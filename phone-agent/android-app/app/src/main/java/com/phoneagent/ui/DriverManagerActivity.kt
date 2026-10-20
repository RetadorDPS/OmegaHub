package com.phoneagent.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.phoneagent.PhoneAgentApp
import com.phoneagent.databinding.ActivityDriverManagerBinding
import com.phoneagent.databinding.ItemDriverBinding
import com.phoneagent.models.DriverConfig
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Apps autorizadas: lista lo que hay en Supabase (app_drivers) cruzado con lo
 * instalado en el teléfono (incluidas variantes duales). El usuario marca
 * qué puede tocar el agente y si una instalación es dual. Guardar = Supabase.
 */
class DriverManagerActivity : AppCompatActivity() {
    private lateinit var binding: ActivityDriverManagerBinding
    private val container by lazy { (application as PhoneAgentApp).container }
    private val adapter = DriverAdapter()
    private val workingCopies = mutableListOf<DriverConfig>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDriverManagerBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.rvDrivers.layoutManager = LinearLayoutManager(this)
        binding.rvDrivers.adapter = adapter
        binding.btnSaveDrivers.setOnClickListener { saveAll() }
        loadDrivers()
    }

    private fun loadDrivers() {
        val userId = container.configManager.userId()
        if (userId.isBlank()) {
            toast("Primero pega tu User ID de Supabase en Ajustes.")
            return
        }
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val drivers = container.driverRegistry.reload(userId, container.configManager)
                val containers = container.dualAppDetector.cloneContainersInstalled()
                if (containers.isNotEmpty()) {
                    toast("Detectado contenedor de clones: ${containers.joinToString()}. El agente no lo tocará; autoriza la app clonada cuando aparezca en su perfil.")
                }
                workingCopies.clear(); workingCopies.addAll(drivers)
                adapter.submit(workingCopies)
                if (drivers.isEmpty()) toast("Supabase no devolvió drivers. ¿Ejecutaste el SQL 001 y seed_initial_data()?")
            } catch (e: Exception) {
                toast("Error cargando drivers: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun saveAll() {
        val userId = container.configManager.userId()
        if (userId.isBlank()) { toast("Falta el User ID (Ajustes)"); return }
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            var savedCount = 0
            try {
                val saved = mutableListOf<DriverConfig>()
                for (cfg in workingCopies) {
                    saved.add(container.supabase.saveUserDriver(userId, cfg))
                    savedCount++
                }
                container.driverRegistry.setConfigs(saved)
                container.supabase.logEvent(userId, null, "info", "drivers_updated",
                    "$savedCount drivers guardados", JSONObject().put("authorized",
                        saved.filter { it.authorized }.joinToString(",") { it.driverKey }))
                toast("Guardado en Supabase: $savedCount apps (${saved.count { it.authorized }} autorizadas)")
                loadDrivers()
            } catch (e: Exception) {
                toast("No se pudo guardar: ${e.message}")
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    // ── Adapter ────────────────────────────────────────────────────────────
    private inner class DriverAdapter : RecyclerView.Adapter<DriverAdapter.Holder>() {
        private var items: List<DriverConfig> = emptyList()

        /** Copia defensiva: el adapter no debe compartir la lista que se edita. */
        fun submit(list: List<DriverConfig>) {
            items = list.toList()
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val itemBinding = ItemDriverBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            return Holder(itemBinding)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: Holder, position: Int) {
            val cfg = items[position]
            with(holder.binding) {
                tvDriverName.text = cfg.displayName + if (cfg.isDualVariant) " (dual)" else ""
                val candidates = container.dualAppDetector.candidatesFor(cfg)
                val candidateText = if (candidates.isEmpty()) "" else
                    candidates.joinToString(" · ") { "perfil ${it.profileId}" }
                tvDriverDetail.text = buildString {
                    append(cfg.resolvedPackage ?: cfg.packageName)
                    append(if (cfg.installed) " · ✅ instalada" else " · ❌ no instalada")
                    if (cfg.installed && cfg.profileId > 0) append(" · perfil ${cfg.profileId} (dual)")
                    if (candidateText.isNotBlank()) append(" · detectada en: $candidateText")
                }
                switchAuthorized.setOnCheckedChangeListener(null)
                checkDual.setOnCheckedChangeListener(null)
                switchAuthorized.isChecked = cfg.authorized
                checkDual.isChecked = cfg.isDualVariant
                switchAuthorized.setOnCheckedChangeListener { _, checked ->
                    workingCopies[position] = workingCopies[position].copy(authorized = checked)
                }
                checkDual.setOnCheckedChangeListener { _, checked ->
                    val current = workingCopies[position]
                    workingCopies[position] = current.copy(
                        isDualVariant = checked,
                        baseDriverKey = if (checked) current.baseDriverKey ?: current.driverKey else current.baseDriverKey,
                    )
                }
            }
        }

        inner class Holder(val binding: ItemDriverBinding) : RecyclerView.ViewHolder(binding.root)
    }
}
