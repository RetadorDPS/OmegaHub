package com.phoneagent.network

import android.content.Context
import android.util.Log
import com.phoneagent.BuildConfig
import com.phoneagent.core.SecurePrefs
import com.phoneagent.models.ActionPlan
import com.phoneagent.models.DriverConfig
import com.phoneagent.models.Macro
import com.phoneagent.models.Project
import com.phoneagent.models.VerificationResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Error de red/Supabase con código legible para mostrar al usuario. */
class SupabaseException(message: String, val code: String = "NETWORK", val httpStatus: Int = 0) :
    Exception(message)

data class PlanTaskResponse(
    val sessionId: String,
    val plan: ActionPlan,
    val maxSteps: Int,
    val model: String,
)

/**
 * Cliente de Supabase de Phone Agent.
 *
 * Una sola vía REST con OkHttp para Auth, PostgREST y Edge Functions: así la
 * respuesta de registro y la persistencia de tokens quedan bajo control directo.
 *
 * El APK de distribución apunta al backend compartido con la configuración
 * pública de BuildConfig. El usuario no configura proyectos ni claves. Su JWT
 * de Auth se guarda cifrado y sustituye a la clave pública en las llamadas.
 */
class SupabaseClient(private val context: Context) {
    companion object { private const val TAG = "[PhoneAgent].[SupabaseClient]" }

    // La URL y la clave pública pertenecen al backend compartido, no al usuario.
    val supabaseUrl: String get() = BuildConfig.SUPABASE_URL.trim().removeSuffix("/")
    val anonKey: String get() = BuildConfig.SUPABASE_ANON_KEY.trim()

