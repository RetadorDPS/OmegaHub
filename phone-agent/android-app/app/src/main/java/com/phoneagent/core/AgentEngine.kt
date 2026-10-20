package com.phoneagent.core

import android.util.Log
import com.phoneagent.capabilities.MemoryCapability
import com.phoneagent.capabilities.VisionCapability
import com.phoneagent.capabilities.VoiceCapability
import com.phoneagent.drivers.DriverRegistry
import com.phoneagent.models.AgentSession
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.SessionResult
import com.phoneagent.models.SessionStatus
import com.phoneagent.network.LLMRouter
import com.phoneagent.network.SupabaseClient
import com.phoneagent.network.SupabaseException
import com.phoneagent.system.AccessibilityController
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * AgentEngine — el loop principal del agente:
 *   comando de voz → plan-task (LLM) → [PermissionGate → ejecutar → screenshot
 *   → verify-and-next (LLM)] × N → complete-session → reporte por voz.
 *
 * Reglas que este loop garantiza:
 *  - NINGUNA acción toca la pantalla sin pasar por PermissionGate.
 *  - Cada paso ejecutado se verifica con screenshot antes de avanzar.
 *  - Máximo de pasos y de tiempo total: el agente nunca entra en bucle eterno.
 *  - Todo error (red, timeout, app no encontrada, permiso, LLM) termina en un
 *    reporte hablado y en event_log, nunca en un cuelgue silencioso.
 */
