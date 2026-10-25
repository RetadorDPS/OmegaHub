# Phone Agent — Proyecto completo

Un agente de IA que opera un teléfono Android **por voz**: le das una instrucción hablada, abre las apps autorizadas, navega su interfaz tocando la pantalla, ejecuta la tarea, **verifica cada paso con un screenshot** y te reporta el resultado por voz.

> **Regla de oro del sistema:** el agente SOLO toca las apps autorizadas (MVP: Claude, Claude Dual, ChatGPT y WhatsApp). Todo lo demás, para él, no existe: `PermissionGate` deniega cualquier acción fuera de la whitelist antes de que llegue a la pantalla.

---

## 1. Arquitectura

```
┌──────────────────────────── TELÉFONO ANDROID ────────────────────────────┐
│  UI + VOZ                    MainActivity · DriverManager · Settings     │
│  (STT/TTS nativos es-ES)     FloatingOverlay (burbuja de estado)         │
│            │ comando de voz                                               │
│            ▼                                                              │
│  AGENT CORE                  AgentEngine (loop plan→ejecutar→verificar)  │
│                              PermissionGate  ← INTERCEPTA TODO           │
│                              SessionManager · EventBus · ConfigManager   │
│            │ paso aprobado                     │ screenshot verificado   │
│            ▼                                   ▼                          │
│  APP DRIVERS (plugins)       ClaudeDriver · ChatGPTDriver                │
│  1 app nueva = 1 clase +     WhatsAppDriver · GenericDriver (fallback)   │
│  1 fila en app_drivers       DriverRegistry (carga dinámica desde DB)    │
│            │ gestos                            ▲ árbol de UI             │
│            ▼                                   │                          │
│  SYSTEM                      AccessibilityService (tap/swipe/type)       │
│                              MediaProjection (screenshots) · Intents     │
│                              DualAppDetector (perfiles/patrones)         │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │  HTTPS (OkHttp, timeouts 90 s)
                               ▼
┌──────────────────────────── SUPABASE ────────────────────────────────────┐
│  PostgreSQL (8 tablas, RLS)  app_drivers · agent_sessions · steps · …    │
│  Edge Functions (Deno)       plan-task · verify-and-next                 │
│                              complete-session · check-alerts             │
│  Storage                     bucket `screenshots` (auto-borrado 24 h)    │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │  API de Anthropic (clave SOLO en el servidor)
                               ▼
                        Claude (visión + razonamiento)
                        modelo desde capability_config
```

**Capas y extensibilidad (CORE + PLUGINS):** agregar una app nueva en el futuro requiere **máximo** una clase que implemente `AppDriver` + un `INSERT` en `app_drivers` (paso a paso en la §9). El core no se toca.

### El loop del agente

1. Hablas → `VoiceCapability` transcribe (SpeechRecognizer nativo, español).
2. `AgentEngine` captura el screenshot inicial + árbol de UI accesible.
3. Edge Function **plan-task** construye el system prompt dinámico (base + apps autorizadas de la DB + proyecto activo + nivel de autonomía) y Claude devuelve la **primera acción** en JSON.
4. `PermissionGate` verifica: ¿app autorizada? ¿acción permitida por el driver? ¿autonomía? ¿es un envío que requiere confirmación?
5. `StepExecutor` ejecuta (tap/swipe/type/open_app…) con el `AccessibilityService`.
6. Nuevo screenshot → Edge Function **verify-and-next**: Claude confirma si el paso funcionó y propone el siguiente paso o la corrección. Se repite hasta `done`, error o máximo de pasos (25, configurable).
7. **complete-session** resume la sesión con el LLM, actualiza la memoria del proyecto y cierra.
8. El resultado se lee por voz (TTS) y queda en la pantalla.

---

## 2. Requisitos para probar desde el teléfono (sin PC)

| Qué | Para qué | Dónde |
|---|---|---|
| Un teléfono Android 10+ (API 29+) real | Voz, accesibilidad y captura de pantalla | — |
| Cuenta y proyecto de Supabase | Base de datos, funciones y almacenamiento | https://supabase.com |
| Clave de API de Anthropic | Claude como motor de planificación/visión; el consumo de API puede facturarse aparte | https://console.anthropic.com |
| Cuenta de GitHub con acceso al repositorio | Descargar el APK que genera GitHub Actions | https://github.com/RetadorDPS/OmegaHub/actions |

