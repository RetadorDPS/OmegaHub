package com.phoneagent.core

import com.phoneagent.drivers.DriverLookup
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.AutonomyLevel
import com.phoneagent.models.DriverConfig
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests de PermissionGate: el único componente que decide si una acción del LLM
 * llega a tocar la pantalla.
 *
 * Estas reglas son el contrato de seguridad del producto. Un test roto aquí
 * significa que el agente puede hacer algo que el usuario no autorizó, así que
 * se cubren los cuatro niveles (whitelist, allowed_actions, autonomía, envío)
 * y los casos límite que más fácil se rompen al ampliar el vocabulario.
 */
class PermissionGateTest {

    /** Doble mínimo de DriverRegistry: suficiente para el Gate, sin Android. */
    private class FakeLookup(private val configs: List<DriverConfig>) : DriverLookup {
        override fun getByKey(driverKey: String): DriverConfig? =
            configs.firstOrNull { it.driverKey == driverKey && it.enabled }
        override fun authorizedKeys(): String =
            configs.filter { it.authorized }.joinToString(", ") { it.driverKey }
                .ifBlank { "(ninguna app autorizada)" }
    }

    private val whatsapp = DriverConfig(
        driverKey = "whatsapp", displayName = "WhatsApp", packageName = "com.whatsapp",
        authorized = true,
        uiMap = JSONObject().put("app_kind", "messaging"),
    )
    private val claude = DriverConfig(
        driverKey = "claude", displayName = "Claude", packageName = "com.anthropic.claude",
        authorized = true,
        uiMap = JSONObject().put("app_kind", "assistant"),
    )
    private val unauthorized = DriverConfig(
        driverKey = "banking", displayName = "Mi Banco", packageName = "com.mi.banco",
        authorized = false,
    )

    private val gate = PermissionGate(FakeLookup(listOf(whatsapp, claude, unauthorized)))

    private fun step(
        type: AgentActionType,
        params: String = "{}",
        requiresConfirmation: Boolean = false,
    ) = AgentStep(stepNumber = 1, actionType = type, paramsJson = params,
        requiresConfirmation = requiresConfirmation)

    // ── Nivel 1: whitelist ─────────────────────────────────────────────────

    @Test
    fun `abrir una app que no esta en la whitelist se deniega`() {
        val decision = gate.evaluate(
            step(AgentActionType.OPEN_APP, """{"driver_key":"banking"}"""),
            currentDriver = null, foregroundPackage = "com.launcher",
            autonomy = AutonomyLevel.ACT,
        )
        assertTrue("Se esperaba Deny, llegó $decision", decision is GateDecision.Deny)
    }

    @Test
    fun `abrir una app inexistente se deniega con mensaje accionable`() {
        val decision = gate.evaluate(
            step(AgentActionType.OPEN_APP, """{"driver_key":"telegram"}"""),
            currentDriver = null, foregroundPackage = null,
            autonomy = AutonomyLevel.ACT,
        )
        assertTrue(decision is GateDecision.Deny)
        assertTrue(
            "El mensaje debe listar las apps permitidas: ${(decision as GateDecision.Deny).reason}",
            decision.reason.contains("whatsapp"),
        )
    }

    @Test
    fun `tocar una app no autorizada en primer plano se deniega`() {
        val decision = gate.evaluate(
            step(AgentActionType.TAP, """{"target_text":"Aceptar"}"""),
            currentDriver = unauthorized, foregroundPackage = "com.mi.banco",
            autonomy = AutonomyLevel.ACT,
        )
        assertTrue("El agente jamás debe tocar una app no autorizada", decision is GateDecision.Deny)
    }

    @Test
    fun `abrir una app autorizada se permite`() {
        val decision = gate.evaluate(
            step(AgentActionType.OPEN_APP, """{"driver_key":"claude"}"""),
            currentDriver = null, foregroundPackage = null,
            autonomy = AutonomyLevel.READ,
        )
        assertEquals(GateDecision.Allow, decision)
    }

    // ── Nivel 2: allowed_actions del driver ────────────────────────────────

    @Test
    fun `una accion fuera de allowed_actions se deniega aunque la app este autorizada`() {
        val restrictivo = claude.copy(allowedActions = listOf("open_app", "read", "done"))
        val decision = gate.evaluate(
            step(AgentActionType.TAP, """{"target_text":"Nuevo chat"}"""),
            currentDriver = restrictivo, foregroundPackage = "com.anthropic.claude",
            autonomy = AutonomyLevel.ACT,
        )
        assertTrue(decision is GateDecision.Deny)
    }

    @Test
    fun `done siempre esta permitido aunque allowed_actions este vacio`() {
        val restrictivo = claude.copy(allowedActions = emptyList())
        assertTrue(restrictivo.allows(AgentActionType.DONE))
    }

    // ── Nivel 3: autonomía ─────────────────────────────────────────────────

    @Test
    fun `en autonomia read no se puede escribir ni tocar`() {
        for (tipo in listOf(AgentActionType.TYPE, AgentActionType.TAP, AgentActionType.SWIPE,
                AgentActionType.SCROLL, AgentActionType.LONG_PRESS,
                AgentActionType.CLEAR_TEXT, AgentActionType.PRESS_ENTER)) {
            val decision = gate.evaluate(
                step(tipo, """{"text":"hola"}"""),
                currentDriver = claude, foregroundPackage = "com.anthropic.claude",
                autonomy = AutonomyLevel.READ,
            )
            assertTrue("read debería denegar $tipo, llegó $decision", decision is GateDecision.Deny)
        }
    }

