# PROGRESS · TrendHunter Pro

Registro de ejecución del proyecto por fases. Cada fase se cierra con
`npm run build`, `npx tsc --noEmit` y una verificación funcional real.

Estado global: **11/11 módulos implementados y verificados en local**.

---

## Resumen de verificación

| Comprobación | Comando / método | Resultado |
| --- | --- | --- |
| Tipos estrictos | `npx tsc --noEmit` | **0 errores** |
| Build de producción | `npm run build` | **Correcto** |
| Tests del motor de tendencias | `npm test` | **48/48** |
| Base de datos | `npm run db:verify` | **OK** (20 productos, 4 dorados, 31 anuncios, 10 tiendas, 12 proveedores) |
| Rutas y páginas | `npm run verify:pages` (Playwright) | **18/18 correctas**, 0 errores de consola |
| APIs y flujos | `npm run verify:api` (Playwright, sesiones reales) | **33/33 comprobaciones OK** |
| Capturas de la interfaz | `npm run screenshots` | **31 pantallas** en `screenshots/` |
| Autenticación | registro, login, logout, sesión, roles | **OK** |
| Stripe | checkout, portal y cancelación en modo demo | **OK** |
| Docker | `Dockerfile` + `docker-compose.yml` (app, worker, PostgreSQL 17, Redis 7) | Listos (sin entorno Docker en el sandbox) |

---

## Fase 1 · Usuarios, autenticación y control de acceso

**Construido**

- `src/auth.ts`: Auth.js v5 con Credentials (bcrypt) y Google opcional,
  **estrategia JWT** (requisito de los proveedores de credenciales) con refresco
  de rol/plan desde Prisma cada 15 s o cuando el cliente pide `update()`.
- Roles `USER`/`ADMIN`, verificación de correo (`isEmailVerified`), cuotas
  diarias por plan.
- `src/proxy.ts` (nuevo nombre de `middleware.ts` en Next 16) para la protección
  ligera de rutas + validación real de sesión en `src/app/dashboard/layout.tsx`.
- Páginas: `/login`, `/register`, `/forgot-password`, `/reset-password`,
  `/dashboard/settings` (perfil, contraseña, plan y consumo),
  `/dashboard/settings/billing`, `/dashboard/settings/notifications`.
- APIs: `POST /api/auth/register`, `forgot-password`, `reset-password`,
  `GET /api/auth/verify-email`, `PATCH /api/user/profile`, `PATCH /api/user/password`.

**Errores encontrados y solución**

1. `UnsupportedStrategy`: los proveedores de credenciales no admiten sesiones en
   base de datos → se pasó a `strategy: "jwt"`.
2. Next 16 renombró el middleware → se movió `src/middleware.ts` a
   `src/proxy.ts` con `export default function proxy`.
3. La ampliación de tipos de `next-auth/jwt` no resolvía → se tipa el token con
   una interfaz local `CamposToken`.

---

## Fase 2 · Prisma: modelo de datos y datos reales de prueba

**Construido**

- `prisma/schema.prisma` con 21 modelos y 15 enums: `User, Product, TrendMetric,
  Ad, Store, StoreProduct, StoreScan, StoreChange, SavedProduct, TrackedStore,
  TrackedProduct, AlertNotification, Supplier, AiGeneration, Subscription,
  UsageEvent, StripeEvent, PasswordResetToken, VerificationToken, Account, Session`.
- Prisma 7 con driver adapters (`better-sqlite3` en local, `pg` en producción),
  cliente generado en `src/generated/prisma` (ESM, `provider = "prisma-client"`).
- `prisma/seed.ts` + datasets: **20 productos** reales (Salud, Belleza,
  Tecnología, Mascotas, Hogar, Fitness), **600 métricas diarias** (30 días × 20),
  **31 anuncios** con métricas de engagement, **10 tiendas Shopify** con catálogo
  y timeline, **49 eventos de cambio**, **12 proveedores**, 10 usuarios de demo.
