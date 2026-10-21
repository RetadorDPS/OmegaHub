# Encargo para Claude Code · TrendHunter Pro

Este documento tiene dos partes:

1. **Cómo conseguir el código** (no hace falta enviar ningún ZIP).
2. **El prompt listo para pegar** en Claude Code, que incluye misión, criterio de
   terminado, lo que ya está verificado y lo que falta por conectar.

---

## 1 · Cómo consigue Claude Code el proyecto

Todo el trabajo está **subido a GitHub**, en la rama
`arena/e7ecf172-omegahub` del repositorio `RetadorDPS/OmegaHub`. Claude Code
trabaja con `git` dentro de su entorno: clona el repositorio y se cambia a esa
rama. **No hay que descargar el ZIP ni enviarle archivos.**

```bash
git clone https://github.com/RetadorDPS/OmegaHub.git trendhunter
cd trendhunter
git checkout arena/e7ecf172-omegahub
```

Si el repositorio nuevo que has creado para la aplicación es otro, añade el
remoto y sube la rama una sola vez:

```bash
git remote add entrega https://github.com/TU-USUARIO/TU-REPO.git
git push entrega arena/e7ecf172-omegahub
```

Lo ideal para que Claude Code trabaje cómodo (y para no arrastrar una rama de
trabajo): **mergear esa rama en `main`** y que él parta de `main`. Hay un PR
abierto con todo listo: `gh pr list` en el repositorio y se mergea con un clic.

El ZIP (`OmegaHub-entrega.zip`) solo hace falta si el entorno de Claude Code
**no tiene acceso a GitHub**. En ese caso se le pasa el ZIP y él lo descomprime;
el resultado es el mismo, porque el ZIP se genera desde `HEAD` exactamente.

---

## 2 · Prompt para pegar en Claude Code

> Copia desde la línea siguiente hasta el final del bloque.

---

**Eres el ingeniero responsable de llevar TrendHunter Pro a producción. Tu
misión no es «avanzar»: es dejar la aplicación totalmente funcional, usable y
verificada, y dejar preparado (con instrucciones exactas) todo lo que dependa de
credenciales que tú no tienes. No pares hasta cumplir el criterio de terminado
del final de este mensaje.**

### 0 · Contexto

TrendHunter Pro es un SaaS de investigación de productos para e-commerce y
dropshipping: catálogo puntuado, spy de anuncios, analizador de tiendas Shopify,
seguimiento con alertas, AI Studio, sello de confianza del dato, API pública v1,
PWA con push, equipos con asientos y webhooks salientes (Slack/Discord/n8n).

- Stack: Next.js 16 (App Router) · TypeScript estricto · Tailwind 4 · shadcn/Radix
  · Prisma 7 · SQLite en desarrollo / PostgreSQL en producción · Auth.js v5 ·
  Stripe · BullMQ + Redis (opcional) · Playwright · OpenAI/Gemini.
- Interfaz **en español**. Documentación en `README.md`, `PROGRESS.md`, `API.md`,
  `DESPLEGUE.md`, `PLAN.md`, `DESARROLLO.md` y 58 páginas en `docs/`.
- Estado actual: **verificado y funcionando** (detalle en el punto 3). No empieces
  de cero ni reescribas lo que ya está probado.

### 1 · Puesta en marcha (obligatorio antes de tocar código)

```bash
git clone https://github.com/RetadorDPS/OmegaHub.git trendhunter
cd trendhunter
git checkout arena/e7ecf172-omegahub     # o main si ya se ha mergeado el PR
npm_config_nodedir=/usr/local npm install   # sin el nodedir, falla en contenedores
npm run chromium                            # Chromium local para capturas y verificaciones
cp .env.example .env.local                  # ajusta lo mínimo (ver punto 4)
npm run db:setup                            # genera Prisma + esquema + seed + verificación
npm run build && npm start                  # servidor en http://localhost:3000
```

Cuentas de demostración: `admin@trendhunter.pro` / `admin1234` (Business + ADMIN,
con equipo y webhook de ejemplo) · `demo@trendhunter.pro` / `demo1234` (Pro) ·
`free@trendhunter.pro` / `free1234` (Free).

### 2 · Reglas del producto (no negociables)

1. **Honestidad del dato.** Nunca rellenes cifras con estimaciones cuando una
   fuente no responde. Si no hay medición, se dice («Estimado», «sin datos»,
   «mide a mano»). Un producto solo es «Verificado» con ≥2 fuentes medidas, ≤7
   días, ≥60 puntos y sin contradicciones. Esto ya está implementado en
   `src/lib/confianza.ts`: no lo suavices.
2. **Cada botón hace lo que promete.** Si un control no tiene función real, se
   implementa o se elimina. Nada decorativo.
3. **No añadir pantallas ni entradas de menú** salvo que sea imprescindible.
   Prefiere acciones dentro de lo existente, la campana de notificaciones y una
   línea de resumen.
