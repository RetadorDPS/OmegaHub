package com.phoneagent.core

import android.util.Log
import com.phoneagent.drivers.DriverRegistry
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import com.phoneagent.system.AccessibilityController
import com.phoneagent.system.IntentLauncher
import kotlinx.coroutines.delay
import org.json.JSONObject

/** Resultado de ejecutar físicamente un paso. */
data class ExecutionOutcome(
    val success: Boolean,
    val detail: String,
    val foregroundPackage: String?,
)

/**
 * Ejecuta UN paso usando el driver de la app (para params/hints) y el
 * AccessibilityController (para los gestos). No decide nada de negocio:
 * PermissionGate ya autorizó y AgentEngine verificará después con el LLM.
 */
class StepExecutor(
    private val accessibility: AccessibilityController,
    private val intentLauncher: IntentLauncher,
    private val registry: DriverRegistry,
) {
    companion object {
        private const val TAG = "[PhoneAgent].[StepExecutor]"
        /** El LLM da coordenadas sobre una pantalla de referencia de 1080 px. */
        private const val REFERENCE_WIDTH = 1080f
    }

    suspend fun execute(step: AgentStep, currentConfig: DriverConfig?): ExecutionOutcome {
        if (!accessibility.isConnected() && step.actionType != AgentActionType.OPEN_APP) {
            return ExecutionOutcome(false,
                "El servicio de accesibilidad no está activo. Actívalo en Ajustes > Accesibilidad > Phone Agent.",
                accessibility.currentPackage())
        }
        // El driver enriquece los params (p. ej. el target_hint de su input).
        val enriched = enrichParams(step, currentConfig)
        Log.i(TAG, "Ejecutando paso #${step.stepNumber}: ${enriched.actionType} ${enriched.paramsJson}")

        val outcome = try {
            when (enriched.actionType) {
                AgentActionType.OPEN_APP -> openApp(enriched)
                AgentActionType.TAP -> tap(enriched)
                AgentActionType.TYPE -> type(enriched)
                AgentActionType.SWIPE -> gesture(enriched, scroll = false)
                AgentActionType.SCROLL -> gesture(enriched, scroll = true)
                AgentActionType.WAIT -> {
                    val ms = enriched.paramLong("ms", 1200L).coerceIn(200L, 10_000L)
                    delay(ms)
                    ExecutionOutcome(true, "Esperados ${ms} ms", accessibility.currentPackage())
                }
                AgentActionType.READ -> ExecutionOutcome(true,
                    accessibility.getUiTreeText(3000).ifBlank { "(sin texto accesible en pantalla)" },
                    accessibility.currentPackage())
                AgentActionType.VERIFY -> ExecutionOutcome(true,
                    "App en primer plano: ${accessibility.currentPackage() ?: "desconocida"}",
                    accessibility.currentPackage())
                AgentActionType.REQUEST_CONFIRMATION -> ExecutionOutcome(true,
                    "Confirmación gestionada por AgentEngine", accessibility.currentPackage())
                AgentActionType.DONE -> ExecutionOutcome(true,
                    enriched.paramString("summary").ifBlank { "Tarea completada" },
                    accessibility.currentPackage())
                AgentActionType.UNKNOWN -> ExecutionOutcome(false,
                    "Tipo de acción desconocido: el LLM devolvió un paso no soportado", accessibility.currentPackage())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error ejecutando el paso #${step.stepNumber}", e)
            ExecutionOutcome(false, "Error ejecutando la acción: ${e.message}", accessibility.currentPackage())
        }

        // Pausa de asentamiento: la UI necesita un respiro antes del screenshot.
        delay(when (enriched.actionType) {
            AgentActionType.OPEN_APP -> 400L
            AgentActionType.TYPE -> 500L
            else -> 800L
        })
        return outcome
    }

    private fun enrichParams(step: AgentStep, config: DriverConfig?): AgentStep {
        val cfg = config ?: return step
        val driver = registry.driverFor(cfg)
        val params: JSONObject = driver.buildActionParams(cfg, step)
        return step.copy(paramsJson = params.toString())
    }

    private suspend fun openApp(step: AgentStep): ExecutionOutcome {
        val key = step.paramString("driver_key")
        val config = registry.getByKey(key)
            ?: return ExecutionOutcome(false, "driver_key desconocido o no autorizado: '$key'", null)
        val pkg = config.resolvedPackage ?: config.packageName
        if (!intentLauncher.isInstalled(pkg) && config.profileId == 0) {
            return ExecutionOutcome(false, "${config.displayName} no está instalada ($pkg)", null)
        }
        val opened = intentLauncher.openApp(pkg, config.profileId)
        if (!opened) return ExecutionOutcome(false, "Android no pudo abrir ${config.displayName} ($pkg)", null)
        delay(1600)
        val fg = accessibility.currentPackage()
        val ok = fg == pkg || registry.configForPackage(fg)?.driverKey == config.driverKey
        return ExecutionOutcome(ok,
            if (ok) "${config.displayName} abierta (primer plano: $fg)" else "Se lanzó $pkg pero el primer plano es $fg",
            fg)
    }

    private fun tap(step: AgentStep): ExecutionOutcome {
        val targetText = step.paramString("target_text")
        if (targetText.isNotBlank()) {
            val ok = accessibility.tapOnText(targetText)
            return ExecutionOutcome(ok,
                if (ok) "Toque sobre «$targetText»" else "No se encontró «$targetText» en la pantalla",
                accessibility.currentPackage())
        }
        if (!step.hasParam("x") || !step.hasParam("y")) {
            return ExecutionOutcome(false, "El paso tap no trae ni coordenadas ni target_text", accessibility.currentPackage())
        }
        val scale = accessibility.displayWidth() / REFERENCE_WIDTH
        val x = (step.paramFloat("x") * scale).toInt()
        val y = (step.paramFloat("y") * scale).toInt()
        val ok = accessibility.tap(x, y)
        return ExecutionOutcome(ok, "Toque en ($x, $y) ya escalado a la pantalla real", accessibility.currentPackage())
    }

    private fun type(step: AgentStep): ExecutionOutcome {
        val text = step.paramString("text")
        if (text.isBlank()) return ExecutionOutcome(false, "El paso type no trae texto", accessibility.currentPackage())
        val hint = step.paramString("target_hint")
        val ok = accessibility.typeText(text, hint)
        return ExecutionOutcome(ok,
            if (ok) "Texto escrito (${text.length} caracteres)" else "No se encontró campo editable para escribir",
            accessibility.currentPackage())
    }

    private fun gesture(step: AgentStep, scroll: Boolean): ExecutionOutcome {
        val direction = step.paramString("direction").ifBlank { "down" }
        val ok = if (scroll) accessibility.scroll(direction) else accessibility.swipe(direction)
        return ExecutionOutcome(ok, "${if (scroll) "Scroll" else "Swipe"} $direction", accessibility.currentPackage())
    }
}
