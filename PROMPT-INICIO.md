# Prompt de arranque para Claude Code

Este fichero contiene **un único bloque** listo para copiar y pegar en Claude
Code. No hace falta resumirlo ni adaptarlo: incluye el repositorio, la rama, los
comandos, los ficheros exactos donde está cada cosa pendiente, cómo se verifica
y el criterio de terminado.

El contexto largo (visión de producto, reglas de honestidad y backlog por valor)
está en `PROMPT-CLAUDE-CODE.md`, que este bloque obliga a leer primero.

---

Copia desde la línea de apertura del bloque hasta el cierre:

```text
Vas a trabajar en TrendHunter Pro, un SaaS de investigación de productos para
e-commerce (Next.js 16 App Router, TypeScript estricto, Tailwind 4, shadcn/Radix,
Prisma 7 con SQLite en local y PostgreSQL en producción, Auth.js v5, Stripe,
BullMQ+Redis opcional, Playwright). La interfaz está en español.

MISIÓN: dejar la aplicación totalmente funcional y usable, y dejar implementado
y documentado todo lo que hoy depende de credenciales que tú no tienes. No pares
hasta cumplir el criterio de terminado del final.

=====================================================================
1 · CÓMO EMPEZAR (haz esto primero, en este orden)
=====================================================================

git clone https://github.com/RetadorDPS/OmegaHub.git trendhunter
cd trendhunter
git checkout arena/e7ecf172-omegahub

Lee estos ficheros antes de tocar nada:
  README.md                     qué es y cómo se arranca
  PROMPT-CLAUDE-CODE.md         reglas del producto, backlog y criterio de terminado
  PROGRESS.md                   qué está hecho y cómo se verificó (última sección)
  DESPLEGUE.md                  producción: Supabase + Oracle Free, cron, variables
  API.md                        contrato de la API pública v1
  prisma/schema.prisma         29 modelos
  scripts/db/table-spec.mjs    el MISMO esquema en DDL (debe coincidir siempre)

Puesta en marcha:
  npm_config_nodedir=/usr/local npm install     # sin nodedir falla en contenedores
  npm run chromium                              # Chromium local para capturas y verificaciones
  cp .env.example .env.local                    # deja los valores por defecto
  npm run db:setup                              # prisma generate + esquema + seed + db:verify
  npm run build
  npm start                                     # http://localhost:3000

Antes de cambiar nada, ejecuta la batería completa y comprueba que da esto
(si no coincide, PARA y dime qué falla antes de seguir):

  npm run typecheck      → 0 errores
  npm run lint           → 0 avisos (261 ficheros)
  npm test               → 170/170
  npm run db:verify      → 29 modelos · 20 enums · sin drift
  npm run verify:equipos → 33/33
  npm run audit:ui       → 0 errores
  npm run verify:api     → 42/42
  npm run verify:api-v1  → 23/23
  npm run verify:pwa     → 18/18
  npm run verify:confianza → 15/15
  npm run verify:ingesta → 45/45
  npm run build:pages && npm run verify:pages → 60 páginas · 60/60

Cuentas del seed: admin@trendhunter.pro / admin1234 (BUSINESS + ADMIN, con equipo
y webhook de ejemplo) · demo@trendhunter.pro / demo1234 (PRO) ·
free@trendhunter.pro / free1234 (FREE).

NO rehagas lo que ya está verde. Si tocas algo y un número baja, es un fallo tuyo.

=====================================================================
2 · REGLAS QUE NO SE NEGOCIAN
=====================================================================

1. Honestidad del dato: nunca rellenes con estimaciones cuando una fuente no
   responde. La regla está en src/lib/confianza.ts (VERIFICADO exige ≥2 fuentes
   medidas, ≤7 días, ≥60 puntos y ninguna contradicción). No la suavices.
2. Cada botón hace lo que promete: si no tiene función real, se implementa o se
   elimina. Nada decorativo.
3. No añadas pantallas ni entradas de menú salvo que sea imprescindible.
4. Seguridad: validación Zod en cada ruta, sesión comprobada en servidor,
   consultas siempre filtradas por el usuario de la sesión, límite de ritmo en
   lo público (ver src/lib/limite.ts, función claveDeIp), secretos fuera del repo.
5. Si falta una credencial, el código se implementa igual y la interfaz dice
   «falta configurar X». Prohibido simular una entrega o un cobro.
6. Todo en español, con el tono actual.
7. Regla del esquema: si cambias prisma/schema.prisma, actualiza TAMBIÉN
   scripts/db/table-spec.mjs (mismas columnas, enums e índices). Después:
   npm run db:generate && npm run db:reset --force && npm run db:verify.
   Ojo: db:reset borra nordika-living.demo; vuelve a ejecutar
   npm run verify:ingesta antes de verify:confianza y de las capturas.

=====================================================================
3 · LO QUE YA ESTÁ HECHO (no lo toques)
=====================================================================

16 módulos: auth, catálogo con score, Ads Spy, Shop Analyzer, Store Tracker,
Product Tracker, proveedores, AI Studio, facturación con 4 planes, admin, API
pública v1 con claves y cuotas, PWA con push, sello de confianza con procedencia
y mantenimiento automático, equipos con asientos y webhooks firmados.

Rutas clave:
  /dashboard                    panel
  /dashboard/equipos            equipos y asientos
  /dashboard/settings/notifications   webhooks + push + preferencias
  /equipos/aceptar              aceptación pública de invitación
  /dashboard/api                claves de la API pública
  /dashboard/admin              administración

Código clave:
  src/lib/equipos.ts            plazas, roles, plan efectivo
  src/lib/webhooks.ts           eventos, validación SSRF, firma HMAC, envío
  src/lib/alerts.ts             motor de alertas (campana + canales + webhooks)
  src/lib/confianza.ts          reglas del sello
  src/lib/mantenimientoConfianza.ts   caducidad y degradación automática
  src/auth.ts                   sesión + plan efectivo heredado del equipo

=====================================================================
4 · LO QUE FALTA, CON SITIO EXACTO
=====================================================================

Trabaja en este orden. Cada punto es un commit independiente.

--- 4.1 · Facturación por asientos (lo que más valor tiene) ---
Situación: el plan da plazas fijas (BUSINESS 5, AGENCY 15) y hoy no se cobran
plazas extra.
Dónde:   src/lib/constants.ts líneas 71-110 (PlanLimits.seats)
         src/app/api/equipos/invitaciones/route.ts línea 79 (comprobación de plazas)
         src/app/api/equipos/invitaciones/aceptar/route.ts línea 65 (ídem al aceptar)
         src/app/api/stripe/checkout/route.ts (crear checkout con quantity)
         src/lib/stripe.ts (createCheckoutSession, ensureStripeCustomer)
Qué hacer: añadir plazas adicionales como cantidad de la suscripción en Stripe
(quantity), reflejarlas en el equipo (campo seats ya existe en el modelo Team) y
pedir confirmación de coste al invitar por encima de las incluidas. Al revocar
una plaza no se reembolsa en silencio: se muestra el efecto y se ofrece bajar la
cantidad. Añadir la verificación a scripts/verificar-equipos.mjs.
Terminado cuando: invitar por encima de las plazas incluidas muestra el coste
exacto, la suscripción de Stripe cambia de cantidad en modo test y verify:equipos
sigue en verde con los casos nuevos.

--- 4.2 · Stripe en vivo ---
Dónde: src/lib/stripe.ts, src/app/api/stripe/{checkout,portal,cancel,webhook}/route.ts
Falta: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS,
       STRIPE_PRICE_AGENCY, STRIPE_WEBHOOK_SECRET (ver .env.example).
Hoy: sin claves, checkout activa el plan en modo demostración (rama al principio
de src/app/api/stripe/checkout/route.ts). Eso debe seguir funcionando.
Terminado cuando: pago de prueba con 4242 4242 4242 4242 cambia el plan, el
portal permite cancelar, y repetir el mismo evento del webhook no duplica nada
(idempotencia ya implementada en src/app/api/stripe/webhook/route.ts).

--- 4.3 · Historial de entregas de webhooks ---
Situación: el modelo Webhook (prisma/schema.prisma línea 866) solo guarda
contadores (envios, fallos, ultimoEstado, ultimoError, ultimoEnvio).
Qué hacer: nuevo modelo WebhookEntrega (webhookId, evento, estado HTTP, latencia,
error, createdAt) con retención de las últimas 50 por webhook y borrado en
cascada. Mostrarlo DENTRO del panel existente
(src/components/domain/webhooks-panel.tsx), sin pantalla nueva.
Recuerda: actualizar scripts/db/table-spec.mjs y regenerar la base.
Terminado cuando: tras pulsar «Probar» aparece la entrega con su código y su
motivo real, y la retención no deja crecer la tabla.

--- 4.4 · Buscador global real ---
Situación: el buscador del header siempre lleva a winning-products.
Dónde: src/components/dashboard/header.tsx líneas 64-69 (función buscar).
Qué hacer: buscar en productos, tiendas, anuncios y secciones, con resultados
agrupados y navegación por teclado. Reutiliza /api/products y añade lo mínimo
para tiendas y anuncios; no dupliques consultas pesadas (usa índices y límites).
Terminado cuando: escribir «pets» encuentra productos y tiendas reales y Enter
lleva al resultado correcto.

--- 4.5 · Onboarding de 3 pasos ---
No existe. Debe ser saltable y medible: elegir nicho, seguir 3 tiendas, activar
avisos. Sin menú nuevo (se muestra en el primer acceso al panel). Guarda el
estado en el usuario para no repetirlo.

--- 4.6 · Informe compartible para clientes (modo agencia) ---
Dónde: src/lib/reportes.tsx (hoy genera PDF) y src/app/dashboard/clientes.
Qué hacer: enlace público de solo lectura con caducidad, con el sello de
confianza y sin datos de otras cuentas. Token largo, revocable y con límite de
ritmo.

--- 4.7 · Credenciales externas (implementado, pendiente de clave) ---
Cada una: el código ya existe, falta la variable y una comprobación honesta en
la interfaz cuando no está.
  Correo         src/lib/mail.ts            SMTP_HOST/PORT/USER/PASSWORD/FROM (Brevo gratis)
  Push           src/lib/push.ts            NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
                 (npx web-push generate-vapid-keys)
  Google OAuth   src/auth.ts                GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  IA             src/lib/ai.ts              OPENAI_API_KEY o GEMINI_API_KEY (sin clave: simulado y LO DICE)
  Scraping       src/lib/scraper.ts         SCRAPING_REAL=true, PLAYWRIGHT_CHROMIUM_EXECUTABLE
  Colas          src/lib/queue.ts, scripts/worker.ts, REDIS_URL
  APIs de pago   SERPAPI_KEY, APIFY_TOKEN, YOUTUBE_API_KEY, FACEBOOK_ACCESS_TOKEN
                 y MODO_COSTES=produccion (por defecto 'gratis': solo fuentes sin coste)
Terminado cuando: con la variable puesta funciona de verdad; sin ella la interfaz
avisa y no inventa resultados.

--- 4.8 · Producción y observabilidad ---
Dónde: DESPLEGUE.md (Supabase + Oracle Always Free, 0 €/mes), .github/workflows/
       (alertas.yml, captura-diaria.yml, ingesta.yml, pages.yml, uptime.yml),
       src/app/api/health/route.ts, src/lib/logger.ts (logs JSON).
Qué hacer: comprobar que DESPLEGUE.md se puede ejecutar de principio a fin,
probar una restauración real de backup (npm run respaldo), y que /api/health
avisa cuando falta cada integración. Añadir alerta si la ingesta o el cron
fallan (los workflows ya existen: verifica que el secreto x-cron-secret es el
mismo que CRON_SECRET).

=====================================================================
5 · CÓMO TRABAJAR
=====================================================================

Para cada punto: reproduce o escribe primero la prueba → implementa lo mínimo →
amplía la verificación automática (patrón: scripts/verificar-*.mjs y
src/lib/__tests__/*.test.ts) → actualiza documentación (README.md, PROGRESS.md,
API.md, DESPLEGUE.md) → si hay interfaz, npm run screenshots y MIRA la imagen en
escritorio y móvil → commit pequeño y descriptivo.

Prohibido: inventar datos o entregas, subir .env.local o bases de datos, usar
git push --force, cambiar el esquema sin actualizar table-spec.mjs, borrar o
bajar umbrales de verificaciones para que pasen, y añadir dependencias pesadas
sin justificarlo en el commit.

=====================================================================
6 · CRITERIO DE TERMINADO (pégalo en el informe final)
=====================================================================

npm run typecheck && npm run lint && npm test && npm run db:verify && npm run build
npm start &   # y con el servidor arriba:
npm run verify:api && npm run verify:api-v1 && npm run verify:equipos
npm run verify:pwa && npm run verify:confianza && npm run verify:ingesta
npm run audit:ui
npm run build:pages && npm run verify:pages

Números mínimos: 0 errores de tipos, 0 avisos de lint, 170+ tests, 42/42 API,
23/23 API v1, 33+/33 equipos, 18/18 PWA, 15/15 confianza, 45/45 ingesta,
0 errores en audit:ui y 60/60 en el sitio estático. Nota: los 502 de
/api/tendencias/del-dia son esperados si no hay salida a internet; la pantalla
debe mostrar las últimas tendencias guardadas y decirlo.

Al terminar cada bloque, y al final, informa con: (1) qué has hecho en lenguaje
de producto, (2) comando y resultado exacto que lo demuestra, (3) qué queda
pendiente y por qué, (4) riesgos y cómo detectarlos.

NO PARES hasta que la aplicación esté completamente funcional y usable y todo lo
que no se pueda conectar hoy quede implementado y documentado para conectarlo
con una sola variable de entorno. Si te bloquea una credencial, sigue con el
resto de la lista, deja esa pieza preparada y continúa. Decide, documenta la
decisión y avanza: nunca entregues a medias ni te quedes esperando.
```

---

## Si Claude Code no tiene acceso a GitHub

Solo en ese caso: pásale `OmegaHub-entrega.zip` (se genera desde el mismo commit)
y que empiece con:

```text
Descomprime el ZIP adjunto como trendhunter y trabaja ahí. El resto del encargo
es exactamente el bloque de PROMPT-INICIO.md que te he pegado: empieza por la
sección 1 (puesta en marcha y batería de verificación) y no pares hasta cumplir
la sección 6.
```