**No necesitas Android Studio, ordenador ni cable USB para instalar la versión de prueba.** GitHub compila el APK en la nube y lo deja como archivo descargable. Android Studio y Supabase CLI solo hacen falta para desarrollo avanzado; no para instalar el APK.

> La suscripción a Claude Code no equivale a una clave de API de Anthropic para esta app. No pegues claves en el chat. La app permite guardarlas cifradas en Ajustes; nunca uses la clave `service_role` de Supabase en el teléfono.

---

## 3. Montar Supabase (10 minutos)

### 3.1 Crear el proyecto
1. Entra en https://supabase.com → **New project**. Nombre: `phone-agent`. Guarda la contraseña de la DB.
2. Espera a que el proyecto esté activo y entra en **Project Settings → API**. Apunta dos valores (los necesitarás en la §5):
   - **Project URL** → `https://xxxxx.supabase.co`
   - **anon public key** → `eyJ...`

### 3.2 Crear las tablas (SQL)
1. En el dashboard: **SQL Editor → New query**.
2. Pega ENTERO el contenido de `supabase/migrations/001_full_schema.sql` y pulsa **Run**.

Eso crea las 8 tablas (`users`, `app_drivers`, `projects`, `agent_sessions`, `session_steps`, `macros`, `capability_config`, `event_log`) con RLS activado, índices por `user_id + created_at`, triggers de `updated_at`, el bucket privado `screenshots` (con borrado automático a las 24 h) y ejecuta el seed global con las 4 apps del MVP y su `ui_map`/`detection_rules`.

> ¿Prefieres CLI? `supabase link --project-ref TU_REF && supabase db push` con esta carpeta como raíz.

### 3.3 Crear tu cuenta (necesaria para que el RLS funcione)
Todas las sesiones, drivers autorizados y logs pertenecen a un usuario de Supabase Auth. **Sin iniciar sesión no hay JWT, y sin JWT las políticas RLS no dejan leer ni escribir nada tuyo**: el agente diría que no tienes ninguna app autorizada aunque la hubieras marcado.

Dos formas, elige una:
- **Desde la app (recomendado):** Ajustes → *1. Cuenta de Supabase* → **Crear cuenta** con tu email y contraseña, y luego **Iniciar sesión**. El User ID se rellena solo.
- **Desde el dashboard:** **Authentication → Users → Add user → Create new user**. Después inicia sesión en la app con ese email y contraseña.

> Si tu proyecto tiene activada la confirmación por email (Authentication → Providers → Email), confirma el enlace antes de iniciar sesión; la app te lo dirá.

Opcional, para tener también filas de driver propias además del seed global:
```sql
select public.seed_initial_data('TU-UUID-DE-USUARIO');
```
No hace falta: al autorizar una app en Driver Manager, la app crea tu fila propia y deja el seed global intacto.

### 3.4 Desplegar las Edge Functions + la clave de Anthropic
**La API key de Anthropic vive SOLO aquí, en el servidor. Nunca en la app** (salvo que uses el modo local de la §5.3).

Con CLI, desde la carpeta `phone-agent/`:
```bash
supabase link --project-ref TU_REF
supabase secrets set ANTHROPIC_API_KEY='sk-ant-api03-...'
supabase functions deploy plan-task
supabase functions deploy verify-and-next
supabase functions deploy complete-session
supabase functions deploy check-alerts
```

Sin CLI (dashboard): **Edge Functions → Deploy a new function**, crea cada una con el nombre exacto de su carpeta (`plan-task`, etc.), pega el contenido de su `index.ts`, y añade el secreto en **Project Settings → Edge Functions → Secrets** (`ANTHROPIC_API_KEY`).

Comprobación rápida (debe responder un error 400 de validación, no un 404):
```bash
curl -i -X POST 'https://TU-PROYECTO.supabase.co/functions/v1/plan-task' \
  -H 'apikey: TU_ANON_KEY' -H 'Authorization: Bearer TU_ANON_KEY' \
  -H 'Content-Type: application/json' -d '{}'
```

### 3.5 (Opcional) Programar check-alerts
En **Edge Functions → check-alerts → Schedule** crea un trigger cada 30-60 min. Detecta ráfagas de errores, pasos fallidos y sesiones atascadas, y ejecuta la limpieza de screenshots de más de 24 h. Los avisos quedan en `event_log` (los canales push/email son la Fase 2; la detección ya es funcional).

---

