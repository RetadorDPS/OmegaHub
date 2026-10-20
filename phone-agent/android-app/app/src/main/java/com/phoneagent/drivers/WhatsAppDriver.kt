package com.phoneagent.drivers

import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import com.phoneagent.system.UiNodeInfo
import org.json.JSONObject

/**
 * Sabe navegar WhatsApp: lista de chats con buscador, conversación con campo
 * "Message", botón enviar y pestañas. Enviar un WhatsApp es LA acción sensible
 * del MVP: PermissionGate la marca como confirmación en modo draft.
 */
class WhatsAppDriver : BaseDriver() {
    override val driverKey: String = "whatsapp"

    override fun canHandle(config: DriverConfig): Boolean =
        config.effectiveDriverKey == "whatsapp"

    override fun parseScreen(config: DriverConfig, nodes: List<UiNodeInfo>): ScreenState {
        val input = inputNode(config, nodes)
        val sendVisible = matchedTexts(nodes, config.uiStrings("send_button_descriptions"))
        val searchVisible = hasAnyText(nodes, config.uiStrings("search_texts"))
        val tabsVisible = matchedTexts(nodes, config.uiStrings("tabs"))
        val newChatVisible = hasAnyText(nodes, config.uiStrings("new_chat_texts"))

        val screenName = when {
            input != null && sendVisible.isNotEmpty() -> "conversacion"
            input != null -> "conversacion_sin_enviar"
            searchVisible || tabsVisible.isNotEmpty() || newChatVisible -> "lista_chats"
            else -> "desconocida"
        }
        return ScreenState(
            driverKey = "whatsapp",
            screenName = screenName,
            visibleTexts = nodes.map { it.text.ifBlank { it.contentDescription } }
                .filter { it.isNotBlank() }.distinct().take(50),
            hasInput = input != null,
            inputHint = config.uiStrings("input_hints").firstOrNull(),
            primaryButtons = (sendVisible + tabsVisible).distinct(),
            navigationHint = "",
        )
    }

    override fun buildActionParams(config: DriverConfig, step: AgentStep): JSONObject {
        val params = super.buildActionParams(config, step)
        // Abrir conversación por contacto: el ejecutor buscará primero con el
        // buscador si el contacto no está visible (lo indica contact_name).
        if (step.actionType == AgentActionType.TAP && params.has("contact_name")
            && !params.has("target_text")) {
            params.put("target_text", params.optString("contact_name"))
        }
        return params
    }

    override fun describeStep(config: DriverConfig, step: AgentStep): String {
        val contact = step.paramString("contact_name")
        return when {
            step.actionType == AgentActionType.TAP &&
                sendButtonTexts(config).any { it.equals(step.paramString("target_text"), true) } ->
                if (contact.isNotBlank()) "Enviar el WhatsApp a $contact" else "Enviar el WhatsApp"
            step.actionType == AgentActionType.TYPE ->
                "Escribir el mensaje de WhatsApp: «${step.paramString("text").take(80)}»"
            else -> super.describeStep(config, step)
        }
    }

    override fun getNavigationHint(config: DriverConfig, screen: ScreenState): String = when (screen.screenName) {
        "lista_chats" -> "Lista de chats de WhatsApp. Para abrir una conversación: toca el chat " +
            "por el nombre del contacto (target_text). Si no se ve, usa el buscador " +
            "(«Search») y escribe el nombre. Pestañas disponibles: ${screen.primaryButtons.joinToString(", ")}."
        "conversacion", "conversacion_sin_enviar" -> "Conversación de WhatsApp abierta. Escribe " +
            "con type en el campo «${screen.inputHint ?: "Message"}». El botón de enviar SOLO " +
            "aparece cuando hay texto escrito; enviar requiere confirmación en modo draft."
        else -> "Pantalla de WhatsApp no reconocida. Vuelve a la lista de chats (atrás) y busca " +
            "el contacto por nombre; no toques chats que no puedas identificar."
    }
}
