package com.phoneagent.models

import org.json.JSONArray
import org.json.JSONObject

/**
 * Espejo de la tabla app_drivers. Una fila = una app que el agente PUEDE tocar.
 * Agregar una app nueva = nueva clase Driver en Android + nueva fila aquí,
 * sin tocar el core (ver DriverRegistry).
 */
data class DriverConfig(
    val id: String = "",
    val driverKey: String,
    val displayName: String,
    val packageName: String,
    val packagePatterns: List<String> = emptyList(),
    val isDualVariant: Boolean = false,
    val baseDriverKey: String? = null,
    val enabled: Boolean = true,
    val authorized: Boolean = false,
    val allowedActions: List<String> = DEFAULT_ACTIONS,
    val detectionRules: JSONObject = JSONObject(),
    val uiMap: JSONObject = JSONObject(),
    // Estado local en tiempo de ejecución (no viene de la DB):
    val installed: Boolean = false,
    val resolvedPackage: String? = null,   // package real detectado (clones)
    val profileId: Int = 0,                // perfil de usuario Android (duales)
) {
    /** Clave del driver que sabe navegar esta app (los clones heredan). */
    val effectiveDriverKey: String get() = if (isDualVariant && !baseDriverKey.isNullOrBlank()) baseDriverKey else driverKey

    fun allows(action: AgentActionType): Boolean =
        allowedActions.isEmpty() || allowedActions.contains(action.wire) || action == AgentActionType.DONE

    fun uiStrings(key: String): List<String> {
        val arr = uiMap.optJSONArray(key) ?: return emptyList()
        return (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotBlank() }
    }

    fun toJson(): JSONObject = JSONObject().apply {
        if (id.isNotBlank()) put("id", id)
        put("driver_key", driverKey)
        put("display_name", displayName)
        put("package_name", packageName)
        put("package_patterns", JSONArray(packagePatterns))
        put("is_dual_variant", isDualVariant)
        put("base_driver_key", baseDriverKey ?: JSONObject.NULL)
        put("enabled", enabled)
        put("authorized", authorized)
        put("allowed_actions", JSONArray(allowedActions))
        put("detection_rules", detectionRules)
        put("ui_map", uiMap)
    }

    companion object {
        val DEFAULT_ACTIONS = listOf(
            "open_app", "tap", "swipe", "scroll", "type", "read", "verify", "wait",
        )

        fun fromJson(json: JSONObject): DriverConfig {
            fun stringList(key: String): List<String> {
                val arr = json.optJSONArray(key) ?: return emptyList()
                return (0 until arr.length()).map { arr.optString(it) }
            }
            return DriverConfig(
                id = json.optString("id", ""),
                driverKey = json.optString("driver_key", ""),
                displayName = json.optString("display_name", json.optString("driver_key", "")),
                packageName = json.optString("package_name", ""),
                packagePatterns = stringList("package_patterns"),
                isDualVariant = json.optBoolean("is_dual_variant", false),
                baseDriverKey = json.optString("base_driver_key").ifBlank { null },
                enabled = json.optBoolean("enabled", true),
                authorized = json.optBoolean("authorized", false),
                allowedActions = stringList("allowed_actions").ifEmpty { DEFAULT_ACTIONS },
                detectionRules = json.optJSONObject("detection_rules") ?: JSONObject(),
                uiMap = json.optJSONObject("ui_map") ?: JSONObject(),
            )
        }
    }
}

/** App detectada físicamente en el teléfono por DualAppDetector. */
data class InstalledAppCandidate(
    val label: String,
    val packageName: String,
    val profileId: Int,          // 0 = perfil principal; >0 = dual/clon/work
    val isSystemProfile: Boolean,
    val matchedPattern: String?,
)