## 4. Descargar e instalar desde el teléfono (sin ordenador)

GitHub Actions construye un APK de prueba en cada cambio del proyecto. Para instalarlo:

1. En el teléfono abre [Phone Agent CI](https://github.com/RetadorDPS/OmegaHub/actions/workflows/phone-agent-ci.yml).
2. Abre la ejecución más reciente de la rama `arena/95f82923-omegahub`.
3. Baja hasta **Artifacts** y descarga `phone-agent-debug-apk`.
4. Abre el ZIP descargado, extrae `app-debug.apk` y tócalo para instalar. Si Android pregunta, permite a Firefox (o a la aplicación de Archivos) instalar apps para esta vez.
5. Abre Phone Agent, configura Supabase en **Ajustes → Conexión de Supabase**, inicia sesión y concede los permisos de la §6.

El artefacto es un **APK debug de prueba**, no una versión de Play Store. Se compila sin credenciales; la URL y clave pública se introducen desde el teléfono en Ajustes, cifradas en el almacenamiento privado de la app. Los artefactos de Actions caducan a los 14 días: si el enlace expiró, abre la ejecución más reciente.

Android Studio/USB siguen siendo útiles para quien desarrolla en un ordenador, pero no son pasos que tú tengas que hacer.

---

## 5. COSAS QUE EL USUARIO DEBE CONECTAR (la lista exacta)

### 5.1 URL y clave pública de Supabase → Ajustes de la app
En **Ajustes → 1. Conexión de Supabase**, pega la **Project URL** y la clave **anon/publicable** de `Project Settings → API` en Supabase. Pulsa **Iniciar sesión** o **Crear cuenta** para guardar la conexión cifrada y autenticarte.

> No pegues la clave `service_role` ni una clave `sb_secret_`: dan acceso de administrador y no deben estar en una app de teléfono. La app la rechaza. `local.properties` sigue disponible para desarrollo, pero no lo necesitas para el APK de prueba.

### 5.3 Anthropic API Key → secreto de Supabase (recomendado) o Ajustes de la app
- **Recomendado (backend):** `supabase secrets set ANTHROPIC_API_KEY='sk-ant-...'` (paso 3.4). La app jamás ve la clave.
- **Alternativa para probar sin desplegar las funciones de IA:** en la app, **Ajustes → Anthropic API Key**. Se guarda cifrada y el `LLMRouter` llama a Claude directamente desde el teléfono. **Aun así necesitas el proyecto y la base de datos de Supabase** para iniciar sesión y cargar las apps autorizadas; las sesiones creadas en modo directo no se guardan en la tabla remota.

### 5.4 Sesión de Supabase Auth → Ajustes de la app
En **Ajustes → 2. Cuenta de Supabase** pon tu email y contraseña y pulsa **Iniciar sesión** (o **Crear cuenta** la primera vez). La app guarda el token cifrado en `EncryptedSharedPreferences` y lo usa en todas las llamadas, así `auth.uid()` existe en el servidor y el RLS te deja leer y guardar tus datos. El **User ID** se rellena automáticamente.

> ¿Por qué no basta con pegar el UUID? Porque el UUID solo identifica; no autentica. Sin token, PostgREST te trata como anónimo y las 11 políticas `auth.uid() = user_id` devuelven cero filas. Por eso la app lo comprueba antes de cada operación y te avisa con un mensaje claro en vez de fallar en silencio.

### 5.5 Permisos del teléfono
Guía completa en la §6. Resumen: micrófono, servicio de accesibilidad, captura de pantalla, burbuja flotante y las apps autorizadas marcadas en Driver Manager.

---

## 6. Permisos del teléfono, paso a paso

La pantalla principal muestra una lista ✅/❌ con el estado de cada uno. Hazlos en este orden:

### 6.1 Micrófono
1. Toca el botón grande **🎤 HABLAR** → Android pide el permiso → **Permitir**. (O: Ajustes del teléfono → Apps → Phone Agent → Permisos → Micrófono → Permitir.)

### 6.2 Servicio de accesibilidad (los "ojos y manos")
1. Ajustes del teléfono → **Accesibilidad → Aplicaciones instaladas** (en Samsung: "Servicios instalados").
2. Toca **Phone Agent — control por voz** → activa el interruptor.
3. Android muestra un aviso genérico de seguridad ("Phone Agent puede ver tu pantalla…"): es exactamente para esto. Pulsa **Permitir** (en algunos fabricantes hay que esperar 10 s).
4. Vuelve a la app: la línea "Servicio de accesibilidad" debe estar en ✅.

> Esto solo permite leer/tocar. Qué apps puede tocar lo sigue decidiendo `PermissionGate` con tu whitelist. Sin este permiso el agente se niega a trabajar y te lo dice.

### 6.3 Captura de pantalla (MediaProjection, los "ojos" de visión)
1. Di tu primer comando con el micrófono: la app pedirá **"Phone Agent quiere grabar tu pantalla"** → **Iniciar ahora / Permitir una sola app**.
2. Elige "Una sola app" si tu Android lo ofrece y selecciona la app destino cuando estés en ella, o pantalla completa para que el agente pueda cambiar de app.
3. Este permiso se concede **por sesión de captura**: si reinicias el teléfono o detienes el servicio, la app lo vuelve a pedir recordando tu comando.

### 6.4 Burbuja flotante (overlay)
1. Ajustes del teléfono → **Apps → Acceso especial → Mostrar sobre otras apps** → Phone Agent → **Permitir**.
2. Sin este permiso el agente trabaja igual (solo pierdes la burbuja de estado sobre las demás apps).

### 6.5 Autorizar las apps (whitelist)
1. En la app: **Apps autorizadas**. Se cruzan los drivers de Supabase con lo instalado en tu teléfono.
2. Marca **Autorizada** en Claude / Claude Dual / ChatGPT / WhatsApp según tengas instalado.
3. Si una instalación es clonada (Dual Messenger, segundo espacio…), marca también **"Es dual / clonada"**: el detector la resuelve por perfiles de usuario y patrones de package.
4. **Guardar en Supabase**. A partir de aquí esas son las ÚNICAS apps que el agente tocará.

---

## 7. Cómo probar: flujo completo con Claude Dual

**Objetivo:** verificar el caso más delicado (la app clonada) de principio a fin.

1. Ten **Claude instalado dos veces**: la normal y la clonada (p. ej. Samsung Dual Messenger: Ajustes → Funciones avanzadas → Dual Messenger → activa Claude; aparecerá un segundo icono con distintivo naranja).
2. Abre Phone Agent → **Apps autorizadas**: debes ver *Claude* y *Claude Dual* como filas separadas. La Dual debe salir como "instalada · perfil 1 (dual)" (o con el package clonado). Autoriza **solo Claude Dual** para esta prueba y guarda.
3. En **Ajustes**: inicia sesión con tu cuenta, autonomía **draft** (escribir sí, enviar tras confirmar), idioma es-ES.
4. Toca el micrófono y di:
   > «Abre Claude Dual, entra en un chat y pregúntale qué tiempo hace mañana en Madrid, pero no envíes sin mi confirmación»
5. Qué deberías ver, paso a paso:
   - La burbuja pasa a 🟣 *Trabajando…*
   - Se abre **la copia dual** de Claude (no la normal: es justo lo que se está probando).
   - El agente escribe la pregunta en el campo "Message Claude".
   - Al llegar al envío, la burbuja pasa a 🟡 y el agente dice por voz «Necesito tu confirmación. Enviar en Claude…». Toca **✅ Confirmar envío** en Phone Agent (o cancela para probar el rechazo).
   - Claude responde; el agente espera a que termine de generar (detecta el botón Detener), lee la respuesta con un screenshot verificado y te la resume por voz.
6. Verifica la trazabilidad en Supabase: `agent_sessions` (la sesión, `completed`), `session_steps` (cada paso con su verificación) y el bucket `screenshots` (las capturas, se borran solas a las 24 h).
7. Prueba la whitelist: pide «Abre la calculadora y suma dos más dos». `PermissionGate` debe denegarlo y el agente decirte que esa app no está autorizada.

**Otros comandos de prueba:**
- WhatsApp (draft): «Abre WhatsApp y escribe a [contacto] que llego en diez minutos» → debe pedirte confirmación antes de enviar.
- Solo lectura: pon autonomía **read** y pide «Abre Claude y resume el último chat» → cualquier intento de escribir será denegado por el Gate.
- Cancelación: durante una tarea larga, «Cancelar» en la pantalla principal o el botón ⛔.

---

## 8. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| La app dice "Supabase no está configurado" | Aún no has introducido URL y clave pública | Ajustes → Conexión de Supabase; pega ambas y vuelve a iniciar sesión |
| `USER_NOT_FOUND` al hablar | El User ID de Ajustes no existe en Supabase Auth | Crea el usuario (§3.3) y pega su UUID exacto |
| "No has iniciado sesión en Supabase" | Falta el login (o el token caducó) | Ajustes → **2. Cuenta de Supabase** → **Iniciar sesión**. Sin sesión, el RLS oculta tus apps autorizadas |
| "No hay ninguna app autorizada" pese a haberlas marcado | Sesión caducada, o no se llegó a guardar | Inicia sesión otra vez y vuelve a **Guardar en Supabase**; ejecuta el SQL 001 si aún no lo hiciste |
| `new row violates row-level security` al guardar | Estás escribiendo sin sesión válida | Inicia sesión; el botón Guardar usa tu token |
| Las Edge Functions devuelven 404 | No desplegadas o nombre distinto | Despliega con los nombres exactos: `plan-task`, `verify-and-next`, `complete-session`, `check-alerts` |
| Error 500 "Falta el secreto ANTHROPIC_API_KEY" | Secreto no configurado | `supabase secrets set ANTHROPIC_API_KEY=...` y redespiega |
| "El servicio de accesibilidad no está activo" | Permiso no concedido o revocado por el fabricante | §6.2. En Xiaomi/Samsung desactiva también el "ahorro de batería" para Phone Agent, que mata el servicio |
| No captura pantalla / screenshot vacío | MediaProjection denegado o detenido | Vuelve a dar un comando: la app re-pide el permiso. No detengas el servicio desde la notificación |
| El reconocedor de voz falla siempre | Sin app de Google o sin paquete de español offline | Instala/actualiza la app de Google; Ajustes → Sistema → Idiomas → Reconocimiento de voz → Español |
| El TTS no habla | Sin motor de voz o sin datos del idioma | Ajustes → Accesibilidad → Salida de texto a voz: instala la voz en español |
| La app dual no se detecta | El clon vive dentro de un contenedor (Parallel Space) | El detector avisa del contenedor pero Android no deja ver su interior sin root: usa Dual Messenger del fabricante (perfil real) o la segunda instalación con package clonado detectable |
| El agente toca donde no debe dentro de la app | La UI de la app cambió y el `ui_map` quedó viejo | Actualiza los textos en `app_drivers.ui_map` desde el SQL Editor (sin recompilar) y vuelve a probar |
| Pasos que "fallan" sin parar | Cambios de red o respuestas lentas del LLM | Revisa `event_log` y `session_steps.verification`; sube `step_timeout_ms` en `capability_config.settings` del planner |
| Gradle no encuentra `gradle-wrapper.jar` | Este repo no incluye binarios | Abre el proyecto en Android Studio (lo regenera) o ejecuta `gradle wrapper --gradle-version 8.7` en `android-app/` |

---

## 9. Cómo agregar una app nueva en el futuro

Ejemplo: Telegram. **Máximo 2 cambios** (regla del proyecto):

**1) Una fila en la DB** (SQL Editor):
```sql
insert into public.app_drivers
  (driver_key, display_name, package_name, package_patterns, enabled, authorized,
   allowed_actions, detection_rules, ui_map)
values (
  'telegram', 'Telegram', 'org.telegram.messenger',
  '["org.telegram.messenger", "org.telegram.messenger.web"]',
  true, false,
  '["open_app","tap","swipe","scroll","type","read","verify","wait"]',
  '{"strategy":"exact_package","known_packages":["org.telegram.messenger"]}',
  '{"input_hints":["Message"],"send_button_descriptions":["Send","Enviar"],
    "search_texts":["Search","Buscar"],"new_chat_texts":["New Message","Nuevo mensaje"]}'
);
```
Con esto, `GenericDriver` YA puede navegar Telegram por su árbol de UI.

