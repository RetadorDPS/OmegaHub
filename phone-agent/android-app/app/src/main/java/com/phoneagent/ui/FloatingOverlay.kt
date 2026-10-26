package com.phoneagent.ui

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.phoneagent.R
import com.phoneagent.core.AgentEvent
import com.phoneagent.core.EventBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Burbuja flotante con el estado del agente mientras trabaja sobre otras
 * apps: ⚪ inactivo, 🎙️ escuchando, 🟣 trabajando, 🟡 esperando confirmación,
 * 🟢 terminado, 🔴 error. Se arrastra con el dedo y al tocarla abre la app.
 *
 * Uso desde MainActivity: FloatingOverlay.start(context) (si hay permiso de
 * overlay; si no, el agente funciona igual sin burbuja).
 */
object FloatingOverlay {
    private const val TAG = "[PhoneAgent].[FloatingOverlay]"

    fun start(context: Context) {
        if (!android.provider.Settings.canDrawOverlays(context)) {
            Log.w(TAG, "Sin permiso de overlay: la burbuja no se mostrará (el agente sigue funcionando)")
            return
        }
        context.startForegroundService(Intent(context, OverlayService::class.java))
    }

    fun stop(context: Context) {
        context.stopService(Intent(context, OverlayService::class.java))
    }
}

class OverlayService : Service() {
    companion object {
        private const val TAG = "[PhoneAgent].[OverlayService]"
        private const val CHANNEL_ID = "phone_agent_overlay"
        private const val NOTIF_ID = 3001
    }

    private var windowManager: WindowManager? = null
    private var bubble: TextView? = null
    private var params: WindowManager.LayoutParams? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundInternal()
        showBubble()
        observeState()
        Log.i(TAG, "Burbuja flotante visible")
    }

    private fun startForegroundInternal() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL_ID, "Estado de Phone Agent", NotificationManager.IMPORTANCE_LOW))
        val openApp = PendingIntent.getActivity(this, 0,
            Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Phone Agent")
            .setContentText("El agente puede estar trabajando sobre tus apps autorizadas")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(openApp).setOngoing(true).build()
        startForeground(NOTIF_ID, notification)
    }

    private fun showBubble() {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val view = TextView(this).apply {
            text = "⚪ Phone Agent"
            textSize = 14f
            setPadding(28, 16, 28, 16)
            setBackgroundColor(0xCC17142B.toInt())
            setTextColor(0xFFFFFFFF.toInt())
        }
        bubble = view
        val type = if (Build.VERSION.SDK_INT >= 26)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            type, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 24; y = 180
        }
        params = lp
        attachDrag(view, lp)
        try {
            windowManager?.addView(view, lp)
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo mostrar la burbuja: ${e.message}")
        }
    }

    private fun attachDrag(view: View, lp: WindowManager.LayoutParams) {
        var startX = 0; var startY = 0; var touchX = 0f; var touchY = 0f; var moved = false
        view.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = lp.x; startY = lp.y; touchX = event.rawX; touchY = event.rawY; moved = false; true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchX).toInt(); val dy = (event.rawY - touchY).toInt()
                    if (kotlin.math.abs(dx) + kotlin.math.abs(dy) > 12) moved = true
                    lp.x = startX + dx; lp.y = startY + dy
                    runCatching { windowManager?.updateViewLayout(v, lp) }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        startActivity(Intent(this, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun observeState() {
        scope.launch {
            EventBus.events.collect { event ->
                val text = when (event) {
                    is AgentEvent.StateChanged -> when (event.state) {
                        com.phoneagent.core.AgentState.IDLE -> "⚪ Phone Agent"
                        com.phoneagent.core.AgentState.LISTENING -> "🎙️ Escuchando…"
                        com.phoneagent.core.AgentState.WORKING -> "🟣 Trabajando…"
                        com.phoneagent.core.AgentState.WAITING_CONFIRMATION -> "🟡 ¿Confirmas? Toca para decidir"
                        com.phoneagent.core.AgentState.DONE -> "🟢 Terminado"
                        com.phoneagent.core.AgentState.ERROR -> "🔴 Error — toca para ver"
                    }
                    is AgentEvent.StepStarted -> "🟣 Paso ${event.stepNumber}…"
                    else -> null
                }
                if (text != null) bubble?.text = text
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        bubble?.let { runCatching { windowManager?.removeView(it) } }
        bubble = null
        super.onDestroy()
        Log.i(TAG, "Burbuja flotante retirada")
    }
}
