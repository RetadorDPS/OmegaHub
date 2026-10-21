# TrendHunter Pro

**Plataforma SaaS de investigación de productos y tendencias para e-commerce y
dropshipping.** Encuentra productos ganadores con datos reales, espía los
anuncios de la competencia, analiza tiendas Shopify, sigue su evolución y genera
las creatividades de tu campaña con IA.

> Stack: **Next.js 16 (App Router) · TypeScript estricto · Tailwind CSS 4 ·
> Shadcn/Radix · Framer Motion · Recharts · Prisma 7 · PostgreSQL/SQLite ·
> Auth.js v5 · BullMQ + Redis · Playwright · Stripe · OpenAI/Gemini**.

---

## Índice

1. [Módulos](#módulos)
2. [Arranque rápido](#arranque-rápido)
3. [Variables de entorno](#variables-de-entorno)
4. [Comandos disponibles](#comandos-disponibles)
5. [Cuentas de demostración](#cuentas-de-demostración)
6. [Arquitectura](#arquitectura)
7. [API](#api) · [API pública (API.md)](API.md)
8. [Datos de prueba](#datos-de-prueba)
9. [Despliegue](#despliegue)
10. [Solución de problemas](#solución-de-problemas)

---

## Módulos

| # | Módulo | Ruta | Qué hace |
| --- | --- | --- | --- |
| 1 | Autenticación y usuarios | `/login`, `/register`, `/forgot-password`, `/dashboard/settings` | Registro con verificación por correo, Google OAuth opcional, roles USER/ADMIN, perfil, contraseña y plan |
| 2 | Base de datos | `prisma/` | 29 modelos, seeding con 20 productos, 600 métricas diarias, 31 anuncios, 10 tiendas y 12 proveedores |
| 3 | Motor de tendencias | `src/lib/trendEngine.ts` | `calculateTrendScore`, `determineSaturationLevel`, `detectGoldenOpportunity`, `calculateProfitEstimate` (48 tests) |
| 4 | Shell del dashboard | `/dashboard` | KPIs, gráfica de 30 días, oportunidades doradas, saturación por nivel, búsqueda global, idioma, campana de notificaciones |
| 5 | Winning Products | `/dashboard/winning-products` | Catálogo con filtros avanzados, ordenaciones, exportación CSV y ficha con galería, histórico Recharts, competencia, proveedores, calculadora de beneficio y AI Marketing |
| 6 | Ads Spy | `/dashboard/ads-spy` | Cuadrícula tipo Pinterest con vídeo, métricas de engagement y "ver producto relacionado" |
| 7 | Shop Analyzer | `/dashboard/shop-analyzer` | URL → scraping (Playwright o determinista) → facturación, tráfico, top 10 productos, categorías, apps y competencia |
| 8 | Store Tracker y Product Tracker | `/dashboard/store-tracker`, `/dashboard/product-tracker` | Timeline de cambios, umbrales de alerta, sparklines y notificaciones en la campana |
| 9 | AI Studio | `/dashboard/ai-studio` | 5 variantes de copy, guiones de 15/30/60 s, buyer persona, nombres de tienda y análisis de producto |
| 10 | Suscripciones | `/pricing`, `/dashboard/settings/billing` | FREE / PRO 19 $ / BUSINESS 49 $ / AGENCY 149 $, checkout, portal, cancelación, webhook y límites por plan |
| 11 | Panel de administración | `/dashboard/admin` | Alta de productos, aprobación de scrapings, gestión de usuarios y revocación de acceso |
| 12 | API pública v1 | `/dashboard/api`, `/api/v1/*` | Claves con hash SHA-256, cuotas por minuto y día, CORS, OpenAPI 3.1 y 9 endpoints de solo lectura ([API.md](API.md)) |
| 14 | Confianza del dato | catálogo, ficha y PDF | Sello Verificado/Parcial/Estimado en cada producto, índice 0–100 con sus cuatro factores, panel de procedencia con fuente, fecha y enlace de comprobación, y filtro «solo datos verificados» |
| 15 | Equipos y asientos | `/dashboard/equipos`, `/equipos/aceptar` | Business 5 plazas y Agency 15: invitar por correo, roles OWNER/ADMIN/MEMBER, heredar el plan del equipo y revocar accesos |
| 16 | Webhooks salientes | `/dashboard/settings/notifications` | Avisos a Slack, Discord o cualquier automatización (n8n, Make, Zapier), con firma HMAC y prueba de entrega |
| 13 | PWA y avisos push | `/manifest.webmanifest`, `/dashboard/settings/notifications` | Instalable en Android, iPhone y escritorio; service worker con caché de estáticos y pantalla sin conexión; alertas al móvil con VAPID por `web-push` |

---

## Arranque rápido

Requisitos: **Node ≥ 20.19** y npm. No hace falta PostgreSQL ni Redis para
empezar (el proyecto arranca con SQLite y trabajos inline).

```bash
# 1 · Dependencias
npm install

# 2 · Variables de entorno
cp .env.example .env      # funciona tal cual (SQLite + secreto de desarrollo)

# 3 · Base de datos + datos reales de prueba
npm run setup             # db:bootstrap + db:seed

# 4 · Servidor de desarrollo
npm run dev               # http://localhost:3000
```

Abre <http://localhost:3000>, entra en **Iniciar sesión** y usa una cuenta de
demostración (ver más abajo) o crea una nueva en `/register`.

### Build de producción

```bash
npm run build
npm start                 # http://localhost:3000
```

---

## Variables de entorno

Todas las variables están documentadas en [`.env.example`](.env.example).
Resumen:

| Bloque | Variables | ¿Obligatorio? |
| --- | --- | --- |
| Base de datos | `DATABASE_PROVIDER`, `DATABASE_URL` | Sí (por defecto SQLite) |
| Sesiones | `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` | Sí en producción |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Opcional |
| IA | `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Opcional (sin claves se usa el motor de plantillas propio) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `STRIPE_WEBHOOK_SECRET` | Opcional (sin claves, modo demostración) |
| Redis/BullMQ | `REDIS_URL` | Opcional (sin Redis, ejecución inline) |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Opcional (sin SMTP, los correos se registran en consola) |
| Scraping | `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, `SCRAPING_REAL`, `SCRAPER_FORCE_SIMULATED` | Opcional |

Genera un secreto de producción con `openssl rand -base64 32`.

---

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en `0.0.0.0:3000` |
| `npm run build` | Genera el cliente Prisma y compila para producción |
| `npm start` | Servidor de producción |
| `npm run worker` | Workers de BullMQ (requiere `REDIS_URL`) |
| `npm test` | 170 tests (motor de tendencias, confianza, equipos, webhooks) |
| `npm run typecheck` | TypeScript estricto (`tsc --noEmit`) |
| `npm run lint` | Análisis estático con oxlint (0 avisos) |
| `npm run db:bootstrap` | Crea la base de datos y aplica el esquema |
| `npm run db:seed` | Carga los datos reales de prueba |
| `npm run db:verify` | Comprueba integridad y recuentos de la base de datos |
| `npm run db:reset` | Recrea la base de datos desde cero y vuelve a sembrar |
| `npm run db:provider` | Cambia entre `sqlite` y `postgresql` |
| `npm run db:migration:postgres` | Genera `prisma/postgres-inicial.sql` (`-- --aplicar` lo ejecuta) |
| `npm run db:studio` | Prisma Studio |
| `npm run screenshots` | Genera las capturas de todas las pantallas en `screenshots/` |
| `npm run verify:api` | 42 comprobaciones de API y flujos con sesiones reales (IA, scraper, trackers, admin, Stripe) |
| `npm run verify:api-v1` | 23 comprobaciones de la API pública (claves, cuotas, revocación) |
| `npm run audit:ui` | Recorre la navegación real de dos cuentas: enlaces, errores de consola y tiempos |
| `npm run verify:pwa` | 18 comprobaciones de la PWA (manifiesto, iconos, service worker, push y sin conexión) |
| `npm run verify:confianza` | 15 comprobaciones del sello de confianza (catálogo, ficha, API y caso verificado) |
| `npm run verify:ingesta` | 45 comprobaciones de la ingesta real (catálogo, cambios, cruce, tendencias y caducidad del sello) |
| `npm run captura:fuentes` | Capturas de la sección «Fuentes en vivo» |
| `npm run confianza:recalcular` | Recalcula el nivel de confianza de todos los productos |
| `npm run verify:equipos` | 33 comprobaciones de equipos, asientos, invitaciones y webhooks |
| `npm run chromium` | Prepara el Chromium local que usan las capturas y las verificaciones |
| `npm run build:pages` | Exporta el sitio estático para GitHub Pages a `docs/` |
| `npm run preview:pages` | Sirve `docs/` igual que GitHub Pages (`http://localhost:4000/OmegaHub/`) |
| `npm run verify:pages` | 60 comprobaciones del sitio estático en `docs/` (usuario + administrador, HTTP y consola) |

---

## Capturas de la interfaz

Todas las pantallas están documentadas en [`screenshots/`](screenshots) (34
imágenes, incluidas las vistas móviles y las hojas de contacto
`00-hoja-contacto-*.png`). Se regeneran con `npm run screenshots` contra el
servidor en ejecución.

---

## Cuentas de demostración

| Rol | Correo | Contraseña | Plan |
| --- | --- | --- | --- |
| Usuario | `demo@trendhunter.pro` | `demo1234` | PRO |
| Administrador | `admin@trendhunter.pro` | `admin1234` | BUSINESS + ADMIN |
| Usuario gratuito | `free@trendhunter.pro` | `free1234` | FREE |

Cuentas adicionales del seed: `maria@`, `carlos@`, `lucia@`, `javier@`,
`sara@`, `pablo@`, `elena@` (todas `@trendhunter.pro`, contraseña `demo1234`).

---

## Arquitectura

```
src/
├─ app/
│  ├─ page.tsx                    # Landing pública con datos reales
│  ├─ pricing/                    # Planes y comparativa
│  ├─ (auth)/                     # login, register, forgot/reset password
│  ├─ dashboard/                  # 11 módulos del panel
│  └─ api/                        # 30+ endpoints REST
├─ components/
│  ├─ ui/                         # 23 primitivas Shadcn/Radix
│  ├─ dashboard/                  # shell, sidebar, header
│  ├─ domain/                     # componentes de negocio (20+)
│  ├─ charts/                     # Recharts (área y barras)
│  └─ auth/                       # formularios de autenticación
├─ lib/
│  ├─ trendEngine.ts              # motor de cálculo (testeado)
│  ├─ dal.ts                      # capa de acceso a datos + DTOs
│  ├─ scraper.ts                  # Playwright + motor determinista
│  ├─ ai.ts / aiTemplates.ts      # OpenAI/Gemini + plantillas locales
│  ├─ planLimits.ts               # cuotas por plan
│  ├─ stripe.ts                   # checkout, portal, webhook
│  ├─ queue.ts                    # BullMQ con degradación a inline
│  ├─ notifications.ts, mail.ts   # alertas y correo transaccional
│  └─ prisma.ts                   # cliente con driver adapters
├─ generated/prisma/              # cliente Prisma 7 (ESM)
├─ proxy.ts                       # protección de rutas (antes middleware)
└─ auth.ts                        # configuración de Auth.js v5
```

### Decisiones técnicas relevantes

- **Prisma 7 con driver adapters**: SQLite en local (`better-sqlite3`) y
  PostgreSQL en producción (`pg`) sin cambiar el código; el cliente se genera en
  `src/generated/prisma`.
- **Auth.js v5 con JWT**: los proveedores de credenciales exigen sesiones JWT;
  rol, plan y nombre se refrescan desde la base de datos cada 15 segundos o al
  cambiar de plan, de modo que ningún cambio queda oculto en la interfaz.
- **Degradación elegante en todas las integraciones**: sin claves de IA se usa un
  motor de plantillas determinista que genera contenido específico por producto;
  sin Stripe el checkout se aplica en modo demostración; sin Redis los trabajos
  se ejecutan inline; sin SMTP los correos se registran en consola; sin
  navegador el scraper usa el motor determinista.
- **Notificaciones Next 16**: `src/proxy.ts` sustituye a `middleware.ts`.

---

## API

Todas las rutas devuelven JSON y exigen sesión salvo las públicas indicadas.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Alta de usuario con validación Zod |
| `POST` | `/api/auth/forgot-password` | Envío de enlace de recuperación |
| `POST` | `/api/auth/reset-password` | Cambio de contraseña con token |
| `GET` | `/api/auth/verify-email?token=` | Verificación de correo |
| `PATCH` | `/api/user/profile` \| `/api/user/password` | Perfil y contraseña |
| `GET` | `/api/products` | Catálogo con filtros, orden y paginación |
| `GET` | `/api/products/export` | Exportación CSV (UTF-8 con BOM) |
| `GET/POST/DELETE` | `/api/saved-products` | Favoritos |
| `GET/POST/PATCH/DELETE` | `/api/trackers/products` | Seguimiento de productos y umbrales |
| `GET/POST/PATCH/DELETE` | `/api/trackers/stores` | Seguimiento de tiendas |
| `GET/PATCH/DELETE` | `/api/notifications` | Campana y preferencias |
| `POST` | `/api/ingesta` | Ingesta de catálogos públicos + tendencias (cron o admin) |
| `POST` | `/api/ingesta/manual` | Lectura manual desde «Fuentes en vivo» (sesión, 6/hora) |
| `POST` | `/api/cron/confianza` | Revisa y corrige el sello de confianza (`simular` no escribe) |
| `POST` | `/api/shop-analyzer` | Análisis de tienda Shopify |
| `GET` | `/api/shop-analyzer` | Historial de análisis del usuario |
| `GET` | `/api/suppliers` | Proveedores con filtros |
| `POST` | `/api/ai` | AI Studio (5 herramientas) |
| `GET` | `/api/ai/history` | Historial de generaciones |
| `POST` | `/api/stripe/checkout` \| `/portal` \| `/cancel` | Suscripciones |
| `POST` | `/api/stripe/webhook` | Webhook idempotente de Stripe |
| `GET/PATCH` | `/api/admin/users` | Gestión de usuarios (ADMIN) |
| `GET/POST/PATCH` | `/api/admin/products` | Catálogo (ADMIN) |
| `GET/POST` | `/api/admin/scans` | Cola de scrapings (ADMIN) |
| `GET` | `/api/admin/stats` | KPIs de la plataforma (ADMIN) |
| `GET` | `/api/v1/*` | **API pública** con clave (`Business`/`Agency`): productos, tiendas, tendencias y estadísticas |
| `GET` | `/api/v1/openapi` | Contrato OpenAPI 3.1 (público) |
| `GET/POST/DELETE` | `/api/api-keys` | Gestión de claves desde la sesión del panel |
| `GET/POST` | `/api/equipos` | Equipo propio, equipos en los que participa y alta del equipo (Business/Agency) |
| `POST` | `/api/equipos/invitaciones` | Invita por correo (rol + enlace de un solo uso de 14 días) |
| `GET` | `/api/equipos/invitaciones?token=` | Datos públicos de una invitación (sin ids ni datos internos) |
| `POST` | `/api/equipos/invitaciones/aceptar` | Acepta la invitación; exige que el correo de la sesión sea el invitado |
| `PATCH/DELETE` | `/api/equipos/miembros/:id` | Cambia el rol o revoca la plaza (el OWNER no se puede quitar) |
| `GET/POST` | `/api/webhooks` | Webhooks salientes (máx. 10, solo https público) |
| `PATCH/DELETE` | `/api/webhooks/:id` | Pausar, reanudar o borrar |
| `POST` | `/api/webhooks/:id/probar` | Envío de prueba (10/hora) con el resultado real |

---

## Datos de prueba

El seed crea datos **reales y coherentes** (no marcadores de posición):

- **20 productos** de 6 categorías con precios, márgenes, URLs de proveedor,
  métricas de Google/TikTok/Meta y 4 oportunidades doradas.
- **600 métricas diarias** (30 días por producto) que alimentan las gráficas.
- **31 anuncios** con titular, copy, CTA, engagement y vídeo reproducible.
- **10 tiendas Shopify** con catálogo, apps detectadas y **49 eventos** de
  timeline (productos nuevos, cambios de precio, picos de tráfico).
- **12 proveedores** mayoristas evaluados (valoración, envío, pedido mínimo,
  índice de precio).
- **60 imágenes** propias en `public/images/products`.

Todo se puede regenerar con `npm run db:reset` y verificar con
`npm run db:verify`.

---

## Despliegue

> Ejecutar en producción es siempre `npm run build` y después `npm start`: el
> servidor escucha en `0.0.0.0:3000` y la aplicación detecta su URL pública del
> propio dominio (Auth.js con `trustHost` y `urlApp()`), así que funciona igual
> detrás de cualquier dominio o proxy inverso. Basta con definir
> `NEXT_PUBLIC_APP_URL` cuando quieras forzar una URL canónica.

### GitHub Pages (versión estática de demostración)

El panel completo también se publica como **sitio estático** en GitHub Pages:
es una exportación real de la aplicación (mismas páginas, mismos datos de
demostración) sin backend.

```bash
npm run setup          # datos de demostración (20 productos, tiendas, anuncios)
npm run build:pages    # exporta el sitio a docs/ (base path /OmegaHub)
npm run preview:pages  # comprueba el resultado en http://localhost:4000/OmegaHub/
```

Para publicarlo hace falta, una sola vez:

1. **Repositorio público** (o cuenta Pro/Team): GitHub Pages no existe en
   repositorios privados con plan gratuito.
2. **Settings → Pages → Source: «GitHub Actions»**. El flujo
   `.github/workflows/pages.yml` publica en cada push a `main` y también admite
   ejecución manual. Deja el sitio en `https://<usuario>.github.io/<repositorio>/`.

Qué funciona en la versión estática: todas las pantallas (landing, precios,
panel completo con datos reales, catálogo con filtros por URL, fichas de
producto y de tienda, administración) y los gráficos. Qué necesita servidor: la
IA, el guardado de favoritos, los trackers, el Shop Analyzer, los pagos y el
alta de cuentas. Un aviso en la cabecera lo explica y las llamadas al backend
responden con un mensaje claro en lugar de fallar en silencio.

### Railway (recomendado)

### Opción A · Railway (app + PostgreSQL + Redis) — recomendada

1. Crea un proyecto en Railway y añade los plugins **PostgreSQL** y **Redis**.
2. Conecta el repositorio; Railway detecta Next.js.
3. Variables: `DATABASE_PROVIDER=postgresql`, `DATABASE_URL` (la del plugin),
   `REDIS_URL` (la del plugin), `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
   (el dominio público) y, opcionalmente, las claves de IA, Stripe y SMTP.
4. Comando de build: `npm run build` · Comando de arranque: `npm start`.
5. Tras el primer despliegue: `npm run db:provider` (si cambias el provider del
   schema), `npm run db:push` y `npm run db:seed` desde la consola de Railway.
6. Para los trabajos en segundo plano, añade un segundo servicio con
   `npm run worker`.

### Opción B · Docker

```bash
docker compose up --build          # app en http://localhost:3000
docker compose exec app npm run db:push && docker compose exec app npm run db:seed
```

El `docker-compose.yml` incluye PostgreSQL 17 y Redis 7 listos para usar.

### Opción C · Vercel

Compatible con Vercel en la parte de frontend y API. Con base de datos
serverless (Neon/Supabase) y `NEXT_PUBLIC_APP_URL` apuntando al dominio. Los
scrapers con Playwright y los workers BullMQ deben ejecutarse en Railway o
Docker, no en funciones serverless.

---

## Solución de problemas

| Problema | Solución |
| --- | --- |
| `No such file or directory: prisma/trendhunter.db` | `npm run db:bootstrap` (crea la base de datos y aplica el esquema) |
| La tabla no existe o faltan datos | `npm run db:reset` (recrea y vuelve a sembrar) |
| Error de tipos tras cambiar el schema | `npm run db:generate && npm run typecheck` |
| Stripe no cobra | Revisa `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*` y `STRIPE_WEBHOOK_SECRET`; sin claves se activa el modo demostración |
| El scraper no detecta Shopify | Activa el motor real con `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (tras `npx playwright install chromium`) |
| Los correos no llegan | Configura SMTP; sin él los enlaces se imprimen en la consola del servidor |
| `npm run worker` termina al instante | Es lo esperado sin `REDIS_URL`: los trabajos se ejecutan inline |

---

© TrendHunter Pro · Proyecto de demostración técnica.