**2) (Opcional pero recomendado) Una clase Driver** en `app/src/main/java/com/phoneagent/drivers/TelegramDriver.kt` que extienda `BaseDriver` e implemente `parseScreen()`/`getNavigationHint()` con el conocimiento fino de Telegram.

Para registrarla **no se toca `DriverRegistry`**: se añade una línea al fichero de servicios.
```
# app/src/main/resources/META-INF/services/com.phoneagent.drivers.AppDriver
com.phoneagent.drivers.ClaudeDriver
com.phoneagent.drivers.ChatGPTDriver
com.phoneagent.drivers.WhatsAppDriver
com.phoneagent.drivers.TelegramDriver   ← la línea nueva
com.phoneagent.drivers.GenericDriver
```
`DriverRegistry` descubre los drivers con `ServiceLoader` al arrancar. Si el fichero falta o está vacío, cae en una lista integrada de respaldo y `GenericDriver` se añade siempre, así que un olvido aquí degrada a navegación genérica en vez de romper la app.

> Si algún día activas `isMinifyEnabled = true`, las reglas de `proguard-rules.pro` ya conservan `com.phoneagent.drivers.**` y `META-INF/services`. Sin ellas R8 borraría los drivers y todo caería en `GenericDriver`.

Tampoco hay que declarar Telegram como app de mensajería en código: se pone `"app_kind":"messaging"` en su `ui_map` y `PermissionGate` tratará ENTER como un envío (ver §6.5).

