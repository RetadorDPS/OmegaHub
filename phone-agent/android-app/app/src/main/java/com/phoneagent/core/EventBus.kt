package com.phoneagent.core

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Estados visibles del agente en la UI y en la burbuja flotante. */
enum class AgentState(val label: String) {
    IDLE("Inactivo"), LISTENING("Escuchando…"), WORKING("Trabajando…"),
    WAITING_CONFIRMATION("Esperando confirmación"), DONE("Terminado"), ERROR("Error"),
}

/** Eventos internos del agente. Un solo bus, sin librerías externas. */
sealed class AgentEvent {
    data class StateChanged(val state: AgentState, val detail: String = "") : AgentEvent()
    data class StepStarted(val stepNumber: Int, val description: String) : AgentEvent()
    data class StepVerified(val stepNumber: Int, val verified: Boolean, val reason: String) : AgentEvent()
    data class ConfirmationRequired(val stepNumber: Int, val description: String) : AgentEvent()
    data class Spoke(val text: String) : AgentEvent()
    data class Finished(val summary: String, val success: Boolean) : AgentEvent()
    data class ErrorOccurred(val message: String) : AgentEvent()
}

/**
 * Bus de eventos proceso-local. replay = 1 para que la burbuja flotante y la
 * Activity vean el último estado al (re)conectarse; extraBufferCapacity para
 * que emit() nunca suspenda al AgentEngine.
 */
object EventBus {
    private val _events = MutableSharedFlow<AgentEvent>(
        replay = 1, extraBufferCapacity = 32,
    )
    val events: SharedFlow<AgentEvent> = _events.asSharedFlow()

    suspend fun emit(event: AgentEvent) { _events.emit(event) }
    fun tryEmit(event: AgentEvent): Boolean = _events.tryEmit(event)
}
