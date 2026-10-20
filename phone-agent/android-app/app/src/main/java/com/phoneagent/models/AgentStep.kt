package com.phoneagent.models

import org.json.JSONObject

/** Tipos de acción que el LLM puede pedir. Espejo exacto del contrato JSON
 *  de las Edge Functions plan-task / verify-and-next. */
enum class AgentActionType(val wire: String) {
    TAP("tap"), SWIPE("swipe"), TYPE("type"), SCROLL("scroll"), WAIT("wait"),
    OPEN_APP("open_app"), READ("read"), VERIFY("verify"),
    REQUEST_CONFIRMATION("request_confirmation"), DONE("done"), UNKNOWN("unknown");

    companion object {
        fun fromWire(value: String?): AgentActionType =
            entries.firstOrNull { it.wire == value?.lowercase() } ?: UNKNOWN
    }
}

/**
 * Un paso atómico del plan. Los parámetros viajan como JSON crudo porque cada
 * acción usa claves distintas (x/y, text, direction, driver_key…); los helpers
 * paramXxx leen con valores por defecto seguros en vez de reventar.
 */
data class AgentStep(
    val stepNumber: Int,
    val actionType: AgentActionType,
    val paramsJson: String = "{}",
    val expectedResult: String = "",
    val requiresConfirmation: Boolean = false,
) {
    private val params: JSONObject by lazy {
        runCatching { JSONObject(paramsJson) }.getOrDefault(JSONObject())
    }
    fun paramString(key: String, default: String = ""): String =
        if (params.has(key) && !params.isNull(key)) params.optString(key, default) else default
    fun paramInt(key: String, default: Int = 0): Int = params.optInt(key, default)
    fun paramLong(key: String, default: Long = 0L): Long = params.optLong(key, default)
    fun paramFloat(key: String, default: Float = 0f): Float =
        params.optDouble(key, default.toDouble()).toFloat()
    fun hasParam(key: String): Boolean = params.has(key) && !params.isNull(key)

    fun toJson(): JSONObject = JSONObject().apply {
        put("step_number", stepNumber)
        put("type", actionType.wire)
        put("params", runCatching { JSONObject(paramsJson) }.getOrDefault(JSONObject()))
        put("expected_result", expectedResult)
        put("requires_confirmation", requiresConfirmation)
    }

    companion object {
        /** Parsea el objeto "action" que devuelve el LLM. */
        fun fromLlmJson(stepNumber: Int, json: JSONObject): AgentStep {
            val action = json.optJSONObject("action") ?: json
            return AgentStep(
                stepNumber = stepNumber,
                actionType = AgentActionType.fromWire(action.optString("type")),
                paramsJson = (action.optJSONObject("params") ?: JSONObject()).toString(),
                expectedResult = action.optString("expected_result", ""),
                requiresConfirmation = json.optBoolean("requires_confirmation", false) ||
                    action.optBoolean("requires_confirmation", false),
            )
        }
    }
}

/** Respuesta completa de plan-task / de cada verificación. */
data class ActionPlan(
    val screenAnalysis: String,
    val currentApp: String,
    val action: AgentStep,
    val confidence: Float,
    val requiresConfirmation: Boolean,
    val taskProgress: String,
) {
    companion object {
        fun fromJson(json: JSONObject, stepNumber: Int): ActionPlan = ActionPlan(
            screenAnalysis = json.optString("screen_analysis", ""),
            currentApp = json.optString("current_app", "desconocida"),
            action = AgentStep.fromLlmJson(stepNumber, json),
            confidence = json.optDouble("confidence", 0.5).toFloat().coerceIn(0f, 1f),
            requiresConfirmation = json.optBoolean("requires_confirmation", false),
            taskProgress = json.optString("task_progress", "paso $stepNumber"),
        )
    }
}

/** Respuesta de verify-and-next. */
data class VerificationResult(
    val verified: Boolean,
    val shouldStop: Boolean,
    val reason: String,
    val screenAnalysis: String,
    val currentApp: String,
    val confidence: Float,
    val nextStep: AgentStep?,
    val message: String,
) {
    companion object {
        fun fromJson(json: JSONObject, nextStepNumber: Int): VerificationResult {
            val next = json.optJSONObject("next_step") ?: json.optJSONObject("correction")
            val nextStep = next?.let { n ->
                val actionObj = n.optJSONObject("action") ?: n
                AgentStep(
                    stepNumber = n.optInt("step_number", nextStepNumber),
                    actionType = AgentActionType.fromWire(actionObj.optString("type")),
                    paramsJson = (actionObj.optJSONObject("params") ?: JSONObject()).toString(),
                    expectedResult = actionObj.optString("expected_result", ""),
                    requiresConfirmation = n.optBoolean("requires_confirmation", false),
                )
            }
            return VerificationResult(
                verified = json.optBoolean("verified", false),
                shouldStop = json.optBoolean("should_stop", false),
                reason = json.optString("reason", ""),
                screenAnalysis = json.optString("screen_analysis", ""),
                currentApp = json.optString("current_app", "desconocida"),
                confidence = json.optDouble("confidence", 0.5).toFloat().coerceIn(0f, 1f),
                nextStep = nextStep,
                message = json.optString("message", ""),
            )
        }
    }
}
