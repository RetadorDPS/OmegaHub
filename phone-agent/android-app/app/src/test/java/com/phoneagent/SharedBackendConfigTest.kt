package com.phoneagent

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Impide publicar accidentalmente un APK de CI con valores de relleno. */
class SharedBackendConfigTest {
    @Test
    fun apkTieneConfiguracionRealDelBackend() {
        assertTrue("La URL del backend debe estar configurada", BuildConfig.SUPABASE_URL.startsWith("https://"))
        assertFalse("El APK no debe usar el host inválido de CI", BuildConfig.SUPABASE_URL.contains(".invalid"))
        assertTrue("La clave pública debe estar incluida", BuildConfig.SUPABASE_ANON_KEY.length > 20)
        assertFalse("El APK no debe usar la clave de relleno de CI", BuildConfig.SUPABASE_ANON_KEY.startsWith("ci-placeholder"))
    }
}
