package com.phoneagent.capabilities

import android.util.Log
import com.phoneagent.network.ImageOptimizer
import com.phoneagent.system.AccessibilityController
import com.phoneagent.system.ScreenCaptureManager

/** Error de visión con causa legible para el usuario. */
class VisionException(message: String) : Exception(message)

/**
 * Capacidad de visión: captura la pantalla (MediaProjection), la comprime
 * (JPEG 80%, máx. 1080 px) y la entrega en Base64 para el LLM. También aporta
 * el árbol de UI accesible, que es texto barato y muy preciso para verificar.
 */
class VisionCapability(
    private val accessibility: AccessibilityController,
) : Capability {
    override val key: String = "vision"

    companion object { private const val TAG = "[PhoneAgent].[Vision]" }

    override suspend fun initialize() {
        if (!ScreenCaptureManager.isReady()) {
            Log.w(TAG, "MediaProjection aún no está listo: la UI debe pedir el permiso primero")
        }
    }

    override fun shutdown() { /* La proyección vive en su servicio; no se toca aquí. */ }

    fun isReady(): Boolean = ScreenCaptureManager.isReady()

    /** Screenshot en Base64 (JPEG) o lanza VisionException con la causa. */
    suspend fun captureBase64(): String {
        val bitmap = ScreenCaptureManager.captureScreen()
            ?: throw VisionException(
                "No se pudo capturar la pantalla. Concede el permiso de grabación " +
                    "de pantalla (MediaProjection) y deja activo el servicio de captura.")
        val base64 = ImageOptimizer.bitmapToBase64Jpeg(bitmap)
        bitmap.recycle()
        Log.d(TAG, "Screenshot listo: ${base64.length / 1024} KB en Base64")
        return base64
    }

    /** Variante tolerante: devuelve "" si la captura falla (el LLM sigue con
     *  el árbol de UI). Usada en pasos intermedios para no abortar la tarea. */
    suspend fun captureBase64OrEmpty(): String = try {
        captureBase64()
    } catch (e: VisionException) {
        Log.w(TAG, "Screenshot omitido: ${e.message}")
        ""
    }

    /** Bytes JPEG para subir al bucket 'screenshots' (trazabilidad 24 h). */
    suspend fun captureJpegBytes(): ByteArray? = try {
        val bitmap = ScreenCaptureManager.captureScreen() ?: return null
        ImageOptimizer.compressToJpeg(bitmap).also { bitmap.recycle() }
    } catch (e: Exception) {
        Log.w(TAG, "captureJpegBytes falló: ${e.message}"); null
    }

    /** Descripción textual barata de la pantalla (sin llamar al LLM). */
    fun uiTreeText(maxChars: Int = 6000): String {
        if (!accessibility.isConnected()) return ""
        return accessibility.getUiTreeText(maxChars)
    }
}
