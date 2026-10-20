package com.phoneagent.network

import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

/**
 * Compresión de screenshots antes de subirlos al LLM:
 * ancho máximo 1080 px, JPEG calidad 80, Base64 sin saltos de línea.
 * Un screenshot crudo (1080×2400 PNG) pesa 2-4 MB; así queda en 120-250 KB,
 * que es lo que hace viable el loop planificar→verificar sin agotar datos.
 */
object ImageOptimizer {
    private const val TAG = "[PhoneAgent].[ImageOptimizer]"

    fun compressToJpeg(bitmap: Bitmap, maxWidth: Int = 1080, quality: Int = 80): ByteArray {
        val scaled = scaleDown(bitmap, maxWidth)
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(10, 100), out)
        val bytes = out.toByteArray()
        Log.d(TAG, "Screenshot ${bitmap.width}x${bitmap.height} → ${scaled.width}x${scaled.height}, ${bytes.size / 1024} KB")
        if (scaled !== bitmap) scaled.recycle()
        return bytes
    }

    fun bitmapToBase64Jpeg(bitmap: Bitmap, maxWidth: Int = 1080, quality: Int = 80): String =
        Base64.encodeToString(compressToJpeg(bitmap, maxWidth, quality), Base64.NO_WRAP)

    /** Reescala manteniendo proporción; nunca amplía. */
    fun scaleDown(bitmap: Bitmap, maxWidth: Int): Bitmap {
        if (bitmap.width <= maxWidth) return bitmap
        val ratio = maxWidth.toFloat() / bitmap.width.toFloat()
        val matrix = Matrix().apply { postScale(ratio, ratio) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
}
