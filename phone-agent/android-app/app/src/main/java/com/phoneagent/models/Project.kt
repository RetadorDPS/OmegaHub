package com.phoneagent.models

import org.json.JSONObject

/** Espejo de la tabla projects: la memoria de trabajo entre sesiones. */
data class Project(
    val id: String,
    val userId: String,
    val name: String,
    val phase: String = "inicio",
    val summary: String = "",
    val pendingItems: List<String> = emptyList(),
    val contextJson: String = "{}",
    val isActive: Boolean = false,
    val updatedAt: String = "",
) {
    companion object {
        fun fromJson(json: JSONObject): Project {
            val pending = json.optJSONArray("pending_items")
            return Project(
                id = json.optString("id", ""),
                userId = json.optString("user_id", ""),
                name = json.optString("name", ""),
                phase = json.optString("phase", "inicio"),
                summary = json.optString("summary", ""),
                pendingItems = if (pending == null) emptyList()
                    else (0 until pending.length()).map { pending.optString(it) },
                contextJson = (json.optJSONObject("context") ?: JSONObject()).toString(),
                isActive = json.optBoolean("is_active", false),
                updatedAt = json.optString("updated_at", ""),
            )
        }
    }
}
