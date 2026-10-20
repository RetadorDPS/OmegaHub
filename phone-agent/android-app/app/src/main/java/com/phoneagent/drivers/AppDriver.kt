package com.phoneagent.drivers

import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import com.phoneagent.system.UiNodeInfo
import org.json.JSONObject

/** Estado interpretado de una pantalla por un driver concreto. */
data class ScreenState(
    val driverKey: String,
    val screenName: String,                 // "lista_chats", "conversacion", "desconocida"…
    val visibleTexts: List<String>,
    val hasInput: Boolean,
    val inputHint: String?,
    val primaryButtons: List<String>,
    val isGenerating: Boolean = false,      // la IA de la app está escribiendo
    val navigationHint: String,
)

/**
 * Contrato de un plugin de app. CORE + PLUGINS:
 * agregar una app nueva = 1 clase que implemente esto + 1 fila en app_drivers.
 * El core (AgentEngine, PermissionGate, StepExecutor) jamás cambia.
 */
interface AppDriver {
    val driverKey: String

    /** ¿Puede este driver navegar la app de esta config? (los clones delegan
     *  en el driver de su base_driver_key vía DriverRegistry) */
    fun canHandle(config: DriverConfig): Boolean

    /** Qué sabe este driver de la pantalla actual, en lenguaje para el LLM. */
    fun getNavigationHint(config: DriverConfig, screen: ScreenState): String

    /** Interpreta el árbol de UI con el ui_map guardado en la DB. */
    fun parseScreen(config: DriverConfig, nodes: List<UiNodeInfo>): ScreenState

    /** Construye los params finales de un paso (p. ej. inyecta el target_hint
     *  correcto del campo de texto propio de la app). */
    fun buildActionParams(config: DriverConfig, step: AgentStep): JSONObject

    /** Frase humana del paso para confirmaciones y TTS: "Enviar mensaje…". */
    fun describeStep(config: DriverConfig, step: AgentStep): String

    /** Textos de sus botones de envío según el ui_map (para PermissionGate). */
    fun sendButtonTexts(config: DriverConfig): List<String> =
        config.uiStrings("send_button_descriptions")
}

/** Utilidades compartidas por todos los drivers al leer el árbol de UI. */
abstract class BaseDriver : AppDriver {

    protected fun inputNode(config: DriverConfig, nodes: List<UiNodeInfo>): UiNodeInfo? {
        val hints = config.uiStrings("input_hints")
        val editables = nodes.filter { it.editable && it.visible }
        return editables.firstOrNull { n ->
            hints.any { h -> n.text.contains(h, true) || n.contentDescription.contains(h, true) }
        } ?: editables.firstOrNull()
    }

    protected fun hasAnyText(nodes: List<UiNodeInfo>, texts: List<String>): Boolean =
        nodes.any { n -> texts.any { t ->
            n.text.contains(t, ignoreCase = true) || n.contentDescription.contains(t, ignoreCase = true) } }

    protected fun matchedTexts(nodes: List<UiNodeInfo>, texts: List<String>): List<String> =
        texts.filter { t -> nodes.any { n ->
            n.text.contains(t, ignoreCase = true) || n.contentDescription.contains(t, ignoreCase = true) } }

    override fun buildActionParams(config: DriverConfig, step: AgentStep): JSONObject {
        val params = runCatching { JSONObject(step.paramsJson) }.getOrDefault(JSONObject())
        if (step.actionType == AgentActionType.TYPE && !params.has("target_hint")) {
            config.uiStrings("input_hints").firstOrNull()?.let { params.put("target_hint", it) }
        }
        if (step.actionType == AgentActionType.TAP && !params.has("target_text") &&
            !params.has("x") && params.has("target_hint")) {
            params.put("target_text", params.optString("target_hint"))
        }
        return params
    }

    override fun describeStep(config: DriverConfig, step: AgentStep): String {
        val app = config.displayName
        return when (step.actionType) {
            AgentActionType.OPEN_APP -> "Abrir $app"
            AgentActionType.TYPE -> "Escribir en $app: «${step.paramString("text").take(80)}»"
            AgentActionType.TAP -> {
                val target = step.paramString("target_text")
                val send = sendButtonTexts(config)
                when {
                    target.isNotBlank() && send.any { it.equals(target, true) } -> "Enviar en $app"
                    target.isNotBlank() -> "Tocar «$target» en $app"
                    else -> "Tocar la pantalla en $app (${step.paramInt("x")}, ${step.paramInt("y")})"
                }
            }
            AgentActionType.SWIPE -> "Deslizar ${step.paramString("direction")} en $app"
            AgentActionType.SCROLL -> "Hacer scroll en $app"
            AgentActionType.BACK -> "Volver atrás desde $app"
            AgentActionType.HOME -> "Ir al inicio del teléfono"
            AgentActionType.LONG_PRESS -> {
                val target = step.paramString("target_text")
                if (target.isNotBlank()) "Mantener pulsado «$target» en $app"
                else "Mantener pulsado en $app (${step.paramInt("x")}, ${step.paramInt("y")})"
            }
            AgentActionType.CLEAR_TEXT -> "Borrar el texto escrito en $app"
            AgentActionType.PRESS_ENTER ->
                if (config.isMessagingApp) "Pulsar ENTER (esto ENVÍA en $app)" else "Pulsar ENTER en $app"
            AgentActionType.WAIT -> "Esperar en $app"
            AgentActionType.READ -> "Leer la pantalla de $app"
            AgentActionType.VERIFY -> "Verificar la pantalla de $app"
            AgentActionType.REQUEST_CONFIRMATION -> "Pedir confirmación en $app"
            AgentActionType.DONE -> "Terminar la tarea en $app"
            AgentActionType.UNKNOWN -> "Acción desconocida en $app"
        }
    }
}
