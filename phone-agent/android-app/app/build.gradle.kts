import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

// Los valores de local.properties o del entorno permiten builds privados.
// El fallback es solo la URL y la clave PÚBLICA publishable del proyecto común;
// nunca se incluye aquí una service_role key ni otra credencial de servidor.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun cfg(name: String): String =
    (localProps.getProperty(name) ?: System.getenv(name) ?: "")
        .replace("\\", "\\\\").replace("\"", "\\\"")
val sharedSupabaseUrl = "https://ccapdpiqawpnqlyumgqh.supabase.co"
val sharedSupabasePublishableKey = "sb_publishable_yCmJG7zj4RGP_NL0SaQcyA_253KH9z3"

android {
    namespace = "com.phoneagent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.phoneagent"
        minSdk = 29          // Android 10+
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        val supabaseUrl = cfg("SUPABASE_URL").ifBlank { sharedSupabaseUrl }
        val supabasePublicKey = cfg("SUPABASE_ANON_KEY").ifBlank { sharedSupabasePublishableKey }
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabasePublicKey\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures { buildConfig = true; viewBinding = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions {
        // PermissionGate y compañía llaman a android.util.Log. En un test de JVM
        // el stub de Android lanza por defecto; esto hace que devuelva valores
        // neutros y el test ejercite la lógica de verdad en vez del logging.
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    // UI / base AndroidX
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    // Ciclo de vida + corrutinas
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    // Red: OkHttp (REST de Supabase PostgREST + Edge Functions + Claude directo)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    // Supabase Auth/PostgREST/Functions se consumen por REST con OkHttp.
    // Persistencia local: Room + Android Keystore para cifrar tokens
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // Tests de JVM. org.json es necesario porque en Android viene del framework
    // y en un test local el stub lanza "not mocked" en cuanto se usa.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
