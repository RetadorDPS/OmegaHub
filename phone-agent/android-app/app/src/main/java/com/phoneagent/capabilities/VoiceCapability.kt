package com.phoneagent.capabilities

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.util.Log
import com.phoneagent.core.AgentEvent
import com.phoneagent.core.EventBus
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Error de voz con mensaje listo para mostrar/escuchar. */
class VoiceException(message: String) : Exception(message)

/**
 * Capacidad de voz 100% nativa de Android:
 *  - STT: SpeechRecognizer en español (es-ES por defecto, configurable).
 *  - TTS: TextToSpeech para reportar resultados por voz.
 *  - Wake word simple: escucha continua que reinicia el reconocedor y dispara
 *    el callback cuando la transcripción contiene la frase de activación.
 */
class VoiceCapability(
    private val context: Context,
    @Volatile var languageTag: String = "es-ES",
    @Volatile var wakeWord: String = "oye agente",
) : Capability {
    override val key: String = "voice"

    companion object { private const val TAG = "[PhoneAgent].[Voice]" }

    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady: Boolean = false
    private var wakeRecognizer: SpeechRecognizer? = null
    private val wakeListening = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())

    override suspend fun initialize() {
        if (tts != null) return
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(locale())
                ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
                Log.i(TAG, "TTS inicializado ($languageTag), listo=$ttsReady")
                if (!ttsReady) Log.e(TAG, "El idioma $languageTag no tiene datos de voz instalados")
            } else {
                Log.e(TAG, "TextToSpeech falló al inicializar (status=$status)")
            }
        }
    }

    override fun shutdown() {
        stopWakeWord()
        tts?.stop(); tts?.shutdown(); tts = null; ttsReady = false
    }

    private fun locale(): Locale = Locale.forLanguageTag(languageTag)

    /** Lee un texto en voz alta. No suspende: el TTS habla en segundo plano. */
    fun speak(text: String) {
        val clean = text.trim()
        if (clean.isBlank()) return
        EventBus.tryEmit(AgentEvent.Spoke(clean))
        val engine = tts
        if (engine == null || !ttsReady) {
            Log.w(TAG, "TTS no listo; texto solo en pantalla: $clean")
            return
        }
        engine.language = locale()
        val result = engine.speak(clean.take(600), TextToSpeech.QUEUE_ADD, null, "phoneagent-${System.currentTimeMillis()}")
        if (result == TextToSpeech.ERROR) Log.e(TAG, "TTS devolvió ERROR al hablar")
    }

    fun stopSpeaking() { tts?.stop() }

    /**
     * Escucha UNA frase y devuelve la transcripción. Lanza VoiceException con
     * la causa (sin micrófono, sin red de reconocimiento, silencio…).
     */
    suspend fun listenOnce(): String = suspendCancellableCoroutine { cont ->
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            cont.resumeWithException(VoiceException(
                "Este teléfono no tiene reconocimiento de voz disponible. Instala la app de Google y su paquete de español."))
            return@suspendCancellableCoroutine
        }
        mainHandler.post {
            val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    recognizer.destroy()
                    if (text.isBlank()) cont.resumeWithException(VoiceException("No se entendió nada. Inténtalo de nuevo, más cerca del micrófono."))
                    else { Log.i(TAG, "Escuchado: $text"); cont.resume(text) }
                }

                override fun onError(error: Int) {
                    recognizer.destroy()
                    cont.resumeWithException(VoiceException(when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH -> "No se entendió la frase. Repítela, por favor."
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No se detectó voz (timeout). Pulsa el micrófono y habla."
                        SpeechRecognizer.ERROR_AUDIO -> "Error de audio: revisa el micrófono y el permiso de grabación."
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                            "El reconocimiento de voz necesita red en este teléfono y falló. Revisa tu conexión."
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                            "Falta el permiso de micrófono. Actívalo en Ajustes > Apps > Phone Agent."
                        else -> "Error de reconocimiento de voz (código $error)."
                    }))
                }

                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            cont.invokeOnCancellation { mainHandler.post { recognizer.destroy() } }
            recognizer.startListening(intent)
        }
    }

    // ── Wake word simple ───────────────────────────────────────────────────

    /** Escucha en bucle hasta que la transcripción contenga la wake word.
     *  Consume batería: solo se activa si el usuario lo marca en Ajustes. */
    fun startWakeWord(onDetected: () -> Unit) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.e(TAG, "Wake word imposible: sin reconocimiento de voz en el dispositivo")
            return
        }
        if (wakeListening.getAndSet(true)) return
        Log.i(TAG, "Escucha de wake word activada: «$wakeWord»")
        mainHandler.post { listenWakeLoop(onDetected) }
    }

    private fun listenWakeLoop(onDetected: () -> Unit) {
        if (!wakeListening.get()) return
        val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        wakeRecognizer = recognizer
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) { restart(results, onDetected, recognizer) }
            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull().orEmpty()
                if (matchesWakeWord(text)) { fire(onDetected, recognizer) }
            }
            override fun onError(error: Int) {
                recognizer.destroy()
                // El reconocedor se cansa: reinicio suave con pausa.
                mainHandler.postDelayed({ listenWakeLoop(onDetected) }, 600)
            }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        recognizer.startListening(intent)
    }

    private fun restart(results: Bundle?, onDetected: () -> Unit, recognizer: SpeechRecognizer) {
        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull().orEmpty()
        if (matchesWakeWord(text)) fire(onDetected, recognizer) else {
            recognizer.destroy()
            mainHandler.postDelayed({ listenWakeLoop(onDetected) }, 250)
        }
    }

    private fun fire(onDetected: () -> Unit, recognizer: SpeechRecognizer) {
        Log.i(TAG, "¡Wake word detectada! («$wakeWord»)")
        recognizer.destroy()
        wakeListening.set(false)
        onDetected()
    }

    private fun matchesWakeWord(text: String): Boolean =
        text.isNotBlank() && text.lowercase(locale()).contains(wakeWord.lowercase(locale()))

    fun stopWakeWord() {
        wakeListening.set(false)
        mainHandler.post { wakeRecognizer?.destroy(); wakeRecognizer = null }
    }

    fun isWakeWordActive(): Boolean = wakeListening.get()
}
