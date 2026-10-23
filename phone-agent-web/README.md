# Phone Agent Web — prototipo

Un agente de voz que **conduce páginas web** por ti: busca en Google, pregunta a
Claude o a ChatGPT, traduce y te lee la respuesta en voz alta.

No hay app Android que instalar ni compilar. Son dos piezas:

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **La cabina** | La página donde hablas y escuchas | GitHub Pages (una URL) |
| **Las manos** | Un *userscript* que pulsa y escribe dentro de las pestañas | Tu navegador, con Violentmonkey |

Se comunican escribiéndose en una tabla de **Supabase**. Ninguna de las dos puede
hablar con la otra directamente porque viven en sitios distintos de internet; la
base de datos hace de buzón.

```
   tú hablas
      ↓
┌─────────────┐   escribe tarea    ┌──────────────┐
│   CABINA    │ ─────────────────→ │   SUPABASE   │
│ (GitHub     │ ←───────────────── │  web_tasks   │
│  Pages)     │   lee el resultado └──────┬───────┘
└─────────────┘                           │ la lee
      ↑                                   ↓
   te lo lee                        ┌─────────────┐
   en voz alta                      │  LAS MANOS  │  ← dentro de google.com
                                    │ userscript  │  ← dentro de claude.ai
                                    └─────────────┘
```

---

## Por qué esto y no la app de Android

La app nativa (`../phone-agent/`) necesita Android Studio, Gradle y firmar un
APK. Este prototipo necesita **un fichero de texto**. Eso lo hace posible de
construir y probar desde un teléfono, que es la situación real aquí.

El precio: un navegador no puede tocar **apps nativas**. Solo páginas web. Si
tus herramientas son claude.ai, chatgpt.com y Google, no te hace falta nada más.

---

## Montarlo (15 minutos)

### Paso 1 — Crear las tablas en Supabase

1. Entra en tu proyecto de Supabase → **SQL Editor** → *New query*.
2. Pega **todo** el contenido de `supabase/migrations/002_web_tasks.sql`.
3. Pulsa **Run**. Debe terminar sin errores.

Crea dos tablas: `web_tasks` (el buzón de tareas) y `web_tabs` (qué pestañas
están vivas).

### Paso 2 — Abrir la cabina

Dos opciones:

- **Rápida, para probar:** abre `panel/index.html` directamente. Funciona, pero
  algunos navegadores ponen pegas con el micrófono en ficheros locales.
- **La buena:** súbelo a GitHub Pages. En Actions ya está configurado el
  despliegue del repo; basta con añadir la carpeta `phone-agent-web/panel` al
  artefacto. Mientras tanto, cualquier hosting estático sirve (Netlify, Vercel,
  o `python3 -m http.server` en un ordenador).

Al abrirla verás el botón del micrófono y cinco ejemplos pulsables.

### Paso 3 — Conectar la cabina

1. Toca **⚙** arriba a la derecha.
2. Pega tu **Supabase URL** (la encuentras en Supabase → *Project Settings* → *API*).
3. Pega la **anon key** (en la misma pantalla). Es pública por diseño: lo que
   protege tus datos es el RLS, no esa clave.
4. Pulsa **generar** en el campo *Canal*. Es un código que une tu cabina con tus
   pestañas; sin él nadie encuentra tus tareas.
5. Pulsa **Probar conexión**. Debe decir «✅ Conexión correcta».
6. **Guardar**.

### Paso 4 — Instalar las manos

1. Instala **Firefox para Android** desde Google Play.
   > Por qué Firefox y no Chrome: Chrome para Android **no** admite extensiones,
   > nunca lo ha hecho. El navegador que se recomendaba para esto, Kiwi,
   > **cerró en enero de 2025**. Firefox tiene soporte completo de extensiones
   > desde la versión 121.
2. Dentro de Firefox: menú **⋮ → Extensiones**, busca **Violentmonkey** e
   instálalo.
3. Abre `userscript/phone-agent.user.js` (puedes verlo en GitHub desde el móvil),
   copia **todo** el contenido.
4. En Violentmonkey crea un script nuevo y pega el contenido. Guarda.
5. Abre **Google** en una pestaña. Abre **claude.ai** en otra. Inicia sesión en
   Claude si no lo estás.
6. En cada una de esas pestañas deberías ver abajo a la izquierda una etiqueta
   `🤖 google · sin configurar` y `🤖 claude · sin configurar`.

### Paso 5 — Darles la configuración

Es el paso más incómodo y el único que exige tocar la consola. En la pestaña de
Google, con el script activo:

1. En Firefox: menú **⋮ → Herramientas → Consola web** (si no aparece, actívala
   en Ajustes → Avanzado).
2. Pega esto, con **tus** datos (los mismos del paso 3):

