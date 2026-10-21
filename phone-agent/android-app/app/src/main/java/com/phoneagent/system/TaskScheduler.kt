package com.phoneagent.system

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.phoneagent.core.SecurePrefs
import org.json.JSONArray
import org.json.JSONObject

/** Una tarea programada. `command` es la frase que se ejecutaría por voz. */
data class ScheduledTask(
    val id: Int,
    val name: String,
    val command: String,
    val triggerAtEpochMs: Long,
    val repeatDaily: Boolean,
    val enabled: Boolean = true,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id); put("name", name); put("command", command)
        put("trigger_at", triggerAtEpochMs); put("repeat_daily", repeatDaily)
        put("enabled", enabled)
    }

    companion object {
        fun fromJson(json: JSONObject): ScheduledTask = ScheduledTask(
            id = json.optInt("id"),
            name = json.optString("name"),
            command = json.optString("command"),
            triggerAtEpochMs = json.optLong("trigger_at"),
            repeatDaily = json.optBoolean("repeat_daily", false),
            enabled = json.optBoolean("enabled", true),
        )
    }
}

/**
 * Programador de tareas con AlarmManager.
 *
 * QUÉ HACE Y QUÉ NO — importante ser honesto aquí:
 * a la hora programada se lanza una NOTIFICACIÓN con la tarea lista y un botón
 * «Ejecutar ahora». No se pone a tocar la pantalla solo.
 *
 * Por qué no se ejecuta en segundo plano sin más:
 *  1. TÉCNICO: el servicio de Accesibilidad no recibe eventos con la pantalla
 *     bloqueada, y MediaProjection no captura con el dispositivo apagado. Una
 *     tarea a las 3:00 con el móvil en el bolsillo fallaría a mitad y dejaría la
 *     sesión colgada en `running`.
 *  2. POLÍTICA DE PLAY: la ejecución autónoma por Accesibilidad está prohibida;
 *     que sea el usuario quien pulse «Ejecutar» es justo lo que la permite.
 *
 * Así que el valor real es: la tarea NO se olvida, llega a la hora, y ponerla en
 * marcha cuesta un toque (o decir la frase si la wake word está activa).
 *
 * Las alarmas exactas en Android 12+ requieren permiso del usuario; si no está
 * concedido se degrada a alarma inexacta en vez de reventar.
 */
object TaskScheduler {
    private const val TAG = "[PhoneAgent].[Scheduler]"
    private const val KEY_TASKS = "scheduled_tasks"
    const val EXTRA_TASK_COMMAND = "com.phoneagent.extra.TASK_COMMAND"
    const val EXTRA_TASK_NAME = "com.phoneagent.extra.TASK_NAME"
    const val ACTION_RUN_TASK = "com.phoneagent.action.RUN_TASK"
    const val ACTION_SNOOZE_TASK = "com.phoneagent.action.SNOOZE_TASK"

