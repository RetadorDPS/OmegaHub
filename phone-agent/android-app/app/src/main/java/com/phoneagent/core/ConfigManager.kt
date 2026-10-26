package com.phoneagent.core

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import com.phoneagent.models.AutonomyLevel
import com.phoneagent.models.DriverConfig
import com.phoneagent.network.SupabaseClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Preferencias locales. Los tokens y claves privadas se cifran con AES-GCM y
 * una clave del Android Keystore; el resto son ajustes no secretos.
 */
object SecurePrefs {
    const val KEY_USER_ID = "user_id"
    const val KEY_USER_JWT = "user_jwt"
    const val KEY_USER_REFRESH_TOKEN = "user_refresh_token"
    const val KEY_USER_TOKEN_EXPIRES_AT = "user_token_expires_at"
    const val KEY_SUPABASE_URL = "supabase_url"
    const val KEY_SUPABASE_ANON_KEY = "supabase_anon_key"
    const val KEY_ANTHROPIC_API_KEY = "anthropic_api_key"
    const val KEY_USER_EMAIL = "user_email"
    const val KEY_WAKE_WORD = "wake_word"
    const val KEY_LANGUAGE = "language"
    const val KEY_AUTONOMY = "autonomy"
    const val KEY_WAKE_ENABLED = "wake_enabled"

    private const val FILE = "phoneagent_prefs_v2"
    private const val KEY_ALIAS = "phoneagent_tokens_aes_gcm_v1"
    private const val CIPHER_PREFIX = "v1:"
    private const val IV_BYTES = 12
    private const val TAG = "[PhoneAgent].[SecurePrefs]"
    private val keyLock = Any()
    private val secretKeys = setOf(KEY_USER_JWT, KEY_USER_REFRESH_TOKEN, KEY_ANTHROPIC_API_KEY)

    fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun get(context: Context, key: String): String? {
        val value = runCatching { prefs(context).getString(key, null) }.getOrElse {
            Log.e(TAG, "No se pudo leer la preferencia $key", it)
            return null
        } ?: return null
        if (key !in secretKeys) return value
        return runCatching { decrypt(value) }.getOrElse {
            Log.e(TAG, "No se pudo descifrar la preferencia segura $key", it)
            null
        }
    }

    /** Guarda en disco antes de devolver el control para no perder una sesión recién creada. */
    fun put(context: Context, key: String, value: String?) {
        val editor = prefs(context).edit()
        if (value.isNullOrBlank()) {
            editor.remove(key)
        } else {
            editor.putString(key, if (key in secretKeys) encrypt(value) else value)
        }
        check(editor.commit()) { "Android no pudo guardar la preferencia $key" }
    }

    fun getBool(context: Context, key: String, default: Boolean = false): Boolean =
        runCatching { prefs(context).getBoolean(key, default) }.getOrElse {
            Log.e(TAG, "No se pudo leer la preferencia $key", it)
            default
        }

    fun putBool(context: Context, key: String, value: Boolean) {
        check(prefs(context).edit().putBoolean(key, value).commit()) {
            "Android no pudo guardar la preferencia $key"
        }
    }

