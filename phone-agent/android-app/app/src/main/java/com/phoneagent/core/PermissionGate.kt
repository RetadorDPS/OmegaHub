package com.phoneagent.core

import android.util.Log
import com.phoneagent.drivers.DriverLookup
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.AutonomyLevel
import com.phoneagent.models.DriverConfig

/** Veredicto del guardián. TODA acción del LLM pasa por aquí antes de tocar
 *  la pantalla. Sin excepciones: si el Gate dice que no, no se ejecuta. */
sealed class GateDecision {
    object Allow : GateDecision()
    data class RequireConfirmation(val reason: String) : GateDecision()
    data class Deny(val reason: String) : GateDecision()
}

/**
 * PermissionGate — intercepta TODAS las acciones y verifica, en orden:
 *  1. ¿La app destino está autorizada? (whitelist de drivers, nada más existe)
 *  2. ¿La acción está permitida por ese driver? (allowed_actions de la DB)
 *  3. ¿El nivel de autonomía la permite? (read/draft/act)
 *  4. ¿Es un envío o acción sensible que requiere confirmación humana?
 */
class PermissionGate(private val registry: DriverLookup) {
    companion object {
        private const val TAG = "[PhoneAgent].[PermissionGate]"
        private val SEND_TEXTS = listOf(
            "Send", "Enviar", "Send message", "Enviar mensaje", "Send prompt",
        )
    }

    fun evaluate(
        step: AgentStep,
        currentDriver: DriverConfig?,
        foregroundPackage: String?,
        autonomy: AutonomyLevel,
    ): GateDecision {
        val type = step.actionType
        Log.d(TAG, "Evaluando paso #${step.stepNumber} $type (autonomía=$autonomy, app=${currentDriver?.driverKey ?: "?"})")

        // Acciones que nunca tocan contenido de apps: siempre permitidas.
        // back/home son navegación del sistema: permiten al agente SALIR de una
        // pantalla equivocada, que es justo la recuperación que le faltaba.
        if (type in listOf(AgentActionType.DONE, AgentActionType.VERIFY,
                AgentActionType.READ, AgentActionType.WAIT,
                AgentActionType.BACK, AgentActionType.HOME)) return GateDecision.Allow

        // El LLM pide confirmación explícitamente: se respeta siempre.
        if (type == AgentActionType.REQUEST_CONFIRMATION) {
            return GateDecision.RequireConfirmation(
                step.paramString("reason").ifBlank { "El agente solicita tu confirmación para continuar" })
        }

        // 1) Apertura de app: el destino debe estar en la whitelist autorizada.
        if (type == AgentActionType.OPEN_APP) {
            val key = step.paramString("driver_key")
            val target = registry.getByKey(key)
                ?: return GateDecision.Deny("App no autorizada o desconocida: '${key.ifBlank { "(vacío)" }}'. Apps permitidas: ${registry.authorizedKeys()}")
            if (!target.authorized) return GateDecision.Deny("La app ${target.displayName} no está autorizada en Driver Manager")
            return GateDecision.Allow
        }

        // Para el resto de acciones debe haber una app autorizada en primer plano.
        val driver = currentDriver
            ?: return GateDecision.Deny("La app en primer plano (${foregroundPackage ?: "desconocida"}) NO está autorizada. Phone Agent solo toca: ${registry.authorizedKeys()}")
        if (!driver.authorized) return GateDecision.Deny("${driver.displayName} no está autorizada")

        // 2) Acción permitida por el driver (allowed_actions de app_drivers).
        if (!driver.allows(type)) {
            return GateDecision.Deny("La acción $type no está permitida en ${driver.displayName}")
        }

        // 3) Autonomía 'read': solo lectura.
        if (autonomy == AutonomyLevel.READ && type in listOf(
                AgentActionType.TYPE, AgentActionType.TAP, AgentActionType.SWIPE,
                AgentActionType.SCROLL, AgentActionType.LONG_PRESS,
                AgentActionType.CLEAR_TEXT, AgentActionType.PRESS_ENTER)) {
            return GateDecision.Deny("Nivel de autonomía 'read': solo puedo leer y resumir, no tocar ni escribir")
        }

        // 4) Envíos y acciones sensibles.
        val isSend = isSendAction(step, driver)
        if (step.requiresConfirmation || isSend) {
            return when (autonomy) {
                AutonomyLevel.READ -> GateDecision.Deny("Nivel 'read': los envíos están prohibidos")
                AutonomyLevel.DRAFT -> GateDecision.RequireConfirmation("Voy a enviar en ${driver.displayName}. ¿Confirmas?")
                AutonomyLevel.ACT -> if (step.requiresConfirmation)
                    GateDecision.RequireConfirmation("El agente marcó este paso como sensible") else GateDecision.Allow
            }
        }
        return GateDecision.Allow
    }

    /**
     * Detecta si un paso es un "envío" y por tanto sensible:
     *  - tap sobre un botón de enviar conocido (ui_map del driver o lista base)
     *  - type con intent=send explícito
     *  - press_enter dentro de una app de mensajería: en WhatsApp y compañía
     *    ENTER ENVÍA el mensaje, así que cuenta como envío aunque no haya botón.
     */
    private fun isSendAction(step: AgentStep, driver: DriverConfig): Boolean {
        if (step.paramString("intent") == "send") return true
        if (step.actionType == AgentActionType.PRESS_ENTER) return driver.isMessagingApp
        if (step.actionType != AgentActionType.TAP) return false
        val target = step.paramString("target_text")
        val byLabel = driver.uiStrings("send_button_descriptions") + SEND_TEXTS
        return target.isNotBlank() && byLabel.any { it.equals(target, ignoreCase = true) }
    }
}
