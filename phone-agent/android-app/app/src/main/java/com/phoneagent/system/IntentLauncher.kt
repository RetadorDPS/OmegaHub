package com.phoneagent.system

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.LauncherApps
import android.net.Uri
import android.os.UserManager
import android.provider.Settings
import android.util.Log

/**
 * Apertura de apps por package name (incluidas variantes en otros perfiles
 * de usuario: Dual Messenger, perfil de trabajo, etc.) e intents de sistema
 * que la UI necesita para guiar al usuario a conceder permisos.
 */
class IntentLauncher(private val context: Context) {
    companion object { private const val TAG = "[PhoneAgent].[IntentLauncher]" }

    fun isInstalled(packageName: String): Boolean = try {
        context.packageManager.getPackageInfo(packageName, 0); true
    } catch (e: Exception) { false }

    /**
     * Abre una app. profileId es el ÍNDICE del perfil en UserManager.userProfiles
     * (0 = principal). Con perfil > 0 se usa LauncherApps, que es la vía
     * oficial para lanzar actividades de otro perfil (apps duales).
     */
    fun openApp(packageName: String, profileId: Int = 0): Boolean {
        return try {
            if (profileId > 0) return openInProfile(packageName, profileId)
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (intent == null) {
                Log.e(TAG, "La app $packageName no tiene actividad launcher (¿instalada?)")
                return false
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            context.startActivity(intent)
            Log.i(TAG, "App abierta: $packageName")
            true
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo abrir $packageName: ${e.message}"); false
        }
    }

    private fun openInProfile(packageName: String, profileId: Int): Boolean {
        val userManager = context.getSystemService(Context.USER_SERVICE) as UserManager
        val profiles = userManager.userProfiles
        val handle = profiles.getOrNull(profileId) ?: run {
            Log.e(TAG, "Perfil $profileId no existe (hay ${profiles.size})"); return false
        }
        val launcherApps = context.getSystemService(LauncherApps::class.java) ?: return false
        val activities = launcherApps.getActivityList(packageName, handle)
        val main = activities.firstOrNull()
        if (main == null) {
            Log.e(TAG, "$packageName no aparece en el perfil $profileId")
            return false
        }
        val component: ComponentName = main.componentName
        launcherApps.startMainActivity(component, handle, null, null)
        Log.i(TAG, "App dual abierta: $packageName en perfil $profileId ($component)")
        return true
    }

    // ── Intents de sistema para la guía de permisos ────────────────────────
    fun openAccessibilitySettings() {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun canDrawOverlays(): Boolean = Settings.canDrawOverlays(context)

    fun openOverlayPermission() {
        context.startActivity(Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun openAppDetails() {
        context.startActivity(Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