class AgentEngine(
    private val supabase: SupabaseClient,
    private val llmRouter: LLMRouter,
    private val registry: DriverRegistry,
    private val gate: PermissionGate,
    private val sessions: SessionManager,
    private val configManager: ConfigManager,
    private val vision: VisionCapability,
    private val voice: VoiceCapability,
    private val memory: MemoryCapability,
    private val accessibility: AccessibilityController,
    private val executor: StepExecutor,
) {
    companion object {
        private const val TAG = "[PhoneAgent].[AgentEngine]"
        private const val MAX_TOTAL_MS = 6 * 60_000L
    }

    /** Confirmación humana desde la UI (botón Confirmar de MainActivity). */
    fun confirmPending(approved: Boolean) = sessions.resolveConfirmation(approved)
    fun cancel() = sessions.cancel()

    suspend fun run(voiceCommand: String, projectId: String? = null): SessionResult {
        sessions.attachJob(currentCoroutineContext()[Job])
        val userId = configManager.userId()

        // ── Precondiciones con mensajes accionables ────────────────────────
        if (userId.isBlank()) {
            return failBeforeStart("Falta tu User ID de Supabase. Ve a Ajustes y pega el UUID de tu usuario (Supabase > Authentication > Users).")
        }
        if (!supabase.isConfigured() && llmRouter.directApiKey() == null) {
            return failBeforeStart("Supabase no está configurado. Pon SUPABASE_URL y SUPABASE_ANON_KEY en android-app/local.properties y vuelve a compilar, o pega tu Anthropic API Key en Ajustes.")
        }
        // Sin sesión no hay JWT: RLS devolvería 0 drivers y el agente diría que
        // no hay apps autorizadas aunque el usuario las hubiera marcado.
        if (!supabase.isAuthenticated()) {
            return failBeforeStart("No has iniciado sesión en Supabase. Ve a Ajustes e inicia sesión: sin eso la base de datos no deja leer tus apps autorizadas.")
        }
        if (!accessibility.isConnected()) {
            return failBeforeStart("El servicio de accesibilidad no está activo. Ve a Ajustes del teléfono > Accesibilidad > Phone Agent y actívalo.")
        }

        sessions.start(AgentSession(id = "", userId = userId, projectId = projectId,
            voiceCommand = voiceCommand, status = SessionStatus.PLANNING))
        EventBus.emit(AgentEvent.StateChanged(AgentState.WORKING, "Planificando: $voiceCommand"))

        var remoteSessionId: String? = null
        var isLocalSession = false
        var stepsExecuted = 0
        var stepsVerified = 0
        var finalStatus = SessionStatus.COMPLETED
        var finalSummary: String? = null
        var failureReason: String? = null
        val history = mutableListOf<String>()

        try {
            // ── Config + drivers autorizados (whitelist) ───────────────────
            val caps = try { configManager.capabilityConfig() } catch (e: Exception) { emptyMap() }
            if (caps.isNotEmpty() && !vision.isEnabled(caps)) {
                // Sin visión no hay verificación posible: el loop entero depende
                // de comparar screenshots. Frenar aquí, no seguir a ciegas.
                return closeEarly(userId,
                    "La capacidad de visión está desactivada en capability_config. " +
                        "Actívala (capability_key='vision', enabled=true) para que el agente pueda verificar lo que hace.")
            }
            val autonomy = configManager.autonomy()
            val model = llmRouter.modelFromConfig(caps)
            val drivers = registry.reload(userId, configManager)
            if (registry.authorized().isEmpty()) {
                Log.w(TAG, "Drivers en DB: ${drivers.joinToString { it.driverKey }}")
                return closeEarly(userId, "No hay ninguna app autorizada. Abre «Apps autorizadas», marca Claude, ChatGPT o WhatsApp y guarda en Supabase.")
            }

            // ── PLAN: screenshot inicial + comando → primer paso ───────────
            val firstShot = vision.captureBase64OrEmpty()
            val routed = llmRouter.plan(
                userId = userId, voiceCommand = voiceCommand, screenshotBase64 = firstShot,
                currentApp = accessibility.currentPackage() ?: "desconocida",
                projectId = projectId, autonomyWire = autonomy.wire,
                uiTree = vision.uiTreeText(), authorizedDrivers = registry.authorized(), model = model)
            remoteSessionId = routed.sessionId
            isLocalSession = routed.isLocal
            val maxSteps = routed.maxSteps.coerceIn(1, 40)
            sessions.attach(AgentSession(id = routed.sessionId, userId = userId, projectId = projectId,
                voiceCommand = voiceCommand, status = SessionStatus.RUNNING, autonomyLevel = autonomy))
            supabase.logEvent(userId, remoteSessionId.takeUnless { isLocalSession }, "info",
                "session_started", voiceCommand, JSONObject().put("max_steps", maxSteps).put("local", isLocalSession))

            var step = routed.plan.action
            history.add("plan: ${routed.plan.screenAnalysis}")

            // ── LOOP ejecutar → verificar ──────────────────────────────────
            var stepNumber = 1
            while (stepNumber <= maxSteps) {
                currentCoroutineContext().ensureActive()
                if (sessions.cancellationRequested) throw CancellationException("Cancelado por el usuario")
                if (sessions.elapsedMs() > MAX_TOTAL_MS) {
                    finalStatus = SessionStatus.FAILED
                    failureReason = "Tiempo máximo de la tarea agotado (${MAX_TOTAL_MS / 60000} min)"
                    break
                }

                val foreground = accessibility.currentPackage()
                val currentDriver = registry.configForPackage(foreground)
                    ?: step.takeIf { it.actionType == AgentActionType.OPEN_APP }
                        ?.let { registry.getByKey(it.paramString("driver_key")) }

                // 1) PermissionGate: sin su permiso no se toca la pantalla.
                when (val decision = gate.evaluate(step, currentDriver, foreground, autonomy)) {
                    is GateDecision.Deny -> {
                        Log.w(TAG, "Paso #$stepNumber denegado: ${decision.reason}")
                        supabase.logEvent(userId, remoteSessionId.takeUnless { isLocalSession }, "warn",
                            "gate_denied", decision.reason, JSONObject().put("step", stepNumber))
                        finalStatus = SessionStatus.FAILED
                        failureReason = decision.reason
                        break
                    }
                    is GateDecision.RequireConfirmation -> {
                        val description = currentDriver?.let {
                            registry.driverFor(it).describeStep(it, step)
                        } ?: decision.reason
                        Log.i(TAG, "Paso #$stepNumber necesita confirmación: $description")
                        sessions.update(SessionStatus.WAITING_CONFIRMATION)
                        EventBus.emit(AgentEvent.StateChanged(AgentState.WAITING_CONFIRMATION, description))
                        EventBus.emit(AgentEvent.ConfirmationRequired(stepNumber, description))
                        voice.speak("Necesito tu confirmación. $description. Di que sí en pantalla o toca Confirmar.")
                        val approved = sessions.awaitConfirmation()
                        sessions.update(SessionStatus.RUNNING)
                        EventBus.emit(AgentEvent.StateChanged(AgentState.WORKING, "Paso $stepNumber de $maxSteps"))
                        if (!approved) {
                            finalStatus = SessionStatus.CANCELLED
                            failureReason = "No confirmaste el paso: $description"
                            break
                        }
                    }
                    GateDecision.Allow -> Unit
                }

                // 2) Ejecutar físicamente el paso.
                EventBus.emit(AgentEvent.StepStarted(stepNumber,
                    currentDriver?.let { registry.driverFor(it).describeStep(it, step) } ?: step.actionType.wire))
                val outcome = executor.execute(step, currentDriver)
                stepsExecuted++
                sessions.setStepsExecuted(stepsExecuted)
                history.add("#$stepNumber ${step.actionType.wire} → ${outcome.detail}")
                Log.i(TAG, "Paso #$stepNumber resultado: ${outcome.detail}")

                if (step.actionType == AgentActionType.DONE) {
                    finalSummary = step.paramString("summary").ifBlank { outcome.detail }
                    break
                }
                if (!outcome.success && step.actionType != AgentActionType.READ) {
                    Log.w(TAG, "La ejecución falló; el LLM decidirá la corrección: ${outcome.detail}")
                }

                // 3) Screenshot posterior + subida al bucket (trazabilidad).
                val afterJpeg = vision.captureJpegBytes()
                var afterBase64 = ""
                if (afterJpeg != null) {
                    afterBase64 = android.util.Base64.encodeToString(
                        afterJpeg, android.util.Base64.NO_WRAP)
                    if (!isLocalSession && remoteSessionId != null) {
                        supabase.uploadScreenshot(userId, remoteSessionId, stepNumber, afterJpeg)
                    }
                } else {
                    afterBase64 = vision.captureBase64OrEmpty()
                }

                // 4) Verificación con el LLM (1 reintento ante fallo de red).
                val verification = try {
                    llmRouter.verify(routed.sessionId, stepNumber, afterBase64,
                        step.toJson().toString(), voiceCommand, vision.uiTreeText(), model)
                } catch (e: SupabaseException) {
                    Log.w(TAG, "verify-and-next falló (${e.message}); reintentando…")
                    delay(2000)
                    try {
                        llmRouter.verify(routed.sessionId, stepNumber, afterBase64,
                            step.toJson().toString(), voiceCommand, vision.uiTreeText(), model)
                    } catch (e2: Exception) {
                        finalStatus = SessionStatus.FAILED
                        failureReason = "No se pudo verificar el paso $stepNumber: ${e2.message}"
                        null
                    }
                } ?: break

                if (verification.verified) stepsVerified++
                history.add("verificación #$stepNumber: ${verification.reason}")
                EventBus.emit(AgentEvent.StepVerified(stepNumber, verification.verified, verification.reason))

                if (verification.shouldStop) {
                    finalSummary = verification.message.ifBlank { verification.reason }
                    break
                }
                val next = verification.nextStep
                if (next == null) {
                    finalSummary = verification.message.ifBlank { "Tarea completada" }
                    break
                }
                step = next
                stepNumber++
                if (step.actionType == AgentActionType.DONE) {
                    finalSummary = step.paramString("summary").ifBlank { verification.message }
                    break
                }
            }
            if (stepNumber > (routed.maxSteps.coerceIn(1, 40)) && finalSummary == null && failureReason == null) {
                finalStatus = SessionStatus.FAILED
                failureReason = "Se alcanzó el máximo de pasos sin completar la tarea"
            }

        } catch (e: CancellationException) {
            withContext(NonCancellable) {
                closeRemoteSession(remoteSessionId, isLocalSession, SessionStatus.CANCELLED, "Cancelado por el usuario")
            }
            sessions.update(SessionStatus.CANCELLED)
            voice.speak("Tarea cancelada.")
            EventBus.emit(AgentEvent.StateChanged(AgentState.IDLE, "Cancelado"))
            EventBus.emit(AgentEvent.Finished("Tarea cancelada", false))
            sessions.finish()
            return SessionResult(remoteSessionId.orEmpty(), SessionStatus.CANCELLED, "Tarea cancelada", stepsExecuted, stepsVerified)
        } catch (e: Exception) {
            Log.e(TAG, "Error en el loop del agente", e)
            finalStatus = SessionStatus.FAILED
            failureReason = when (e) {
                is SupabaseException -> e.message
                else -> "Error inesperado: ${e.message}"
            }
            supabase.logEvent(userId, remoteSessionId?.takeUnless { isLocalSession }, "error",
                "engine_error", failureReason.orEmpty())
        }

        // ── CIERRE: resumen + memoria + reporte por voz ────────────────────
        val summary = closeRemoteSession(remoteSessionId, isLocalSession, finalStatus, failureReason)
            ?: finalSummary
            ?: failureReason
            ?: "Tarea terminada: $voiceCommand"

        // En modo local complete-session no corrió: guardamos la memoria aquí.
        if (isLocalSession && finalStatus == SessionStatus.COMPLETED) {
            val project = memory.activeProject(userId, projectId)
            if (project != null) {
                memory.saveProgress(userId, project, summary, summary,
                    project.pendingItems, remoteSessionId.orEmpty())
            }
        }

        sessions.update(finalStatus, resultSummary = summary,
            error = if (finalStatus == SessionStatus.FAILED) failureReason else null)
        val success = finalStatus == SessionStatus.COMPLETED
        EventBus.emit(AgentEvent.StateChanged(if (success) AgentState.DONE else AgentState.ERROR, summary))
        EventBus.emit(AgentEvent.Finished(summary, success))
        voice.speak(summary)
        sessions.finish()
        Log.i(TAG, "Sesión cerrada ($finalStatus): $summary")
        return SessionResult(remoteSessionId.orEmpty(), finalStatus, summary, stepsExecuted, stepsVerified)
    }

    /** Llama a complete-session (o al resumen local) y devuelve el resumen. */
    private suspend fun closeRemoteSession(
        remoteSessionId: String?, isLocal: Boolean,
        status: SessionStatus, error: String?,
    ): String? {
        if (remoteSessionId.isNullOrBlank()) return null
        return try {
            if (isLocal) {
                // Sin backend no hay historial en DB: resumen determinista.
                if (status == SessionStatus.COMPLETED) "Tarea completada." else "La tarea terminó con estado ${status.wire}."
            } else {
                val res = supabase.completeSession(remoteSessionId, status.wire, error)
                res.optString("summary").ifBlank { null }
            }
        } catch (e: Exception) {
            Log.w(TAG, "complete-session falló (la tarea ya terminó): ${e.message}")
            null
        }
    }

    private suspend fun closeEarly(userId: String, message: String): SessionResult {
        supabase.logEvent(userId, null, "warn", "session_blocked", message)
        sessions.update(SessionStatus.FAILED, error = message)
        EventBus.emit(AgentEvent.StateChanged(AgentState.ERROR, message))
        EventBus.emit(AgentEvent.Finished(message, false))
        voice.speak(message)
        sessions.finish()
        return SessionResult("", SessionStatus.FAILED, message, 0, 0)
    }

    private suspend fun failBeforeStart(message: String): SessionResult {
        Log.e(TAG, message)
        EventBus.emit(AgentEvent.StateChanged(AgentState.ERROR, message))
        EventBus.emit(AgentEvent.ErrorOccurred(message))
        EventBus.emit(AgentEvent.Finished(message, false))
        voice.speak(message)
        return SessionResult("", SessionStatus.FAILED, message, 0, 0)
    }
}
