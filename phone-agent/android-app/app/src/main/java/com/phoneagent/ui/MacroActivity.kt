package com.phoneagent.ui

import android.app.TimePickerDialog
import android.os.Bundle
import android.widget.CheckBox
import android.widget.LinearLayout
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.phoneagent.PhoneAgentApp
import com.phoneagent.databinding.ActivityMacrosBinding
import com.phoneagent.databinding.ItemMacroBinding
import com.phoneagent.models.Macro
import com.phoneagent.system.ScheduledTask
import com.phoneagent.system.TaskScheduler
import kotlinx.coroutines.launch
import java.util.Calendar

/**
 * Gestión de macros grabadas.
 *
 * Qué es una macro: un flujo que el agente resolvió bien una vez y que queda
 * guardado como script. La próxima vez que el usuario diga la misma frase, se
 * reproduce tal cual — sin LLM, sin tokens y sin el riesgo de que el modelo
 * improvise distinto hoy.
 *
 * Aquí se pueden activar/desactivar y borrar. Editar los pasos uno a uno no está
 * en el MVP: la forma de cambiar una macro es volver a ejecutar la tarea.
 */
class MacroActivity : AppCompatActivity() {

    companion object { private const val TAG = "[PhoneAgent].[MacrosUI]" }

    private lateinit var binding: ActivityMacrosBinding
    private val container by lazy { (application as PhoneAgentApp).container }
    private val adapter = MacroAdapter()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMacrosBinding.inflate(layoutInflater)
        setContentView(binding.root)
        supportActionBar?.title = "Macros grabadas"