Nada más. Ni el core, ni el Gate, ni el loop, ni las Edge Functions cambian: el system prompt de plan-task se construye desde `app_drivers` en cada llamada.

---

## 10. Estructura del proyecto

```
phone-agent/
├── README.md                          ← esta guía
├── .env.example                       ← credenciales a conectar (resumen)
├── supabase/
│   ├── config.toml
│   ├── .env.example                   ← secretos de las Edge Functions
│   ├── migrations/001_full_schema.sql ← 8 tablas + RLS + seed + bucket
│   ├── ci/000_auth_stub.sql           ← fixture SOLO para CI (auth/storage mínimos)
│   └── functions/
│       ├── plan-task/index.ts         ← planifica con Claude (visión)
│       ├── verify-and-next/index.ts   ← verifica cada paso y propone el siguiente
│       ├── complete-session/index.ts  ← resumen + memoria del proyecto
│       └── check-alerts/index.ts      ← alertas sobre event_log (Fase 2 ready)
└── android-app/
    ├── build.gradle.kts / app/build.gradle.kts
    ├── local.properties.example       ← copia como local.properties (§5)
    └── app/src/main/
        ├── AndroidManifest.xml
        └── java/com/phoneagent/
            ├── PhoneAgentApp.kt       ← contenedor de dependencias
            ├── core/                  ← AgentEngine, StepExecutor, PermissionGate,
            │                            SessionManager, EventBus, ConfigManager, MacroEngine
            ├── drivers/               ← AppDriver, DriverLookup, DriverRegistry,
            │                            GenericDriver, ClaudeDriver, ChatGPTDriver, WhatsAppDriver
            ├── capabilities/          ← VisionCapability, VoiceCapability, MemoryCapability,
            │                            StepVerifier (verificación sin imagen)
            ├── system/                ← AccessibilityController, ScreenCapture,
            │                            IntentLauncher, DualAppDetector, TaskScheduler,
            │                            ScheduledTaskReceiver
            ├── network/               ← SupabaseClient, LLMRouter, ImageOptimizer
            ├── ui/                    ← MainActivity, DriverManagerActivity, SettingsActivity,
            │                            MacroActivity, FloatingOverlay
            └── models/                ← AgentStep, DriverConfig, Project, Session, Macro
        └── app/src/test/java/com/phoneagent/   ← tests de JVM (ver §12)
```

