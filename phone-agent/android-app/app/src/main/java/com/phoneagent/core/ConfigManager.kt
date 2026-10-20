package com.phoneagent.core

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.phoneagent.models.AutonomyLevel
import com.phoneagent.models.DriverConfig
import com.phoneagent.network.SupabaseClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Preferencias CIFRADAS (EncryptedSharedPreferences): User ID, JWT opcional,
 * Anthropic API Key y ajustes de voz/autonomía. Las credenciales jamás van en
 * código ni en prefs normales.
 */
object SecurePrefs {
    const val KEY_USER_ID = "user_id"
    const val KEY_USER_JWT = "user_jwt"
    const val KEY_ANTHROPIC_API_KEY = "anthropic_api_key"
    const val KEY_USER_EMAIL = "user_email"
    const val KEY_WAKE_WORD = "wake_word"
    const val KEY_LANGUAGE = "language"
    const val KEY_AUTONOMY = "autonomy"
    const val KEY_WAKE_ENABLED = "wake_enabled"

    private const val FILE = "phoneagent_secure_prefs"

    fun prefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            context, FILE, masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun get(context: Context, key: String): String? =
        runCatching { prefs(context).getString(key, null) }.getOrNull()

    fun put(context: Context, key: String, value: String?) {
        runCatching { prefs(context).edit().apply {
            if (value.isNullOrBlank()) remove(key) else putString(key, value)
        }.apply() }
    }

    fun getBool(context: Context, key: String, default: Boolean = false): Boolean =
        runCatching { prefs(context).getBoolean(key, default) }.getOrDefault(default)

    fun putBool(context: Context, key: String, value: Boolean) {
        runCatching { prefs(context).edit().putBoolean(key, value).apply() }
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
