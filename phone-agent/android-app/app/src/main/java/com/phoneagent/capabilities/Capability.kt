package com.phoneagent.capabilities

/**
 * Módulo activable del agente (capability_config en Supabase).
 * Cada capacidad se puede encender/apagar sin tocar el core: AgentEngine solo
 * usa las que están presentes. Agregar una capacidad futura (calendario,
 * notificaciones…) = 1 clase que implemente esto + 1 fila en capability_config.
 */
interface Capability {
    /** vision | voice | memory | planner… (capability_config.capability_key) */
    val key: String

    /** ¿Debe estar activa según la config remota/local? */
    fun isEnabled(remoteConfig: Map<String, org.json.JSONObject>): Boolean {
        val row = remoteConfig[key] ?: return true
        return row.optBoolean("enabled", true)
    }

    /** Preparación asíncrona (motores de voz, permisos…). Nunca bloquea la UI. */
    suspend fun initialize()

    /** Liberar recursos (al cancelar la sesión o cerrar la app). */
    fun shutdown()
}
