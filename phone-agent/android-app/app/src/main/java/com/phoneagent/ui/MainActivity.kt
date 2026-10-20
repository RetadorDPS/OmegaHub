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
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.phoneagent.PhoneAgentApp
import com.phoneagent.core.AgentEvent
import com.phoneagent.core.AgentState
import com.phoneagent.core.EventBus
import com.phoneagent.core.SecurePrefs
import com.phoneagent.databinding.ActivityMainBinding
import com.phoneagent.system.AccessibilityController
import com.phoneagent.system.ScreenCaptureManager
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
        binding.btnConfirm.setOnClickListener {
            container.agentEngine.confirmPending(true)
            binding.btnConfirm.visibility = View.GONE
        }
        binding.btnDrivers.setOnClickListener {
            startActivity(Intent(this, DriverManagerActivity::class.java))
        }
        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        observeEvents()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
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
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestMicPermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        startListening()
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
                    is AgentEvent.ConfirmationRequired -> binding.btnConfirm.visibility = View.VISIBLE
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
        val userOk = container.configManager.userId().isNotBlank()
        binding.tvPermissions.text = buildString {
            appendLine("Estado de permisos y conexión:")
            appendLine("${mark(supabaseOk)} Supabase configurado (local.properties)")
            appendLine("${mark(userOk)} User ID de Supabase (Ajustes)")
            appendLine("${mark(mic)} Micrófono")
            appendLine("${mark(accSettings && accConnected)} Servicio de accesibilidad activo")
            appendLine("${mark(capture)} Captura de pantalla (MediaProjection)")
            appendLine("${mark(overlay)} Burbuja flotante (overlay)")
            append("Toca «Apps autorizadas» para autorizar Claude / ChatGPT / WhatsApp.")
        }
        if (!accSettings) {
            binding.tvPermissions.setOnClickListener { container.intentLauncher.openAccessibilitySettings() }
        }
    }

    private fun mark(ok: Boolean): String = if (ok) "✅" else "❌"
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
