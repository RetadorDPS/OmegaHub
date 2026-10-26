package com.phoneagent.models

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests de DriverConfig: cómo se interpreta una fila de app_drivers.
 *
 * Importan porque de aquí salen las decisiones de seguridad: `allows` dice si
 * una acción está permitida e `isMessagingApp` decide si ENTER cuenta como
 * envío. Y `fromJson` es lo que convierte la fila de Supabase en objeto, así
 * que un campo mal leído deja al agente sin restricciones.
 */
class DriverConfigTest {

    @Test
    fun `allowed_actions vacia permite todo menos lo que el Gate aparte`() {
        val cfg = DriverConfig(driverKey = "x", displayName = "X",
            packageName = "com.x", allowedActions = emptyList())
        assertTrue(cfg.allows(AgentActionType.TAP))
        assertTrue(cfg.allows(AgentActionType.PRESS_ENTER))
    }

    @Test
    fun `una accion ausente de allowed_actions se rechaza`() {
        val cfg = DriverConfig(driverKey = "x", displayName = "X",
            packageName = "com.x", allowedActions = listOf("open_app", "read"))
        assertTrue(cfg.allows(AgentActionType.READ))
        assertFalse("tap no está en allowed_actions", cfg.allows(AgentActionType.TAP))
        assertFalse(cfg.allows(AgentActionType.PRESS_ENTER))
    }

    @Test
    fun `done nunca se puede bloquear desde allowed_actions`() {
        // Bloquear 'done' dejaría al agente sin forma de terminar la tarea.
        val cfg = DriverConfig(driverKey = "x", displayName = "X",
            packageName = "com.x", allowedActions = listOf("read"))
        assertTrue(cfg.allows(AgentActionType.DONE))
    }

    @Test
    fun `app_kind messaging decide isMessagingApp`() {
        val messaging = DriverConfig(driverKey = "signal", displayName = "Signal",
            packageName = "org.thoughtcrime.securesms",
            uiMap = JSONObject().put("app_kind", "messaging"))
        assertTrue("app_kind debe mandar sobre la lista por defecto", messaging.isMessagingApp)
    }

    @Test
    fun `app_kind assistant no es mensajeria`() {
        val assistant = DriverConfig(driverKey = "gemini", displayName = "Gemini",
            packageName = "com.google.android.apps.bard",
            uiMap = JSONObject().put("app_kind", "assistant"))
        assertFalse(assistant.isMessagingApp)
    }

    @Test
    fun `sin app_kind se deduce de la lista por defecto`() {
        // Compatibilidad con filas antiguas que aún no declaran app_kind.
        val viejo = DriverConfig(driverKey = "whatsapp", displayName = "WhatsApp",
            packageName = "com.whatsapp", uiMap = JSONObject())
        assertTrue(viejo.isMessagingApp)

        val otro = DriverConfig(driverKey = "claude", displayName = "Claude",
            packageName = "com.anthropic.claude", uiMap = JSONObject())
        assertFalse(otro.isMessagingApp)
    }

    @Test
    fun `uiStrings lee arrays del ui_map y devuelve vacio si faltan`() {
        val cfg = DriverConfig(driverKey = "x", displayName = "X", packageName = "com.x",
            uiMap = JSONObject().put("send_button_descriptions",
                JSONArray().put("Enviar").put("Send")))
        assertEquals(listOf("Enviar", "Send"), cfg.uiStrings("send_button_descriptions"))
        assertEquals(emptyList<String>(), cfg.uiStrings("clave_inexistente"))
    }

    @Test
    fun `un clon hereda el driver de su base`() {
        // Claude Dual es un clon: no tiene driver propio, lo navega ClaudeDriver.
        val clon = DriverConfig(driverKey = "claude_dual", displayName = "Claude Dual",
            packageName = "com.anthropic.claude.dual", isDualVariant = true,
            baseDriverKey = "claude")
        assertEquals("claude", clon.effectiveDriverKey)

        val normal = DriverConfig(driverKey = "claude", displayName = "Claude",
            packageName = "com.anthropic.claude")
        assertEquals("claude", normal.effectiveDriverKey)
    }

    @Test
    fun `fromJson rellena allowed_actions con el valor por defecto si la fila no los trae`() {
        // Una fila antigua sin allowed_actions NO debe quedar sin restricciones.
        val cfg = DriverConfig.fromJson(JSONObject()
            .put("driver_key", "claude")
            .put("display_name", "Claude")
            .put("package_name", "com.anthropic.claude"))
        assertEquals(DriverConfig.DEFAULT_ACTIONS, cfg.allowedActions)
        assertTrue("press_enter falta del vocabulario por defecto",
            cfg.allowedActions.contains("press_enter"))
    }

    @Test
    fun `allowed_actions lleva 13 verbos porque done y request_confirmation son meta-acciones`() {
        // Invariante entre tres sitios: DriverConfig.DEFAULT_ACTIONS, el DEFAULT
        // del DDL en 001_full_schema.sql y la comprobación del job 'sql' de CI.
        // PermissionGate resuelve DONE y REQUEST_CONFIRMATION antes de consultar
        // allows(), así que listarlos aquí no cambiaría nada.
        assertEquals(13, DriverConfig.DEFAULT_ACTIONS.size)
        assertFalse("done no debe estar en allowed_actions",
            DriverConfig.DEFAULT_ACTIONS.contains("done"))
        assertFalse("request_confirmation no debe estar en allowed_actions",
            DriverConfig.DEFAULT_ACTIONS.contains("request_confirmation"))
        // Las otras 13 sí, incluidas las que se añadieron después.
        for (wire in listOf("open_app", "tap", "swipe", "scroll", "type", "read",
                "verify", "wait", "back", "home", "long_press", "clear_text", "press_enter")) {
            assertTrue("falta $wire", DriverConfig.DEFAULT_ACTIONS.contains(wire))
        }
    }

    @Test
    fun `fromJson conserva el dueno de la fila para no pisar el seed global`() {
        // La columna se llama user_id en la base; toJson no la escribe a
        // propósito porque saveUserDriver la pone explícitamente al guardar.
        val cfg = DriverConfig.fromJson(JSONObject()
            .put("driver_key", "claude")
            .put("display_name", "Claude")
            .put("package_name", "com.anthropic.claude")
            .put("user_id", "11111111-2222-3333-4444-555555555555"))
        assertEquals("11111111-2222-3333-4444-555555555555", cfg.ownerUserId)

        val anonima = DriverConfig.fromJson(JSONObject()
            .put("driver_key", "claude").put("package_name", "com.anthropic.claude"))
        assertNull("Una fila del seed global no tiene dueño", anonima.ownerUserId)
    }

    @Test
    fun `toJson y fromJson hacen ida y vuelta`() {
        val original = DriverConfig(
            driverKey = "whatsapp", displayName = "WhatsApp", packageName = "com.whatsapp",
            packagePatterns = listOf("com.whatsapp.*"), authorized = true, enabled = true,
            allowedActions = listOf("open_app", "tap", "type", "press_enter"),
            uiMap = JSONObject().put("app_kind", "messaging")
                .put("input_hints", JSONArray().put("Mensaje")),
        )
        val parsed = DriverConfig.fromJson(original.toJson())
        assertEquals(original.driverKey, parsed.driverKey)
        assertEquals(original.packagePatterns, parsed.packagePatterns)
        assertEquals(original.allowedActions, parsed.allowedActions)
        assertTrue(parsed.isMessagingApp)
        assertEquals(listOf("Mensaje"), parsed.uiStrings("input_hints"))
    }
}
