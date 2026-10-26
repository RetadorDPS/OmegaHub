package com.phoneagent.core

import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class DriverVariantSelectorTest {
    private val normal = DriverConfig(
        driverKey = "claude", displayName = "Claude", packageName = "com.anthropic.claude",
        authorized = true, installed = true,
    )
    private val dual = DriverConfig(
        driverKey = "claude_dual", displayName = "Claude Dual", packageName = "com.anthropic.claude",
        isDualVariant = true, baseDriverKey = "claude", authorized = true, installed = true,
    )
    private val family = listOf(normal, dual)

    private fun open(driverKey: String) = AgentStep(
        stepNumber = 1,
        actionType = AgentActionType.OPEN_APP,
        paramsJson = JSONObject().put("driver_key", driverKey).put("keep", "value").toString(),
    )

    @Test
    fun `sin mencionar dual prefiere instalacion normal aunque el modelo elija dual`() {
        val selected = DriverVariantSelector.select(open("claude_dual"), "abre Claude", family)
        assertEquals("claude", selected.step?.paramString("driver_key"))
        assertEquals("value", selected.step?.paramString("keep"))
        assertEquals(null, selected.error)
    }

    @Test
    fun `al decir dual elige la variante dual aunque el modelo elija normal`() {
        val selected = DriverVariantSelector.select(open("claude"), "abre Claude dual", family)
        assertEquals("claude_dual", selected.step?.paramString("driver_key"))
    }

    @Test
    fun `si falta la variante preferida devuelve error en vez de abrir la otra cuenta`() {
        val onlyDualInstalled = listOf(normal.copy(installed = false), dual)
        val original = open("claude_dual")
        val selected = DriverVariantSelector.select(original, "abre Claude", onlyDualInstalled)
        assertEquals(null, selected.step)
        assertEquals(true, selected.error?.contains("versión normal") == true)
    }

    @Test
    fun `no modifica acciones distintas de abrir aplicacion`() {
        val tap = AgentStep(1, AgentActionType.TAP, "{}")
        assertEquals(tap, DriverVariantSelector.select(tap, "abre Claude dual", family).step)
    }
}
