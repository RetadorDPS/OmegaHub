package com.phoneagent.models

import org.json.JSONObject

enum class SessionStatus(val wire: String) {
    PLANNING("planning"), RUNNING("running"), WAITING_CONFIRMATION("waiting_confirmation"),
    COMPLETED("completed"), FAILED("failed"), CANCELLED("cancelled");

    val isTerminal: Boolean get() = this == COMPLETED || this == FAILED || this == CANCELLED

    companion object {
        fun fromWire(v: String?): SessionStatus = entries.firstOrNull { it.wire == v } ?: PLANNING
    }
}

/** Nivel de autonomía global. Espejo de capability_config.autonomy_level. */
enum class AutonomyLevel(val wire: String) {
    READ("read"), DRAFT("draft"), ACT("act");

    companion object {
        fun fromWire(v: String?): AutonomyLevel = entries.firstOrNull { it.wire == v?.lowercase() } ?: DRAFT
    }
}

/** Espejo de agent_sessions + estado local de la UI. */
data class AgentSession(
    val id: String,
    val userId: String,
    val projectId: String? = null,
    val voiceCommand: String,
    val status: SessionStatus = SessionStatus.PLANNING,
    val autonomyLevel: AutonomyLevel = AutonomyLevel.DRAFT,
    val currentApp: String = "",
    val resultSummary: String? = null,
    val errorMessage: String? = null,
    val startedAt: String = "",
    val finishedAt: String? = null,
    val stepsExecuted: Int = 0,
) {
    companion object {
        fun fromJson(json: JSONObject): AgentSession = AgentSession(
            id = json.optString("id", ""),
            userId = json.optString("user_id", ""),
            projectId = json.optString("project_id").ifBlank { null },
            voiceCommand = json.optString("voice_command", ""),
            status = SessionStatus.fromWire(json.optString("status", "planning")),
            autonomyLevel = AutonomyLevel.fromWire(json.optString("autonomy_level", "draft")),
            currentApp = json.optString("current_app", ""),
            resultSummary = json.optString("result_summary").ifBlank { null },
            errorMessage = json.optString("error_message").ifBlank { null },
            startedAt = json.optString("started_at", ""),
            finishedAt = json.optString("finished_at").ifBlank { null },
        )
    }
}

/** Resultado final que AgentEngine devuelve a la UI (y que se lee por TTS). */
data class SessionResult(
    val sessionId: String,
    val status: SessionStatus,
    val summary: String,
    val stepsExecuted: Int,
    val stepsVerified: Int,
)
