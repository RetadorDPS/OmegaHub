package com.phoneagent.capabilities

import android.util.Log
import com.phoneagent.drivers.DriverRegistry
import com.phoneagent.models.AgentActionType
import com.phoneagent.models.AgentStep
import com.phoneagent.models.DriverConfig
import com.phoneagent.models.Macro
import com.phoneagent.system.AccessibilityController

/**
 * Veredicto de la verificación barata (sin LLM, sin captura de pantalla).
 *
 * Unknown es el caso por defecto y el más importante: cuando no hay evidencia
 * contundente en el árbol de UI, se le pregunta al LLM con visión. Un falso
 * "verificado" es mucho peor que un token gastado, así que este verificador
 * solo decide cuando la evidencia es inequívoca.
 */
sealed class CheapVerdict {
    data class Verified(val reason: String) : CheapVerdict()
    data class Refuted(val reason: String) : CheapVerdict()
    object Unknown : CheapVerdict()
}

/**
 * Verificador determinista de bajo coste.
 *
 * POR QUÉ EXISTE: el bucle del agente hace una llamada al LLM con screenshot
 * por cada paso (verificar + proponer el siguiente). En la práctica la mayoría
 * de los pasos son obvios desde el árbol de accesibilidad: si el plan esperaba
 * ver «Chats» y el árbol contiene «Chats», no hace falta pagar por una imagen.
 *
 * CÓMO AHORRA: lee el árbol de UI (ya está en memoria, es gratis) y aplica
 * reglas conservadoras. Solo cuando devuelve Verified/Refuted se evita la
 * llamada; con Unknown el flujo sigue exactamente igual que antes.
 *
 * Lo que NUNCA decide por su cuenta: verify, done y request_confirmation,
 * porque ahí el juicio es sobre el objetivo global, no sobre un control.
 */
