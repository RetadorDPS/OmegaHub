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
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.currentSessionOrNull
import io.github.jan.supabase.auth.providers.Email
import io.github.jan.supabase.auth.signInWith
import io.github.jan.supabase.auth.signOut
import io.github.jan.supabase.auth.signUpWith
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
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
 * Dos vías, un solo sitio:
 *  - SDK oficial (createSupabaseClient) inicializado con Postgrest/Auth/
 *    Functions/Storage: sesión de Auth y acceso tipado futuro.
 *  - REST fino con OkHttp contra PostgREST y las Edge Functions: control
 *    total de timeouts (el LLM puede tardar 30-60 s) y de mensajes de error.
 *
 * Credenciales: se configuran en la propia app y se guardan cifradas. BuildConfig
 * queda como fallback solo para desarrollo local. Si el usuario inicia sesión en
 * Auth, su JWT (guardado cifrado) sustituye a la clave pública en las llamadas.
 */
class SupabaseClient(private val context: Context) {
    companion object { private const val TAG = "[PhoneAgent].[SupabaseClient]" }

    // Se leen en cada acceso para que el usuario pueda configurar el proyecto
    // desde el teléfono sin generar un APK distinto por cada clave.
    val supabaseUrl: String
        get() = (SecurePrefs.get(context, SecurePrefs.KEY_SUPABASE_URL)
            ?: BuildConfig.SUPABASE_URL).trim().removeSuffix("/")
    val anonKey: String
        get() = (SecurePrefs.get(context, SecurePrefs.KEY_SUPABASE_ANON_KEY)
            ?: BuildConfig.SUPABASE_ANON_KEY).trim()

    fun isConfigured(): Boolean = supabaseUrl.startsWith("https://") && anonKey.length > 20 &&
        !supabaseUrl.contains("TU-PROYECTO") && !supabaseUrl.contains(".invalid")

    /** Cliente del SDK oficial, recreado si el usuario cambia el proyecto desde Ajustes. */
    @Volatile private var sdkConfigKey: String? = null
    @Volatile private var sdkClientCache: io.github.jan.supabase.SupabaseClient? = null

