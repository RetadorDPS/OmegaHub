package com.phoneagent.core

import android.util.Log
import com.phoneagent.drivers.DriverRegistry
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.AutonomyLevel
import com.phoneagent.models.DriverConfig
import com.phoneagent.models.Macro
import com.phoneagent.models.MacroStep
import com.phoneagent.system.AccessibilityController
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Resultado de ejecutar una macro. */
data class MacroRunResult(
    val success: Boolean,
    val stepsExecuted: Int,
    val failedAt: Int?,
    val message: String,
)

/**
 * Motor de macros: grabar, emparejar y reproducir.
 *
 * Por qué existe esto y no solo el agente:
 *  - UTILIDAD: un flujo que haces a diario se graba una vez y se repite por voz,
 *    sin gastar tokens ni esperar al LLM.
 *  - FIABILIDAD: la reproducción es determinista; no depende de que el modelo
 *    acierte hoy igual que ayer.
 *  - DISTRIBUCIÓN: es la única modalidad que la política de Accesibilidad de
 *    Google Play permite publicar (script estático definido por una persona).
 *
 * Diseño: reproducción determinista SIN LLM. Si un paso falla, se devuelve el
 * control al agente con LLM para que se recupere (fallback), en vez de intentar
 * adivinar dentro del reproductor.
 */
class MacroEngine(
    private val registry: DriverRegistry,
    private val gate: PermissionGate,
    private val executor: StepExecutor,
    private val accessibility: AccessibilityController,
) {
    companion object { private const val TAG = "[PhoneAgent].[Macros]" }

    @Volatile private var macros: List<Macro> = emptyList()
    private val recordMutex = Mutex()

    // ── Grabación ──────────────────────────────────────────────────────────

    /** Pasos acumulados de la sesión en curso (solo pasos verificados). */
    private val recording = mutableListOf<MacroStep>()

    suspend fun startRecording() = recordMutex.withLock { recording.clear() }

    /** Solo se graban pasos que la verificación dio por buenos. */
    suspend fun recordStep(step: AgentStep, verified: Boolean) = recordMutex.withLock {
        if (!verified) return@withLock
        // Las esperas y verificaciones no forman parte del flujo útil.
        if (step.actionType in listOf(AgentActionType.WAIT, AgentActionType.VERIFY,
                AgentActionType.READ, AgentActionType.REQUEST_CONFIRMATION)) return@withLock
        recording.add(MacroStep.fromAgentStep(step))
    }

    /** Construye la macro a partir de lo grabado. Null si no hay nada útil. */
    suspend fun buildMacro(voiceCommand: String, driverKey: String?): Macro? = recordMutex.withLock {
        if (recording.isEmpty()) {
            Log.d(TAG, "Nada que grabar en esta sesión")
            return@withLock null
        }
        Macro(
            name = voiceCommand.take(60),
            description = "Grabada automáticamente el ${java.time.LocalDate.now()}",
            driverKey = driverKey,
            triggerPhrase = Macro.normalize(voiceCommand),
            steps = recording.toList(),
            enabled = true,
        )
    }

    // ── Emparejado ─────────────────────────────────────────────────────────

    fun setMacros(list: List<Macro>) {
        macros = list
        Log.i(TAG, "Macros cargadas: ${list.size} (${list.count { it.enabled }} activas)")
    }

    fun all(): List<Macro> = macros

    /**
     * ¿El comando dicho coincide con alguna macro activa?
     * Coincidencia exacta normalizada, o contenido mutuo para tolerar variaciones
     * ("abre claude dual y pregunta el tiempo" vs "…y pregúntale el tiempo").
     */
    fun match(voiceCommand: String): Macro? {
        val said = Macro.normalize(voiceCommand)
        if (said.isBlank()) return null
        val candidates = macros.filter { it.enabled && it.steps.isNotEmpty() && it.normalizedTrigger.isNotBlank() }
        return candidates.firstOrNull { it.normalizedTrigger == said }
            ?: candidates.firstOrNull { said.contains(it.normalizedTrigger) || it.normalizedTrigger.contains(said) }
                ?.takeIf { it.normalizedTrigger.length >= 8 } // evita falsos positivos con frases cortas
    }

    // ── Reproducción determinista ──────────────────────────────────────────

    /**
     * Reproduce la macro sin llamar al LLM. Cada paso pasa por PermissionGate
     * exactamente igual que en el agente: una macro NO tiene privilegios extra.
     *
     * @param onProgress callback por paso (para la burbuja y la narración).
     */
    suspend fun run(
        macro: Macro,
        autonomy: AutonomyLevel,
        onProgress: suspend (Int, Int, String, Boolean) -> Unit,
    ): MacroRunResult {
        Log.i(TAG, "Reproduciendo macro «${macro.name}» (${macro.steps.size} pasos)")
        var executed = 0
        for ((index, macroStep) in macro.steps.withIndex()) {
            currentCoroutineContext().ensureActive()
            val number = index + 1
            val step = macroStep.toAgentStep(number)
            val foreground = accessibility.currentPackage()
            val driver: DriverConfig? = registry.configForPackage(foreground)
                ?: macro.driverKey?.let { registry.getByKey(it) }

            // El Gate decide igual que con el agente: una macro tampoco puede
            // saltarse la whitelist ni la autonomía.
            when (val decision = gate.evaluate(step, driver, foreground, autonomy)) {
                is GateDecision.Deny -> {
                    Log.w(TAG, "Macro parada en el paso $number: ${decision.reason}")
                    return MacroRunResult(false, executed, number, decision.reason)
                }
                is GateDecision.RequireConfirmation -> {
                    onProgress(number, macro.steps.size, "Confirmación: ${decision.reason}", false)
                    // En reproducción no hay diálogo: se aborta y se pide al agente.
                    return MacroRunResult(false, executed, number,
                        "Este paso necesita confirmación; ejecútalo con el agente en vez de la macro")
                }
                GateDecision.Allow -> Unit
            }

            val description = driver?.let { registry.driverFor(it).describeStep(it, step) }
                ?: step.actionType.wire
            val outcome = executor.execute(step, driver)
            executed++
            onProgress(number, macro.steps.size, description, outcome.success)

            if (!outcome.success && step.actionType != AgentActionType.READ) {
                return MacroRunResult(false, executed, number,
                    "El paso $number no funcionó: ${outcome.detail}. El agente puede retomarlo con visión.")
            }
        }
        return MacroRunResult(true, executed, null, "Macro «${macro.name}» completada")
    }
}
