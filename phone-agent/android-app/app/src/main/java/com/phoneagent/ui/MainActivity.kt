package com.phoneagent.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.phoneagent.PhoneAgentApp
import com.phoneagent.core.AgentEvent
import com.phoneagent.core.AgentState
import com.phoneagent.core.ConfirmationOutcome
import com.phoneagent.core.EventBus
import com.phoneagent.core.SecurePrefs
import com.phoneagent.databinding.ActivityMainBinding
import com.phoneagent.system.AccessibilityController
import com.phoneagent.system.ScreenCaptureManager
import com.phoneagent.system.TaskScheduler
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Pantalla principal: botón de micrófono grande, indicador de estado
 * (inactivo/escuchando/trabajando/esperando/terminado/error), último
 * resultado, confirmar y cancelar. Todo el trabajo lo hace AgentEngine;
 * esta Activity solo escucha EventBus y pinta.
 */
class MainActivity : AppCompatActivity() {
    companion object { private const val TAG = "[PhoneAgent].[MainActivity]" }

    private lateinit var binding: ActivityMainBinding
    private val container by lazy { (application as PhoneAgentApp).container }
    private var taskJob: Job? = null
    private var pendingCommand: String? = null
    private var lastConfirmation: AgentEvent.ConfirmationRequired? = null