    fun all(context: Context): List<ScheduledTask> {
        val raw = SecurePrefs.get(context, KEY_TASKS) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { ScheduledTask.fromJson(arr.getJSONObject(it)) }
        }.getOrElse {
            Log.e(TAG, "Tareas programadas ilegibles; se descartan: ${it.message}")
            emptyList()
        }
    }

    private fun persist(context: Context, tasks: List<ScheduledTask>) {
        val arr = JSONArray()
        tasks.forEach { arr.put(it.toJson()) }
        SecurePrefs.put(context, KEY_TASKS, arr.toString())
    }

    fun nextId(context: Context): Int = (all(context).maxOfOrNull { it.id } ?: 0) + 1

    /** Crea la tarea, la guarda cifrada y arma la alarma. */
    fun schedule(
        context: Context, name: String, command: String,
        triggerAtEpochMs: Long, repeatDaily: Boolean,
    ): ScheduledTask {
        val task = ScheduledTask(nextId(context), name, command, triggerAtEpochMs, repeatDaily)
        persist(context, all(context) + task)
        arm(context, task)
        Log.i(TAG, "Programada «$name» para ${java.util.Date(triggerAtEpochMs)} (diaria=$repeatDaily)")
        return task
    }

    fun cancel(context: Context, taskId: Int) {
        val remaining = all(context).filter { it.id != taskId }
        persist(context, remaining)
        alarmManager(context).cancel(pendingIntent(context, taskId, command = ""))
        Log.i(TAG, "Tarea $taskId cancelada")
    }

    /**
     * Rearma todas las alarmas. Hace falta tras un reinicio: AlarmManager no
     * sobrevive a un reboot, así que sin esto las tareas programadas se
     * perderían en silencio.
     */
    fun rescheduleAll(context: Context) {
        val tasks = all(context)
        var armed = 0
        tasks.forEach { task ->
            if (!task.enabled) return@forEach
            // Las que ya pasaron y no se repiten se dejan caer: avisar de una
            // tarea de hace tres días no es útil.
            if (!task.repeatDaily && task.triggerAtEpochMs < System.currentTimeMillis()) {
                Log.i(TAG, "«${task.name}» ya caducó; no se reprograma")
                return@forEach
            }
            arm(context, task)
            armed++
        }
        Log.i(TAG, "Reprogramadas $armed de ${tasks.size} tareas")
    }

    /**
     * Aplaza una tarea. Se mueve el disparo real y se rearma la alarma:
     * simplemente volver a publicar la notificación no sería posponer nada.
     */
    fun snooze(context: Context, taskId: Int, minutes: Long) {
        val task = all(context).firstOrNull { it.id == taskId } ?: return
        val next = System.currentTimeMillis() + minutes * 60_000L
        val moved = task.copy(triggerAtEpochMs = next, repeatDaily = false)
        // repeatDaily=false a propósito: si el usuario la pospone, no quiere
        // que además le salte la de mañana a la misma hora sin avisar.
        persist(context, all(context).map { if (it.id == taskId) moved else it })
        arm(context, moved)
        Log.i(TAG, "«${task.name}» pospuesta ${minutes}min, a las ${java.util.Date(next)}")
    }

    /** Para las diarias: mueve el disparo al siguiente día y rearma. */
    fun advanceDaily(context: Context, taskId: Int) {
        val task = all(context).firstOrNull { it.id == taskId } ?: return
        if (!task.repeatDaily) return
        val next = task.triggerAtEpochMs + 24 * 60 * 60 * 1000L
        val advanced = task.copy(triggerAtEpochMs = next)
        persist(context, all(context).map { if (it.id == taskId) advanced else it })
        arm(context, advanced)
        Log.i(TAG, "«${task.name}» reprogramada para ${java.util.Date(next)}")
    }

    // ── Internos ───────────────────────────────────────────────────────────

    private fun alarmManager(context: Context): AlarmManager =
        context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private fun pendingIntent(context: Context, taskId: Int, command: String): PendingIntent {
        val intent = Intent(context, ScheduledTaskReceiver::class.java).apply {
            action = ACTION_RUN_TASK
            putExtra("task_id", taskId)
            putExtra(EXTRA_TASK_COMMAND, command)
        }
        // FLAG_IMMUTABLE es obligatorio desde Android 12 (API 31).
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        // El requestCode debe ser único por tarea: si no, programar dos tareas
        // sobrescribe la alarma de la primera.
        return PendingIntent.getBroadcast(context, taskId, intent, flags)
    }

    private fun arm(context: Context, task: ScheduledTask) {
        val am = alarmManager(context)
        val pi = pendingIntent(context, task.id, task.command)
        val exactAllowed = if (Build.VERSION.SDK_INT >= 31) am.canScheduleExactAlarms() else true
        try {
            if (exactAllowed) {
                // WhileIdle: dispara aunque el móvil esté en Doze.
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, task.triggerAtEpochMs, pi)
            } else {
                // Sin permiso de alarma exacta (Android 12+). Mejor llegar unos
                // minutos tarde que no llegar: se avisa para que el usuario lo
                // active en Ajustes si necesita precisión.
                Log.w(TAG, "Alarmas exactas no permitidas; «${task.name}» puede llegar con retraso. " +
                    "Actívalo en ${Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM}")
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, task.triggerAtEpochMs, pi)
            }
        } catch (e: SecurityException) {
            // Android 12 lanza si el permiso se revocó entre la comprobación y
            // el armado. Se degrada igual que arriba.
            Log.e(TAG, "No se pudo armar alarma exacta para «${task.name}»: ${e.message}")
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, task.triggerAtEpochMs, pi)
        }
    }
}
