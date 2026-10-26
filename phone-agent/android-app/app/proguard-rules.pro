# Reglas de ofuscación de Phone Agent.
#
# isMinifyEnabled está en false por defecto (build.gradle.kts). Estas reglas
# existen para que activarlo en release no rompa nada de forma silenciosa:
# los tres puntos críticos son R8 borrando lo que se carga por reflexión.

# ── 1. Drivers por ServiceLoader ────────────────────────────────────────────
# DriverRegistry descubre los AppDriver leyendo
# META-INF/services/com.phoneagent.drivers.AppDriver. R8 no ve esas referencias
# porque son texto en un recurso, no bytecode: sin esto, elimina las clases y el
# registro arranca vacío (todo caería en GenericDriver).
-keep class com.phoneagent.drivers.** { *; }
-keepnames class com.phoneagent.drivers.AppDriver
# El fichero de servicios debe sobrevivir tal cual al empaquetado.
-keepdirectories META-INF/services
-adaptresourcefilenames META-INF/services/**

# ── 2. Modelos serializados a JSON ──────────────────────────────────────────
# Los data class se leen/escriben campo a campo vía org.json en sus
# fromJson/toJson, así que los nombres de campo son contrato con la base.
-keepclassmembers class com.phoneagent.models.** {
    <fields>;
    <init>(...);
}
-keep class com.phoneagent.models.** { *; }

# ── 3. Nombres de clase en logs y en el event_log ───────────────────────────
# SessionManager y EventBus escriben el nombre de la clase en Supabase; sin
# -keepnames eso se convierte en a.b.c y los registros dejan de ser legibles.
-keepnames class com.phoneagent.core.**
-keepnames class com.phoneagent.capabilities.**

# ── 4. Terceros ─────────────────────────────────────────────────────────────
# OkHttp avisa por reflexión de proveedores TLS opcionales en Android antiguo.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
# Kotlinx.coroutines usa ServiceLoader para sus excepciones diagnósticas.
-dontwarn kotlinx.coroutines.**

# ── 5. Depuración ───────────────────────────────────────────────────────────
# Conserva números de línea para que un stacktrace de producción se pueda
# mapear; -printmapping guarda el mapa que hay que archivar por release.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-printmapping build/outputs/mapping/release/mapping.txt