    val sdkClient: io.github.jan.supabase.SupabaseClient
        get() {
            check(isConfigured()) { "Configura la URL y la clave pública de Supabase en Ajustes." }
            val url = supabaseUrl
            val key = anonKey
            val fingerprint = "$url\n$key"
            return synchronized(this) {
                if (sdkConfigKey != fingerprint || sdkClientCache == null) {
                    sdkClientCache = createSupabaseClient(supabaseUrl = url, supabaseKey = key) {
                        install(Postgrest)
                        install(Auth)
                        install(Functions)
                        install(Storage)
                    }
                    sdkConfigKey = fingerprint
                }
                checkNotNull(sdkClientCache)
            }
        }

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)   // el LLM con visión puede tardar
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    // ── Autenticación real (imprescindible: sin JWT, auth.uid() es NULL en el
    //    servidor y RLS bloquea TODAS las filas del usuario) ─────────────────

    /** Resultado de login/registro. */
    data class AuthResult(val userId: String, val email: String, val needsEmailConfirmation: Boolean)

    /**
     * Inicia sesión con email+password. Al terminar hay un JWT real, así que
     * auth.uid() existe en el servidor y las policies RLS funcionan.
     * Persiste user_id y token cifrados para reutilizarlos mientras duren.
     */
    suspend fun signIn(email: String, password: String): AuthResult {
        if (!isConfigured()) throw SupabaseException("Supabase no configurado. Abre Ajustes y completa la conexión de Supabase.", "NOT_CONFIGURED")
        if (email.isBlank() || password.isBlank()) throw SupabaseException("Email y contraseña son obligatorios", "BAD_INPUT")
        return try {
            val session = sdkClient.auth.signInWith(Email) {
                this.email = email
                this.password = password
            }
            persistSession(session.user?.id, session.accessToken, session.user?.email ?: email)
            AuthResult(session.user?.id.orEmpty(), session.user?.email ?: email, false)
        } catch (e: Exception) {
            throw SupabaseException("No se pudo iniciar sesión: ${e.message ?: e::class.java.simpleName}. " +
                "Revisa email/contraseña y que el usuario exista en Supabase > Authentication.", "AUTH_FAILED")
        }
    }

    /** Crea la cuenta. Si el proyecto exige confirmar el email, hay que hacerlo antes de usar la app. */
    suspend fun signUp(email: String, password: String): AuthResult {
        if (!isConfigured()) throw SupabaseException("Supabase no configurado. Abre Ajustes y completa la conexión de Supabase.", "NOT_CONFIGURED")
        if (email.isBlank() || password.isBlank()) throw SupabaseException("Email y contraseña son obligatorios", "BAD_INPUT")
        return try {
            val session = sdkClient.auth.signUpWith(Email) {
                this.email = email
                this.password = password
            }
            val id = session.user?.id.orEmpty()
            persistSession(id.ifBlank { null }, session.accessToken, email)
            AuthResult(id, email, session.accessToken.isNullOrBlank())
        } catch (e: Exception) {
            throw SupabaseException("No se pudo crear la cuenta: ${e.message ?: e::class.java.simpleName}", "SIGNUP_FAILED")
        }
    }

    suspend fun signOut() {
        runCatching { sdkClient.auth.signOut() }
        SecurePrefs.put(context, SecurePrefs.KEY_USER_JWT, null)
        SecurePrefs.put(context, SecurePrefs.KEY_USER_ID, null)
    }

    /** ¿Hay sesión utilizable (token del SDK o token persistido no caducado)? */
    suspend fun isAuthenticated(): Boolean = resolveToken() != anonKey

    private fun persistSession(userId: String?, token: String?, email: String) {
        userId?.ifBlank { null }?.let { SecurePrefs.put(context, SecurePrefs.KEY_USER_ID, it) }
        token?.ifBlank { null }?.let { SecurePrefs.put(context, SecurePrefs.KEY_USER_JWT, it) }
        email.let { SecurePrefs.put(context, SecurePrefs.KEY_USER_EMAIL, it) }
        Log.i(TAG, "Sesión de Supabase Auth iniciada para $email")
    }

    /**
     * Token para las llamadas. Prioridad:
     *   1. Sesión viva del SDK (la refresca él solo).
     *   2. Token persistido cifrado (mismo proceso o reinicio rápido).
     *   3. anon key (solo sirve para leer filas globales y llamar funciones).
     */
    private suspend fun resolveToken(): String {
        runCatching { sdkClient.auth.currentSessionOrNull()?.accessToken?.ifBlank { null } }
            .getOrNull()?.let { return it }
        SecurePrefs.get(context, SecurePrefs.KEY_USER_JWT)?.ifBlank { null }?.let { return it }
        return anonKey
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
                    val msg = runCatching { JSONObject(text).optString("error") }.getOrNull()
                        ?.ifBlank { null } ?: text.take(300)
                    val code = runCatching { JSONObject(text).optString("code") }.getOrNull()?.ifBlank { null }
                    throw SupabaseException("Supabase ${res.code}: $msg", code ?: "HTTP_${res.code}", res.code)
                }
                if (text.isBlank()) JSONObject() else runCatching { JSONObject(text) }
                    .getOrElse { JSONObject().put("raw", text) }
            }
        } catch (e: SupabaseException) { throw e }
        catch (e: IOException) {
            Log.e(TAG, "Error de red llamando a Supabase", e)
            throw SupabaseException("Sin conexión con Supabase (${e.message}). Revisa internet y la URL del proyecto.", "NO_NETWORK")
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
            "Supabase no está configurado. Abre Ajustes y completa la URL y la clave pública del proyecto.",
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
        if (!isConfigured()) throw SupabaseException("Supabase no configurado. Abre Ajustes y completa la conexión de Supabase.", "NOT_CONFIGURED")
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
            "No has iniciado sesión en Supabase. Ve a Ajustes e inicia sesión con tu email y contraseña: " +
                "sin sesión, la seguridad de la base (RLS) no deja leer ni guardar tus apps autorizadas.",
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