    private val requestMicPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startListening()
        else toast("Sin permiso de micrófono no puedo escucharte. Actívalo en Ajustes > Apps > Phone Agent.")
    }

    private val requestProjection = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()) { result ->
        val command = pendingCommand
        pendingCommand = null
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            ScreenCaptureManager.start(this, result.resultCode, result.data!!)
            if (command != null) {
                lifecycleScope.launch {
                    // Dar tiempo al primer frame antes de planificar.
                    kotlinx.coroutines.delay(900)
                    executeCommand(command)
                }
            } else toast("Captura de pantalla activada")
        } else {
            toast("Sin captura de pantalla el agente no puede ver. La tarea no se ejecutó.")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val voice = container.voice
        voice.languageTag = container.configManager.language()
        voice.wakeWord = container.configManager.wakeWord()
        lifecycleScope.launch { voice.initialize(); container.vision.initialize() }

        binding.btnMic.setOnClickListener { onMicPressed() }
        binding.btnCancel.setOnClickListener {
            container.agentEngine.cancel()
            toast("Cancelando la tarea…")
        }
        binding.btnConfirm.setOnClickListener { showConfirmationDialog(lastConfirmation) }
        binding.btnDrivers.setOnClickListener {
            startActivity(Intent(this, DriverManagerActivity::class.java))
        }
        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        binding.btnPermissionSetup.setOnClickListener { openPermissionSetup() }
        binding.btnMacros.setOnClickListener {
            startActivity(Intent(this, MacroActivity::class.java))
        }
        observeEvents()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
        handleScheduledTaskIntent()
        // Wake word en segundo plano solo si el usuario lo activó en Ajustes.
        if (SecurePrefs.getBool(this, SecurePrefs.KEY_WAKE_ENABLED) && taskJob?.isActive != true) {
            container.voice.wakeWord = container.configManager.wakeWord()
            container.voice.startWakeWord {
                runOnUiThread {
                    toast("Te escucho…")
                    onMicPressed()
                }
            }
        }
    }

    override fun onPause() {
        container.voice.stopWakeWord()
        super.onPause()
    }

    // ── Flujo de voz ───────────────────────────────────────────────────────

    private fun onMicPressed() {
        if (taskJob?.isActive == true) { toast("Ya estoy trabajando en una tarea. Cancélala antes de pedir otra."); return }
        lifecycleScope.launch {
            // No pedir permisos de voz ni captura si todavía falta el backend y la sesión.
            if (!container.supabase.isConfigured()) {
                val mensaje = "No se pudo cargar la conexión del servicio de Phone Agent. Instala la versión oficial más reciente."
                binding.tvLastResult.text = mensaje
                toast(mensaje)
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                return@launch
            }
            val userId = SecurePrefs.get(this@MainActivity, SecurePrefs.KEY_USER_ID).orEmpty()
            val sesionActiva = runCatching { container.supabase.isAuthenticated() }.getOrDefault(false)
            if (userId.isBlank() || !sesionActiva) {
                val mensaje = "Primero crea o inicia sesión en tu cuenta desde Ajustes para cargar las apps autorizadas."
                binding.tvLastResult.text = mensaje
                toast(mensaje)
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                return@launch
            }
            if (!AccessibilityController.isServiceEnabledInSettings(this@MainActivity)) {
                val mensaje = "Falta activar Accesibilidad. Pulsa Configurar permisos y activa Phone Agent."
                binding.tvLastResult.text = mensaje
                openPermissionSetup()
                return@launch
            }
            if (!container.accessibility.awaitConnection()) {
                val mensaje = "Android muestra el permiso como activado, pero el servicio aún no se conectó. Espera unos segundos o apágalo y vuelve a activarlo en Accesibilidad."
                binding.tvLastResult.text = mensaje
                toast(mensaje)
                return@launch
            }
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
                requestMicPermission.launch(Manifest.permission.RECORD_AUDIO)
                return@launch
            }
            startListening()
        }
    }

    private fun startListening() {
        lifecycleScope.launch {
            EventBus.emit(AgentEvent.StateChanged(AgentState.LISTENING))
            try {
                val command = container.voice.listenOnce()
                binding.tvLastResult.text = "Has dicho: «$command»"
                ensureCaptureThenExecute(command)
            } catch (e: Exception) {
                Log.w(TAG, "STT falló: ${e.message}")
                toast(e.message ?: "No se pudo escuchar")
                EventBus.emit(AgentEvent.StateChanged(AgentState.ERROR, e.message.orEmpty()))
            }
        }
    }

    /**
     * Arranca una tarea que venía de una notificación programada.
     *
     * Se gestiona en onResume (que siempre corre, también tras onCreate) y se
     * quita el extra al consumirlo: así un giro de pantalla o un segundo
     * onResume no vuelven a lanzar la misma tarea.
     */
    private fun handleScheduledTaskIntent() {
        val incoming = intent ?: return
        val command = incoming.getStringExtra(TaskScheduler.EXTRA_TASK_COMMAND) ?: return
        incoming.removeExtra(TaskScheduler.EXTRA_TASK_COMMAND)
        val name = incoming.getStringExtra(TaskScheduler.EXTRA_TASK_NAME).orEmpty()
        incoming.removeExtra(TaskScheduler.EXTRA_TASK_NAME)
        if (taskJob?.isActive == true) {
            toast("Ya hay una tarea en marcha; la programada queda pendiente")
            return
        }
        Log.i(TAG, "Tarea programada «$name»: $command")
        toast("Tarea programada: ${name.ifBlank { command }}")
        ensureCaptureThenExecute(command)
    }

    /** Sin MediaProjection no hay ojos: se pide una vez y se recuerda el comando. */
    private fun ensureCaptureThenExecute(command: String) {
        if (ScreenCaptureManager.isReady()) { executeCommand(command); return }
        pendingCommand = command
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        requestProjection.launch(mpm.createScreenCaptureIntent())
    }

    private fun executeCommand(command: String) {
        FloatingOverlay.start(this)
        taskJob = lifecycleScope.launch {
            val result = container.agentEngine.run(command)
            binding.tvLastResult.text = result.summary
            Log.i(TAG, "Resultado: ${result.status} · ${result.summary}")
        }
    }

    // ── Estado / permisos ──────────────────────────────────────────────────

    private fun observeEvents() {
        lifecycleScope.launch {
            EventBus.events.collect { event ->
                when (event) {
                    is AgentEvent.StateChanged -> renderState(event.state, event.detail)
                    is AgentEvent.StepStarted -> binding.tvLastResult.text = "Paso ${event.stepNumber}: ${event.description}"
                    is AgentEvent.StepVerified -> if (!event.verified) toast("Paso ${event.stepNumber} no verificado: ${event.reason}")
                    is AgentEvent.ConfirmationRequired -> {
                        lastConfirmation = event
                        showConfirmationDialog(event)
                    }
                    is AgentEvent.Finished -> {
                        binding.tvLastResult.text = event.summary
                        binding.btnConfirm.visibility = View.GONE
                    }
                    is AgentEvent.ErrorOccurred -> toast(event.message)
                    is AgentEvent.Spoke -> Unit // el TTS ya está hablando
                }
            }
        }
    }

    /**
     * Tarjeta de aprobación EDITABLE: el usuario ve qué se va a hacer y puede
     * corregir el texto antes de que salga. Aprobar sin tocar nada envía lo que
     * el agente había preparado.
     */
    private fun showConfirmationDialog(event: AgentEvent.ConfirmationRequired?) {
        if (event == null) return
        val editable = event.currentText
        if (editable.isNullOrBlank()) {
            // Sin texto que corregir: confirmación simple.
            MaterialAlertDialogBuilder(this)
                .setTitle("¿Confirmas?")
                .setMessage(event.description)
                .setPositiveButton("Sí, adelante") { _, _ ->
                    container.agentEngine.confirmPending(ConfirmationOutcome.Approved)
                    binding.btnConfirm.visibility = View.GONE
                }
                .setNegativeButton("No") { _, _ ->
                    container.agentEngine.confirmPending(ConfirmationOutcome.Rejected)
                    binding.btnConfirm.visibility = View.GONE
                }
                .setCancelable(false)
                .show()
            return
        }
        val input = EditText(this).apply {
            setText(editable)
            setSelection(editable.length)
            minLines = 2
            maxLines = 6
            hint = "Puedes corregir el texto antes de enviar"
        }
        // Ojo: no llamarlo 'container', que taparía la propiedad de la Activity.
        val wrapper = FrameLayout(this).apply {
            val pad = (20 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        MaterialAlertDialogBuilder(this)
            .setTitle("Revisa antes de enviar")
            .setMessage(event.description)
            .setView(wrapper)
            .setPositiveButton("Enviar") { _, _ ->
                val edited = input.text.toString()
                val outcome = if (edited == editable) ConfirmationOutcome.Approved
                              else ConfirmationOutcome.ApprovedWithText(edited)
                container.agentEngine.confirmPending(outcome)
                binding.btnConfirm.visibility = View.GONE
                if (edited != editable) toast("Texto corregido")
            }
            .setNegativeButton("Cancelar") { _, _ ->
                this@MainActivity.container.agentEngine.confirmPending(ConfirmationOutcome.Rejected)
                binding.btnConfirm.visibility = View.GONE
            }
            .setCancelable(false)
            .show()
    }

    private fun renderState(state: AgentState, detail: String) {
        val icon = when (state) {
            AgentState.IDLE -> "⚪"; AgentState.LISTENING -> "🎙️"
            AgentState.WORKING -> "🟣"; AgentState.WAITING_CONFIRMATION -> "🟡"
            AgentState.DONE -> "🟢"; AgentState.ERROR -> "🔴"
        }
        binding.tvStatus.text = "$icon ${state.label}"
        if (detail.isNotBlank() && state != AgentState.WORKING) binding.tvLastResult.text = detail
        if (state != AgentState.WAITING_CONFIRMATION && state != AgentState.WORKING) {
            binding.btnConfirm.visibility = View.GONE
        }
    }

    private fun updatePermissionStatus() {
        val mic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val accSettings = AccessibilityController.isServiceEnabledInSettings(this)
        val accConnected = container.accessibility.isConnected()
        val overlay = container.intentLauncher.canDrawOverlays()
        val capture = ScreenCaptureManager.isReady()
        val supabaseOk = container.supabase.isConfigured()
        lifecycleScope.launch {
            // La sesión es lo primero: sin JWT, RLS oculta las apps autorizadas.
            val authOk = runCatching { container.supabase.isAuthenticated() }.getOrDefault(false)
            binding.tvPermissions.text = buildString {
                appendLine("Estado de permisos y conexión:")
                appendLine("${mark(supabaseOk)} Servicio de Phone Agent disponible")
                appendLine("${mark(authOk)} Sesión iniciada (Ajustes → Cuenta)")
                appendLine("${mark(mic)} Micrófono")
                appendLine("${mark(accSettings && accConnected)} Servicio de accesibilidad activo")
                appendLine("${mark(capture)} Captura de pantalla (MediaProjection)")
                appendLine("${mark(overlay)} Burbuja flotante (overlay)")
                append(when {
                    !authOk -> "Empieza creando o iniciando sesión en tu cuenta desde Ajustes."
                    !mic || !accSettings -> "Toca «Configurar permisos»; te llevaré a cada ajuste necesario."
                    accSettings && !accConnected -> "Accesibilidad está activada; Android aún está conectando el servicio. Espera unos segundos."
                    !capture -> "La captura se pedirá automáticamente al iniciar una tarea."
                    else -> "Toca «Apps autorizadas» para elegir qué apps puede usar el agente."
                })
            }
            binding.btnPermissionSetup.visibility = View.VISIBLE
            binding.tvPermissions.setOnClickListener {
                if (!supabaseOk || !authOk) startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                else openPermissionSetup()
            }
        }
    }

    private fun openPermissionSetup() {
        startActivity(Intent(this, PermissionSetupActivity::class.java))
    }

    private fun mark(ok: Boolean): String = if (ok) "✅" else "❌"
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
