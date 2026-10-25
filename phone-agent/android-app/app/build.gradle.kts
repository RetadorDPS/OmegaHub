import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

// Lee credenciales de local.properties (NUNCA hardcodeadas en código).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun cfg(name: String): String =
    (localProps.getProperty(name) ?: System.getenv(name) ?: "")
        .replace("\\", "\\\\").replace("\"", "\\\"")

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
        buildConfigField("String", "SUPABASE_URL", "\"${cfg("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${cfg("SUPABASE_ANON_KEY")}\"")
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
    // Supabase Kotlin SDK (cliente/Auth/Storage; el transporte fino va por OkHttp
    // para controlar timeouts y errores de las Edge Functions byte a byte)
    // 2.7.0 final no se publicó en Maven Central; beta-1 es la versión 2.7 disponible.
    implementation(platform("io.github.jan-tennert.supabase:bom:2.7.0-beta-1"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    // En supabase-kt 2.x el módulo de Auth aún se llamaba gotrue-kt.
    implementation("io.github.jan-tennert.supabase:gotrue-kt")
    implementation("io.github.jan-tennert.supabase:functions-kt")
    implementation("io.github.jan-tennert.supabase:storage-kt")
    implementation("io.ktor:ktor-client-okhttp:2.3.12")
    // Persistencia local: Room (caché de drivers/config) + prefs cifradas
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Tests de JVM. org.json es necesario porque en Android viene del framework
    // y en un test local el stub lanza "not mocked" en cuanto se usa.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
