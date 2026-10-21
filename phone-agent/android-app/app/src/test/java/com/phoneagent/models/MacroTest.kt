package com.phoneagent.models

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests del vocabulario de acciones.
 *
 * Por qué importan: `fromWire` es la frontera entre lo que dice el LLM y lo que
 * el teléfono ejecuta. Si una cadena no mapea, el paso cae en UNKNOWN y
 * StepExecutor lo rechaza. Que las 15 acciones hagan ida y vuelta sin perderse
 * es lo que garantiza que ampliar el vocabulario no rompa lo anterior.
 */
class AgentActionTypeTest {

    /** Las 15 acciones del producto (UNKNOWN no se envía nunca al LLM). */
    private val productActions = listOf(
        "tap", "swipe", "type", "scroll", "wait", "open_app", "read", "verify",
        "back", "home", "long_press", "clear_text", "press_enter",
        "request_confirmation", "done",
    )

    @Test
    fun `el vocabulario del producto tiene 15 acciones`() {
        assertEquals(15, productActions.size)
        assertEquals(15, productActions.distinct().size)
    }

    @Test
    fun `cada accion hace ida y vuelta por fromWire`() {
        for (wire in productActions) {
            val parsed = AgentActionType.fromWire(wire)
            assertTrue("$wire cayó en UNKNOWN", parsed != AgentActionType.UNKNOWN)
            assertEquals("ida y vuelta rota para $wire", wire, parsed.wire)
        }
    }

    @Test
    fun `todas las acciones del enum salvo UNKNOWN estan en el vocabulario`() {
        val wires = AgentActionType.entries
            .filter { it != AgentActionType.UNKNOWN }
            .map { it.wire }
        assertEquals(
            "El enum y la lista del prompt se han desincronizado",
            productActions.sorted(), wires.sorted(),
        )
    }

    @Test
    fun `cadenas desconocidas o vacias caen en UNKNOWN`() {
        assertEquals(AgentActionType.UNKNOWN, AgentActionType.fromWire("teletransportar"))
        assertEquals(AgentActionType.UNKNOWN, AgentActionType.fromWire(""))
        assertEquals(AgentActionType.UNKNOWN, AgentActionType.fromWire(null))
    }

    @Test
    fun `fromWire normaliza mayusculas porque el LLM a veces las cambia`() {
        assertEquals(AgentActionType.TAP, AgentActionType.fromWire("TAP"))
        assertEquals(AgentActionType.PRESS_ENTER, AgentActionType.fromWire("Press_Enter"))
    }
}

/**
 * Tests de Macro: la normalización del disparador y la serialización.
 *
 * La normalización es lo que hace que "¡Abre Claude!" dicho por voz active la
 * macro grabada como "abre claude". Sin ella, la utilidad principal de las
 * macros (repetir por voz) fallaría por un acento.
 */
class MacroTest {

    @Test
    fun `normalizar quita acentos signos y mayusculas`() {
        assertEquals("abre claude", Macro.normalize("¡Abre Claude!"))
        assertEquals("abre claude", Macro.normalize("  ÁBRE   CLAUDE  "))
        assertEquals("envia mensaje a ana", Macro.normalize("Envía mensaje a Ana"))
    }

    @Test
    fun `dos formas de decir lo mismo dan la misma clave`() {
        assertEquals(Macro.normalize("abre Claude"), Macro.normalize("¡ABRE CLAUDE!"))
        assertEquals(Macro.normalize("pregunta a chatgpt"), Macro.normalize("¿Pregunta a ChatGPT?"))
    }

    @Test
    fun `normalizar no confunde palabras distintas`() {
        assertFalse(
            Macro.normalize("abre claude") == Macro.normalize("abre chatgpt"),
        )
    }

    @Test
    fun `una macro hace ida y vuelta por JSON conservando los pasos`() {
        val original = Macro(
            id = "m1", name = "Resumen diario", driverKey = "claude",
            triggerPhrase = "resumen diario",
            steps = listOf(
                MacroStep(AgentActionType.OPEN_APP, """{"driver_key":"claude"}""", "Claude abierto"),
                MacroStep(AgentActionType.TYPE, """{"text":"resume"}""", "texto escrito"),
                MacroStep(AgentActionType.PRESS_ENTER, "{}", "respuesta generándose"),
            ),
        )
        val parsed = Macro.fromJson(original.toJson())

        assertEquals(original.name, parsed.name)
        assertEquals(original.driverKey, parsed.driverKey)
        assertEquals(original.triggerPhrase, parsed.triggerPhrase)
        assertEquals(original.steps.size, parsed.steps.size)
        assertEquals(
            original.steps.map { it.actionType },
            parsed.steps.map { it.actionType },
        )
        assertEquals(original.normalizedTrigger, parsed.normalizedTrigger)
    }

    @Test
    fun `un paso con accion desconocida se descarta al leer JSON`() {
        // Si el vocabulario cambiara en el futuro, una macro vieja con una
        // acción inexistente no debe reventar la app al cargarse.
        val json = org.json.JSONObject()
            .put("action_type", "accion_del_futuro")
            .put("params", org.json.JSONObject())
        assertNull(MacroStep.fromJson(json))
    }

    @Test
    fun `toAgentStep conserva la accion y deja que el Gate decida la confirmacion`() {
        val macroStep = MacroStep(AgentActionType.PRESS_ENTER, """{"intent":"send"}""", "enviado")
        val agentStep = macroStep.toAgentStep(7)

        assertEquals(7, agentStep.stepNumber)
        assertEquals(AgentActionType.PRESS_ENTER, agentStep.actionType)
        assertEquals("enviado", agentStep.expectedResult)
        // La macro NO se salta el guardián: requires_confirmation=false significa
        // "que decida PermissionGate", no "ya está aprobado".
        assertFalse(agentStep.requiresConfirmation)
    }
}
