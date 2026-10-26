package com.phoneagent.system

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.phoneagent.R
import com.phoneagent.ui.MainActivity

/**
 * Se dispara cuando llega la hora de una tarea programada.
 *
 * Publica una notificación con la tarea y dos botones (Ejecutar / Posponer 10
 * min). NO ejecuta nada por su cuenta: ver TaskScheduler para el motivo
 * (pantalla bloqueada + política de Play sobre Accesibilidad).
 *
 * El comando se lee de las prefs cifradas por id, no del Intent: un Intent de
 * alarma se puede reconstruir tras un reboot con datos viejos, y así la
 * notificación siempre refleja lo que el usuario dejó programado.
 */
class ScheduledTaskReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "[PhoneAgent].[Scheduler]"
        private const val CHANNEL_ID = "phoneagent_tareas"
        private const val SNOOZE_MINUTES = 10L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getIntExtra("task_id", -1)
        if (taskId < 0) {
            Log.w(TAG, "Alarma sin task_id; se ignora")
            return
        }
        when (intent.action) {
            TaskScheduler.ACTION_SNOOZE_TASK -> {
                TaskScheduler.snooze(context, taskId, SNOOZE_MINUTES)
                // Se retira el aviso: ya ha cumplido su función.
                context.getSystemService(NotificationManager::class.java)?.cancel(taskId)
                return
            }
            TaskScheduler.ACTION_RUN_TASK -> Unit   // sigue abajo
            else -> return
        }
        val task = TaskScheduler.all(context).firstOrNull { it.id == taskId }
        if (task == null) {
            // Cancelada entre el armado y el disparo: no es un error.
            Log.i(TAG, "La tarea $taskId ya no existe; alarma huérfana ignorada")
            return
        }
        if (!task.enabled) {
            Log.i(TAG, "«${task.name}» está desactivada; no se notifica")
            return
        }

        Log.i(TAG, "Alarma de «${task.name}»: ${task.command}")
        ensureChannel(context)
        notify(context, task)

        // Las diarias se reprograman al dispararse, no al pulsar: si el usuario
        // ignora la notificación, la de mañana sigue en pie.
        if (task.repeatDaily) TaskScheduler.advanceDaily(context, taskId)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Tareas programadas",
                NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Avisos de las tareas que programaste en Phone Agent"
            })
    }

    private fun notify(context: Context, task: ScheduledTask) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)

        val runIntent = PendingIntent.getActivity(context, task.id,
            Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra(TaskScheduler.EXTRA_TASK_COMMAND, task.command)
                putExtra(TaskScheduler.EXTRA_TASK_NAME, task.name)
            }, flags)

        // Acción y requestCode distintos a los de la alarma: si compartieran
        // PendingIntent, "posponer" rearmaría justo lo que acaba de saltar.
        val snoozeIntent = PendingIntent.getBroadcast(context, task.id + 10_000,
            Intent(context, ScheduledTaskReceiver::class.java).apply {
                action = TaskScheduler.ACTION_SNOOZE_TASK
                putExtra("task_id", task.id)
            }, flags)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Tarea programada: ${task.name}")
            .setContentText(task.command)
            .setStyle(NotificationCompat.BigTextStyle().bigText(task.command))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(runIntent)
            .addAction(0, "Ejecutar ahora", runIntent)
            .addAction(0, "Posponer $SNOOZE_MINUTES min", snoozeIntent)
            .build()

        try {
            manager.notify(task.id, notification)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS denegado (Android 13+). La alarma sigue
            // armada, pero sin el permiso no hay forma de avisar al usuario.
            Log.e(TAG, "No se puede notificar: falta POST_NOTIFICATIONS. ${e.message}")
        }
    }
}

/**
 * Rearma las alarmas tras un reinicio. Sin este receptor, cada reboot
 * perdería en silencio todas las tareas programadas.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        Log.i(TAG, "Reinicio detectado; reprogramando tareas")
        TaskScheduler.rescheduleAll(context)
    }

    companion object { private const val TAG = "[PhoneAgent].[Scheduler]" }
}
