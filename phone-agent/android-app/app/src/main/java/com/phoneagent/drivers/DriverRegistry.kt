package com.phoneagent.drivers

import android.util.Log
import com.phoneagent.core.ConfigManager
import com.phoneagent.models.DriverConfig
import com.phoneagent.system.DualAppDetector

/**
 * Registro dinámico de drivers. Las configs vienen de Supabase (app_drivers) y
 * se resuelven contra el teléfono con DualAppDetector. El código navegable se
 * elige por effectiveDriverKey; si una app futura no tiene clase Driver aún,
 * GenericDriver la navega por el árbol de UI genérico.
 */
class DriverRegistry(private val detector: DualAppDetector) {
    companion object { private const val TAG = "[PhoneAgent].[DriverRegistry]" }

    private val driversByKey: Map<String, AppDriver> = listOf<AppDriver>(
        ClaudeDriver(), ChatGPTDriver(), WhatsAppDriver(), GenericDriver(),
    ).associateBy { it.driverKey }

    @Volatile private var configs: List<DriverConfig> = emptyList()

    fun generic(): AppDriver = driversByKey.getValue(GenericDriver.KEY)

    /** Recarga configs desde Supabase (con caché Room) y las resuelve en el
     *  teléfono. Devuelve la lista final (con instalada/package/perfil). */
    suspend fun reload(userId: String, configManager: ConfigManager): List<DriverConfig> {
        val remote = configManager.refreshFromRemote(userId)
        val resolved = detector.resolveDrivers(remote)
        configs = resolved
        Log.i(TAG, "Drivers cargados: " + resolved.joinToString { "${it.driverKey}(auth=${it.authorized}, instalada=${it.installed}, pkg=${it.resolvedPackage}, perfil=${it.profileId})" })
        return resolved
    }

    fun setConfigs(list: List<DriverConfig>) { configs = detector.resolveDrivers(list) }
    fun all(): List<DriverConfig> = configs
    fun authorized(): List<DriverConfig> = configs.filter { it.authorized && it.enabled }

    fun getByKey(driverKey: String): DriverConfig? =
        configs.firstOrNull { it.driverKey == driverKey && it.enabled }

    /** Config de la app en primer plano según su package (resuelto o base). */
    fun configForPackage(packageName: String?): DriverConfig? {
        if (packageName.isNullOrBlank()) return null
        return configs.firstOrNull { it.enabled &&
            (it.resolvedPackage == packageName || it.packageName == packageName) }
    }

    /** Driver navegable para una config (los clones usan el de su base). */
    fun driverFor(config: DriverConfig): AppDriver =
        driversByKey[config.effectiveDriverKey]?.takeIf { it.canHandle(config) } ?: generic()

    fun authorizedKeys(): String =
        authorized().joinToString(", ") { "${it.displayName} (${it.driverKey})" }
            .ifBlank { "(ninguna app autorizada)" }
}
