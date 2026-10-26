package com.phoneagent.drivers

import com.phoneagent.models.DriverConfig
import com.phoneagent.system.UiNodeInfo

/**
 * Sabe navegar Claude (y su variante DUAL: hereda vía effectiveDriverKey).
 * Conocimiento de UI: cajón de chats, campo "Message Claude", botón enviar,
 * menú de cuenta, selector de modelo y botón de detener generación.
 * Los textos concretos viven en el ui_map de la DB (editables sin recompilar).
 */
class ClaudeDriver : BaseDriver() {
    override val driverKey: String = "claude"

    override fun canHandle(config: DriverConfig): Boolean =
        config.effectiveDriverKey == "claude"

    override fun parseScreen(config: DriverConfig, nodes: List<UiNodeInfo>): ScreenState {
        val input = inputNode(config, nodes)
        val sendVisible = matchedTexts(nodes, config.uiStrings("send_button_descriptions"))
        val stopVisible = hasAnyText(nodes, config.uiStrings("stop_texts"))
        val drawerVisible = hasAnyText(nodes, config.uiStrings("drawer_texts"))
        val newChatVisible = hasAnyText(nodes, config.uiStrings("new_chat_texts"))
        val accountVisible = hasAnyText(nodes, config.uiStrings("account_texts"))
        val modelVisible = matchedTexts(nodes, config.uiStrings("model_texts"))

        val screenName = when {
            stopVisible -> "generando_respuesta"
            input != null && (sendVisible.isNotEmpty() || drawerVisible) -> "conversacion"
            input != null -> "conversacion"
            newChatVisible || accountVisible -> "lista_chats_o_drawer"
            else -> "desconocida"
        }
        val buttons = buildList {
            if (sendVisible.isNotEmpty()) addAll(sendVisible)
            if (newChatVisible) addAll(config.uiStrings("new_chat_texts"))
            if (accountVisible) addAll(config.uiStrings("account_texts"))
            addAll(modelVisible)
        }.distinct()
        return ScreenState(
            driverKey = "claude",
            screenName = screenName,
            visibleTexts = nodes.map { it.text.ifBlank { it.contentDescription } }
                .filter { it.isNotBlank() }.distinct().take(40),
            hasInput = input != null,
            inputHint = config.uiStrings("input_hints").firstOrNull(),
            primaryButtons = buttons,
            isGenerating = stopVisible,
            navigationHint = "",
        )
    }

    override fun getNavigationHint(config: DriverConfig, screen: ScreenState): String = when (screen.screenName) {
        "conversacion" -> "Estás en una conversación de Claude. Escribe con type (campo " +
            "\"${screen.inputHint ?: "Message Claude"}\") y envía tocando el botón de enviar. " +
            "Si aparece el botón de detener, Claude aún está generando: espera con wait."
        "generando_respuesta" -> "Claude está generando una respuesta (botón Detener visible). " +
            "Usa wait hasta que desaparezca antes de leer o enviar otro mensaje."
        "lista_chats_o_drawer" -> "Estás en la lista de chats / drawer de Claude. Toca un chat " +
            "por su título (target_text) o «New chat» para empezar uno nuevo. El menú de cuenta " +
            "está en el drawer (Settings/Account)."
        else -> "Pantalla de Claude no reconocida. Lee los textos visibles y actúa solo por " +
            "target_text; si no ves el campo de mensaje, abre el drawer o vuelve atrás."
    }
}
