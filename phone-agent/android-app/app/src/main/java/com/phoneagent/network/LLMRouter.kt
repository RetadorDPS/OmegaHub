package com.phoneagent.network

import android.content.Context
import android.util.Log
import com.phoneagent.core.SecurePrefs
import com.phoneagent.models.ActionPlan
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import com.phoneagent.models.VerificationResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Plan ya ruteado: si sessionId empieza por "local-", no hay fila en DB y la
 *  verificación/resumen se hacen con Claude directo (modo sin backend). */
data class RoutedPlan(val sessionId: String, val plan: ActionPlan, val maxSteps: Int, val isLocal: Boolean)

/**
 * Router de LLMs. Hoy todo va a Claude, pero la decisión vive SOLO aquí:
 * para añadir otro proveedor se implementa su rama en askDirect() y en la
 * lectura de capability_config, sin tocar AgentEngine.
 *
 * Ruta principal: Edge Functions de Supabase (la API key vive en el servidor).
 * Ruta de respaldo: si las funciones fallan y el usuario pegó su Anthropic
 * API Key en Ajustes, se llama a Claude directamente desde el teléfono.
 */
class LLMRouter(private val context: Context, private val supabase: SupabaseClient) {
    companion object { private const val TAG = "[PhoneAgent].[LLMRouter]" }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS).build()

    fun directApiKey(): String? = SecurePrefs.get(context, SecurePrefs.KEY_ANTHROPIC_API_KEY)
        ?.takeIf { it.startsWith("sk-ant-") }

    fun modelFromConfig(caps: Map<String, JSONObject>): String =
        caps["planner"]?.optString("model")?.ifBlank { null }
            ?: caps["vision"]?.optString("model")?.ifBlank { null }
            ?: "claude-sonnet-4-20250514"

    suspend fun plan(
        userId: String, voiceCommand: String, screenshotBase64: String, currentApp: String,
        projectId: String?, autonomyWire: String, uiTree: String,
        authorizedDrivers: List<DriverConfig>, model: String,
    ): RoutedPlan {
        try {
            val res = supabase.planTask(userId, voiceCommand, screenshotBase64, currentApp, projectId, autonomyWire, uiTree)
            return RoutedPlan(res.sessionId, res.plan, res.maxSteps, isLocal = false)
        } catch (e: SupabaseException) {
            val key = directApiKey() ?: throw e
            Log.w(TAG, "plan-task falló (${e.message}); usando Claude directo con la key de Ajustes")
            val apps = authorizedDrivers.joinToString(", ") { "${it.displayName} (driver_key: ${it.driverKey}, acciones: ${it.allowedActions})" }
            val system = """Eres Phone Agent. Controlas un teléfono Android por voz. Solo interactúas con apps autorizadas: $apps. Si ves una app no autorizada, NO la toques. Verifica cada acción antes de avanzar. Responde SOLO un JSON:
{"screen_analysis":"qué ves","current_app":"driver_key o desconocida","action":{"type":"tap|swipe|type|scroll|wait|open_app|read|verify|request_confirmation|done","params":{},"expected_result":"qué debería cambiar"},"confidence":0.0,"requires_confirmation":false,"task_progress":"paso 1 de N"}
Params: open_app {"driver_key":"..."}; tap {"x":540,"y":1200} (referencia 1080px) o {"target_text":"..."}; type {"text":"...","target_hint":"..."}; swipe/scroll {"direction":"down"}; wait {"ms":1200}; done {"summary":"..."}."""
            val raw = askClaudeDirect(system, "Comando del usuario: \"$voiceCommand\"\nApp en primer plano: $currentApp\nÁrbol de UI:\n${uiTree.take(4000)}\nDevuelve la PRIMERA acción.", screenshotBase64, key, model)
            val plan = ActionPlan.fromJson(extractJson(raw), stepNumber = 1)
            return RoutedPlan("local-" + UUID.randomUUID().toString(), plan, maxSteps = 25, isLocal = true)
        }
    }

    suspend fun verify(
        sessionId: String, stepNumber: Int, screenshotBase64: String, actionExecutedJson: String,
        taskGoal: String, uiTree: String, model: String,
    ): VerificationResult {
        if (!sessionId.startsWith("local-")) {
            return supabase.verifyAndNext(sessionId, stepNumber, screenshotBase64, actionExecutedJson, taskGoal, uiTree)
        }
        val key = directApiKey() ?: throw SupabaseException("Sesión local sin Anthropic API Key para verificar", "NO_KEY")
        val system = """Eres el verificador de Phone Agent. Mira el screenshot tras ejecutar una acción y decide si se cumplió. Responde SOLO este JSON:
{"verified":true,"screen_analysis":"...","current_app":"driver_key o desconocida","confidence":0.0,"should_stop":false,"reason":"...","next_action":{"type":"tap|swipe|type|scroll|wait|open_app|read|verify|request_confirmation|done","params":{},"expected_result":"..."}|null,"requires_confirmation":false,"message":"..."}"""
        val raw = askClaudeDirect(system, "Tarea: \"$taskGoal\"\nAcción ejecutada (paso $stepNumber): $actionExecutedJson\nÁrbol de UI:\n${uiTree.take(4000)}\n¿Se ejecutó correctamente? ¿Siguiente acción o corrección?", screenshotBase64, key, model)
        return VerificationResult.fromJson(extractJson(raw), nextStepNumber = stepNumber + 1)
    }

    /** Resumen hablado para sesiones locales (sin backend). */
    suspend fun summarizeDirect(voiceCommand: String, historyText: String, model: String): String {
        val key = directApiKey() ?: return "Tarea terminada: $voiceCommand"
        val raw = askClaudeDirect(
            "Resume en español, en máximo 2 frases cortas para leer por voz, el resultado de esta tarea de Phone Agent. Sin JSON, solo el resumen.",
            "Comando: \"$voiceCommand\"\nHistorial:\n$historyText", "", key, model)
        return raw.trim().ifBlank { "Tarea terminada: $voiceCommand" }
    }

    /** Llamada directa a la API de Anthropic (solo con key del usuario). */
    suspend fun askClaudeDirect(system: String, userText: String, imageBase64: String, apiKey: String, model: String): String =
        withContext(Dispatchers.IO) {
            val content = JSONArray()
            if (imageBase64.isNotBlank()) {
                content.put(JSONObject().apply {
                    put("type", "image")
                    put("source", JSONObject().apply {
                        put("type", "base64"); put("media_type", "image/jpeg"); put("data", imageBase64)
                    })
                })
            }
            content.put(JSONObject().put("type", "text").put("text", userText))
            val payload = JSONObject().apply {
                put("model", model); put("max_tokens", 2048); put("system", system)
                put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", content)))
            }
            val req = Request.Builder().url("https://api.anthropic.com/v1/messages")
                .header("x-api-key", apiKey).header("Anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .post(payload.toString().toRequestBody("application/json".toMediaType())).build()
            http.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) throw SupabaseException("Claude directo ${res.code}: ${text.take(300)}", "LLM_DIRECT")
                val arr = JSONObject(text).optJSONArray("content") ?: throw SupabaseException("Respuesta de Claude sin contenido", "LLM_DIRECT")
                val sb = StringBuilder()
                for (i in 0 until arr.length()) {
                    val part = arr.getJSONObject(i)
                    if (part.optString("type") == "text") sb.append(part.optString("text"))
                }
                sb.toString()
            }
        }

    private fun extractJson(text: String): JSONObject {
        val clean = text.replace("```json", "").replace("```", "").trim()
        val start = clean.indexOf('{'); val end = clean.lastIndexOf('}')
        require(start >= 0 && end > start) { "El LLM no devolvió JSON válido: ${text.take(200)}" }
        return JSONObject(clean.substring(start, end + 1))
    }
}
