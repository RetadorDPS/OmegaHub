package com.phoneagent.ui

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.phoneagent.PhoneAgentApp
import com.phoneagent.core.SecurePrefs
import com.phoneagent.databinding.ActivitySettingsBinding
import com.phoneagent.models.AutonomyLevel

/**
 * Ajustes del agente: User ID de Supabase, wake word, idioma de voz, nivel
 * de autonomía y (opcional) Anthropic API Key para el modo sin backend.
 * Todo se guarda CIFRADO con EncryptedSharedPreferences.
 */
class SettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsBinding
    private val container by lazy { (application as PhoneAgentApp).container }

    private val languages = listOf(
        "es-ES" to "Español (España)", "es-MX" to "Español (México)",
        "es-US" to "Español (EE. UU.)", "en-US" to "English (US)",
    )
    private val autonomyOptions = listOf(
        AutonomyLevel.READ to "read — solo lee y resume",
        AutonomyLevel.DRAFT to "draft — escribe, confirma envíos (recomendado)",
        AutonomyLevel.ACT to "act — ejecuta todo lo permitido",
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.spinnerLanguage.adapter = ArrayAdapter(this,
            android.R.layout.simple_spinner_dropdown_item, languages.map { it.second })
        binding.spinnerAutonomy.adapter = ArrayAdapter(this,
            android.R.layout.simple_spinner_dropdown_item, autonomyOptions.map { it.second })

        // Cargar valores actuales (la API key nunca se muestra entera de vuelta:
        // si ya hay una guardada, el campo indica que existe).
        binding.etUserId.setText(SecurePrefs.get(this, SecurePrefs.KEY_USER_ID).orEmpty())
        binding.etWakeWord.setText(SecurePrefs.get(this, SecurePrefs.KEY_WAKE_WORD) ?: "oye agente")
        val savedLang = SecurePrefs.get(this, SecurePrefs.KEY_LANGUAGE) ?: "es-ES"
        binding.spinnerLanguage.setSelection(languages.indexOfFirst { it.first == savedLang }.coerceAtLeast(0))
        val savedAutonomy = AutonomyLevel.fromWire(SecurePrefs.get(this, SecurePrefs.KEY_AUTONOMY) ?: "draft")
        binding.spinnerAutonomy.setSelection(autonomyOptions.indexOfFirst { it.first == savedAutonomy }.coerceAtLeast(0))
        val hasKey = !SecurePrefs.get(this, SecurePrefs.KEY_ANTHROPIC_API_KEY).isNullOrBlank()
        binding.etApiKey.hint = if (hasKey) "sk-ant-… (ya hay una guardada; déjalo vacío para conservarla)" else "sk-ant-… (se guarda cifrada)"
        binding.checkWakeWord.isChecked = SecurePrefs.getBool(this, SecurePrefs.KEY_WAKE_ENABLED)

        binding.btnSaveSettings.setOnClickListener { save() }
    }

    private fun save() {
        val userId = binding.etUserId.text.toString().trim()
        if (userId.isNotBlank() && !isUuid(userId)) {
            toast("El User ID no parece un UUID válido de Supabase Auth")
            return
        }
        SecurePrefs.put(this, SecurePrefs.KEY_USER_ID, userId)
        SecurePrefs.put(this, SecurePrefs.KEY_WAKE_WORD,
            binding.etWakeWord.text.toString().trim().ifBlank { "oye agente" })
        val language = languages[binding.spinnerLanguage.selectedItemPosition].first
        SecurePrefs.put(this, SecurePrefs.KEY_LANGUAGE, language)
        val autonomy = autonomyOptions[binding.spinnerAutonomy.selectedItemPosition].first
        SecurePrefs.put(this, SecurePrefs.KEY_AUTONOMY, autonomy.wire)
        val apiKey = binding.etApiKey.text.toString().trim()
        if (apiKey.isNotBlank()) {
            if (!apiKey.startsWith("sk-ant-")) {
                toast("Esa API key no parece de Anthropic (debe empezar por sk-ant-)")
                return
            }
            SecurePrefs.put(this, SecurePrefs.KEY_ANTHROPIC_API_KEY, apiKey)
        }
        SecurePrefs.putBool(this, SecurePrefs.KEY_WAKE_ENABLED, binding.checkWakeWord.isChecked)

        // Aplicar en caliente al motor de voz.
        container.voice.languageTag = language
        container.voice.wakeWord = binding.etWakeWord.text.toString().trim().ifBlank { "oye agente" }

        toast("Ajustes guardados (cifrados en el teléfono)")
        finish()
    }

    private fun isUuid(value: String): Boolean =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").matches(value)

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