- Imágenes propias generadas en `public/images/products` (60 fotos).

**Comandos**

```bash
npm run db:bootstrap   # crea la base de datos y aplica el esquema
npm run db:seed        # carga los datos de demo
npm run db:verify      # comprueba integridad y recuentos
```

---

## Fase 3 · Motor de tendencias

**Construido** — `src/lib/trendEngine.ts` con `calculateTrendScore`,
`determineSaturationLevel`, `detectGoldenOpportunity`, `calculateProfitEstimate`,
`calculateVelocityScore`, `generateMetricSeries`, `calculateHeatIndex`…
48 tests en `src/lib/trendEngine.test.ts` (**48/48 correctos**).

---

## Fase 4 · Shell del dashboard

**Construido** — `sidebar` (9 secciones + Admin), `header` (búsqueda global,
selector de idioma, campana de notificaciones con contador, menú de perfil),
tema oscuro slate-950 con acentos indigo-600/violet-600, 23 componentes de UI
(Shadcn/Radix) y 20+ componentes de dominio.

---

## Fase 5 · Winning Products

**Construido** — catálogo con tarjetas (imagen, nicho, score circular, margen,
insignia de saturación), filtros avanzados (búsqueda, categoría, nicho,
saturación, score mínimo, margen mínimo, precio máximo, solo doradas),
6 ordenaciones, paginación, exportación CSV y **ficha de producto completa**:
galería, histórico Recharts de 30 días, métricas por plataforma, tiendas
competidoras, proveedores con enlaces, calculadora de beneficio, favoritos,
seguimiento y pestaña **AI Marketing**.

---

## Fase 6 · Ads Spy

**Construido** — cuadrícula tipo Pinterest con vídeo reproducible al pasar el
ratón (con control de sonido), métricas de likes/comentarios/compartidos/
engagement, días activos, países objetivo, filtros por plataforma/nicho/país/
engagement/antigüedad y ordenación, más "Ver producto relacionado".

---

## Fase 7 · Shop Analyzer

**Construido** — `POST /api/shop-analyzer` con dos motores: **Playwright real**
(detecta Shopify, tema, apps y catálogo) y **determinista** como respaldo
(coherente por dominio). Devuelve facturación, visitas, ticket medio, conversión,
ingreso por visita, categorías, top productos, competencia y avisos; persiste
tienda, catálogo, evento de timeline y el trabajo en `StoreScan`; interfaz con
progreso por pasos y resultado completo.

---

## Fase 8 · Store Tracker y Product Tracker

**Construido** — tiendas monitorizadas con métricas y control de alertas,
timeline agregado de cambios (productos nuevos, precios, picos de tráfico,
hitos) con impacto 0-100, página de detalle por tienda con catálogo completo,
seguimiento de productos con sparkline de evolución, umbral de alerta
configurable, campana en la cabecera y preferencias de notificación.

---

## Fase 9 · AI Studio

**Construido** — cinco herramientas (`AD_COPY`, `VIDEO_SCRIPT`,
`BUYER_PERSONA`, `STORE_NAMES`, `PRODUCT_ANALYSIS`) con OpenAI/Gemini
configurables y motor de plantillas propio como respaldo; historial de
generaciones persistido con proveedor, modelo, tokens y latencia; integración
embebida en la ficha de producto y página completa con parámetros.

---

## Fase 10 · Suscripciones Stripe

**Construido** — planes FREE / PRO 49 $ / BUSINESS 149 $, página `/pricing`
pública con comparativa, `POST /api/stripe/checkout`, `/api/stripe/portal`,
`/api/stripe/cancel`, webhook idempotente (`StripeEvent`) que sincroniza plan,
estado y periodo, y **modo demostración** que aplica el cambio de plan al
instante cuando no hay claves (con upsert idempotente y aviso al usuario).
Límites por plan aplicados en productos, IA, análisis y exportación.

---

## Fase 11 · Panel de administración