        binding.rvMacros.layoutManager = LinearLayoutManager(this)
        binding.rvMacros.adapter = adapter
        load()
    }

    private fun load() {
        val userId = container.configManager.userId()
        if (userId.isBlank()) {
            binding.tvEmpty.text = "Inicia sesión en Ajustes para ver tus macros."
            binding.tvEmpty.visibility = View.VISIBLE
            return
        }
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val macros = container.supabase.fetchMacros(userId)
                container.macroEngine.setMacros(macros)
                adapter.submit(macros)
                binding.tvEmpty.visibility = if (macros.isEmpty()) View.VISIBLE else View.GONE
                Log.d(TAG, "${macros.size} macros cargadas")
            } catch (e: Exception) {
                Log.e(TAG, "Error cargando macros", e)
                binding.tvEmpty.text = "No se pudieron cargar las macros: ${e.message}"
                binding.tvEmpty.visibility = View.VISIBLE
                toast("Error al cargar las macros")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    /** Activar/desactivar: se guarda en Supabase para que se sincronice. */
    private fun toggle(macro: Macro, enabled: Boolean) {
        val userId = container.configManager.userId()
        if (userId.isBlank()) { toast("Inicia sesión en Phone Agent desde Ajustes"); return }
        lifecycleScope.launch {
            try {
                val saved = container.supabase.saveMacro(userId, macro.copy(enabled = enabled))
                val updated = adapter.items.map { if (it.id == saved.id) saved else it }
                adapter.submit(updated)
                container.macroEngine.setMacros(updated)
                toast(if (enabled) "Macro activada" else "Macro desactivada")
            } catch (e: Exception) {
                Log.e(TAG, "Error actualizando macro", e)
                toast("No se pudo actualizar: ${e.message}")
                adapter.submit(adapter.items) // revierte el switch
            }
        }
    }

    private fun delete(macro: Macro) {
        val userId = container.configManager.userId()
        if (userId.isBlank()) { toast("Inicia sesión en Phone Agent desde Ajustes"); return }
        lifecycleScope.launch {
            try {
                container.supabase.deleteMacro(userId, macro.id)
                val remaining = adapter.items.filter { it.id != macro.id }
                adapter.submit(remaining)
                container.macroEngine.setMacros(remaining)
                binding.tvEmpty.visibility = if (remaining.isEmpty()) View.VISIBLE else View.GONE
                toast("Macro borrada")
            } catch (e: Exception) {
                Log.e(TAG, "Error borrando macro", e)
                toast("No se pudo borrar: ${e.message}")
            }
        }
    }

    /**
     * Programar una macro. Se programa la FRASE que la dispara, no los pasos:
     * así, si el usuario mejora la macro, la tarea programada usa la versión
     * nueva sin tener que reprogramarla.
     */
    private fun openScheduler(macro: Macro) {
        val command = macro.triggerPhrase.ifBlank { macro.name }
        val existing = TaskScheduler.all(this)
            .filter { it.command == command && it.enabled }
        val listado = if (existing.isEmpty()) "Sin programar."
            else existing.joinToString("\n") { task ->
                "• ${java.text.SimpleDateFormat("HH:mm dd/MM", java.util.Locale.getDefault())
                    .format(java.util.Date(task.triggerAtEpochMs))}" +
                    if (task.repeatDaily) " (a diario)" else ""
            }
        MaterialAlertDialogBuilder(this)
            .setTitle("Programar «${macro.name}»")
            .setMessage("Se ejecutará: «$command»\n\nProgramadas ahora:\n$listado\n\n" +
                "A la hora elegida recibirás un aviso con un botón para lanzarla. " +
                "No se ejecuta sola: con la pantalla bloqueada la accesibilidad no " +
                "recibe eventos, y así lo exige la política de Google Play.")
            .setPositiveButton("Añadir hora") { _, _ -> pickTime(macro, command) }
            .apply {
                if (existing.isNotEmpty()) {
                    setNeutralButton("Quitar todas") { _, _ ->
                        existing.forEach { TaskScheduler.cancel(this@MacroActivity, it.id) }
                        toast("${existing.size} programación(es) eliminada(s)")
                    }
                }
            }
            .setNegativeButton("Cerrar", null)
            .show()
    }

    private fun pickTime(macro: Macro, command: String) {
        val now = Calendar.getInstance()
        TimePickerDialog(this, { _, hour, minute ->
            val target = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, hour)
                set(Calendar.MINUTE, minute)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                // Una hora que ya pasó hoy significa mañana.
                if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
            }
            askRepeatDaily(macro, command, target.timeInMillis)
        }, now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE), true).show()
    }

    private fun askRepeatDaily(macro: Macro, command: String, triggerAt: Long) {
        val repeat = CheckBox(this).apply { text = "Repetir cada día" }
        val wrapper = LinearLayout(this).apply {
            val pad = (20 * resources.displayMetrics.density).toInt()
            setPadding(pad, 0, pad, 0)
            addView(repeat)
        }
        val cuando = java.text.SimpleDateFormat("EEE d MMM, HH:mm", java.util.Locale.getDefault())
            .format(java.util.Date(triggerAt))
        MaterialAlertDialogBuilder(this)
            .setTitle("¿Repetir?")
            .setMessage("Primera ejecución: $cuando")
            .setView(wrapper)
            .setPositiveButton("Programar") { _, _ ->
                TaskScheduler.schedule(this, macro.name, command, triggerAt, repeat.isChecked)
                toast("Programada para $cuando")
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    // ── Adaptador ──────────────────────────────────────────────────────────

    private inner class MacroAdapter : RecyclerView.Adapter<MacroAdapter.VH>() {

        var items: List<Macro> = emptyList()
            private set

        fun submit(list: List<Macro>) {
            items = list
            notifyDataSetChanged()
        }

        inner class VH(val itemBinding: ItemMacroBinding) :
            RecyclerView.ViewHolder(itemBinding.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val vb = ItemMacroBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            return VH(vb)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val macro = items[position]
            val vb = holder.itemBinding
            vb.tvMacroName.text = macro.name
            vb.tvMacroDetail.text = buildString {
                append("${macro.steps.size} pasos")
                macro.driverKey?.let { append(" · $it") }
                if (macro.triggerPhrase.isNotBlank()) append(" · di: «${macro.triggerPhrase}»")
            }
            // setOnClickListener primero: setOnCheckedChangeListener se dispara
            // al fijar el estado y nos llamaría a Supabase sin que nadie toque.
            vb.switchMacroEnabled.setOnCheckedChangeListener(null)
            vb.switchMacroEnabled.isChecked = macro.enabled
            vb.switchMacroEnabled.setOnCheckedChangeListener { _, checked ->
                if (checked != macro.enabled) toggle(macro, checked)
            }
            vb.btnDeleteMacro.setOnClickListener { delete(macro) }
            vb.btnScheduleMacro.setOnClickListener { openScheduler(macro) }
        }
    }
}
