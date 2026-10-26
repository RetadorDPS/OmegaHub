package com.phoneagent.drivers

import android.util.Log
import com.phoneagent.core.ConfigManager
import com.phoneagent.models.DriverConfig
import com.phoneagent.system.DualAppDetector
import java.util.ServiceConfigurationError
import java.util.ServiceLoader

/**
 * Registro dinámico de drivers. Las configs vienen de Supabase (app_drivers) y
 * se resuelven contra el teléfono con DualAppDetector.
 *
 * ESCALABILIDAD: las implementaciones de AppDriver ya NO están listadas aquí a
 * mano. Se descubren con ServiceLoader leyendo
 * `META-INF/services/com.phoneagent.drivers.AppDriver`. Añadir una app nueva es
 * de verdad "1 clase + 1 fila en app_drivers" (+ una línea en ese fichero de
 * servicios), sin tocar el core ni este registro.
 *
 * Robustez: un driver que falle al instanciarse se registra como error y se
 * descarta, pero el resto sigue funcionando. Y GenericDriver nunca puede faltar,
 * porque es el respaldo de cualquier app sin driver propio.
 */
class DriverRegistry(private val detector: DualAppDetector) : DriverLookup {
    companion object {
        private const val TAG = "[PhoneAgent].[DriverRegistry]"

        /** Respaldo si ServiceLoader no devuelve nada (R8 agresivo, APK mal
         *  empaquetado, test unitario sin recursos). Sin esto el agente se
         *  quedaría sin poder navegar nada. */
        private fun builtInDrivers(): List<AppDriver> = listOf(
            ClaudeDriver(), ChatGPTDriver(), WhatsAppDriver(), GenericDriver(),
        )

        /**
         * Descubre los drivers publicados como servicio. Devuelve null si no hay
         * fichero de servicios, para que el llamador sepa que debe usar el
         * respaldo.
         */
        private fun discoverDrivers(): List<AppDriver>? {
            val found = mutableListOf<AppDriver>()
            var sawAny = false
            val loader = try {
                ServiceLoader.load(AppDriver::class.java, AppDriver::class.java.classLoader)
            } catch (e: Exception) {
                Log.e(TAG, "ServiceLoader no disponible: ${e.message}")
                return null
            }
            // Ojo: la iteración de ServiceLoader lanza en tiempo de iteración,
            // no en load(). Hay que proteger cada paso, no solo la carga.
            val it = loader.iterator()
            while (true) {
                val driver = try {
                    if (!it.hasNext()) break
                    sawAny = true
                    it.next()
                } catch (e: ServiceConfigurationError) {
                    Log.e(TAG, "Driver descartado por error de configuración: ${e.message}")
                    continue
                } catch (e: Throwable) {
                    Log.e(TAG, "Driver descartado al instanciarse: ${e.message}", e)
                    continue
                }
                found.add(driver)
                Log.d(TAG, "Driver descubierto: ${driver.driverKey} (${driver.javaClass.simpleName})")
            }
            if (!sawAny) {
                Log.w(TAG, "META-INF/services no declara ningún AppDriver; usando la lista integrada")
                return null
            }
            return found
        }
    }

    private val driversByKey: Map<String, AppDriver> = buildMap {
        (discoverDrivers() ?: builtInDrivers()).forEach { put(it.driverKey, it) }
        // Invariante: siempre hay un genérico, aunque un servicio lo omita.
        if (GenericDriver.KEY !in this) {
            Log.w(TAG, "Ningún servicio publicó ${GenericDriver.KEY}; se añade el integrado")
            put(GenericDriver.KEY, GenericDriver())
        }
    }

    @Volatile private var configs: List<DriverConfig> = emptyList()

    init {
        Log.i(TAG, "Drivers disponibles: ${driversByKey.keys.sorted()}")
    }

    /** Claves de los drivers disponibles. Lo usa AgentEngine para explicar por
     *  qué no puede abrir una app, en vez de un genérico "no soportada". */
    fun availableDriverKeys(): Set<String> = driversByKey.keys

    fun generic(): AppDriver = driversByKey.getValue(GenericDriver.KEY)

    /** Recarga configs desde Supabase (con caché Room) y las resuelve en el
     *  teléfono. Devuelve la lista final (con instalada/package/perfil). */
    suspend fun reload(userId: String, configManager: ConfigManager): List<DriverConfig> {
        val remote = configManager.refreshFromRemote(userId)
        val resolved = detector.resolveDrivers(remote)
        configs = resolved
        Log.i(TAG, "Drivers cargados: " + resolved.joinToString { "${it.driverKey}(auth=${it.authorized}, instalada=${it.installed}, pkg=${it.resolvedPackage}, perfil=${it.profileId})" })
        val orphan = resolved.filter { it.effectiveDriverKey !in driversByKey }
        if (orphan.isNotEmpty()) {
            // No es un error: GenericDriver las navega. Pero conviene saberlo.
            Log.w(TAG, "Sin driver propio (irá con GenericDriver): " +
                orphan.joinToString { it.driverKey })
        }
        return resolved
    }

    fun setConfigs(list: List<DriverConfig>) { configs = detector.resolveDrivers(list) }
    fun all(): List<DriverConfig> = configs
    fun authorized(): List<DriverConfig> = configs.filter { it.authorized && it.enabled }

    override fun getByKey(driverKey: String): DriverConfig? =
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

    override fun authorizedKeys(): String =
        authorized().joinToString(", ") { "${it.displayName} (${it.driverKey})" }
            .ifBlank { "(ninguna app autorizada)" }
}