## 11. Seguridad y privacidad (decisiones tomadas)

- **Whitelist dura:** `PermissionGate` intercepta el 100% de las acciones. Sin driver autorizado no hay gestos, aunque el LLM los pida.
- **Autonomía por niveles:** `read` (solo lee), `draft` (escribe pero todo envío pide confirmación humana), `act` (ejecuta lo permitido). Se configura en Ajustes o en `capability_config`.
- **La API key de Anthropic vive en el servidor** (secreto de Supabase). La app solo conoce la *anon key* pública de Supabase + RLS. El modo local con clave en el teléfono es opcional y la guarda cifrada.
- **Screenshots:** bucket privado, políticas por usuario y **auto-borrado a las 24 h** (`delete_old_screenshots()` + `check-alerts`).
- **Sin hardcodeos:** URL y clave pública en `EncryptedSharedPreferences` (o `local.properties` solo para desarrollo); claves privadas de API en el secreto de Supabase o, para pruebas, en las preferencias cifradas del teléfono.
- **Trazabilidad total:** cada sesión, paso, verificación y evento queda en PostgreSQL (`agent_sessions`, `session_steps`, `event_log`).

---

## 12. Macros: grabar una vez, repetir por voz

Una **macro** es un flujo que el agente resolvió bien y que queda guardado como script. La próxima vez que digas la misma frase se reproduce tal cual, **sin llamar al LLM**.

