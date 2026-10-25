package com.phoneagent.ui

import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.phoneagent.PhoneAgentApp
import com.phoneagent.core.SecurePrefs
import com.phoneagent.databinding.ActivitySettingsBinding
import com.phoneagent.models.AutonomyLevel
import kotlinx.coroutines.launch

/**
 * Ajustes del agente.
 *
 * Lo primero es la CUENTA: sin iniciar sesión no hay JWT, y sin JWT la base de
 * datos (RLS) no deja leer ni guardar nada del usuario — el agente parecería no
 * tener ninguna app autorizada aunque la hubieras marcado. El backend común
 * viene integrado en el APK: aquí el usuario solo crea/inicia su cuenta.
 *
 * Las preferencias personales se guardan cifradas con EncryptedSharedPreferences.
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

        loadCurrentValues()

        binding.btnSignIn.setOnClickListener { authenticate(signUp = false) }
        binding.btnSignUp.setOnClickListener { authenticate(signUp = true) }
        binding.btnSignOut.setOnClickListener { signOut() }
        binding.btnSaveSettings.setOnClickListener { save() }
    }

    override fun onResume() {
        super.onResume()
        refreshAuthState()
    }

    private fun loadCurrentValues() {
        binding.etEmail.setText(SecurePrefs.get(this, SecurePrefs.KEY_USER_EMAIL).orEmpty())
        binding.etWakeWord.setText(SecurePrefs.get(this, SecurePrefs.KEY_WAKE_WORD) ?: "oye agente")
        val savedLang = SecurePrefs.get(this, SecurePrefs.KEY_LANGUAGE) ?: "es-ES"
        binding.spinnerLanguage.setSelection(languages.indexOfFirst { it.first == savedLang }.coerceAtLeast(0))
        val savedAutonomy = AutonomyLevel.fromWire(SecurePrefs.get(this, SecurePrefs.KEY_AUTONOMY) ?: "draft")
        binding.spinnerAutonomy.setSelection(autonomyOptions.indexOfFirst { it.first == savedAutonomy }.coerceAtLeast(0))
        binding.checkWakeWord.isChecked = SecurePrefs.getBool(this, SecurePrefs.KEY_WAKE_ENABLED)
    }

    /** Muestra si hay sesión y ajusta los botones en consecuencia. */
    private fun refreshAuthState() {
        lifecycleScope.launch {
            val userId = SecurePrefs.get(this@SettingsActivity, SecurePrefs.KEY_USER_ID).orEmpty()
            val email = SecurePrefs.get(this@SettingsActivity, SecurePrefs.KEY_USER_EMAIL).orEmpty()
            val authed = runCatching { container.supabase.isAuthenticated() }.getOrDefault(false)
            when {
                authed && userId.isNotBlank() -> {
                    binding.tvAuthState.text = "✅ Cuenta activa: ${email.ifBlank { "Phone Agent" }}"
                    binding.btnSignOut.visibility = View.VISIBLE
                    binding.etPassword.isEnabled = false
                }
                userId.isNotBlank() -> {
                    binding.tvAuthState.text = "⚠️ Tu sesión caducó: vuelve a iniciar sesión"
                    binding.btnSignOut.visibility = View.GONE
                    binding.etPassword.isEnabled = true
                }
                else -> {
                    binding.tvAuthState.text = "Sin sesión iniciada"
                    binding.btnSignOut.visibility = View.GONE
                    binding.etPassword.isEnabled = true
                }
            }
        }
    }

    private fun authenticate(signUp: Boolean) {
        val email = binding.etEmail.text.toString().trim()
        val password = binding.etPassword.text.toString()
        if (email.isBlank() || password.isBlank()) {
            toast("Escribe tu email y tu contraseña")
            return
        }
        if (!container.supabase.isConfigured()) {
            toast("No se pudo cargar la conexión del servicio. Instala la versión oficial más reciente.")
            return
        }
        setBusy(true)
        lifecycleScope.launch {
            try {
                val result = if (signUp) container.supabase.signUp(email, password)
                             else container.supabase.signIn(email, password)
                if (result.needsEmailConfirmation) {
                    toast("La cuenta se creó, pero no se abrió la sesión. Pulsa Iniciar sesión; si vuelve a fallar, avísanos.")
                } else {
                    toast(if (signUp) "Cuenta creada y sesión iniciada" else "Sesión iniciada como ${result.email}")
                }
            } catch (e: Exception) {
                toast(e.message ?: "No se pudo completar la operación")
            } finally {
                setBusy(false)
                refreshAuthState()
            }
        }
    }

    private fun signOut() {
        lifecycleScope.launch {
            container.supabase.signOut()
            binding.etPassword.setText("")
            toast("Sesión cerrada")
            refreshAuthState()
        }
    }

    private fun setBusy(busy: Boolean) {
        binding.btnSignIn.isEnabled = !busy
        binding.btnSignUp.isEnabled = !busy
        binding.btnSaveSettings.isEnabled = !busy
    }

    private fun save() {
        SecurePrefs.put(this, SecurePrefs.KEY_WAKE_WORD,
            binding.etWakeWord.text.toString().trim().ifBlank { "oye agente" })
        val language = languages[binding.spinnerLanguage.selectedItemPosition].first
        SecurePrefs.put(this, SecurePrefs.KEY_LANGUAGE, language)
        val autonomy = autonomyOptions[binding.spinnerAutonomy.selectedItemPosition].first
        SecurePrefs.put(this, SecurePrefs.KEY_AUTONOMY, autonomy.wire)
        SecurePrefs.putBool(this, SecurePrefs.KEY_WAKE_ENABLED, binding.checkWakeWord.isChecked)

        // Aplicar en caliente al motor de voz.
        container.voice.languageTag = language
        container.voice.wakeWord = binding.etWakeWord.text.toString().trim().ifBlank { "oye agente" }

        toast("Ajustes guardados (cifrados en el teléfono)")
        finish()
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
