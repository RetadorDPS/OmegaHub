package com.phoneagent.capabilities

import android.util.Log
import com.phoneagent.models.Project
import com.phoneagent.network.SupabaseClient
import com.phoneagent.network.SupabaseException
import org.json.JSONArray
import org.json.JSONObject

/**
 * Capacidad de memoria: lee/escribe el contexto del proyecto en Supabase.
 * Es lo que permite que el agente "recuerde" entre sesiones dónde iba un
 * trabajo (último avance, pendientes, historial breve de sesiones).
 */
class MemoryCapability(private val supabase: SupabaseClient) : Capability {
    override val key: String = "memory"

    companion object { private const val TAG = "[PhoneAgent].[Memory]" }

    override suspend fun initialize() { /* Sin estado local que preparar. */ }
    override fun shutdown() {}

    /** Proyecto indicado o el activo del usuario. Null si no hay ninguno. */
    suspend fun activeProject(userId: String, projectId: String?): Project? {
        if (userId.isBlank()) return null
        return try {
            supabase.fetchActiveProject(userId, projectId)
                .also { Log.i(TAG, "Proyecto activo: ${it?.name ?: "(ninguno)"}") }
        } catch (e: SupabaseException) {
            Log.w(TAG, "No se pudo leer el proyecto: ${e.message}")
            null
        }
    }

    /**
     * Guarda el avance tras una sesión. La Edge Function complete-session ya
     * hace esto server-side; este método cubre el modo local (sin backend) y
     * cualquier guardado extra desde la UI.
     */
    suspend fun saveProgress(
        userId: String, project: Project, lastProgress: String,
        newSummary: String, pendingItems: List<String>, sessionId: String,
    ): Boolean {
        return try {
            val context = runCatching { JSONObject(project.contextJson) }.getOrDefault(JSONObject())
            val history = context.optJSONArray("session_history") ?: JSONArray()
            history.put(JSONObject().apply {
                put("session_id", sessionId)
                put("at", java.time.Instant.now().toString())
                put("progress", lastProgress)
            })
            // Solo las últimas 20 sesiones en el contexto (JSON ligero).
            val trimmed = JSONArray()
            val from = maxOf(0, history.length() - 20)
            for (i in from until history.length()) trimmed.put(history.get(i))
            context.put("session_history", trimmed)
            context.put("last_progress", lastProgress)
            context.put("last_session_id", sessionId)
            supabase.updateProjectContext(project.id, newSummary, pendingItems, context)
            Log.i(TAG, "Progreso guardado en el proyecto ${project.name}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "saveProgress falló: ${e.message}")
            supabase.logEvent(userId, sessionId.ifBlank { null }, "warn", "memory_save_failed", e.message.orEmpty())
            false
        }
    }
}
