package com.phoneagent.core

import android.util.Log
import com.phoneagent.capabilities.CheapVerdict
import com.phoneagent.capabilities.MemoryCapability
import com.phoneagent.capabilities.StepVerifier
import com.phoneagent.capabilities.VisionCapability
import com.phoneagent.capabilities.VoiceCapability
import com.phoneagent.drivers.DriverRegistry
import com.phoneagent.models.AgentSession
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AutonomyLevel
import com.phoneagent.models.Macro
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
    private val macroEngine: MacroEngine,
    private val stepVerifier: StepVerifier,
) {
    companion object {
        private const val TAG = "[PhoneAgent].[AgentEngine]"
        private const val MAX_TOTAL_MS = 6 * 60_000L
    }

    /** Cuenta en voz alta cada paso. Se puede apagar sin tocar nada más. */
    @Volatile var narrate: Boolean = true

    /** Decisión humana desde la UI (diálogo de confirmación de MainActivity). */
    fun confirmPending(outcome: ConfirmationOutcome) = sessions.resolveConfirmation(outcome)
    fun cancel() = sessions.cancel()

    suspend fun run(voiceCommand: String, projectId: String? = null): SessionResult {
        sessions.attachJob(currentCoroutineContext()[Job])
        val userId = configManager.userId()

        // ── Precondiciones con mensajes accionables ────────────────────────
        if (userId.isBlank()) {
            return failBeforeStart("Falta una cuenta activa. Ve a Ajustes e inicia sesión en Phone Agent.")
        }
        if (!supabase.isConfigured() && llmRouter.directApiKey() == null) {
            return failBeforeStart("No se pudo cargar la conexión del servicio de Phone Agent. Instala la versión oficial más reciente.")
        }
        // Sin sesión no hay JWT: RLS devolvería 0 drivers y el agente diría que
        // no hay apps autorizadas aunque el usuario las hubiera marcado.
        if (!supabase.isAuthenticated()) {
            return failBeforeStart("No has iniciado sesión en Supabase. Ve a Ajustes e inicia sesión: sin eso la base de datos no deja leer tus apps autorizadas.")
        }
        if (!accessibility.awaitConnection()) {
            return failBeforeStart("Android no terminó de conectar Accesibilidad. Espera unos segundos; si persiste, apaga y vuelve a activar Phone Agent en Ajustes > Accesibilidad.")
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
        var lastTypedText: String? = null

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
            // Macros antes que el LLM: si el usuario ya grabó este flujo, se
            // reproduce tal cual (sin tokens, sin esperar al modelo).
            try {
                val userMacros = supabase.fetchMacros(userId)
                macroEngine.setMacros(userMacros)
            } catch (e: Exception) {
                Log.w(TAG, "No se pudieron cargar las macros: ${e.message}")
                macroEngine.setMacros(emptyList())
            }
            val matchedMacro = macroEngine.match(voiceCommand)
            if (matchedMacro != null) {
                val macroResult = runMacro(userId, matchedMacro, autonomy)
                if (macroResult.success) {
                    EventBus.emit(AgentEvent.StateChanged(AgentState.DONE, macroResult.message))
                    EventBus.emit(AgentEvent.Finished(macroResult.message, true))
                    voice.speak(macroResult.message)
                    sessions.finish()
                    return SessionResult("", SessionStatus.COMPLETED, macroResult.message, macroResult.stepsExecuted, macroResult.stepsExecuted)
                }
                // La macro falló: se avisa y se cae al agente con visión.
                Log.w(TAG, "Macro fallida, continuando con el agente: ${macroResult.message}")
                EventBus.emit(AgentEvent.StateChanged(AgentState.WORKING,
                    "La macro falló en el paso ${macroResult.failedAt}; lo retomo con visión"))
            }
            if (registry.authorized().isEmpty()) {
                Log.w(TAG, "Drivers en DB: ${drivers.joinToString { it.driverKey }} · " +
                    "plugins cargados: ${registry.availableDriverKeys().sorted()}")
                return closeEarly(userId, "No hay ninguna app autorizada. Abre «Apps autorizadas», marca Claude, ChatGPT o WhatsApp y guarda en Supabase. " +
                    "(Apps con driver propio ahora mismo: ${registry.availableDriverKeys().sorted().joinToString()})")
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

            macroEngine.startRecording()
            stepVerifier.resetCounters()
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
                        // Se ofrece el texto para que el usuario lo corrija ANTES
                        // de que salga, no solo aprobar o rechazar.
                        EventBus.emit(AgentEvent.ConfirmationRequired(stepNumber, description, lastTypedText))
                        voice.speak("Necesito tu confirmación para $description. Puedes editar el texto en pantalla.")
                        when (val outcome = sessions.awaitConfirmation()) {
                            is ConfirmationOutcome.Rejected -> {
                                sessions.update(SessionStatus.RUNNING)
                                finalStatus = SessionStatus.CANCELLED
                                failureReason = "No confirmaste el paso: $description"
                                break
                            }
                            is ConfirmationOutcome.ApprovedWithText -> {
                                // Reescribe el campo con el texto corregido y luego
                                // continúa con el paso sensible (el envío).
                                applyEditedText(outcome.text, currentDriver)
                                sessions.update(SessionStatus.RUNNING)
                            }
                            ConfirmationOutcome.Approved -> sessions.update(SessionStatus.RUNNING)
                        }
                        EventBus.emit(AgentEvent.StateChanged(AgentState.WORKING, "Paso $stepNumber de $maxSteps"))
                    }
                    GateDecision.Allow -> Unit
                }

                // 2) Ejecutar físicamente el paso.
                val stepDescription = currentDriver?.let { registry.driverFor(it).describeStep(it, step) }
                    ?: step.actionType.wire
                EventBus.emit(AgentEvent.StepStarted(stepNumber, stepDescription))
                // Narración: el usuario oye qué está haciendo el agente en cada
                // paso, en vez de mirar una burbuja que dice "Paso 3…".
                if (narrate) voice.speak(stepDescription)
                if (step.actionType == AgentActionType.TYPE) lastTypedText = step.paramString("text")
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

                // 3) ¿Hace falta visión para verificar este paso?
                //    El árbol de UI ya está en memoria y es gratis. Si la
                //    evidencia es inequívoca, la imagen NO viaja al LLM: una
                //    captura de 1080x2400 son ~3.500 tokens de imagen, más que
                //    todo el prompt de texto. Se reserva la visión para cuando
                //    de verdad hay ambigüedad.
                val cheap = stepVerifier.cheapVerify(step, currentDriver)
                val needsVision = cheap is CheapVerdict.Unknown
                if (cheap is CheapVerdict.Verified) {
                    Log.i(TAG, "Paso #$stepNumber verificado con el árbol de UI (sin imagen): ${cheap.reason}")
                }

                // Screenshot posterior + subida al bucket. Se captura SIEMPRE,
                // aunque no se envíe al LLM: el bucket existe para trazabilidad
                // y borrar la pista justo en los pasos baratos haría imposible
                // auditar por qué una macro se grabó mal.
                val afterJpeg = vision.captureJpegBytes()
                var afterBase64 = ""
                if (afterJpeg != null) {
                    if (!isLocalSession && remoteSessionId != null) {
                        supabase.uploadScreenshot(userId, remoteSessionId, stepNumber, afterJpeg)
                    }
                    if (needsVision) {
                        afterBase64 = android.util.Base64.encodeToString(afterJpeg, android.util.Base64.NO_WRAP)
                    }
                } else if (needsVision) {
                    afterBase64 = vision.captureBase64OrEmpty()
                }

                // Se le dice al LLM lo que ya se comprobó en local, para que no
                // lo vuelva a deducir (y para que no contradiga la evidencia).
                val treeForLlm = when (cheap) {
                    is CheapVerdict.Verified ->
                        "[Comprobado en local: ${cheap.reason}]\n" + vision.uiTreeText()
                    is CheapVerdict.Refuted ->
                        "[Falló en local: ${cheap.reason}]\n" + vision.uiTreeText()
                    CheapVerdict.Unknown -> vision.uiTreeText()
                }

                // 4) Verificación con el LLM (1 reintento ante fallo de red).
                stepVerifier.noteVerification()
                val verification = try {
                    llmRouter.verify(routed.sessionId, stepNumber, afterBase64,
                        step.toJson().toString(), voiceCommand, treeForLlm, model)
                } catch (e: SupabaseException) {
                    Log.w(TAG, "verify-and-next falló (${e.message}); reintentando…")
                    delay(2000)
                    try {
                        llmRouter.verify(routed.sessionId, stepNumber, afterBase64,
                            step.toJson().toString(), voiceCommand, treeForLlm, model)
                    } catch (e2: Exception) {
                        finalStatus = SessionStatus.FAILED
                        failureReason = "No se pudo verificar el paso $stepNumber: ${e2.message}"
                        null
                    }
                } ?: break

                if (verification.verified) stepsVerified++
                history.add("verificación #$stepNumber: ${verification.reason}")
                EventBus.emit(AgentEvent.StepVerified(stepNumber, verification.verified, verification.reason))
                // Solo los pasos verificados entran en la macro grabable.
                macroEngine.recordStep(step, verification.verified)

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

        // Qué costó la sesión en imágenes: sirve para ver si la verificación
        // por árbol de UI está haciendo su trabajo.
        if (stepVerifier.verificationsTotal > 0) {
            val pct = (stepVerifier.imagelessRatio() * 100).toInt()
            Log.i(TAG, "Verificaciones: ${stepVerifier.verificationsTotal} · " +
                "sin enviar imagen: ${stepVerifier.verificationsWithoutImage} ($pct%)")
            supabase.logEvent(userId, remoteSessionId?.takeUnless { isLocalSession }, "info",
                "vision_savings",
                "$pct% de los pasos verificados sin imagen " +
                    "(${stepVerifier.verificationsWithoutImage}/${stepVerifier.verificationsTotal})")
        }

        // Grabar el flujo como macro reutilizable (solo si terminó bien).
        if (finalStatus == SessionStatus.COMPLETED) {
            saveMacroFromSession(userId, voiceCommand, remoteSessionId)
        }

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

    /** Vacía el campo y escribe el texto corregido por el usuario. */
    private suspend fun applyEditedText(edited: String, driver: DriverConfig?) {
        Log.i(TAG, "Texto corregido por el usuario (${edited.length} caracteres)")
        executor.execute(AgentStep(stepNumber = 0, actionType = AgentActionType.CLEAR_TEXT,
            paramsJson = org.json.JSONObject().toString()), driver)
        val written = executor.execute(
            AgentStep(stepNumber = 0, actionType = AgentActionType.TYPE,
                paramsJson = org.json.JSONObject().put("text", edited).toString()), driver)
        if (!written.success) Log.w(TAG, "No se pudo reescribir el texto: ${written.detail}")
    }

    /** Reproduce una macro y reporta por voz y por eventos. */
    private suspend fun runMacro(userId: String, macro: Macro, autonomy: AutonomyLevel): MacroRunResult {
        sessions.update(SessionStatus.RUNNING)
        EventBus.emit(AgentEvent.StateChanged(AgentState.WORKING, "Macro: ${macro.name}"))
        return try {
            macroEngine.run(macro, autonomy) { number, total, description, ok ->
                EventBus.emit(AgentEvent.StepStarted(number, description))
                if (narrate) voice.speak(description)
                Log.d(TAG, "Macro paso $number/$total: $description (ok=$ok)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reproduciendo la macro", e)
            supabase.logEvent(userId, null, "warn", "macro_failed", e.message.orEmpty())
            MacroRunResult(false, 0, null, "La macro falló: ${e.message}")
        }
    }

    /**
     * Convierte la sesión terminada en una macro reutilizable. Es lo que hace
     * que el agente mejore con el uso: cada flujo bien resuelto queda grabado y
     * la próxima vez se reproduce sin LLM.
     */
    private suspend fun saveMacroFromSession(userId: String, voiceCommand: String, sessionId: String?) {
        try {
            val driverKey = sessions.current.value?.currentApp?.takeIf { it.isNotBlank() }
            val macro = macroEngine.buildMacro(voiceCommand, driverKey) ?: return
            // No duplicar: si ya existe una macro con ese disparador, se reemplaza.
            val existing = macroEngine.all().firstOrNull { it.normalizedTrigger == macro.normalizedTrigger }
            val toSave = if (existing != null) macro.copy(id = existing.id) else macro
            val saved = supabase.saveMacro(userId, toSave)
            macroEngine.setMacros(macroEngine.all().filter { it.id != saved.id } + saved)
            supabase.logEvent(userId, sessionId, "info", "macro_saved",
                "Macro «${saved.name}» con ${saved.steps.size} pasos")
            Log.i(TAG, "Macro guardada: «${saved.name}» (${saved.steps.size} pasos)")
        } catch (e: Exception) {
            // No grabar la macro jamás debe romper una tarea que ya terminó bien.
            Log.w(TAG, "No se pudo guardar la macro: ${e.message}")
        }
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