4. **Todo en español**, con el tono actual (directo, sin jerga).
5. **Seguridad por defecto**: validación con Zod en cada ruta, sesión verificada
   en servidor, `scoped` por usuario en cada consulta, límite de ritmo en lo
   público, sin secretos en el repositorio.
6. **Compatibilidad**: no rompas la exportación estática (`npm run build:pages`)
   ni las verificaciones existentes. Nada de `force-dynamic` en `/dashboard/fuentes`.

### 3 · Qué está hecho y verificado (no lo rehagas)

Ejecutado y en verde en el último commit de la rama:

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Tipos | `npm run typecheck` | 0 errores |
| Lint | `npm run lint` | 0 avisos |
| Tests | `npm test` | 170/170 |
| Base de datos | `npm run db:verify` | 29 modelos · 20 enums · sin drift |
| API y flujos | `npm run verify:api` | 42/42 |
| API pública v1 | `npm run verify:api-v1` | 23/23 |
| Equipos y webhooks | `npm run verify:equipos` | 33/33 |
| PWA | `npm run verify:pwa` | 18/18 |
| Confianza del dato | `npm run verify:confianza` | 15/15 |
| Ingesta real | `npm run verify:ingesta` | 45/45 |
| Navegación real (2 cuentas) | `npm run audit:ui` | 0 errores |
| Sitio estático | `npm run build:pages` + `npm run verify:pages` | 60 páginas · 60/60 |
| Capturas | `npm run screenshots` | 34 imágenes en `screenshots/` |

Funcionalidades cerradas: 16 módulos, planes Free/Pro/Business/Agency con cuotas,
Stripe en modo demostración, admin, sello de confianza con procedencia,
mantenimiento automático de la confianza, PWA instalable con push, API pública con
claves y cuotas, equipos con 5/15 plazas y roles, y webhooks firmados con HMAC.

### 4 · Qué no está conectado y cómo dejarlo listo

Regla: **si te falta una credencial, no inventes ni simules en silencio.**
Implementa todo el código, deja la configuración documentada y una comprobación
que diga claramente «falta X» en vez de fingir que funciona.

