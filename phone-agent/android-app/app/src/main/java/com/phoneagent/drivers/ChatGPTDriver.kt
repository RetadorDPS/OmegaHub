package com.phoneagent.drivers

import com.phoneagent.models.DriverConfig
import com.phoneagent.system.UiNodeInfo

/**
 * Sabe navegar ChatGPT: campo "Message ChatGPT", botón enviar, nuevo chat,
 * buscador de chats en el drawer, selector de modelo y detener generación.
 * Los textos concretos viven en el ui_map de la DB.
 */
class ChatGPTDriver : BaseDriver() {
    override val driverKey: String = "chatgpt"

    override fun canHandle(config: DriverConfig): Boolean =
        config.effectiveDriverKey == "chatgpt"

    override fun parseScreen(config: DriverConfig, nodes: List<UiNodeInfo>): ScreenState {
        val input = inputNode(config, nodes)
        val sendVisible = matchedTexts(nodes, config.uiStrings("send_button_descriptions"))
        val stopVisible = hasAnyText(nodes, config.uiStrings("stop_texts"))
        val newChatVisible = hasAnyText(nodes, config.uiStrings("new_chat_texts"))
        val drawerVisible = hasAnyText(nodes, config.uiStrings("drawer_texts"))
        val accountVisible = hasAnyText(nodes, config.uiStrings("account_texts"))

        val screenName = when {
            stopVisible -> "generando_respuesta"
            input != null -> "conversacion"
            newChatVisible || drawerVisible || accountVisible -> "lista_chats_o_drawer"
            else -> "desconocida"
        }
        return ScreenState(
            driverKey = "chatgpt",
            screenName = screenName,
            visibleTexts = nodes.map { it.text.ifBlank { it.contentDescription } }
                .filter { it.isNotBlank() }.distinct().take(40),
            hasInput = input != null,
            inputHint = config.uiStrings("input_hints").firstOrNull(),
            primaryButtons = (sendVisible + config.uiStrings("new_chat_texts")
                .filter { newChatVisible }).distinct(),
            isGenerating = stopVisible,
            navigationHint = "",
        )
    }

    override fun getNavigationHint(config: DriverConfig, screen: ScreenState): String = when (screen.screenName) {
        "conversacion" -> "Conversación de ChatGPT. Escribe con type (campo " +
            "\"${screen.inputHint ?: "Message ChatGPT"}\") y envía con el botón de enviar."
        "generando_respuesta" -> "ChatGPT está generando (botón Detener visible). Espera con wait " +
            "y luego lee la respuesta completa antes de decidir."
        "lista_chats_o_drawer" -> "Lista de chats de ChatGPT. «New chat» crea una conversación; " +
            "el buscador filtra por título. Toca el chat por target_text."
        else -> "Pantalla de ChatGPT no reconocida. Actúa solo por textos visibles (target_text) " +
            "y verifica con un screenshot antes de escribir."
    }
}