class StepVerifier(
    private val accessibility: AccessibilityController,
    private val registry: DriverRegistry,
) {
    companion object {
        private const val TAG = "[PhoneAgent].[StepVerifier]"

        /** Cadenas entrecomilladas en el resultado esperado: son literales de
         *  UI que el plan afirma que deberían aparecer. */
        private val QUOTED = Regex("[«\"'“]([^»\"'”]{2,60})[»\"'”]")

        /** Pasos cuyo éxito no se puede juzgar mirando un control suelto. */
        private val NEVER_CHEAP = setOf(
            AgentActionType.VERIFY,
            AgentActionType.DONE,
            AgentActionType.REQUEST_CONFIRMATION,
            AgentActionType.UNKNOWN,
        )
    }

    /**
     * Contadores de la sesión. Ojo a qué miden: el LLM se llama SIEMPRE después
     * de cada paso, porque de ahí sale la siguiente acción. Lo que este
     * verificador ahorra es la IMAGEN (~3.500 tokens de imagen por captura de
     * 1080x2400), no la llamada.
     */
    @Volatile var verificationsWithoutImage: Int = 0
        private set
    @Volatile var verificationsTotal: Int = 0
        private set

    /** Lo llama AgentEngine tras cada verificación, barata o no. */
    fun noteVerification() { verificationsTotal++ }

    fun resetCounters() {
        verificationsWithoutImage = 0
        verificationsTotal = 0
    }

    /** Fracción de pasos verificados sin enviar imagen al LLM (0.0 a 1.0). */
    fun imagelessRatio(): Double =
        if (verificationsTotal == 0) 0.0
        else verificationsWithoutImage.toDouble() / verificationsTotal

    fun cheapVerify(step: AgentStep, config: DriverConfig?): CheapVerdict {
        if (step.actionType in NEVER_CHEAP) return CheapVerdict.Unknown
        if (!accessibility.isConnected()) {
            Log.d(TAG, "Accesibilidad desconectada; verificación por LLM")
            return CheapVerdict.Unknown
        }
        return try {
            val nodes = accessibility.getUiNodes()
            if (nodes.isEmpty()) return CheapVerdict.Unknown
            val visibleTexts = nodes.filter { it.visible }
                .flatMap { listOf(it.text, it.contentDescription) }
                .filter { it.isNotBlank() }
                .map { Macro.normalize(it) }

            when (step.actionType) {
                AgentActionType.OPEN_APP -> checkOpenApp(step)
                AgentActionType.TYPE -> checkTyped(step, visibleTexts)
                AgentActionType.READ -> CheapVerdict.Verified(
                    "Árbol de UI leído (${nodes.size} nodos)")
                AgentActionType.WAIT ->
                    if (step.expectedResult.isBlank())
                        CheapVerdict.Verified("Espera completada")
                    else CheapVerdict.Unknown
                else -> checkQuotedExpectation(step, visibleTexts, config)
            }
        } catch (e: Exception) {
            // Nunca dejar que la verificación barata rompa la sesión.
            Log.w(TAG, "Verificación barata falló, se usará el LLM: ${e.message}")
            CheapVerdict.Unknown
        }.also {
            if (it is CheapVerdict.Verified || it is CheapVerdict.Refuted) {
                verificationsWithoutImage++
                Log.i(TAG, "Verificado sin LLM (${step.actionType.wire}): " +
                    when (it) {
                        is CheapVerdict.Verified -> it.reason
                        is CheapVerdict.Refuted -> it.reason
                        else -> ""
                    })
            }
        }
    }

    /** open_app: el package en primer plano es la prueba directa. */
    private fun checkOpenApp(step: AgentStep, ): CheapVerdict {
        val foreground = accessibility.currentPackage() ?: return CheapVerdict.Unknown
        val wantedKey = step.paramString("driver_key")
        val wantedPackage = step.paramString("package").ifBlank {
            // Si el plan solo dio el driver_key, se busca su package resuelto
            // (importante con los clones, cuyo package no es el base).
            registry.getByKey(wantedKey)?.let { it.resolvedPackage ?: it.packageName }.orEmpty()
        }
        if (wantedPackage.isBlank()) return CheapVerdict.Unknown
        return if (foreground == wantedPackage) {
            CheapVerdict.Verified("$foreground está en primer plano")
        } else {
            // Distinto de lo pedido. Puede ser un diálogo encima, así que no se
            // afirma el fallo: se deja decidir al LLM con la imagen.
            CheapVerdict.Unknown
        }
    }

    /** type: el texto escrito debe estar en un campo editable. */
    private fun checkTyped(step: AgentStep, visibleTexts: List<String>): CheapVerdict {
        val typed = step.paramString("text")
        if (typed.isBlank()) return CheapVerdict.Unknown
        val needle = Macro.normalize(typed)
        // En chats el texto puede quedar en un nodo no editable (burbuja), así
        // que se acepta que aparezca en cualquier texto visible.
        return if (visibleTexts.any { it.contains(needle) }) {
            CheapVerdict.Verified("El texto escrito (${typed.length} caracteres) está en pantalla")
        } else {
            CheapVerdict.Unknown
        }
    }

    /**
     * Regla general: si el resultado esperado menciona literales de UI entre
     * comillas y TODOS aparecen en el árbol, el paso se cumplió.
     */
    private fun checkQuotedExpectation(
        step: AgentStep,
        visibleTexts: List<String>,
        config: DriverConfig?,
    ): CheapVerdict {
        val expected = step.expectedResult
        if (expected.isBlank()) return CheapVerdict.Unknown
        val quoted = QUOTED.findAll(expected).map { Macro.normalize(it.groupValues[1]) }
            .filter { it.isNotBlank() }.distinct().toList()
        if (quoted.isEmpty()) return CheapVerdict.Unknown
        val found = quoted.filter { needle -> visibleTexts.any { it.contains(needle) } }
        return if (found.size == quoted.size) {
            CheapVerdict.Verified("Se ve en pantalla: ${quoted.joinToString(", ")}")
        } else {
            // Faltan literales, pero pueden estar fuera del árbol capturado
            // (listas largas, contenido renderizado en canvas). Al LLM.
            CheapVerdict.Unknown
        }
    }
}
