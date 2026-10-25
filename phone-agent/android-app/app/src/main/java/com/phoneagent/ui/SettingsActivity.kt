package com.phoneagent.ui

import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.phoneagent.BuildConfig
import com.phoneagent.PhoneAgentApp
import com.phoneagent.core.SecurePrefs
import com.phoneagent.databinding.ActivitySettingsBinding
import com.phoneagent.models.AutonomyLevel
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Ajustes del agente.
 *
 * Lo primero es la CUENTA: sin iniciar sesión no hay JWT, y sin JWT la base de
 * datos (RLS) no deja leer ni guardar nada del usuario — el agente parecería no
 * tener ninguna app autorizada aunque la hubieras marcado. Por eso el login va
 * arriba y el User ID se rellena solo al iniciar sesión.
 *
 * El resto (wake word, idioma, autonomía, API key opcional) se guarda CIFRADO
 * con EncryptedSharedPreferences.
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
        val compiledUrl = BuildConfig.SUPABASE_URL.takeUnless { it.contains(".invalid") }.orEmpty()
        val compiledKey = BuildConfig.SUPABASE_ANON_KEY.takeUnless { it.startsWith("ci-placeholder") }.orEmpty()
        binding.etSupabaseUrl.setText(SecurePrefs.get(this, SecurePrefs.KEY_SUPABASE_URL) ?: compiledUrl)
        binding.etSupabaseAnonKey.setText(SecurePrefs.get(this, SecurePrefs.KEY_SUPABASE_ANON_KEY) ?: compiledKey)
        binding.etUserId.setText(SecurePrefs.get(this, SecurePrefs.KEY_USER_ID).orEmpty())
        binding.etEmail.setText(SecurePrefs.get(this, SecurePrefs.KEY_USER_EMAIL).orEmpty())
        binding.etWakeWord.setText(SecurePrefs.get(this, SecurePrefs.KEY_WAKE_WORD) ?: "oye agente")
        val savedLang = SecurePrefs.get(this, SecurePrefs.KEY_LANGUAGE) ?: "es-ES"
        binding.spinnerLanguage.setSelection(languages.indexOfFirst { it.first == savedLang }.coerceAtLeast(0))
        val savedAutonomy = AutonomyLevel.fromWire(SecurePrefs.get(this, SecurePrefs.KEY_AUTONOMY) ?: "draft")
        binding.spinnerAutonomy.setSelection(autonomyOptions.indexOfFirst { it.first == savedAutonomy }.coerceAtLeast(0))
        val hasKey = !SecurePrefs.get(this, SecurePrefs.KEY_ANTHROPIC_API_KEY).isNullOrBlank()
        binding.etApiKey.hint = if (hasKey) "sk-ant-… (ya hay una guardada; déjalo vacío para conservarla)"
                                else "sk-ant-… (se guarda cifrada)"
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
                    binding.tvAuthState.text = "✅ Sesión activa: ${email.ifBlank { userId }}"
                    binding.btnSignOut.visibility = View.VISIBLE
                    binding.etPassword.isEnabled = false
                }
                userId.isNotBlank() -> {
                    binding.tvAuthState.text = "⚠️ Hay User ID pero la sesión caducó: vuelve a iniciar sesión"
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
        if (!saveSupabaseConnectionFromFields()) return
        if (!container.supabase.isConfigured()) {
            toast("Completa primero la URL y la clave pública de Supabase")
            return
        }
        setBusy(true)
        lifecycleScope.launch {
            try {
                val result = if (signUp) container.supabase.signUp(email, password)
                             else container.supabase.signIn(email, password)
                if (result.needsEmailConfirmation) {
                    toast("Cuenta creada. Confirma tu email desde el enlace que te hemos enviado y luego inicia sesión.")
                } else {
                    binding.etUserId.setText(result.userId)
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
            binding.etUserId.setText("")
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
        val userId = binding.etUserId.text.toString().trim()
        if (userId.isNotBlank() && !isUuid(userId)) {
            toast("El User ID no parece un UUID válido de Supabase Auth")
            return
        }
        if (!saveSupabaseConnectionFromFields()) return
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

    /** Guarda la conexión cifrada para no depender de local.properties ni de un APK personalizado. */
    private fun saveSupabaseConnectionFromFields(): Boolean {
        val url = binding.etSupabaseUrl.text.toString().trim().removeSuffix("/")
        val key = binding.etSupabaseAnonKey.text.toString().trim()
        if (url.isBlank() && key.isBlank()) return true
        if (url.isBlank() || key.isBlank()) {
            toast("Para conectar Supabase hacen falta la URL y la clave pública")
            return false
        }
        val parsed = runCatching { Uri.parse(url) }.getOrNull()
        if (parsed == null || parsed.scheme != "https" || parsed.host.isNullOrBlank()) {
            toast("La URL debe empezar por https:// y ser la URL del proyecto Supabase")
            return false
        }
        if (key.length < 20) {
            toast("La clave parece incompleta. Usa la clave pública anon o publishable")
            return false
        }
        if (isServiceRoleKey(key)) {
            toast("Esa es una clave secreta de administrador. No la pongas en el teléfono; usa la clave pública anon/publishable")
            return false
        }
        SecurePrefs.put(this, SecurePrefs.KEY_SUPABASE_URL, url)
        SecurePrefs.put(this, SecurePrefs.KEY_SUPABASE_ANON_KEY, key)
        return true
    }

    /** Impide guardar accidentalmente una clave capaz de saltarse las políticas RLS. */
    private fun isServiceRoleKey(key: String): Boolean {
        if (key.startsWith("sb_secret_", ignoreCase = true)) return true
        val payload = key.split('.').getOrNull(1) ?: return false
        val decoded = runCatching {
            String(Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING), Charsets.UTF_8)
        }.getOrNull() ?: return false
        return runCatching { JSONObject(decoded).optString("role") == "service_role" }.getOrDefault(false)
    }

    private fun isUuid(value: String): Boolean =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").matches(value)

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