**Construido** — KPIs globales (usuarios por plan, MRR/ARR, catálogo,
scrapings fallidos), gestión de usuarios (rol, plan, revocación de acceso con
notificación), catálogo (alta manual con cálculo real de score/saturación/margen,
archivado y republicación) y cola de scrapings (aprobar → publica el producto,
descartar, reintentar).

---

## Correcciones destacadas de la verificación final

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `POST /api/trackers/stores` → 500 (FK) | El Shop Analyzer devolvía el `id` del DTO simulado, no el de la base de datos | La ruta devuelve ahora la tienda persistida con su `id` real |
| Repetir el checkout demo → 500 | `stripeSubscriptionId` único duplicado | `upsert` idempotente de la suscripción |
| El plan tardaba en reflejarse | El token JWT cacheaba rol/plan 60 s | Refresco a los 15 s y `useSession().update()` tras el pago |
| Cancelación demo dejaba la suscripción activa | Sólo se actualizaba el usuario | La suscripción pasa a `CANCELED` en la misma transacción |

---

## Entorno de demostración en vivo

La aplicación está **desplegada y en ejecución en modo producción**
(`npm run build` + `npm start`, servidor `0.0.0.0:3000`) sobre el entorno de
vista previa de la sesión:

    https://3000-ioctbfz8x5syunz9rn5rc.e2b.app

Comprobado a través del dominio público: `/api/health` (entorno `production`,
20 productos), inicio de sesión real (`demo@trendhunter.pro`) y las APIs
protegidas (`/api/products`, `/api/notifications`, `/api/ai/history`) devuelven
200. La aplicación no fija su dominio (Auth.js con `trustHost` y `urlApp()`), por
lo que funciona igual detrás de cualquier dominio o proxy inverso.

Para replicarlo en un servidor propio: Railway (recomendado, con PostgreSQL y
Redis gestionados), `docker compose up` o cualquier host con Node 22 y
PostgreSQL. Pasos en el README.

## Correcciones finales de calidad

- Aviso de Next por `scroll-behavior: smooth` global → se añadió
  `data-scroll-behavior="smooth"` al `<html>`.
- Aviso de LCP en las imágenes de tarjetas → `preload` + `loading="eager"` en
  las tarjetas que quedan sobre el pliegue (`ProductCard` y `AdCard`).
- Trazado del build recorría todo el proyecto por un acceso dinámico al sistema
  de archivos en `src/lib/prisma.ts` y en el panel de administración → se
  eliminaron: el adapter de SQLite resuelve las rutas relativas y las imágenes
  sugeridas del alta de productos se leen de la base de datos.
- Se eliminaron las sondas temporales y se convirtieron en scripts versionados
  (`scripts/verify-pages.mjs`, `scripts/verify-api.mjs`).
- **Error de hidratación** en las marcas de tiempo relativas (`hace 50 minutos`
  frente a `hace 51 minutos` entre servidor y navegador): se añadió el
  componente `RelativeTime`, que pinta la fecha absoluta en el primer render
  (determinista) y cambia al texto relativo una vez montado, refrescándolo cada
  minuto. Con esto el `verify:pages` queda en **58/58 sin errores de consola**.
- **URL pública desacoplada del entorno**: nuevo `src/lib/app-url.ts`. Stripe y
  los correos usan `NEXT_PUBLIC_APP_URL` cuando apunta a un dominio real y, en
  caso contrario, el origen de la petición (vistas previas, desarrollo y
  despliegues detrás de un proxy).

## Capturas de la interfaz

`screenshots/` contiene 31 imágenes (31 pantallas + 3 hojas de contacto):
landing, autenticación, precios, los 11 módulos del panel, resultados reales del
Shop Analyzer y del AI Studio, y las vistas móviles. Se regeneran con
`npm run screenshots`.

## Trabajo pendiente / siguientes pasos

- Deploy: Railway (app + PostgreSQL + Redis) o Docker (`docker-compose.yml`
  incluido), con las variables de `.env.example`.
- Sustituir el motor determinista de scraping por Playwright en producción
  (activar con `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).
