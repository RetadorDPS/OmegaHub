package com.phoneagent.system

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.LauncherApps
import android.os.UserManager
import android.util.Log
import com.phoneagent.models.DriverConfig
import com.phoneagent.models.InstalledAppCandidate

/**
 * Detecta apps clonadas/duales. Estrategias, en orden de fiabilidad:
 *  1. Perfiles de usuario: Samsung Dual Messenger, Xiaomi Segundo espacio y
 *     el perfil de trabajo instalan la MISMA app con el mismo package pero en
 *     otro UserHandle. LauncherApps las enumera por perfil.
 *  2. Patrones de package: clonadores que copian la app con otro package
 *     (*.dual, *.clone, sufijos del clonador) usando package_patterns de la DB.
 *  3. Contenedores conocidos (Parallel Space, Dual Space…): se detectan como
 *     instalados, pero el agente NUNCA los toca directamente (no están en la
 *     whitelist); sirven para avisar al usuario en Driver Manager.
 *  4. Directorios de datos: solo informativo. Android (API 29+, scoped
 *     storage) no permite leer /data de otros perfiles sin root; por eso esta
 *     vía se limita a comprobar los directorios accesibles de ESTA app.
 */
class DualAppDetector(private val context: Context) {
    companion object {
        private const val TAG = "[PhoneAgent].[DualAppDetector]"
        val CLONE_CONTAINERS = listOf(
            "com.lbe.parallel.intl", "com.parallel.space", "com.parallel.space.pro",
            "com.excelliance.multiaccount", "com.dualspace", "com.jumobile.multiapp",
            "com.cloneapp.parallelspace", "com.applisto.appcloner",
        )
    }

    /** package -> índices de perfil donde aparece como app launcher. */
    fun packagesByProfile(): Map<String, Set<Int>> {
        val launcherApps = context.getSystemService(Context.LAUNCHER_SERVICE) as LauncherApps
        val userManager = context.getSystemService(Context.USER_SERVICE) as UserManager
        val result = mutableMapOf<String, MutableSet<Int>>()
        userManager.userProfiles.forEachIndexed { index, handle ->
            try {
                launcherApps.getActivityList(null, handle).forEach { info ->
                    result.getOrPut(info.componentName.packageName) { mutableSetOf() }.add(index)
                }
            } catch (e: Exception) {
                Log.w(TAG, "No se pudo enumerar el perfil $index: ${e.message}")
            }
        }
        return result
    }

    fun installedPackageNames(): Set<String> = try {
        context.packageManager.getInstalledApplications(0)
            .map { it.packageName }.toSet()
    } catch (e: Exception) { Log.e(TAG, "getInstalledApplications falló: ${e.message}"); emptySet() }

    /** Contenedores de clonación presentes (solo para avisar, nunca se abren). */
    fun cloneContainersInstalled(): List<String> =
        installedPackageNames().filter { it in CLONE_CONTAINERS }

    /** Directorios de datos accesibles de esta app (estrategia 4, informativa). */
    fun accessibleDataDirs(): List<String> = listOfNotNull(
        context.dataDir?.absolutePath,
        context.getExternalFilesDir(null)?.absolutePath,
    )

    /**
     * Resuelve cada DriverConfig contra el teléfono real: marca instalada,
     * package resuelto y perfil. Para variantes duales prefiere el package en
     * un perfil secundario; si no lo hay, un package que cumpla los patrones.
     */
    fun resolveDrivers(drivers: List<DriverConfig>): List<DriverConfig> {
        val byProfile = packagesByProfile()
        val allInstalled = installedPackageNames() + byProfile.keys
        return drivers.map { driver ->
            val known = mutableListOf(driver.packageName)
            driver.detectionRules.optJSONArray("known_packages")?.let { arr ->
                for (i in 0 until arr.length()) known.add(arr.optString(i))
            }
            val patterns = driver.packagePatterns

            var resolved: String? = null
            var profileId = 0
            var installed = false

            if (driver.isDualVariant) {
                // 1) La app base viviendo en un perfil secundario (Dual Messenger).
                for (pkg in known) {
                    val profiles = byProfile[pkg].orEmpty()
                    val secondary = profiles.firstOrNull { it > 0 }
                    if (secondary != null) { resolved = pkg; profileId = secondary; installed = true; break }
                }
                // 2) Package clonado que cumple los patrones de la DB.
                if (resolved == null) {
                    val match = allInstalled.firstOrNull { pkg ->
                        pkg != driver.packageName && patterns.any { likeMatches(it, pkg) }
                    }
                    if (match != null) {
                        resolved = match; installed = true
                        profileId = byProfile[match]?.firstOrNull() ?: 0
                    }
                }
            }
            if (resolved == null) {
                for (pkg in known) {
                    if (pkg in allInstalled) {
                        resolved = pkg; installed = true
                        profileId = byProfile[pkg]?.minOrNull() ?: 0
                        break
                    }
                }
                if (resolved == null) {
                    // Patrón exacto también vale para no-duales (p. ej. WhatsApp Business).
                    resolved = allInstalled.firstOrNull { pkg -> patterns.any { !it.contains('%') && it == pkg } }
                    installed = resolved != null
                }
            }

            Log.i(TAG, "${driver.driverKey}: instalada=$installed package=$resolved perfil=$profileId")
            driver.copy(installed = installed, resolvedPackage = resolved, profileId = profileId)
        }
    }

    /** Candidatas físicas relacionadas con un driver (para la UI). */
    fun candidatesFor(driver: DriverConfig): List<InstalledAppCandidate> {
        val launcherApps = context.getSystemService(Context.LAUNCHER_SERVICE) as LauncherApps
        val userManager = context.getSystemService(Context.USER_SERVICE) as UserManager
        val out = mutableListOf<InstalledAppCandidate>()
        userManager.userProfiles.forEachIndexed { index, handle ->
            try {
                launcherApps.getActivityList(null, handle).forEach { info ->
                    val pkg = info.componentName.packageName
                    val pattern = when {
                        pkg == driver.packageName -> "exact_package"
                        driver.packagePatterns.any { likeMatches(it, pkg) } ->
                            driver.packagePatterns.first { likeMatches(it, pkg) }
                        else -> null
                    }
                    if (pattern != null) {
                        out.add(InstalledAppCandidate(
                            label = info.label?.toString() ?: pkg,
                            packageName = pkg, profileId = index,
                            isSystemProfile = index == 0, matchedPattern = pattern,
                        ))
                    }
                }
            } catch (e: Exception) { Log.w(TAG, "candidatesFor perfil $index: ${e.message}") }
        }
        return out.distinctBy { it.packageName to it.profileId }
    }

    /** Convierte un patrón SQL LIKE (% = comodín) a comparación segura. */
    fun likeMatches(pattern: String, value: String): Boolean {
        if (!pattern.contains('%')) return pattern.equals(value, ignoreCase = true)
        val regex = pattern.split('%').joinToString(".*") { Regex.escape(it) }
        return Regex("^$regex$", RegexOption.IGNORE_CASE).matches(value)
    }

    fun labelFor(packageName: String): String = try {
        val info: ApplicationInfo = context.packageManager.getApplicationInfo(packageName, 0)
        context.packageManager.getApplicationLabel(info).toString()
    } catch (e: Exception) { packageName }
}