    fun isConfigured(): Boolean = supabaseUrl.startsWith("https://") && anonKey.length > 20 &&
        !supabaseUrl.contains("TU-PROYECTO") && !supabaseUrl.contains(".invalid")

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)   // el LLM con visión puede tardar
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    // ── Autenticación persistente por REST ─────────────────────────────────

    /** Resultado de login/registro. */
    data class AuthResult(val userId: String, val email: String, val needsEmailConfirmation: Boolean)

    private fun authUrl(path: String, query: Map<String, String> = emptyMap()): okhttp3.HttpUrl {
        val builder = "$supabaseUrl/auth/v1/$path".toHttpUrl().newBuilder()
        query.forEach { (name, value) -> builder.addQueryParameter(name, value) }
        return builder.build()
    }

    private fun authPost(
        path: String,
        payload: JSONObject,
        query: Map<String, String> = emptyMap(),
        bearerToken: String = anonKey,
    ): Request = Request.Builder()
        .url(authUrl(path, query))
        .header("apikey", anonKey)
        .header("Authorization", "Bearer $bearerToken")
        .header("Content-Type", "application/json")
        .post(payload.toString().toRequestBody("application/json".toMediaType()))
        .build()

    /**
     * Registra la cuenta directamente en Supabase Auth y persiste el JWT y el
     * refresh token cifrados. No depende de la sesión en memoria de un SDK.
     */
    suspend fun signUp(email: String, password: String): AuthResult {
        if (!isConfigured()) throw SupabaseException("La conexión del servicio no está incluida en esta versión de Phone Agent.", "NOT_CONFIGURED")
        if (email.isBlank() || password.isBlank()) throw SupabaseException("Escribe tu correo y contraseña", "BAD_INPUT")
        if (password.length < 6) throw SupabaseException("La contraseña debe tener al menos 6 caracteres", "WEAK_PASSWORD")
        return try {
            val response = execute(authPost("signup", JSONObject().put("email", email).put("password", password)))
            val user = response.optJSONObject("user") ?: response
            val accessToken = response.optString("access_token").ifBlank { null }
            val userId = user.optString("id").ifBlank { null }
            val userEmail = user.optString("email").ifBlank { email }
            if (accessToken != null && userId != null) {
                try {
                    persistSession(
                        userId = userId,
                        accessToken = accessToken,
                        refreshToken = response.optString("refresh_token").ifBlank { null },
                        expiresInSeconds = response.optLong("expires_in", 3600L),
                        email = userEmail,
                    )
                } catch (e: Exception) {
                    runCatching { clearAuthTokens() }
                    throw SupabaseException(
                        "La cuenta se creó en el servidor, pero Android no pudo guardar la sesión. Pulsa Iniciar sesión. (${e.message})",
                        "SESSION_STORAGE",
                    )
                }
                AuthResult(userId, userEmail, needsEmailConfirmation = false)
            } else {
                // Si la confirmación estuviera activada, no fingimos que ya hay sesión.
                clearAuthTokens()
                SecurePrefs.put(context, SecurePrefs.KEY_USER_EMAIL, userEmail)
                AuthResult(userId.orEmpty(), userEmail, needsEmailConfirmation = true)
            }
        } catch (e: SupabaseException) {
            throw e
        } catch (e: Exception) {
            throw SupabaseException("No se pudo crear la cuenta: ${e.message ?: e::class.java.simpleName}", "SIGNUP_FAILED")
        }
    }

    /** Inicia sesión y guarda la sesión para que sobreviva al cierre de la app. */
    suspend fun signIn(email: String, password: String): AuthResult {
        if (!isConfigured()) throw SupabaseException("La conexión del servicio no está incluida en esta versión de Phone Agent.", "NOT_CONFIGURED")
        if (email.isBlank() || password.isBlank()) throw SupabaseException("Escribe tu correo y contraseña", "BAD_INPUT")
        return try {
            val response = execute(authPost(
                path = "token",
                query = mapOf("grant_type" to "password"),
                payload = JSONObject().put("email", email).put("password", password),
            ))
            val user = response.optJSONObject("user") ?: JSONObject()
            val userId = user.optString("id").ifBlank { null }
                ?: throw SupabaseException("El servidor no devolvió la cuenta. Prueba otra vez.", "AUTH_NO_USER")
            val accessToken = response.optString("access_token").ifBlank { null }
                ?: throw SupabaseException("El servidor no abrió la sesión. Comprueba el correo y la contraseña.", "AUTH_NO_SESSION")
            val userEmail = user.optString("email").ifBlank { email }
            try {
                persistSession(
                    userId = userId,
                    accessToken = accessToken,
                    refreshToken = response.optString("refresh_token").ifBlank { null },
                    expiresInSeconds = response.optLong("expires_in", 3600L),
                    email = userEmail,
                )
            } catch (e: Exception) {
                runCatching { clearAuthTokens() }
                throw SupabaseException(
                    "El inicio de sesión funcionó, pero Android no pudo guardar la sesión. Inténtalo de nuevo. (${e.message})",
                    "SESSION_STORAGE",
                )
            }
            AuthResult(userId, userEmail, needsEmailConfirmation = false)
        } catch (e: SupabaseException) {
            throw e
        } catch (e: Exception) {
            throw SupabaseException("No se pudo iniciar sesión: ${e.message ?: e::class.java.simpleName}", "AUTH_FAILED")
        }
    }

    /** Cierra la sesión en servidor si es posible y siempre limpia el teléfono. */
    suspend fun signOut() {
        val accessToken = SecurePrefs.get(context, SecurePrefs.KEY_USER_JWT).orEmpty()
        if (accessToken.isNotBlank() && isConfigured()) {
            runCatching { execute(authPost("logout", JSONObject(), bearerToken = accessToken)) }
        }
        clearAuthTokens()
        SecurePrefs.put(context, SecurePrefs.KEY_USER_EMAIL, null)
    }

    /** ¿Hay una sesión vigente o se pudo renovar con el refresh token guardado? */
    suspend fun isAuthenticated(): Boolean =
        runCatching { resolveToken() != anonKey }.getOrDefault(false)

    private fun persistSession(
        userId: String,
        accessToken: String,
        refreshToken: String?,
        expiresInSeconds: Long,
        email: String,
    ) {
        SecurePrefs.put(context, SecurePrefs.KEY_USER_ID, userId)
        SecurePrefs.put(context, SecurePrefs.KEY_USER_JWT, accessToken)
        SecurePrefs.put(context, SecurePrefs.KEY_USER_REFRESH_TOKEN, refreshToken)
        val expiresAt = System.currentTimeMillis() + expiresInSeconds.coerceAtLeast(60L) * 1000L
        SecurePrefs.put(context, SecurePrefs.KEY_USER_TOKEN_EXPIRES_AT, expiresAt.toString())
        SecurePrefs.put(context, SecurePrefs.KEY_USER_EMAIL, email)
        Log.i(TAG, "Sesión de Phone Agent guardada para $email")
    }

    private fun clearAuthTokens() {
        SecurePrefs.put(context, SecurePrefs.KEY_USER_ID, null)
        SecurePrefs.put(context, SecurePrefs.KEY_USER_JWT, null)
        SecurePrefs.put(context, SecurePrefs.KEY_USER_REFRESH_TOKEN, null)
        SecurePrefs.put(context, SecurePrefs.KEY_USER_TOKEN_EXPIRES_AT, null)
    }

    /**
     * Obtiene el JWT guardado y lo renueva antes de que caduque. Si la red falla,
     * conserva el refresh token para poder volver a intentar más tarde.
     */
    private suspend fun resolveToken(): String {
        val accessToken = SecurePrefs.get(context, SecurePrefs.KEY_USER_JWT)?.ifBlank { null }
            ?: return anonKey
        val expiresAt = SecurePrefs.get(context, SecurePrefs.KEY_USER_TOKEN_EXPIRES_AT)?.toLongOrNull()
        if (expiresAt == null || expiresAt > System.currentTimeMillis() + 60_000L) return accessToken
        val refreshToken = SecurePrefs.get(context, SecurePrefs.KEY_USER_REFRESH_TOKEN)?.ifBlank { null }
            ?: run {
                clearAuthTokens()
                return anonKey
            }
        val response = execute(authPost(
            path = "token",
            query = mapOf("grant_type" to "refresh_token"),
            payload = JSONObject().put("refresh_token", refreshToken),
        ))
        val renewedAccess = response.optString("access_token").ifBlank { null }
            ?: throw SupabaseException("No se pudo renovar la sesión. Inicia sesión otra vez.", "REFRESH_NO_TOKEN")
        val user = response.optJSONObject("user")
        persistSession(
            userId = user?.optString("id")?.ifBlank { null }
                ?: SecurePrefs.get(context, SecurePrefs.KEY_USER_ID).orEmpty(),
            accessToken = renewedAccess,
            refreshToken = response.optString("refresh_token").ifBlank { refreshToken },
            expiresInSeconds = response.optLong("expires_in", 3600L),
            email = user?.optString("email")?.ifBlank { null }
                ?: SecurePrefs.get(context, SecurePrefs.KEY_USER_EMAIL).orEmpty(),
        )
        return renewedAccess
    }

    private suspend fun baseRequest(url: okhttp3.HttpUrl): Request.Builder = Request.Builder()
        .url(url)
        .header("apikey", anonKey)
        .header("Authorization", "Bearer ${resolveToken()}")
        .header("Content-Type", "application/json")

    private suspend fun execute(request: Request): JSONObject = withContext(Dispatchers.IO) {
        try {
            http.newCall(request).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    val errorBody = runCatching { JSONObject(text) }.getOrNull()
                    val msg = errorBody?.optString("message")?.ifBlank { null }
                        ?: errorBody?.optString("msg")?.ifBlank { null }
                        ?: errorBody?.optString("error_description")?.ifBlank { null }
                        ?: errorBody?.optString("error")?.ifBlank { null }
                        ?: text.take(300)
                    val code = errorBody?.optString("code")?.ifBlank { null }
                        ?: errorBody?.optString("error_code")?.ifBlank { null }
                    throw SupabaseException("Supabase ${res.code}: $msg", code ?: "HTTP_${res.code}", res.code)
                }
                if (text.isBlank()) JSONObject() else runCatching { JSONObject(text) }
                    .getOrElse { JSONObject().put("raw", text) }
            }
        } catch (e: SupabaseException) { throw e }
        catch (e: IOException) {
            Log.e(TAG, "Error de red llamando a Supabase", e)
            throw SupabaseException("Sin conexión con Phone Agent (${e.message}). Revisa internet e inténtalo de nuevo.", "NO_NETWORK")
        }
    }

    private suspend fun executeArray(request: Request): JSONArray = withContext(Dispatchers.IO) {
        try {
            http.newCall(request).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) throw SupabaseException("Supabase ${res.code}: ${text.take(300)}", "HTTP_${res.code}", res.code)
                if (text.isBlank()) JSONArray() else JSONArray(text)
            }
        } catch (e: SupabaseException) { throw e }
        catch (e: IOException) { throw SupabaseException("Sin conexión con Supabase (${e.message})", "NO_NETWORK") }
    }

    private fun functionUrl(name: String) = "$supabaseUrl/functions/v1/$name".toHttpUrl()
    private fun restUrl(table: String) = "$supabaseUrl/rest/v1/$table".toHttpUrl()

    private suspend fun invokeFunction(name: String, body: JSONObject): JSONObject {
        if (!isConfigured()) throw SupabaseException(
            "La conexión del servicio no está incluida en esta versión de Phone Agent.",
            "NOT_CONFIGURED")
        Log.d(TAG, "Invocando Edge Function $name (${body.length()} campos)")
        return execute(baseRequest(functionUrl(name))
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
    }

    // ── Edge Functions ─────────────────────────────────────────────────────

    suspend fun planTask(
        userId: String, voiceCommand: String, screenshotBase64: String,
        currentApp: String, projectId: String?, autonomyWire: String, uiTree: String,
    ): PlanTaskResponse {
        val res = invokeFunction("plan-task", JSONObject().apply {
            put("user_id", userId)
            put("voice_command", voiceCommand)
            put("screenshot_base64", screenshotBase64)
            put("current_app", currentApp)
            projectId?.let { put("project_id", it) }
            put("autonomy_level", autonomyWire)
            if (uiTree.isNotBlank()) put("ui_tree", uiTree)
        })
        val sessionId = res.optString("session_id")
        if (sessionId.isBlank()) throw SupabaseException("plan-task no devolvió session_id: ${res.toString().take(300)}", "BAD_RESPONSE")
        return PlanTaskResponse(
            sessionId = sessionId,
            plan = ActionPlan.fromJson(res.getJSONObject("plan"), stepNumber = 1),
            maxSteps = res.optInt("max_steps", 25),
            model = res.optString("model", ""),
        )
    }

    suspend fun verifyAndNext(
        sessionId: String, stepNumber: Int, screenshotBase64: String,
        actionExecutedJson: String, taskGoal: String, uiTree: String,
    ): VerificationResult {
        val res = invokeFunction("verify-and-next", JSONObject().apply {
            put("session_id", sessionId)
            put("step_number", stepNumber)
            put("screenshot_base64", screenshotBase64)
            put("action_executed", runCatching { JSONObject(actionExecutedJson) }
                .getOrElse { JSONObject().put("raw", actionExecutedJson) })
            put("task_goal", taskGoal)
            if (uiTree.isNotBlank()) put("ui_tree", uiTree)
        })
        return VerificationResult.fromJson(res, nextStepNumber = stepNumber + 1)
    }

    /** Cierra la sesión y devuelve el resumen (summary) generado por el LLM. */
    suspend fun completeSession(sessionId: String, finalStatus: String, errorMessage: String?): JSONObject {
        return invokeFunction("complete-session", JSONObject().apply {
            put("session_id", sessionId)
            put("final_status", finalStatus)
            errorMessage?.let { put("error_message", it) }
        })
    }

    suspend fun checkAlerts(userId: String): JSONObject =
        invokeFunction("check-alerts", JSONObject().put("user_id", userId))

    // ── PostgREST (lecturas/escrituras directas con RLS) ───────────────────

    suspend fun fetchDrivers(userId: String): List<DriverConfig> {
        if (!isConfigured()) throw SupabaseException("La conexión del servicio no está incluida en esta versión de Phone Agent.", "NOT_CONFIGURED")
        requireAuth()
        val url = restUrl("app_drivers").newBuilder()
            .addQueryParameter("select", "*")
            .addQueryParameter("enabled", "eq.true")
            .addQueryParameter("or", "(user_id.eq.$userId,user_id.is.null)")
            .addQueryParameter("order", "display_name.asc")
            .build()
        val arr = executeArray(baseRequest(url).get().build())
        // La fila del usuario (user_id = userId) manda sobre la global.
        val byKey = LinkedHashMap<String, DriverConfig>()
        for (i in 0 until arr.length()) {
            val row = arr.getJSONObject(i)
            val cfg = DriverConfig.fromJson(row)
            val isUserRow = row.optString("user_id") == userId
            val prev = byKey[cfg.driverKey]
            if (prev == null || isUserRow) byKey[cfg.driverKey] = cfg
        }
        return byKey.values.toList()
    }

    suspend fun fetchCapabilityConfig(userId: String): Map<String, JSONObject> {
        requireAuth()
        val url = restUrl("capability_config").newBuilder()
            .addQueryParameter("select", "*")
            .addQueryParameter("or", "(user_id.eq.$userId,user_id.is.null)")
            .build()
        val arr = executeArray(baseRequest(url).get().build())
        val out = LinkedHashMap<String, JSONObject>()
        for (i in 0 until arr.length()) {
            val row = arr.getJSONObject(i)
            val key = row.optString("capability_key")
            val isUserRow = row.optString("user_id") == userId
            if (!out.containsKey(key) || isUserRow) out[key] = row
        }
        return out
    }

    suspend fun fetchActiveProject(userId: String, projectId: String?): Project? {
        requireAuth()
        val builder = restUrl("projects").newBuilder()
            .addQueryParameter("select", "*")
            .addQueryParameter("user_id", "eq.$userId")
            .addQueryParameter("limit", "1")
        if (!projectId.isNullOrBlank()) builder.addQueryParameter("id", "eq.$projectId")
        else builder.addQueryParameter("is_active", "eq.true").addQueryParameter("order", "updated_at.desc")
        val arr = executeArray(baseRequest(builder.build()).get().build())
        return if (arr.length() == 0) null else Project.fromJson(arr.getJSONObject(0))
    }

    /**
     * Guarda la autorización de un driver para ESTE usuario.
     *
     * Ojo con el detalle que rompe todo: la lista que llega viene de filas
     * GLOBALES (user_id NULL, el seed del sistema) o de filas propias. Si se
     * hiciera PATCH sobre el id de una fila global, se estaría reescribiendo el
     * seed de todos los usuarios. Por eso solo se actualiza cuando la fila ya
     * es del usuario; si no, se INSERTA una fila propia nueva.
     */
    suspend fun saveUserDriver(userId: String, config: DriverConfig): DriverConfig {
        requireAuth()
        val body = config.toJson().apply {
            remove("id")               // nunca se manda el id: lo decide la ruta
            put("user_id", userId)
        }
        val isOwnRow = config.ownerUserId != null && config.ownerUserId == userId
        return if (isOwnRow && config.id.isNotBlank()) {
            val url = restUrl("app_drivers").newBuilder()
                .addQueryParameter("id", "eq.${config.id}")
                .addQueryParameter("user_id", "eq.$userId")   // doble cerrojo: solo filas propias
                .build()
            val arr = executeArray(baseRequest(url)
                .header("Prefer", "return=representation")
                .patch(body.toString().toRequestBody("application/json".toMediaType())).build())
            if (arr.length() > 0) DriverConfig.fromJson(arr.getJSONObject(0)) else config
        } else {
            val arr = executeArray(baseRequest(restUrl("app_drivers"))
                .header("Prefer", "return=representation")
                .post(body.toString().toRequestBody("application/json".toMediaType())).build())
            if (arr.length() > 0) DriverConfig.fromJson(arr.getJSONObject(0)) else config
        }
    }

    // ── Macros ───────────────────────────────────────────────────────────────

    /** Macros activas y desactivadas del usuario (la UI las muestra todas). */
    suspend fun fetchMacros(userId: String): List<Macro> {
        requireAuth()
        val url = restUrl("macros").newBuilder()
            .addQueryParameter("select", "*")
            .addQueryParameter("user_id", "eq.$userId")
            .addQueryParameter("order", "updated_at.desc")
            .build()
        val arr = executeArray(baseRequest(url).get().build())
        return (0 until arr.length()).mapNotNull {
            runCatching { Macro.fromJson(arr.getJSONObject(it)) }.getOrNull()
        }
    }

    /** Crea o actualiza. Si ya tiene id, PATCH; si no, INSERT. */
    suspend fun saveMacro(userId: String, macro: Macro): Macro {
        requireAuth()
        val body = macro.toJson().apply { put("user_id", userId) }
        val request = if (macro.id.isNotBlank()) {
            val url = restUrl("macros").newBuilder()
                .addQueryParameter("id", "eq.${macro.id}")
                .addQueryParameter("user_id", "eq.$userId")   // solo macros propias
                .build()
            baseRequest(url).header("Prefer", "return=representation")
                .patch(body.toString().toRequestBody("application/json".toMediaType()))
        } else {
            baseRequest(restUrl("macros")).header("Prefer", "return=representation")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
        }
        val arr = executeArray(request.build())
        return if (arr.length() > 0) Macro.fromJson(arr.getJSONObject(0)) else macro
    }

    suspend fun deleteMacro(userId: String, macroId: String) {
        requireAuth()
        val url = restUrl("macros").newBuilder()
            .addQueryParameter("id", "eq.$macroId")
            .addQueryParameter("user_id", "eq.$userId")
            .build()
        executeArray(baseRequest(url).delete().build())
    }

    /** Sin sesión real, RLS devuelve 0 filas y el agente cree que no hay apps. */
    private suspend fun requireAuth() {
        if (!isAuthenticated()) throw SupabaseException(
            "No has iniciado sesión en Phone Agent. Ve a Ajustes e inicia sesión con tu correo y contraseña para cargar tus apps autorizadas.",
            "NOT_AUTHENTICATED")
    }

    suspend fun updateProjectContext(projectId: String, summary: String, pendingItems: List<String>, context: JSONObject) {
        val url = restUrl("projects").newBuilder().addQueryParameter("id", "eq.$projectId").build()
        val body = JSONObject().apply {
            put("summary", summary)
            put("pending_items", org.json.JSONArray(pendingItems))
            put("context", context)
        }
        execute(baseRequest(url).patch(body.toString().toRequestBody("application/json".toMediaType())).build())
    }

    /** Telemetría best-effort: si falla, jamás rompe el flujo del agente. */
    suspend fun logEvent(userId: String?, sessionId: String?, level: String, eventType: String, message: String, payload: JSONObject = JSONObject()) {
        if (!isConfigured() || userId.isNullOrBlank()) return
        try {
            val body = JSONObject().apply {
                put("user_id", userId); sessionId?.let { put("session_id", it) }
                put("level", level); put("source", "android")
                put("event_type", eventType); put("message", message); put("payload", payload)
            }
            execute(baseRequest(restUrl("event_log"))
                .post(body.toString().toRequestBody("application/json".toMediaType())).build())
        } catch (e: Exception) { Log.w(TAG, "logEvent no enviado ($eventType): ${e.message}") }
    }

    /**
     * Sube un screenshot al bucket privado 'screenshots' (auto-borrado 24 h).
     * Ruta: {user_id}/{session_id}_paso{n}.jpg — coincide con las policies.
     * Devuelve la ruta o null si falla (la verificación sigue sin la foto).
     */
    suspend fun uploadScreenshot(userId: String, sessionId: String, stepNumber: Int, jpeg: ByteArray): String? {
        if (!isConfigured()) return null
        val path = "$userId/${sessionId}_paso$stepNumber.jpg"
        val url = "$supabaseUrl/storage/v1/object/screenshots/$path".toHttpUrl()
        return try {
            withContext(Dispatchers.IO) {
                http.newCall(baseRequest(url)
                    .header("Content-Type", "image/jpeg").header("x-upsert", "true")
                    .post(jpeg.toRequestBody("image/jpeg".toMediaType())).build()
                ).execute().use { res -> if (res.isSuccessful) path else null }
            }
        } catch (e: Exception) { Log.w(TAG, "Screenshot no subido: ${e.message}"); null }
    }
}