```js
window.phoneAgent.setup({
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  anonKey:     "TU-ANON-KEY",
  channel:     "EL-CANAL-QUE-GENERASTE"
})
```

3. La pestaña se recarga sola y la etiqueta cambia a `🤖 google · a la escucha`.
4. **Repite en la pestaña de Claude.** Cada pestaña necesita su propia llamada.

La configuración queda guardada en el navegador: no hay que repetirlo.

### Paso 6 — Probar

En la cabina di o escribe:

- `estás ahí` → contesta qué pestañas tienes abiertas
- `busca el tiempo en Madrid`
- `pregunta a claude qué es la fotosíntesis en una frase`
- `traduce good morning al español`
- `lee la página`

---

## Qué entiende

| Dices | Qué hace |
|---|---|
| `busca …` / `buscar …` / `google …` / `búscame …` | Busca en Google y te lee los 3 primeros resultados |
| `pregunta a claude …` / `dile a claude …` | Escribe en Claude, envía y te lee la respuesta |
| `pregunta a chatgpt …` | Igual, en ChatGPT |
| `traduce X al inglés` | Pide la traducción (a Claude o ChatGPT, según la pestaña) |
| `abre claude` / `abre google` / `abre https://…` | Abre la pestaña |
| `lee la página` / `¿qué pone aquí?` | Lee el texto de la pestaña actual |
| `estás ahí` / `hola` | Comprueba que el ejecutor vive |
| **cualquier otra cosa** | Se lo pasa a Claude |

Las reglas están en `panel/app.js` → `parse()`, y hay un test que las cubre:

```bash
node phone-agent-web/tests/parser.test.mjs     # 26 casos
```

---

## Fallos normales y qué significan

| Síntoma | Causa |
|---|---|
| La etiqueta dice `sin configurar` | Falta el paso 5 en esa pestaña |
| La cabina dice «esperando al ejecutor» | Las pestañas no están abiertas, o el canal no coincide |
| `No encuentro la caja de texto de Claude` | Claude cambió su diseño, o no estás dentro de una conversación |
| `El navegador bloqueó la pestaña nueva` | Normal la primera vez: ábrela a mano y ya no vuelve a pasar |
| El micrófono está gris | Firefox no reconoce la voz. Usa el dictado del teclado o abre la cabina en Chrome |
| `HTTP 404` al probar la conexión | No ejecutaste la migración del paso 1 |
| Las respuestas llegan en minúsculas | Ya no pasa; estaba corregido y hay un test que lo vigila |

**Sobre el micrófono:** Firefox para Android no soporta reconocimiento de voz en
páginas web. Ahí se usa el **dictado del teclado** (el icono del micrófono del
propio teclado), que funciona igual de bien. Para hablar de verdad, abre la
cabina en Chrome y las pestañas en Firefox: la cabina y las manos no tienen por
qué estar en el mismo navegador, porque se hablan por Supabase.

---

## Lo que este prototipo NO hace

Decidido a propósito, para que se pueda probar pronto:

- **No toca apps nativas.** Ni WhatsApp de la tienda, ni el banco. Solo páginas.
- **No tiene memoria entre sesiones.** Cada tarea es independiente. La tabla
  `projects` del proyecto Android ya está preparada para cuando se quiera.
- **No graba macros.** El concepto existe en el proyecto Android; aquí aún no.
- **No decide solo.** No hay un bucle que planifique varios pasos: tú mandas una
  orden y se ejecuta una acción. Eso es lo que lo hace fiable para probar.
- **Las RLS son permisivas.** El único secreto es el canal (un UUID imposible de
  adivinar). Está documentado al final de la migración, con el camino para
  endurecerlo con `auth.uid()` cuando esto pase de prototipo.

---

## Si se rompe porque cambiaron la web

Claude y ChatGPT rediseñan su interfaz cada poco, y los selectores dejan de
encontrar los botones. Es el coste de conducir una página ajena y no tiene cura
definitiva.

Están todos juntos en `userscript/phone-agent.user.js`, dentro de `drivers`:

```js
box:  'div.ProseMirror[contenteditable="true"], textarea[placeholder]',
send: 'button[aria-label*="Send" i], button[aria-label*="Enviar" i]',
```

Para arreglarlo: abre Claude en un ordenador, clic derecho sobre la caja de
texto → *Inspeccionar*, y copia el selector nuevo.

---

## Ficheros

```
phone-agent-web/
├── README.md                          ← esto
├── panel/
│   ├── index.html                     ← la cabina
│   ├── app.js                         ← voz, parser, buzón
│   └── styles.css
├── userscript/
│   └── phone-agent.user.js            ← las manos (Google, Claude, ChatGPT)
├── supabase/migrations/
│   └── 002_web_tasks.sql              ← buzón + pestañas + RLS
└── tests/
    └── parser.test.mjs                ← 26 casos sobre el código real
```