    private fun encrypt(value: String): String = synchronized(keyLock) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val bytes = cipher.iv + encrypted
        CIPHER_PREFIX + Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String = synchronized(keyLock) {
        require(value.startsWith(CIPHER_PREFIX)) { "Formato de preferencia segura no reconocido" }
        val bytes = Base64.decode(value.removePrefix(CIPHER_PREFIX), Base64.NO_WRAP)
        require(bytes.size > IV_BYTES) { "Preferencia segura incompleta" }
        val iv = bytes.copyOfRange(0, IV_BYTES)
        val encrypted = bytes.copyOfRange(IV_BYTES, bytes.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        generator.init(spec)
        return generator.generateKey()
    }
}

// ── Caché local (Room): copia de app_drivers + capability_config ────────────
@Entity(tableName = "cached_drivers")
data class CachedDriverEntity(
    @PrimaryKey val driverKey: String,
    val json: String,
    val updatedAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "cached_config")
data class CachedConfigEntity(
    @PrimaryKey val capabilityKey: String,
    val json: String,
    val updatedAt: Long = System.currentTimeMillis(),
)

@Dao
interface ConfigDao {
    @Query("SELECT * FROM cached_drivers") suspend fun allDrivers(): List<CachedDriverEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertDriver(row: CachedDriverEntity)
    @Query("SELECT * FROM cached_config") suspend fun allConfig(): List<CachedConfigEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertConfig(row: CachedConfigEntity)
}

@Database(entities = [CachedDriverEntity::class, CachedConfigEntity::class], version = 1, exportSchema = false)
abstract class PhoneAgentDatabase : RoomDatabase() { abstract fun configDao(): ConfigDao }

/**
 * Configuración efectiva del agente. Prioridad:
 *   Ajustes locales (cifrados) > capability_config de Supabase > defaults.
 * Refresca desde Supabase y cachea en Room para funcionar con red intermitente.
 */
class ConfigManager(private val context: Context, private val supabase: SupabaseClient) {
    companion object { private const val TAG = "[PhoneAgent].[ConfigManager]" }

    private val db: PhoneAgentDatabase by lazy {
        Room.databaseBuilder(context, PhoneAgentDatabase::class.java, "phoneagent.db").build()
    }

    @Volatile private var remoteCaps: Map<String, JSONObject> = emptyMap()

    suspend fun refreshFromRemote(userId: String): List<DriverConfig> = withContext(Dispatchers.IO) {
        if (userId.isBlank()) return@withContext cachedDrivers()
        try {
            val drivers = supabase.fetchDrivers(userId)
            drivers.forEach { db.configDao().upsertDriver(CachedDriverEntity(it.driverKey, it.toJson().toString())) }
            remoteCaps = supabase.fetchCapabilityConfig(userId)
            remoteCaps.forEach { (k, v) -> db.configDao().upsertConfig(CachedConfigEntity(k, v.toString())) }
            Log.i(TAG, "Config refrescada: ${drivers.size} drivers, ${remoteCaps.size} capacidades")
            drivers
        } catch (e: Exception) {
            Log.w(TAG, "Sin red al refrescar config; usando caché local. ${e.message}")
            cachedDrivers()
        }
    }

    suspend fun cachedDrivers(): List<DriverConfig> = withContext(Dispatchers.IO) {
        db.configDao().allDrivers().mapNotNull { row ->
            runCatching { DriverConfig.fromJson(JSONObject(row.json)) }.getOrNull()
        }
    }

    suspend fun capabilityConfig(): Map<String, JSONObject> {
        if (remoteCaps.isNotEmpty()) return remoteCaps
        return withContext(Dispatchers.IO) {
            db.configDao().allConfig().associate { it.capabilityKey to JSONObject(it.json) }
                .also { remoteCaps = it }
        }
    }

    /** Autonomía: el ajuste local manda; si no hay, la de capability_config. */
    suspend fun autonomy(): AutonomyLevel {
        SecurePrefs.get(context, SecurePrefs.KEY_AUTONOMY)?.let { return AutonomyLevel.fromWire(it) }
        val planner = capabilityConfig()["planner"]
        return AutonomyLevel.fromWire(planner?.optString("autonomy_level") ?: "draft")
    }

    fun userId(): String = SecurePrefs.get(context, SecurePrefs.KEY_USER_ID).orEmpty()
    fun wakeWord(): String = SecurePrefs.get(context, SecurePrefs.KEY_WAKE_WORD)?.ifBlank { null } ?: "oye agente"
    fun language(): String = SecurePrefs.get(context, SecurePrefs.KEY_LANGUAGE)?.ifBlank { null } ?: "es-ES"
    fun maxSteps(caps: Map<String, JSONObject>): Int =
        caps["planner"]?.optJSONObject("settings")?.optInt("max_steps", 25) ?: 25
}
