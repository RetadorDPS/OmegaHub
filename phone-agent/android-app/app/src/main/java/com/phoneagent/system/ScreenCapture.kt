package com.phoneagent.system

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.phoneagent.R
import kotlinx.coroutines.delay

/**
 * Ojos del agente: captura la pantalla con MediaProjection.
 * El permiso se pide UNA vez en MainActivity; el servicio en primer plano
 * mantiene la proyección viva durante toda la sesión del agente.
 */
object ScreenCaptureManager {
    private const val TAG = "[PhoneAgent].[ScreenCapture]"

    @Volatile var lastFrame: Bitmap? = null
    @Volatile var ready: Boolean = false

    fun isReady(): Boolean = ready && lastFrame != null

    /** Último frame capturado (copia defensiva) o null si aún no hay frames. */
    fun latestBitmap(): Bitmap? = lastFrame?.let { Bitmap.createBitmap(it) }

    suspend fun captureScreen(timeoutMs: Long = 2500): Bitmap? {
        // Espera activamente al primer frame si el servicio acaba de arrancar.
        var waited = 0L
        while (lastFrame == null && waited < timeoutMs) { delay(120); waited += 120 }
        return latestBitmap()
    }

    fun start(context: Context, resultCode: Int, data: Intent) {
        val intent = Intent(context, ScreenCaptureService::class.java).apply {
            action = ScreenCaptureService.ACTION_START
            putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenCaptureService.EXTRA_DATA, data)
        }
        context.startForegroundService(intent)
        Log.i(TAG, "Servicio de captura arrancando…")
    }

    fun stop(context: Context) {
        context.startService(Intent(context, ScreenCaptureService::class.java)
            .setAction(ScreenCaptureService.ACTION_STOP))
    }

    internal fun clear() { ready = false; lastFrame = null }
}

class ScreenCaptureService : Service() {
    companion object {
        const val ACTION_START = "com.phoneagent.capture.START"
        const val ACTION_STOP = "com.phoneagent.capture.STOP"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_DATA = "data"
        private const val TAG = "[PhoneAgent].[ScreenCapture]"
        private const val CHANNEL_ID = "phone_agent_capture"
        private const val NOTIF_ID = 2001
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var worker: HandlerThread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForegroundInternal()
                val code = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                @Suppress("DEPRECATION")
                val data: Intent? = if (Build.VERSION.SDK_INT >= 33)
                    intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
                else intent.getParcelableExtra(EXTRA_DATA)
                if (data == null) { Log.e(TAG, "Sin Intent de MediaProjection: no se puede capturar"); stopSelf(); return START_NOT_STICKY }
                setupProjection(code, data)
            }
            ACTION_STOP -> { release(); stopSelf() }
        }
        return START_STICKY
    }

    private fun startForegroundInternal() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL_ID, "Captura de pantalla del agente", NotificationManager.IMPORTANCE_LOW))
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Phone Agent está activo")
            .setContentText("Capturando pantalla solo dentro de las apps autorizadas")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else startForeground(NOTIF_ID, notification)
    }

    private fun setupProjection(resultCode: Int, data: Intent) {
        release()
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val metrics = resources.displayMetrics
        val width = metrics.widthPixels; val height = metrics.heightPixels; val density = metrics.densityDpi
        worker = HandlerThread("PhoneAgentCapture").apply { start() }
        val handler = Handler(worker!!.looper)

        projection = mpm.getMediaProjection(resultCode, data)
        projection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { Log.w(TAG, "MediaProjection detenido por el sistema"); release() }
        }, handler)

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
        imageReader?.setOnImageAvailableListener({ reader ->
            try {
                reader.acquireLatestImage()?.use { image ->
                    val plane = image.planes[0]
                    val buffer = plane.buffer
                    val pixelStride = plane.pixelStride; val rowStride = plane.rowStride
                    val rowPadding = rowStride - pixelStride * width
                    val padded = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888)
                    padded.copyPixelsFromBuffer(buffer)
                    val cropped = if (rowPadding == 0) padded
                        else Bitmap.createBitmap(padded, 0, 0, width, height)
                    val previous = ScreenCaptureManager.lastFrame
                    ScreenCaptureManager.lastFrame = cropped
                    ScreenCaptureManager.ready = true
                    if (previous != null && previous !== cropped) previous.recycle()
                }
            } catch (e: Exception) { Log.e(TAG, "Error convirtiendo frame: ${e.message}") }
        }, handler)

        virtualDisplay = projection?.createVirtualDisplay(
            "PhoneAgentCapture", width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface, null, handler)
        Log.i(TAG, "Captura lista: ${width}x$height")
    }

    private fun release() {
        try { virtualDisplay?.release() } catch (e: Exception) { Log.w(TAG, "release display: ${e.message}") }
        try { imageReader?.close() } catch (e: Exception) { Log.w(TAG, "release reader: ${e.message}") }
        try { projection?.stop() } catch (e: Exception) { Log.w(TAG, "release projection: ${e.message}") }
        virtualDisplay = null; imageReader = null; projection = null
        worker?.quitSafely(); worker = null
        ScreenCaptureManager.clear()
    }

    override fun onDestroy() { release(); super.onDestroy() }
}
