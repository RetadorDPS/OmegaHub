package com.phoneagent.models

import org.json.JSONArray
import org.json.JSONObject

/**
 * Un paso grabado de una macro.
 *
 * A diferencia de AgentStep, esto NO lo decide un LLM en tiempo de ejecución:
 * es un script estático que definió una persona (grabándolo una vez). Esa
 * distinción es literalmente la que permite publicar en Google Play, cuya
 * política de Accesibilidad prohíbe la autonomía pero exceptúa la
 * "automatización determinista que sigue un script estático definido por
 * una persona".
 */
data class MacroStep(
    val actionType: AgentActionType,
    val paramsJson: String = "{}",
    val expectedResult: String = "",
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("action_type", actionType.wire)
        put("params", runCatching { JSONObject(paramsJson) }.getOrDefault(JSONObject()))
        put("expected_result", expectedResult)
    }

    /** Convierte el paso grabado en un AgentStep ejecutable por StepExecutor. */
    fun toAgentStep(stepNumber: Int): AgentStep = AgentStep(
        stepNumber = stepNumber,
        actionType = actionType,
        paramsJson = paramsJson,
        expectedResult = expectedResult,
        requiresConfirmation = false, // el Gate la decide según la acción y la autonomía
    )

    companion object {
        fun fromJson(json: JSONObject): MacroStep? {
            val type = AgentActionType.fromWire(json.optString("action_type"))
            if (type == AgentActionType.UNKNOWN) return null
            return MacroStep(
                actionType = type,
                paramsJson = (json.optJSONObject("params") ?: JSONObject()).toString(),
                expectedResult = json.optString("expected_result", ""),
            )
        }

        fun fromAgentStep(step: AgentStep): MacroStep = MacroStep(
            actionType = step.actionType,
            paramsJson = step.paramsJson,
            expectedResult = step.expectedResult,
        )
    }
}

/** Espejo de la tabla macros. */
data class Macro(
    val id: String = "",
    val userId: String = "",
    val name: String,
    val description: String = "",
    val driverKey: String? = null,
    val triggerPhrase: String = "",
    val steps: List<MacroStep> = emptyList(),
    val enabled: Boolean = true,
    val createdAt: String = "",
    val updatedAt: String = "",
) {
    /** Clave normalizada para comparar con lo que dice el usuario. */
    val normalizedTrigger: String get() = normalize(triggerPhrase)

    fun toJson(): JSONObject = JSONObject().apply {
        if (id.isNotBlank()) put("id", id)
        put("name", name)
        put("description", description)
        put("driver_key", driverKey ?: JSONObject.NULL)
        put("trigger_phrase", triggerPhrase)
        put("steps", JSONArray().also { arr -> steps.forEach { arr.put(it.toJson()) } })
        put("enabled", enabled)
    }

    companion object {
        /** Minúsculas, sin acentos y sin signos: "¡Abre Claude!" == "abre claude". */
        fun normalize(text: String): String = text
            .lowercase()
            .replace(Regex("[\\p{Punct}¿?¡!«»\"']"), " ")
            .replace(Regex("[áàäâ]"), "a").replace(Regex("[éèëê]"), "e")
            .replace(Regex("[íìïî]"), "i").replace(Regex("[óòöô]"), "o")
            .replace(Regex("[úùüû]"), "u").replace(Regex("[ñ]"), "n")
            .replace(Regex("\\s+"), " ")
            .trim()

        fun fromJson(json: JSONObject): Macro {
            val arr = json.optJSONArray("steps")
            val steps = if (arr == null) emptyList() else
                (0 until arr.length()).mapNotNull { MacroStep.fromJson(arr.getJSONObject(it)) }
            return Macro(
                id = json.optString("id", ""),
                userId = json.optString("user_id", ""),
                name = json.optString("name", ""),
                description = json.optString("description", ""),
                driverKey = json.optString("driver_key").ifBlank { null },
                triggerPhrase = json.optString("trigger_phrase", ""),
                steps = steps,
                enabled = json.optBoolean("enabled", true),
                createdAt = json.optString("created_at", ""),
                updatedAt = json.optString("updated_at", ""),
            )
        }
    }
}