    @Test
    fun `en autonomia read si se puede leer`() {
        assertEquals(GateDecision.Allow, gate.evaluate(
            step(AgentActionType.READ), claude, "com.anthropic.claude", AutonomyLevel.READ))
    }

    // ── back y home: recuperación del agente ───────────────────────────────

    @Test
    fun `back y home se permiten siempre para poder salir de una pantalla equivocada`() {
        // Incluso en read y sin app autorizada en primer plano: son acciones del
        // sistema y son la vía de escape cuando el agente se pierde.
        for (tipo in listOf(AgentActionType.BACK, AgentActionType.HOME)) {
            assertEquals("read+$tipo", GateDecision.Allow,
                gate.evaluate(step(tipo), null, "com.whatever", AutonomyLevel.READ))
            assertEquals("act+$tipo", GateDecision.Allow,
                gate.evaluate(step(tipo), claude, "com.anthropic.claude", AutonomyLevel.ACT))
        }
    }

    // ── Nivel 4: envíos ────────────────────────────────────────────────────

    @Test
    fun `pulsar el boton Enviar en draft exige confirmacion`() {
        val decision = gate.evaluate(
            step(AgentActionType.TAP, """{"target_text":"Enviar"}"""),
            currentDriver = whatsapp, foregroundPackage = "com.whatsapp",
            autonomy = AutonomyLevel.DRAFT,
        )
        assertTrue("Enviar en draft debe pedir confirmación, llegó $decision",
            decision is GateDecision.RequireConfirmation)
    }

    @Test
    fun `pulsar Enviar en act se permite sin preguntar`() {
        val decision = gate.evaluate(
            step(AgentActionType.TAP, """{"target_text":"Enviar"}"""),
            currentDriver = whatsapp, foregroundPackage = "com.whatsapp",
            autonomy = AutonomyLevel.ACT,
        )
        assertEquals(GateDecision.Allow, decision)
    }

    @Test
    fun `pulsar Enviar en read se deniega del todo`() {
        val decision = gate.evaluate(
            step(AgentActionType.TAP, """{"target_text":"Enviar"}"""),
            currentDriver = whatsapp, foregroundPackage = "com.whatsapp",
            autonomy = AutonomyLevel.READ,
        )
        assertTrue(decision is GateDecision.Deny)
    }

    @Test
    fun `el boton de enviar declarado en el ui_map tambien cuenta como envio`() {
        val driverConUiMap = claude.copy(
            uiMap = JSONObject().put("app_kind", "assistant")
                .put("send_button_descriptions", JSONArray().put("Send prompt")),
        )
        val decision = gate.evaluate(
            step(AgentActionType.TAP, """{"target_text":"Send prompt"}"""),
            currentDriver = driverConUiMap, foregroundPackage = "com.anthropic.claude",
            autonomy = AutonomyLevel.DRAFT,
        )
        assertTrue("El ui_map debe poder declarar sus propios botones de envío",
            decision is GateDecision.RequireConfirmation)
    }

    @Test
    fun `enter en una app de mensajeria es un envio`() {
        // En WhatsApp ENTER manda el mensaje: no puede tratarse como una tecla
        // inocente. app_kind=messaging es lo que lo decide.
        assertTrue("WhatsApp debe detectarse como mensajería", whatsapp.isMessagingApp)
        val decision = gate.evaluate(
            step(AgentActionType.PRESS_ENTER),
            currentDriver = whatsapp, foregroundPackage = "com.whatsapp",
            autonomy = AutonomyLevel.DRAFT,
        )
        assertTrue("ENTER en WhatsApp debe pedir confirmación, llegó $decision",
            decision is GateDecision.RequireConfirmation)
    }

    @Test
    fun `enter en un asistente NO es un envio`() {
        // En Claude ENTER manda el prompt, pero no sale del teléfono hacia otra
        // persona: el criterio de sensibilidad es distinto y lo decide el
        // ui_map, no una regla escrita a fuego.
        assertTrue("Claude no debe detectarse como mensajería", !claude.isMessagingApp)
        val decision = gate.evaluate(
            step(AgentActionType.PRESS_ENTER),
            currentDriver = claude, foregroundPackage = "com.anthropic.claude",
            autonomy = AutonomyLevel.ACT,
        )
        assertEquals(GateDecision.Allow, decision)
    }

    @Test
    fun `intent send explicito se trata como envio sea cual sea la app`() {
        val decision = gate.evaluate(
            step(AgentActionType.TYPE, """{"text":"hola","intent":"send"}"""),
            currentDriver = claude, foregroundPackage = "com.anthropic.claude",
            autonomy = AutonomyLevel.DRAFT,
        )
        assertTrue(decision is GateDecision.RequireConfirmation)
    }

    @Test
    fun `un paso marcado como sensible pide confirmacion incluso en act`() {
        val decision = gate.evaluate(
            step(AgentActionType.TAP, """{"target_text":"Eliminar cuenta"}""", requiresConfirmation = true),
            currentDriver = claude, foregroundPackage = "com.anthropic.claude",
            autonomy = AutonomyLevel.ACT,
        )
        assertTrue("requires_confirmation=true debe sobrevivir al modo act",
            decision is GateDecision.RequireConfirmation)
    }

    @Test
    fun `el LLM puede pedir confirmacion explicita y se respeta`() {
        val decision = gate.evaluate(
            step(AgentActionType.REQUEST_CONFIRMATION, """{"reason":"voy a borrar 40 chats"}"""),
            currentDriver = whatsapp, foregroundPackage = "com.whatsapp",
            autonomy = AutonomyLevel.ACT,
        )
        assertTrue(decision is GateDecision.RequireConfirmation)
        assertTrue((decision as GateDecision.RequireConfirmation).reason.contains("borrar"))
    }
}
