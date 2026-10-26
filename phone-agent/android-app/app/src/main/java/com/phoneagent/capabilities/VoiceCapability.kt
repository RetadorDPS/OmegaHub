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
    suspend fun listenOnce(onStatus: (String) -> Unit = {}): String = suspendCancellableCoroutine { cont ->
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            cont.resumeWithException(VoiceException(
                "Este teléfono no tiene reconocimiento de voz disponible. Instala la app de Google y su paquete de español."))
            return@suspendCancellableCoroutine
        }
        mainHandler.post {
            val recognizer = try {
                SpeechRecognizer.createSpeechRecognizer(context)
            } catch (e: Exception) {
                if (cont.isActive) cont.resumeWithException(VoiceException(
                    "Android no pudo iniciar el servicio de reconocimiento de voz. Comprueba que Speech Services by Google esté habilitado."))
                return@post
            }
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            recognizer.setRecognitionListener(object : RecognitionListener {
                // onResults y onError pueden dispararse los dos; reanudar una
                // CancellableContinuation dos veces lanza IllegalStateException.
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    recognizer.destroy()
                    if (!cont.isActive) return
                    if (text.isBlank()) cont.resumeWithException(VoiceException("No se entendió nada. Inténtalo de nuevo, más cerca del micrófono."))
                    else { Log.i(TAG, "Escuchado: $text"); cont.resume(text) }
                }

                override fun onError(error: Int) {
                    recognizer.destroy()
                    if (!cont.isActive) return
                    cont.resumeWithException(VoiceException(when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH -> "No se entendió la frase. Repítela, por favor."
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No se detectó voz (timeout). Pulsa el micrófono y habla."
                        SpeechRecognizer.ERROR_AUDIO -> "Error de audio: revisa el micrófono y el permiso de grabación."
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                            "Falló la conexión del reconocimiento de voz. Comprueba internet y vuelve a probar."
                        SpeechRecognizer.ERROR_SERVER ->
                            "El servicio de voz del teléfono tuvo un problema. Espera un momento y vuelve a intentarlo."
                        SpeechRecognizer.ERROR_SERVER_DISCONNECTED ->
                            "Se desconectó el servicio de voz de Android. Comprueba que «Speech Services by Google» esté habilitado y vuelve a probar."
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY ->
                            "El micrófono está ocupado por otro reconocimiento. Espera unos segundos y vuelve a pulsar HABLAR."
                        SpeechRecognizer.ERROR_TOO_MANY_REQUESTS ->
                            "El servicio de voz recibió demasiadas solicitudes. Espera unos segundos y vuelve a probar."
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                            "Falta el permiso de micrófono. Pulsa Configurar permisos y actívalo."
                        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
                            "El teléfono no tiene disponible el reconocimiento en español. En Ajustes de Google, activa o descarga el paquete de voz en español."
                        SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT ->
                            "Android no pudo comprobar el reconocimiento en español. Comprueba internet y el servicio de voz del teléfono."
                        else -> "Falló el reconocimiento de voz (error $error). Comprueba el servicio de voz del teléfono e inténtalo otra vez."
                    }))
                }

                override fun onReadyForSpeech(params: Bundle?) {
                    onStatus("Te escucho ahora. Di una orden con claridad.")
                }
                override fun onBeginningOfSpeech() {
                    onStatus("Te estoy escuchando…")
                }
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {
                    onStatus("He dejado de oírte. Estoy entendiendo la frase…")
                }
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            cont.invokeOnCancellation { mainHandler.post { recognizer.destroy() } }
            try {
                recognizer.startListening(intent)
            } catch (e: Exception) {
                recognizer.destroy()
                if (cont.isActive) cont.resumeWithException(VoiceException(
                    "Android no pudo empezar a escuchar. Comprueba el permiso de micrófono e inténtalo otra vez."))
            }
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
                if (!wakeListening.get()) return
                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    // El silencio es normal en modo palabra de activación: se reintenta con pausa.
                    mainHandler.postDelayed({ listenWakeLoop(onDetected) }, 600)
                } else {
                    // No reiniciar ante fallos del servicio: algunos móviles muestran
                    // un diálogo cada vez que Speech Services se desconecta.
                    wakeListening.set(false)
                    val message = when (error) {
                        SpeechRecognizer.ERROR_SERVER_DISCONNECTED ->
                            "Se pausó la escucha automática porque se desconectó el servicio de voz de Android. Puedes seguir usando HABLAR."
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                            "Se pausó la escucha automática por un problema de conexión. Puedes seguir usando HABLAR."
                        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
                            "Se pausó la escucha automática porque Android no tiene reconocimiento en español disponible. Puedes usar HABLAR."
                        else -> "Se pausó la escucha automática por un error del servicio de voz (error $error). Puedes seguir usando HABLAR."
                    }
                    Log.e(TAG, "Wake word pausada tras error $error; no se reintentará automáticamente")
                    EventBus.tryEmit(AgentEvent.StateChanged(com.phoneagent.core.AgentState.ERROR, message))
                }
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
