package com.phoneagent.drivers

import com.phoneagent.models.DriverConfig
import com.phoneagent.system.UiNodeInfo

/**
 * Fallback para cualquier app sin driver específico: interpreta la pantalla
 * solo con el árbol de accesibilidad (inputs, botones, textos visibles).
 * Permite que una app nueva funcione el día 1 con su fila en app_drivers,
 * antes incluso de escribir su Driver dedicado.
 */
class GenericDriver : BaseDriver() {
    companion object { const val KEY = "generic" }
    override val driverKey: String = KEY

    override fun canHandle(config: DriverConfig): Boolean = true

    override fun parseScreen(config: DriverConfig, nodes: List<UiNodeInfo>): ScreenState {
        val input = inputNode(config, nodes)
        val buttons = nodes.filter { it.clickable && it.visible }
            .map { it.text.ifBlank { it.contentDescription } }.filter { it.isNotBlank() }.distinct().take(12)
        val texts = nodes.map { it.text.ifBlank { it.contentDescription } }
            .filter { it.isNotBlank() }.distinct().take(40)
        return ScreenState(
            driverKey = config.effectiveDriverKey,
            screenName = when {
                input != null && buttons.size <= 4 -> "formulario"
                buttons.size > 4 -> "lista_o_menu"
                else -> "desconocida"
            },
            visibleTexts = texts,
            hasInput = input != null,
            inputHint = config.uiStrings("input_hints").firstOrNull(),
            primaryButtons = buttons,
            navigationHint = "",
        )
    }

    override fun getNavigationHint(config: DriverConfig, screen: ScreenState): String =
        "App sin driver específico (${config.displayName}). Navega SOLO por textos " +
        "visibles del árbol de UI. Pantalla detectada: ${screen.screenName}. " +
        "Botones disponibles: ${screen.primaryButtons.joinToString(", ").ifBlank { "ninguno" }}. " +
        (if (screen.hasInput) "Hay un campo de texto editable." else "No hay campo de texto visible.")
}