### Cómo se crea

No hay que hacer nada: cuando una sesión termina en `COMPLETED`, `AgentEngine.saveMacroFromSession()` convierte los pasos **verificados** en una macro y la guarda en la tabla `macros`. El disparador es la frase que dijiste, normalizada (sin acentos, signos ni mayúsculas), así que *«¡Abre Claude!»* y *«abre claude»* activan la misma macro.

Solo se graban pasos que la verificación dio por buenos, y se descartan `wait`/`read`/`verify`/`request_confirmation`, que no forman parte del flujo útil.

### Cómo se reproduce

`AgentEngine.run()` intenta la macro **antes** de planificar:

```
comando de voz → ¿coincide con una macro activa?
                   ├─ SÍ → MacroEngine.run() → PermissionGate → StepExecutor  (0 tokens)
                   │        └─ si un paso falla → se avisa y se cae al agente con visión
                   └─ NO → plan-task (LLM + visión), y al terminar bien se graba la macro
```

**Una macro no tiene privilegios extra.** Cada paso pasa por `PermissionGate` exactamente igual que en el agente: whitelist, `allowed_actions`, nivel de autonomía y confirmación de envíos.

### Gestionarlas

Ajustes → **Macros grabadas**: verlas, activarlas/desactivarlas, borrarlas y **programarlas** (§13).

### Por qué esto importa para publicar en Google Play

La política de Accesibilidad de Play dice:

> *"Any use of the Accessibility API that enables an app to autonomously initiate, plan, and execute actions or decisions is strictly prohibited"*

…y a continuación:

> *"This does not prohibit deterministic, rule-based automation, where behavior follows a static, human-defined script."*

Las macros son literalmente ese segundo caso: un script estático que definió una persona. **Es la única modalidad del proyecto publicable en Play**; el agente con LLM en tiempo de ejecución tendría que distribuirse como APK propio.

---

## 13. Tareas programadas

En **Macros grabadas → Programar** eliges hora (y si se repite a diario). A la hora exacta llega una notificación con dos botones: **Ejecutar ahora** y **Posponer 10 min**.

### Por qué avisa en vez de ejecutarse sola

No es una limitación que se pueda arreglar con más código:

1. **Técnica.** El servicio de Accesibilidad no recibe eventos con la pantalla bloqueada y MediaProjection no captura con el dispositivo apagado. Una tarea a las 3:00 con el móvil en el bolsillo fallaría a mitad y dejaría la sesión colgada en `running`.
2. **De política.** Que sea el usuario quien pulse «Ejecutar» es justo lo que la hace compatible con la restricción de Play sobre autonomía por Accesibilidad.

El valor es que **la tarea no se olvida**: llega a la hora y arrancarla cuesta un toque (o decir la frase, si la wake word está activa).

### Detalles de implementación

- `AlarmManager.setExactAndAllowWhileIdle`, que dispara aunque el móvil esté en Doze.
- En Android 12+ la alarma exacta requiere permiso del usuario; si no está concedido se degrada a `setAndAllowWhileIdle` (inexacta) **en vez de reventar**, y se registra el aviso.
- Las alarmas no sobreviven a un reinicio: `BootCompletedReceiver` las rearma, y `PhoneAgentApp.onCreate()` las rearma otra vez al abrir la app, porque varios fabricantes filtran el broadcast de arranque.
- Las tareas se guardan cifradas en `EncryptedSharedPreferences`, no en una tabla nueva: el esquema se queda en las 8 tablas del diseño.
- Posponer mueve el disparo real y rearma (y desactiva la repetición diaria: si la posones, no quieres que además te salte mañana sin avisar).

---

## 14. Confirmación editable y narración

**Confirmación editable.** Antes la aprobación era binaria (sí/no). Ahora, cuando el agente va a enviar algo, el diálogo muestra **el texto que iba a salir** y puedes corregirlo. Si lo cambias, `AgentEngine.applyEditedText()` vacía el campo, escribe tu versión y después ejecuta el envío. Aprobar sin tocar nada envía lo que el agente había preparado.

**Narración por voz.** Cada paso se cuenta en voz alta (`AgentEngine.narrate`, activada por defecto) usando la descripción que da el driver —«Enviar mensaje a Ana en WhatsApp»— en vez de obligarte a mirar una burbuja que dice «Paso 3…».

