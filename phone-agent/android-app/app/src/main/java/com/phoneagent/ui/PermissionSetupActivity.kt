package com.phoneagent.ui

import android.Manifest
import android.app.AlarmManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.phoneagent.PhoneAgentApp
import com.phoneagent.databinding.ActivityPermissionSetupBinding
import com.phoneagent.system.AccessibilityController
import com.phoneagent.system.ScreenCaptureManager

/** Guía simple que abre cada permiso en el diálogo o pantalla oficial de Android. */
class PermissionSetupActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPermissionSetupBinding
    private val container by lazy { (application as PhoneAgentApp).container }

    private val requestMicrophone = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        refreshStatuses()
        toast(if (granted) "Micrófono permitido" else "Sin micrófono no se pueden dar órdenes por voz")
    }

    private val requestNotifications = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        refreshStatuses()
        toast(if (granted) "Avisos permitidos" else "Los avisos de tareas programadas quedarán desactivados")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPermissionSetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnMicrophone.setOnClickListener {
            requestMicrophone.launch(Manifest.permission.RECORD_AUDIO)
        }
        binding.btnAccessibility.setOnClickListener { openAccessibilitySettings() }
        binding.btnOverlay.setOnClickListener { openOverlaySettings() }
        binding.btnNotifications.setOnClickListener {
            if (Build.VERSION.SDK_INT >= 33) requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        binding.btnExactAlarm.setOnClickListener { openExactAlarmSettings() }
        binding.btnDone.setOnClickListener { finish() }
        refreshStatuses()
    }

    override fun onResume() {
        super.onResume()
        if (::binding.isInitialized) refreshStatuses()
    }

    private fun refreshStatuses() {
        val mic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val accessibility = AccessibilityController.isServiceEnabledInSettings(this) && container.accessibility.isConnected()
        val capture = ScreenCaptureManager.isReady()
        val overlay = Settings.canDrawOverlays(this)
        val notifications = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val exactAlarm = Build.VERSION.SDK_INT < 31 ||
            getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

        status(binding.tvMicrophoneStatus, mic, if (mic) "Listo" else "Necesario para hablar")
        status(binding.tvAccessibilityStatus, accessibility, if (accessibility) "Listo" else "Necesario para controlar las apps que autorices")
        status(binding.tvCaptureStatus, capture, if (capture) "Activo en esta sesión" else "Android lo preguntará al empezar una tarea")
        status(binding.tvOverlayStatus, overlay, if (overlay) "Activada" else "Opcional: muestra la burbuja flotante")
        status(binding.tvNotificationsStatus, notifications, if (Build.VERSION.SDK_INT < 33) "No se necesita en esta versión de Android" else if (notifications) "Activadas" else "Opcional: avisos de tareas programadas")
        status(binding.tvExactAlarmStatus, exactAlarm, if (Build.VERSION.SDK_INT < 31) "No se necesita en esta versión de Android" else if (exactAlarm) "Permitidas" else "Opcional: puntualidad de tareas programadas")

        binding.btnMicrophone.text = if (mic) "Micrófono listo" else "Permitir micrófono"
        binding.btnAccessibility.text = if (accessibility) "Accesibilidad lista" else "Abrir Accesibilidad"
        binding.btnMicrophone.isEnabled = !mic
        binding.btnAccessibility.isEnabled = !accessibility
        binding.btnOverlay.text = if (overlay) "Burbuja flotante activada" else "Permitir burbuja flotante"
        binding.btnOverlay.isEnabled = !overlay
        binding.btnNotifications.text = if (notifications) "Avisos permitidos" else "Permitir avisos de tareas"
        binding.btnNotifications.visibility = if (Build.VERSION.SDK_INT >= 33) View.VISIBLE else View.GONE
        binding.btnNotifications.isEnabled = Build.VERSION.SDK_INT >= 33 && !notifications
        binding.btnExactAlarm.text = if (exactAlarm) "Alarmas exactas listas" else "Permitir alarmas exactas"
        binding.btnExactAlarm.visibility = if (Build.VERSION.SDK_INT >= 31) View.VISIBLE else View.GONE
        binding.btnExactAlarm.isEnabled = Build.VERSION.SDK_INT >= 31 && !exactAlarm
    }

    private fun status(view: android.widget.TextView, granted: Boolean, detail: String) {
        view.text = "${if (granted) "✅" else "•"} $detail"
    }

    private fun openAccessibilitySettings() {
        runCatching { container.intentLauncher.openAccessibilitySettings() }
            .onFailure { toast("No se pudieron abrir los Ajustes de accesibilidad: ${it.message}") }
    }

    private fun openOverlaySettings() {
        runCatching {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }.onFailure {
            runCatching { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
                .onFailure { toast("Abre Ajustes → Aplicaciones → Phone Agent → Mostrar sobre otras apps") }
        }
    }

    private fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT < 31) return
        runCatching {
            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
        }.onFailure {
            runCatching { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
                .onFailure { toast("Abre Ajustes → Aplicaciones → Acceso especial → Alarmas exactas → Phone Agent") }
        }
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