| # | Pieza | Qué falta exactamente | Criterio de terminado |
| --- | --- | --- | --- |
| 1 | **Stripe en vivo** | Crear 3 precios y rellenar `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO/BUSINESS/AGENCY`, `STRIPE_WEBHOOK_SECRET`; alta del endpoint `/api/stripe/webhook` | Pago de prueba con `4242 4242 4242 4242` cambia el plan; el portal permite cancelar; el webhook es idempotente (repetir el evento no duplica nada) |
| 2 | **Facturación por asientos** | Hoy el plan da plazas fijas. Falta cobrar plazas extra en Stripe (`quantity`) y reflejarlo al invitar/revocar | Invitar por encima de las plazas incluidas pide confirmación de coste y actualiza la suscripción; revocar no reembolsa en silencio |
| 3 | **Correo real** | `SMTP_HOST/PORT/USER/PASSWORD/FROM` (Brevo gratis: 300/día) | Llegan verificación de correo, bienvenida y recuperación; los rebotes no rompen el flujo |
| 4 | **Push real** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`npx web-push generate-vapid-keys`) | Un móvil real recibe la notificación; al caducar una suscripción se borra sola |
| 5 | **Google OAuth** | `GOOGLE_CLIENT_ID/SECRET` y redirect URI | Alta y acceso con Google sin crear duplicados por correo |
| 6 | **IA real** | `OPENAI_API_KEY` o `GEMINI_API_KEY` (sin ellas funciona simulado y **lo dice**) | El AI Studio devuelve texto real, con coste/latencia controlados y error legible si la cuota se agota |
| 7 | **Scraping real** | `SCRAPING_REAL=true`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` en el servidor | Analiza una tienda Shopify real; si falla, devuelve el motivo y no cifras inventadas |
| 8 | **Redis + colas** | `REDIS_URL` para el worker de BullMQ | El worker procesa la cola; sin Redis, la app sigue funcionando con cron |
| 9 | **Webhooks reales** | No hay salida HTTPS en el entorno de desarrollo | En un servidor con red: llega a Slack y Discord, y la firma `sha256=…` verifica en destino |
| 10 | **APIs de terceros** | `SERPAPI_KEY`, `APIFY_TOKEN`, `YOUTUBE_API_KEY`, `FACEBOOK_ACCESS_TOKEN`; `MODO_COSTES=produccion` | Con clave, datos medidos; sin clave, degradación con aviso (nunca estimación disfrazada) |
| 11 | **Producción** | Dominio + HTTPS, `AUTH_SECRET`, `CRON_SECRET`, backups (`npm run respaldo`), workflows de `.github/workflows/` | `DESPLEGUE.md` ejecutable de principio a fin; restauración de un backup probada |
| 12 | **Observabilidad** | Hoy hay logs JSON (`src/lib/logger.ts`) y `/api/health` | Alertas si la ingesta o el cron fallan; latencia y errores visibles sin entrar al servidor |

### 5 · Trabajo de producto pendiente (por orden de valor)

1. **Facturación por asientos** (arriba, punto 2): es lo que convierte «equipos» en
   ingresos.
2. **Historial de entregas de webhooks**: últimas N entregas por webhook con
   código, latencia y motivo del fallo. Sin pantalla nueva: dentro del panel que ya
   existe.
3. **Onboarding de 3 pasos** en el primer acceso: elegir nicho, seguir 3 tiendas,
   activar avisos. Medible y saltable.
4. **Informe compartible para clientes** (modo agencia): enlace público de solo
   lectura con caducidad, con el sello de confianza incluido.
5. **Búsqueda global real** (hoy el buscador del header es decorativo si no filtra
   en todas las secciones): que encuentre productos, tiendas, anuncios y páginas.
6. **Accesibilidad y rendimiento**: foco visible, navegación con teclado,
   contraste AA, imágenes con `next/image`, presupuesto de LCP < 2,5 s en 4G.
7. **Tests e2e** de los flujos de dinero: registro → plan → equipo → webhook.

### 6 · Cómo trabajar (una tarea = un ciclo cerrado)

Para **cada** tarea, en este orden:

1. Reproduce el problema o escribe primero la prueba que debe pasar.
2. Implementa lo mínimo que lo resuelve, sin tocar lo que ya funciona.
3. Añade o amplía la verificación automática (los scripts de `scripts/` y los
   tests de `src/lib/__tests__/` son el patrón a seguir).
4. Actualiza la documentación que corresponda (`README.md`, `PROGRESS.md`,
   `API.md`, `DESPLEGUE.md`).
5. Si hay interfaz nueva, captura con `npm run screenshots` y **mira la imagen**
   (escritorio y móvil): que no se corte texto, que los botones quepan, que se
   vea bien en tema oscuro.
6. Commit pequeño y descriptivo. No mezcles dos tareas en un commit.

**Nunca** des por buena una tarea porque «compila». El criterio es la
verificación real, con la aplicación arrancada.

### 7 · Prohibiciones

- No inventar datos, métricas ni entregas. No marcar como verificado lo estimado.
- No subir secretos, `.env.local`, bases de datos ni `node_modules`.
- No usar `git push --force` ni reescribir la historia de `main`.
- No cambiar el esquema a mano sin actualizar `prisma/schema.prisma` **y**
  `scripts/db/table-spec.mjs` (la verificación falla si divergen).
- No eliminar verificaciones ni bajar umbrales para que pasen.
- No añadir dependencias pesadas sin justificar el motivo en el commit.

### 8 · Criterio de terminado (esto es lo que significa «hecho»)

La tarea está terminada cuando **todo** esto se cumple y lo pegas en el informe
final:

```bash
npm run typecheck        # 0 errores
npm run lint             # 0 avisos
npm test                 # 170+ tests en verde, sin saltarte ninguno
npm run db:verify        # esquema sin drift
npm run build            # compila
npm start &              # y con el servidor arriba:
npm run verify:api       # 42/42
npm run verify:api-v1    # 23/23
npm run verify:equipos   # 33/33
npm run verify:pwa       # 18/18
npm run verify:confianza # 15/15
npm run verify:ingesta   # 45/45
npm run audit:ui         # 0 errores (los 502 de /api/tendencias/del-dia sin red son esperados)
npm run build:pages && npm run verify:pages   # 60/60
```

Y además:

- Ninguna funcionalidad nueva depende de una credencial sin que exista un mensaje
  claro en la interfaz cuando falta.
- La documentación refleja el estado real (sin promesas que el código no cumple).
- `PROGRESS.md` tiene una sección de la ronda con: qué se hizo, cómo se verificó y
  qué queda pendiente con su motivo.

### 9 · Cómo informar

Al terminar cada bloque de trabajo, y al final, escribe un resumen con:

1. **Qué he hecho** (en lenguaje de producto, no de código).
2. **Cómo lo he verificado** (comando y resultado exacto).
3. **Qué queda pendiente y por qué** (credencial que falta, decisión de negocio,
   dependencia externa).
4. **Riesgos**: lo que podría romperse y cómo detectarlo.

### 10 · Mandato final

**No pares hasta que la aplicación esté completamente funcional y usable, y hasta
que todo lo que no se pueda conectar hoy quede implementado y documentado para
conectarlo con una sola variable de entorno.** Si te bloquea una credencial,
sigue con el resto de la lista, deja la pieza preparada y sigue avanzando: nunca
te quedes esperando ni entregues a medias. Decide, documenta la decisión y
continúa. El objetivo es que un cliente real pueda registrarse, pagar, usar la
herramienta, invitar a su equipo y recibir avisos sin tropezar con nada.

---

## 3 · Cómo saber si Claude Code va bien

- Si te dice «he avanzado» pero no pega la salida de las verificaciones, pídesela.
- Si un número baja (por ejemplo `verify:api` pasa de 42 a 40), que lo explique.
- Si añade una pantalla nueva, que justifique por qué no valía una línea en una
  existente.
- Si algo depende de una clave, debe aparecer en la interfaz «falta configurar X»,
  nunca un resultado inventado.