---

## 15. Coste: verificar con el árbol de UI

Cada paso hacía una llamada al LLM con screenshot. Una captura de 1080×2400 son ~3.500 tokens de imagen, más que todo el prompt de texto.

`StepVerifier` lee el árbol de accesibilidad (ya está en memoria, es gratis) y aplica reglas **conservadoras**: literales entrecomillados del resultado esperado presentes en pantalla, texto escrito localizado, package correcto tras `open_app`. Solo decide cuando la evidencia es inequívoca; en cualquier otro caso devuelve `Unknown` y se usa la visión como antes.

Lo que **nunca** decide por su cuenta: `verify`, `done` y `request_confirmation`, porque ahí el juicio es sobre el objetivo global.

Dos matices honestos:

- **El LLM se sigue llamando en cada paso**, porque de ahí sale la siguiente acción. Lo que se ahorra es la **imagen**, no la llamada. Los contadores se llaman `verificationsWithoutImage` a propósito.
- **El screenshot se sigue capturando y subiendo al bucket** aunque no viaje al LLM: el bucket existe para trazabilidad, y borrar la pista justo en los pasos baratos haría imposible auditar por qué una macro se grabó mal.

Al terminar cada sesión se registra en `event_log` (evento `vision_savings`) qué porcentaje de pasos se verificó sin imagen.

---

## 16. Tests y CI

### Tests de JVM

`app/src/test/java/com/phoneagent/` — se ejecutan con `./gradlew testDebugUnitTest` (en CI: `gradle testDebugUnitTest`).

| Fichero | Qué cubre |
|---|---|
| `core/PermissionGateTest.kt` | Los 4 niveles del guardián: whitelist, `allowed_actions`, autonomía y envíos. Incluye `back`/`home` siempre permitidos, ENTER como envío solo en mensajería, y que `requires_confirmation` sobrevive al modo `act`. |
| `models/MacroTest.kt` | Normalización de disparadores (acentos/signos/mayúsculas), ida y vuelta JSON, descarte de pasos con acciones inexistentes. |
| `models/MacroTest.kt` (AgentActionTypeTest) | Las 15 acciones hacen ida y vuelta por `fromWire` y el enum no se desincroniza del prompt. |
| `models/DriverConfigTest.kt` | `allows()`, `isMessagingApp` por `app_kind`, herencia de drivers en clones, y el invariante **13 verbos en `allowed_actions`** frente a 15 en el vocabulario. |

Dos decisiones de configuración que los tests necesitan:

- `testImplementation("org.json:json:20240303")` — en Android `org.json` viene del framework y en un test local el stub lanza *"not mocked"* en cuanto se usa.
- `testOptions { unitTests.isReturnDefaultValues = true }` — `PermissionGate` llama a `android.util.Log`; sin esto el stub lanza y no se ejercita la lógica.

Para poder testear el guardián se introdujo `DriverLookup`, una interfaz con lo único que `PermissionGate` necesita del registro. `DriverRegistry` la implementa tal cual, así que en producción no cambia nada, pero en test se sustituye por un doble de dos líneas sin mocks ni framework.

### CI

`.github/workflows/phone-agent-ci.yml` — tres jobs independientes, disparados por cambios en `phone-agent/**`:

| Job | Qué hace |
|---|---|
| `android` | JDK 17 + Gradle 8.7 → `testDebugUnitTest` y `assembleDebug`. Sube los informes como artefacto. |
| `edge-functions` | `deno check` (mismo chequeo de tipos que hace `supabase functions deploy`) + `deno lint`. |
| `sql` | Postgres 15 de servicio, aplica `ci/000_auth_stub.sql` + la migración **de verdad**, ejecuta el seed y comprueba: 4 drivers, 13 acciones por fila, 4 `app_kind`, RLS en las 8 tablas, bucket `screenshots` y que `delete_old_screenshots()` corre. |

`ci/000_auth_stub.sql` crea el mínimo de `auth.users`, `auth.uid()`, `storage.buckets` y los roles de Supabase que la migración da por supuestos. **Está fuera de `migrations/` a propósito** para que `supabase db reset` no lo vea; en un proyecto real no se ejecuta nunca.

> El job `android` instala Gradle directamente porque `gradle-wrapper.jar` no se versiona (es un binario).
