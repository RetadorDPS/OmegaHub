package com.phoneagent.ui

import android.Manifest
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
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
    private var voiceFlowJob: Job? = null
    private var awaitingCapture = false
    private var awaitingMicPermission = false
    private var micPulseAnimator: AnimatorSet? = null
    private var pendingCommand: String? = null
    private var lastConfirmation: AgentEvent.ConfirmationRequired? = null

    private val requestMicPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()) { granted ->
        awaitingMicPermission = false
        refreshMicButton()
        if (granted) startListening()
        else {
            val message = "Necesito permiso de micrófono para escuchar órdenes. Puedes activarlo en Configurar permisos."
            showStatus("🔴 Falta el micrófono", message)
            binding.tvLastResult.text = message
            toast(message)
        }
    }

    private val requestProjection = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()) { result ->
        val command = pendingCommand
        pendingCommand = null
        val captureGranted = result.resultCode == Activity.RESULT_OK && result.data != null
        awaitingCapture = captureGranted && command != null
        refreshMicButton()
        if (captureGranted) {
            ScreenCaptureManager.start(this, result.resultCode, result.data!!)
            if (command != null) {
                lifecycleScope.launch {
                    // Dar tiempo al primer frame antes de planificar.
                    kotlinx.coroutines.delay(900)
                    awaitingCapture = false
                    executeCommand(command)
                }
            } else toast("Captura de pantalla activada")
        } else {
            val message = "No se compartió la pantalla. La tarea no se ejecutó; pulsa HABLAR para intentarlo de nuevo."
            binding.tvLastResult.text = message
            showStatus("🔴 Tarea no iniciada", message)
            toast(message)
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
        binding.btnCancel.visibility = View.GONE
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
        startWakeWordIfIdle()
    }

    override fun onPause() {
        setListeningAnimation(false)
        container.voice.stopWakeWord()
        super.onPause()
    }

    override fun onDestroy() {
        setListeningAnimation(false)
        super.onDestroy()
    }

    // ── Flujo de voz ───────────────────────────────────────────────────────

    private fun onMicPressed() {
        if (taskJob?.isActive == true) {
            toast("Ya estoy trabajando en una tarea. Cancélala antes de pedir otra.")
            return
        }
        if (voiceFlowJob?.isActive == true || awaitingCapture) return
        binding.tvLastResult.text = "Cuando la reconozca, tu frase aparecerá aquí."
        showStatus("⏳ Preparando", "Comprobando la cuenta y los permisos…")
        voiceFlowJob = lifecycleScope.launch {
            // No pedir permisos de voz ni captura si todavía falta el backend y la sesión.
            if (!container.supabase.isConfigured()) {
                val mensaje = "No se pudo cargar la conexión del servicio de Phone Agent. Instala la versión oficial más reciente."
                binding.tvLastResult.text = mensaje
                showStatus("🔴 Servicio no disponible", mensaje)
                toast(mensaje)
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                return@launch
            }
            val userId = SecurePrefs.get(this@MainActivity, SecurePrefs.KEY_USER_ID).orEmpty()
            val sesionActiva = runCatching { container.supabase.isAuthenticated() }.getOrDefault(false)
            if (userId.isBlank() || !sesionActiva) {
                val mensaje = "Primero inicia sesión en tu cuenta desde Ajustes."
                binding.tvLastResult.text = mensaje
                showStatus("🔴 Inicia sesión", mensaje)
                toast(mensaje)
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                return@launch
            }
            if (!AccessibilityController.isServiceEnabledInSettings(this@MainActivity)) {
                val mensaje = "Falta activar Accesibilidad. Pulsa Configurar permisos y activa Phone Agent."
                binding.tvLastResult.text = mensaje
                showStatus("🔴 Falta Accesibilidad", mensaje)
                openPermissionSetup()
                return@launch
            }
            if (!container.accessibility.awaitConnection()) {
                val mensaje = "Android aún no conectó Accesibilidad. Espera unos segundos y vuelve a probar."
                binding.tvLastResult.text = mensaje
                showStatus("🔴 Accesibilidad no conectada", mensaje)
                toast(mensaje)
                return@launch
            }
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
                awaitingMicPermission = true
                showStatus("🎙️ Permiso de micrófono", "Acepta la solicitud de Android para que pueda escucharte.")
                refreshMicButton()
                requestMicPermission.launch(Manifest.permission.RECORD_AUDIO)
                return@launch
            }
            listenForCommand()
        }
        voiceFlowJob?.invokeOnCompletion { binding.root.post { refreshMicButton(); startWakeWordIfIdle() } }
        refreshMicButton()
    }

    /** La misma sesión de voz continúa tras conceder el permiso de micrófono. */
    private fun startListening() {
        if (voiceFlowJob?.isActive == true) return
        voiceFlowJob = lifecycleScope.launch { listenForCommand() }
        voiceFlowJob?.invokeOnCompletion { binding.root.post { refreshMicButton(); startWakeWordIfIdle() } }
        refreshMicButton()
    }

    private suspend fun listenForCommand() {
        container.voice.stopWakeWord()
        EventBus.emit(AgentEvent.StateChanged(AgentState.LISTENING, "Preparando el reconocimiento de voz…"))
        try {
            val command = container.voice.listenOnce { progress ->
                EventBus.tryEmit(AgentEvent.StateChanged(AgentState.LISTENING, progress))
            }
            binding.tvLastResult.text = "He entendido: «$command»"
            showStatus("🎙️ Frase recibida", "Ahora prepararé la tarea. Si Android lo pide, toca «Compartir pantalla».")
            ensureCaptureThenExecute(command)
        } catch (e: Exception) {
            val message = e.message ?: "No se pudo escuchar. Comprueba el servicio de reconocimiento de voz del teléfono."
            Log.w(TAG, "STT falló: $message", e)
            binding.tvLastResult.text = message
            EventBus.emit(AgentEvent.StateChanged(AgentState.ERROR, message))
            toast(message)
        } finally {
            refreshMicButton()
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
        awaitingCapture = true
        showStatus("📱 Esperando permiso", "En la ventana de Android, toca «Compartir pantalla» para que pueda ver la app.")
        refreshMicButton()
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        requestProjection.launch(mpm.createScreenCaptureIntent())
    }

    private fun executeCommand(command: String) {
        FloatingOverlay.start(this)
        taskJob = lifecycleScope.launch {
            refreshMicButton()
            try {
                val result = container.agentEngine.run(command)
                binding.tvLastResult.text = result.summary
                Log.i(TAG, "Resultado: ${result.status} · ${result.summary}")
            } catch (e: Exception) {
                val message = e.message ?: "No se pudo completar la tarea."
                Log.e(TAG, "Falló la tarea", e)
                binding.tvLastResult.text = message
                EventBus.emit(AgentEvent.StateChanged(AgentState.ERROR, message))
            } finally {
                refreshMicButton()
                binding.root.post { refreshMicButton(); startWakeWordIfIdle() }
            }
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
        val title = when (state) {
            AgentState.IDLE -> "⚪ Listo para hablar"
            AgentState.LISTENING -> "🎙️ Escuchando"
            AgentState.WORKING -> "🟣 Estoy trabajando"
            AgentState.WAITING_CONFIRMATION -> "🟡 Necesito tu confirmación"
            AgentState.DONE -> "✅ Tarea terminada"
            AgentState.ERROR -> "🔴 No se pudo continuar"
        }
        val hint = when (state) {
            AgentState.ERROR -> "La tarea se detuvo. El motivo está en el recuadro de abajo."
            AgentState.DONE -> "La tarea terminó. El resultado está en el recuadro de abajo."
            else -> detail.ifBlank {
                when (state) {
                    AgentState.IDLE -> "Pulsa HABLAR y dime qué necesitas."
                    AgentState.LISTENING -> "Te escucho. Habla ahora."
                    AgentState.WORKING -> "Estoy siguiendo los pasos en la pantalla."
                    AgentState.WAITING_CONFIRMATION -> "Revisa la pantalla y confirma o cancela."
                    AgentState.DONE -> "Ya terminé. Puedes pedirme otra cosa."
                    AgentState.ERROR -> "Lee el mensaje de abajo y vuelve a intentarlo."
                }
            }
        }
        showStatus(title, hint)
        setListeningAnimation(state == AgentState.LISTENING)
        if (state == AgentState.ERROR || state == AgentState.DONE) {
            if (detail.isNotBlank()) binding.tvLastResult.text = detail
        }
        binding.btnCancel.visibility = if (state == AgentState.WORKING || state == AgentState.WAITING_CONFIRMATION)
            View.VISIBLE else View.GONE
        if (state != AgentState.WAITING_CONFIRMATION && state != AgentState.WORKING) {
            binding.btnConfirm.visibility = View.GONE
        }
        refreshMicButton()
    }

    private fun showStatus(title: String, hint: String) {
        binding.tvStatus.text = title
        binding.tvStatusHint.text = hint
        val color = when {
            title.startsWith("🔴") -> getColor(com.phoneagent.R.color.phone_agent_error)
            title.startsWith("✅") || title.startsWith("🟢") -> 0xFF18794E.toInt()
            title.startsWith("🟡") || title.startsWith("📱") -> 0xFF8A6500.toInt()
            title.startsWith("🎙") || title.startsWith("⏳") || title.startsWith("🟣") ->
                getColor(com.phoneagent.R.color.phone_agent_primary)
            else -> getColor(com.phoneagent.R.color.phone_agent_text)
        }
        binding.tvStatus.setTextColor(color)
    }

    private fun setListeningAnimation(listening: Boolean) {
        if (listening && micPulseAnimator == null && ::binding.isInitialized) {
            val pulseX = ObjectAnimator.ofFloat(binding.btnMic, View.SCALE_X, 1f, 1.045f, 1f).apply {
                duration = 1100
                repeatCount = ObjectAnimator.INFINITE
            }
            val pulseY = ObjectAnimator.ofFloat(binding.btnMic, View.SCALE_Y, 1f, 1.045f, 1f).apply {
                duration = 1100
                repeatCount = ObjectAnimator.INFINITE
            }
            micPulseAnimator = AnimatorSet().apply {
                playTogether(pulseX, pulseY)
                interpolator = AccelerateDecelerateInterpolator()
                start()
            }
        } else if (!listening) {
            micPulseAnimator?.cancel()
            micPulseAnimator = null
            if (::binding.isInitialized) {
                binding.btnMic.scaleX = 1f
                binding.btnMic.scaleY = 1f
            }
        }
    }

    private fun refreshMicButton() {
        if (!::binding.isInitialized) return
        val busy = voiceFlowJob?.isActive == true || taskJob?.isActive == true || awaitingCapture || awaitingMicPermission
        binding.btnMic.isEnabled = !busy
        binding.btnMic.text = when {
            awaitingCapture -> "📱\nESPERANDO"
            awaitingMicPermission -> "🎙️\nPERMISO"
            voiceFlowJob?.isActive == true -> "🎙️\nESCUCHANDO…"
            taskJob?.isActive == true -> "⏳\nEN MARCHA"
            else -> "🎙\nHABLAR"
        }
        binding.btnMic.alpha = if (busy) 0.88f else 1f
        binding.btnMic.contentDescription = when {
            awaitingCapture -> "Esperando permiso para compartir pantalla"
            awaitingMicPermission -> "Esperando permiso de micrófono"
            voiceFlowJob?.isActive == true -> "Phone Agent está escuchando"
            taskJob?.isActive == true -> "Phone Agent está trabajando; puedes cancelar la tarea"
            else -> "Pulsa para hablar con Phone Agent"
        }
    }


    private fun startWakeWordIfIdle() {
        if (isFinishing || isDestroyed || !SecurePrefs.getBool(this, SecurePrefs.KEY_WAKE_ENABLED)) return
        if (voiceFlowJob?.isActive == true || taskJob?.isActive == true || awaitingCapture || awaitingMicPermission) return
        container.voice.wakeWord = container.configManager.wakeWord()
        container.voice.startWakeWord {
            runOnUiThread {
                toast("Te escucho…")
                onMicPressed()
            }
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
