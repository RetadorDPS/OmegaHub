package com.phoneagent.core

import android.util.Log
import com.phoneagent.models.AgentSession
import com.phoneagent.models.SessionStatus
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Estado de la sesión activa: quién manda, confirmaciones pendientes,
 * cancelación y timeouts. Un solo sitio decide si el agente sigue vivo.
 */
class SessionManager {
    companion object {
        private const val TAG = "[PhoneAgent].[SessionManager]"
        const val CONFIRMATION_TIMEOUT_MS = 120_000L
    }

    private val _current = MutableStateFlow<AgentSession?>(null)
    val current: StateFlow<AgentSession?> = _current.asStateFlow()

    @Volatile private var job: Job? = null
    @Volatile private var confirmation: CompletableDeferred<Boolean>? = null
    @Volatile var startedAtMs: Long = 0L; private set
    @Volatile var cancellationRequested: Boolean = false; private set

    fun attachJob(job: Job?) { this.job = job }
    fun isRunning(): Boolean = job?.isActive == true && _current.value?.status?.isTerminal != true

    fun start(session: AgentSession) {
        cancellationRequested = false
        startedAtMs = System.currentTimeMillis()
        _current.value = session
        Log.i(TAG, "Sesión iniciada: ${session.id.ifBlank { "(local)" }} · ${session.voiceCommand}")
    }

    fun update(status: SessionStatus, currentApp: String? = null, resultSummary: String? = null, error: String? = null) {
        val cur = _current.value ?: return
        _current.value = cur.copy(
            status = status,
            currentApp = currentApp ?: cur.currentApp,
            resultSummary = resultSummary ?: cur.resultSummary,
            errorMessage = error ?: cur.errorMessage,
        )
    }

    fun setStepsExecuted(count: Int) {
        _current.value = _current.value?.copy(stepsExecuted = count)
    }

    /** Suspende el loop hasta que el usuario confirma o rechaza (o timeout). */
    suspend fun awaitConfirmation(timeoutMs: Long = CONFIRMATION_TIMEOUT_MS): Boolean {
        val deferred = CompletableDeferred<Boolean>()
        confirmation = deferred
        update(SessionStatus.WAITING_CONFIRMATION)
        val result = withTimeoutOrNull(timeoutMs) { deferred.await() } ?: false
        if (result) update(SessionStatus.RUNNING) else Log.w(TAG, "Confirmación no recibida (timeout o rechazo)")
        confirmation = null
        return result
    }

    /** Lo llama la UI (botón Confirmar / rechazo implícito al cancelar). */
    fun resolveConfirmation(approved: Boolean) {
        confirmation?.takeIf { !it.isCompleted }?.complete(approved)
    }

    fun cancel() {
        cancellationRequested = true
        resolveConfirmation(false)
        job?.cancel()
        update(SessionStatus.CANCELLED)
        Log.w(TAG, "Sesión cancelada por el usuario")
    }

    fun elapsedMs(): Long = if (startedAtMs == 0L) 0 else System.currentTimeMillis() - startedAtMs

    fun finish() { job = null; confirmation = null }
}
