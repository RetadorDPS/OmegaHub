# PROGRESS · TrendHunter Pro

Historial fase a fase con sus verificaciones.

## Fase 0 · Esqueleto y modo de costes ✅
- `src/lib/modoCostes.ts`: `modoCostes()`,
  `modalidadPermitida()`, `explicarModo()`.
- `/api/health` público con `modoCostes`,
  latencia y conteo de productos.
- `/api/diagnostics` (clave de cron): modo,
  proveedores registrados y canales.
- Registro de proveedores con `modalidad:
  gratuita | pago | via-gris`.

## Fase 1 · Procedencia de datos ✅
- `enum TipoDato {MEDIDO, IMPORTADO, ESTIMADO}`
  y `fuente/fechaMedicion/tipoDato` en
  `TrendMetric` (+ DTOs).
- `trendCapture` persiste la procedencia.
- Insignia `ProcedenciaBadge` en el panel de
  métricas de producto.

## Fase 2 · Proveedores gratuitos ✅
- `providers/youtube.ts` (YouTube Data API v3,
  ~100 búsquedas/día gratis), `tendenciasGoogle.ts`
  (RSS oficial sin clave + `parsearRssTendencias`),
  `tiktokCreativeCenter.ts` (vía gris opt-in
  `TIKTOK_CREATIVE_CENTER`), `importacion.ts`
  (CSV/JSON con formato europeo).
- Cliente HTTP con caché TTL y reintentos
  (`providers/http.ts`).
- Registro de 8 proveedores en `providers/index.ts`.
- Rutas: `/api/tendencias/del-dia`,
  `/api/productos/:id/importar-tendencias`.
- UI: radar de tendencias en Winning Products,
  importador en la ficha de producto, tarjeta
  YouTube en métricas.
- El motor usa `max(tiktok, youtube)` para la
  familia vídeo.

## Fase 3 · Captura diaria + cron ✅
- `.github/workflows/captura-diaria.yml` (06:00 UTC)
  y `alertas.yml` (cada 30 min), ambos con
  `x-cron-secret`.
- `src/lib/trendCapture.ts` (idempotente, con
  `soloRecalcular` honesto: escribe ESTIMADO).

## Fase 4 · Supabase listo ✅
- `prisma.config.ts` con `DIRECT_URL` (5432) para
  migraciones; `DATABASE_URL` (pooler 6543) para la app.
- Scripts: `db:migrate`, `respaldo` (pg_dump, retiene
  14), `arranque.mjs` (migra si es Postgres y arranca).
- Dockerfile: `CMD ["node", "scripts/arranque.mjs"]`.

## Fase 5 · Pagos y modo agencia ✅
- Planes finales: FREE 0 $ · PRO 19 $ · BUSINESS
  49 $ · AGENCY 149 $ (sincronizados en schema,
  tipos, límites, Stripe y pricing).
- Modelo `Cliente` + `clienteId` en trackers
  (se persiste al crear y reasignar).
- API `/api/clientes` (GET/POST) y
  `/api/clientes/:id` (PATCH/DELETE), puerta
  BUSINESS+. Página `/dashboard/clientes` con
  formulario. Nav con `minPlan` (filtro local).
- Checkout acepta AGENCY.

## Fase 6 · Extensión Chrome MV3 ✅
- `extension/`: manifest, popup (URL manual + URL
  de la app guardada), content script que detecta
  Shopify, iconos 16/48/128, README.
- Deep link `/dashboard/shop-analyzer?url=` que
  prefija el campo y **autoanaliza**.
- `store-listing.md` + `privacy.md` para la
  Chrome Web Store (5 $ una vez).

## Fase 7 · Informes PDF ✅
- `@react-pdf/renderer`; `src/lib/reportes.tsx`
  con `DocumentoProducto` y `DocumentoTienda`:
  marca de agua del plan, métricas con
  procedencia.
- Rutas `POST /api/productos/:id/informe` y
  `POST /api/tiendas/:id/informe` (cuota EXPORT;
  FREE 0/día → 402 con mensaje).
- Botón «Informe PDF» en la ficha de producto
  y de tienda.

## Fase 8 · Escalabilidad profesional ✅
- Caché TTL (`cache.ts`) para lecturas GET a
  proveedores (5 min).
- Reintentos exponenciales en `pedirJson`
  (5xx y red; 4xx no).
- Rate limiting por usuario+acción
  (`limite.ts`); Shop Analyzer a 5/min (429).
- Logs estructurados JSON (`logger.ts`) en el
  analizador y ambos crons.
- Monitor de uptime (`uptime.yml`, Telegram).

## Fase 9 · Despliegue ✅
- `DESPLEGUE.md` (runbook completo) y
  `desplegar.sh` (un comando: Docker, migra,
  siebla si está vacía, comprueba health).
- `scripts/db-estado.mjs` para el script.
- `docker-compose.yml` inyecta todas las claves
  del `.env`.

## Fase 10 · Precios y mejoras ✅
- Modelo `PriceHistory` (23 modelos): cada
  análisis guarda el precio real de cada producto.
- `precios.ts`: `caidaPercent`, `esCaidaRelevante`
  (umbral 5 %), `describirCaida`.
- Gráfica «Evolución de precios» en la ficha de
  tienda; eventos `PRICE_CHANGE` en el timeline;
  alertas de caída por email/Telegram a tiendas
  seguidas.
- Seed con 4 rondas históricas por producto.

## Verificación final
- `tsc` 0 · `oxlint` 0/0 · **65 tests** ·
  `npm run build` ✓ · `db:verify` ✅
  (23 modelos · 16 enums).
- `verify-api` 33/33 · `verify-pages` 60/60 ·
  E2E 15/15 · `build:pages` 52 páginas.
- En vivo: PDF 200 (%PDF), FREE → 402 de cuota,
  rate limit → 429, logs JSON, health con modo.

## Fase 11 · API pública v1 ✅
- Modelo `ApiKey` (24 modelos): prefijo único, hash SHA-256, uso
  por minuto/día y revocación con auditoría.
- `src/lib/apiKeys.ts` (claves, límites por plan) y
  `src/lib/apiAuth.ts` (autenticación, cuotas, logs).
- Endpoints `/api/v1`: índice, productos, producto, tiendas,
  tienda, tendencias, tendencias del día, estadísticas y OpenAPI 3.1.
- Gestión de claves con sesión: `/api/api-keys` (+ `DELETE :id`) y
  panel `/dashboard/api` (crear, copiar una vez, revocar).
- Cuotas: Business 60/min · 5.000/día · 5 claves; Agency
  300/min · 50.000/día · 20 claves. Cabeceras `X-RateLimit-*` y
  `X-Quota-*`, `Retry-After` en 429 y CORS abierto.
- Errores estables con código (`SIN_CLAVE`, `CLAVE_INVALIDA`,
  `CLAVE_REVOCADA`, `PLAN_INSUFICIENTE`, `LIMITE_RITMO`,
  `CUOTA_DIARIA`, `PARAMETRO_INVALIDO`, `NO_ENCONTRADO`).

### Correcciones de esta ronda
- **Agencia**: borrar un cliente usaba un formulario POST con
  `?_method=DELETE` (la ruta solo acepta DELETE) → ahora es un
  componente cliente con `fetch` + `DELETE` y confirmación.
- **Precios**: Pro mostraba «49 $/mes» con `price: 19` → ahora
  «19 $/mes» (coherente con el resto del sistema).
- **Paginación**: `listProducts` forzaba un mínimo de 4 por página
  (ignoraba `pageSize` menores); ahora admite 1–100.
- **Tablas en móvil**: las tablas anchas (admin, tiendas,
  facturación, IA, analizador, claves) llevan ancho mínimo y se
  desplazan en horizontal en vez de comprimir las columnas.
- **Pestañas en móvil**: `TabsList` no crecía y se solapaba con el
  contenido; ahora usa `flex-wrap` y `min-h`.
- **Diagnóstico**: `/api/diagnostics` importaba `auth` sin usarlo;
  ahora acepta la clave de cron **o** una sesión de administrador.
- **verify:api**: libera las cuotas del día antes de ejecutar (era
  imposible repetirlo el mismo día) y comprueba el 402 de FREE
  llegando al límite real.

### Despliegue verificado en PostgreSQL (motor real de Supabase)
- **Prisma fija el motor al compilar**: una imagen generada para
  SQLite falla contra PostgreSQL (`adapter-pg not compatible`).
  El `Dockerfile` acepta `--build-arg DATABASE_PROVIDER` y
  `desplegar.sh` compila para `postgresql`.
- DDL de PostgreSQL corregido: las claves ajenas se añaden
  **después** de crear todas las tablas (antes fallaba por orden:
  `TrackedStore → Cliente`). En SQLite iban en línea.
- `docker-compose.yml` deja de montar un volumen sobre `/app/prisma`
  (ocultaba `seed.ts` y el esquema) y acepta `DATABASE_URL`,
  `DIRECT_URL` y `AUTO_SEED` del `.env` (Supabase o PostgreSQL local).
- `scripts/arranque.mjs`: crea el esquema, espera/reintenta si la
  base está fría y siebla solo si está vacía.
- `scripts/db-estado.mjs` reescrito con SQL directo (antes usaba
  `@prisma/client` sin generar y solo funcionaba por casualidad).
- `scripts/generate-postgres-migration.mjs` recuperado: genera
  `prisma/postgres-inicial.sql` (25 tablas, 16 enums, 27 claves
  ajenas; 185 sentencias) y puede aplicarlo con `--aplicar`. TLS automático.
- `prisma.config.ts` y `src/lib/prisma.ts`: una variable vacía en el
  `.env` ya no rompe la conexión (se usa `||`, no `??`).
- **Probado de punta a punta contra PostgreSQL 16**: bootstrap
  (25 tablas), seed completo, `db:verify` sin drift, `npm run build`,
  `verify:api` **42/42**, `verify:api-v1` **23/23** y E2E **18/18**.

### Pulido de interfaz (revisión con capturas reales)
- **Gráfica de precios**: agrupaba por instante y cada producto caía en una
  fecha distinta (ejes desalineados) y el eje Y recortaba los importes. Ahora
  agrupa por día, el seed usa la misma hora por ronda y el eje muestra
  «24 €» con ancho suficiente.
- **Tarjetas de métricas**: la insignia de procedencia y el «peso 0 %» de
  YouTube se solapaban con el título; ahora cabecera flexible (`flex-wrap`) y
  YouTube indica «familia vídeo» en lugar de un peso engañoso.
- **Tablas** con ancho mínimo y **pestañas** con `flex-wrap`: ya no se
  comprimen ni se solapan en móvil (verificado a 412 px).
- Capturas nuevas 01–17 en `screenshots-nuevas/` (escritorio y móvil).

### Verificación
- `tsc` 0 · `oxlint` 0/0 (210 ficheros) · **73 tests** ·
  `build` ✓ · `db:verify` ✅ (24 modelos · 16 enums).
- SQLite: `verify:api` **42/42** · `verify:api-v1` **23/23** ·
  E2E **18/18** · `verify:pages` **58/58** · `build:pages` (60 páginas).
- Orden recomendado de la batería: `verify:api` **antes** de E2E; el E2E
  agota el límite de análisis de tienda (5/min) y el siguiente
  `verify:api` recibiría 429 hasta pasar el minuto.
- PostgreSQL 16: los mismos resultados (42/42 · 23/23 · 18/18).

## Fase 12 · PWA y notificaciones push ✅

Objetivo: que la plataforma se pueda **instalar en el móvil** y que las
alertas que ya existían lleguen al teléfono como notificación del sistema,
sin coste y sin servicio externo.

### Servidor
- Modelo **`PushSubscription`** (25 modelos): una fila por navegador,
  `endpoint` único, claves `p256dh`/`auth`, navegador, `activa`,
  `ultimoUso`. Se borra en cascada con el usuario.
- `src/lib/push.ts`: `pushConfigurado()`, `estadoPush()` y
  `enviarPushAUsuario()`. Usa `web-push` con VAPID, TTL de una hora,
  urgencia `high` para cambios de precio y **desactiva** la suscripción
  cuando el servicio responde 404/410. Sin claves VAPID es un no-op
  silencioso: la alerta ya está en la campana.
- Rutas `POST /api/push/subscribe` (alta idempotente por endpoint),
  `POST /api/push/unsubscribe` (baja idempotente),
  `POST /api/push/test` (envío de prueba) y `GET /api/push/estado`
  (diagnóstico del servidor y dispositivos, sin exponer la clave privada).
  Todas exigen sesión; el alta valida endpoint HTTPS y claves.
- `entregarAlerta()` incorpora el canal **push** al resultado
  (`{email, telegram, webhook, push, motivos}`) y `estadoCanales()` lo
  declara. El motor de alertas pasa `usuarioId` y el tipo de aviso, así que
  los cinco tipos (score objetivo, cambio de precio, producto nuevo,
  saturación y reversión) llegan al móvil y la campana registra el
  resultado por canal.
- `.env.example` documenta `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.

### Cliente (PWA)
- `src/app/manifest.ts` con iconos 192/512/maskable, atajos a Productos,
  Tiendas y Notificaciones, `display: standalone` y `theme_color`.
- `public/sw.js`: precarga `/offline` y los iconos; **red primero** para
  navegación (nunca se sirve un panel cacheado), caché primero para
  estáticos e imágenes, API siempre por red; `push`, `notificationclick`
  (abre o enfoca la ficha) y limpieza de cachés de versiones anteriores.
- `public/icons/*`: iconos generados con `scripts/generar-iconos-pwa.mjs`
  (PNG propio con `zlib`, sin dependencias), más `apple-touch-icon`.
- `src/app/offline/page.tsx`: pantalla «Sin conexión» con la explicación de
  por qué no se muestran cifras antiguas.
- `RegistrarServiceWorker` en el layout raíz y metadatos `manifest`,
  `appleWebApp`, iconos y `theme-color` (también para iOS).
- Tarjeta **«Avisos al móvil (PWA)»** en Ajustes → Notificaciones: estado
  del permiso y del servidor, activar/desactivar en este dispositivo,
  enviar prueba, instalar app (con instrucciones para iPhone), lista de
  dispositivos y último envío. Usa la Permissions API con respaldo a
  `Notification.permission`.

### Corrección de un fallo real encontrado al verificar
- El motor de alertas escribía `SCORE_THRESHOLD`, `SATURATION_ALERT` y
  `TREND_REVERSAL` en `NotificationType`, pero esos valores **no existían en
  el enum**: cualquier producto seguido que superase su objetivo hacía que
  `/api/cron/alertas` respondiera **500** y no se generaba ningún aviso.
  Añadidos al esquema, a los tipos, a las etiquetas y a los colores de la
  interfaz. Verificado: la tarea responde 200 y crea el aviso con su tipo.
- El DDL de PostgreSQL ahora añade los valores que falten a un enum ya
  existente (`ALTER TYPE … ADD VALUE IF NOT EXISTS`), así una base creada
  antes recibe los tipos nuevos sin migración manual.

### Pruebas
- `src/lib/__tests__/pwa.test.ts` (13): rutas y cachés, clasificación de
  peticiones, validación de suscripciones (HTTPS, claves), navegador y carga
  de la notificación.
- `src/lib/__tests__/push.test.ts` (5): envío **real** con `web-push`
  contra un servidor HTTPS local que hace de FCM —cifrado, cabecera TTL,
  firma VAPID, `ultimoUso` actualizado, 410 que desactiva el dispositivo y
  comportamiento sin claves o sin dispositivos—.
- `npm run verify:pwa` (22): manifiesto, iconos PNG reales con su tamaño,
  service worker registrado en Chromium, metadatos, alta/consulta/baja de
  dispositivos, validaciones 400/401, canal push en el motor de alertas y
  pantalla sin conexión precargada.
- **Historial de avisos en móvil**: badge, título y acciones se apilaban y
  dejaban el texto en una columna de 100 px (títulos partidos letra a letra).
  Ahora el aviso es columna en móvil y fila desde `sm`, con las acciones
  debajo del texto.
- Capturas nuevas: `screenshots-nuevas/18-pwa-avisos-escritorio.png`,
  `19-pwa-avisos-movil.png` y `20-pwa-historial-movil.png` (412 px).

### Verificación de la ronda
- `tsc` 0 · `oxlint` 0/0 · **91 tests** (73 + 13 + 5) · `build` ✓ ·
  `db:verify` ✅ (25 modelos · 16 enums · 292 columnas · 51 índices).
- `verify:pwa` **22/22** · `verify:api` **42/42** · `verify:api-v1`
  **23/23** · E2E **18/18** · `verify:pages` **58/58** · `build:pages`
  **66 páginas**.
- **PostgreSQL 16**: `postgres-inicial.sql` aplicado dos veces sin error
  (25 tablas · 292 columnas), seed completo, `db:verify` sin drift,
  `verify:api-v1` **23/23** y `verify:pwa` **22/22** con el servidor real
  en PostgreSQL. También se probó el camino de actualización: un enum
  `NotificationType` con los 6 valores antiguos pasa a 9 al aplicar el SQL.
- Avisos honestos de `verify:pwa`: la suscripción push real de Chromium no
  se puede completar en este entorno (sin acceso al servicio push de Google
  y permiso de notificaciones denegado en modo headless) y el corte de red
  total no es reproducible porque la emulación de red no alcanza al service
  worker; ambos caminos se cubren con las pruebas de `web-push` y con la
  comprobación de la política de respaldo.

## Fase 13 · Confianza del dato ✅

Objetivo: que ninguna cifra se presente como medida si no lo está. Es la base
para que un usuario pueda decir «esto es verdad» y vuelva.

### Qué se ha construido
- **Procedencia por fuente** (`TrendMetric.procedencia`): cada medición guarda,
  por cada fuente, su tipo (`MEDIDO`/`IMPORTADO`/`ESTIMADO`), el origen, la
  fecha y el valor. Antes una fila con YouTube medido y el resto heredado se
  marcaba entera como `MEDIDO`.
- Nuevo tipo `MIXTO` y `tipoDatoDeFila()`: si conviven valores medidos y
  heredados, la fila lo dice.
- **Índice de confianza 0–100** (`src/lib/confianza.ts`, puro y probado):
  cobertura 45 · frescura 25 · diversidad 15 · consistencia 15. Niveles
  `VERIFICADO` (2+ fuentes medidas en 7 días, 60+ puntos y sin
  contradicciones), `PARCIAL`, `ESTIMADO` y `SIN_DATOS`.
- **Sello visible** en catálogo, ficha y PDF, con el motivo en el tooltip.
- **Regla dura**: «Oportunidad dorada» solo con datos verificados; si no, la
  etiqueta pasa a «Oportunidad estimada» (ámbar). `puedeSerDorada()`.
- **Pestaña «Confianza»** en la ficha: los cuatro factores con su puntuación,
  el desglose fuente por fuente (tipo, fecha, valor) y un **enlace para
  comprobarlo a mano** en Google Trends, Meta Ad Library, YouTube, TikTok o
  catálogo Shopify.
- **Filtro «Solo datos verificados»** en el catálogo y `?verificados=1` en la
  API pública; la API expone además `confianza`, `nivelConfianza`,
  `fuentesMedidas` y `ultimaMedicion`.
- **Panel general**: nueva tarjeta «Datos verificados» con el porcentaje del
  catálogo.
- `npm run confianza:recalcular` y recálculo automático tras cada captura.

### Cifras falsas eliminadas
- Las tarjetas del panel mostraban **+12,4 % / +25 % / +8,1 % / +18,7 % «vs.
  mes anterior» escritos a mano. Ahora los dos que se pueden calcular son
  reales (productos y anuncios dados de alta en los últimos 30 días frente a
  los 30 anteriores) y los otros dos se han retirado.
- La portada prometía «datos reales de Google Trends · TikTok · Meta Ads ·
  Shopify» con un catálogo que es de demostración; ahora dice «cada dato con
  fuente y fecha» y las fichas explican si está verificado o estimado.
- El seed guarda su procedencia (`seed-demo`, `ESTIMADO`) en las 600
  mediciones y calcula el nivel con la función real: 20 productos
  `ESTIMADO` · 0/100. No se disfraza la demo de dato medido.

### Verificación
- `npm test`: **109 pruebas** (18 nuevas de confianza).
- `npm run verify:confianza`: **15/15** con navegador real, incluido un
  producto temporal con dos fuentes medidas que aparece como **Verificado ·
  90/100** y como «Oportunidad dorada», y vuelve a estimado al borrarlo.
- `verify:api` 42/42 · `verify:api-v1` 23/23 · `verify:pwa` 22/22 ·
  E2E 18/18 · `build:pages` **63 páginas** · `verify:pages` 58/58 ·
  `db:verify` sin drift (25 modelos · 17 enums).
- Capturas: `21-confianza-catalogo.png`, `22-confianza-cabecera.png`,
  `23-confianza-panel.png` y `24-confianza-movil.png`.

## Mejora 3 · Bloque B — Ingesta real sin claves (✅)

Objetivo: que el catálogo deje de depender de datos de demostración sin
necesitar ninguna clave de API.

### Qué se ha añadido
- **`src/lib/providers/shopifyCatalogo.ts`** — cliente del catálogo público de
  Shopify (`/products.json`): normaliza el dominio, pagina hasta 4 veces, lee
  precio, precio anterior, disponibilidad, imagen y fecha de alta, y devuelve
  un motivo exacto cuando falla (`dominio-invalido`, `bloqueado`, `no-shopify`,
  `formato`, `red`). Nunca lanza y nunca inventa un producto sin precio.
- **`src/lib/coincidencia.ts`** — emparejado de títulos con reglas explícitas:
  sin acentos, sin palabras vacías, singular/plural por prefijo (máximo 3
  letras de diferencia) y umbral del 70 % sobre el título más corto. Añade
  `coincideConTendencia` (exige **todas** las palabras del término) y
  `volumenAproximado` («1M+» → 1 000 000, entendiendo separadores de millar).
- **`src/lib/ingesta.ts`** — guarda el catálogo en `Store`, `StoreProduct`,
  `PriceHistory` y `StoreChange` (alta, cambio de precio y agotado), cruza los
  productos con el catálogo interno y escribe la observación `tiendas` como
  **MEDIDO**. `ingerirTendencias` guarda los términos del día en `TrendingTerm`
  y marca los productos que casan con la fuente `tendencias`.
- **Base de datos**: nueva tabla `TrendingTerm` y tres columnas en
  `StoreProduct` (`externalId`, `available`, `lastSeenAt`), más `Store.origen`
  para separar tiendas de demostración de tiendas leídas en vivo.
  `db:verify` sin drift: **26 modelos · 17 enums**.
- **`/dashboard/fuentes`** — página «Fuentes en vivo» con etiqueta `LIVE` en el
  menú: leer una tienda, leer las tendencias, actualizar todo, estado de cada
  fuente, tiendas leídas, términos del día con los productos que casan y el
  timeline de cambios reales.
- **API**: `POST /api/ingesta` (cron o admin) y `POST /api/ingesta/manual`
  (sesión + 6 lecturas/hora). Flujo `ingesta.yml` cada 6 horas.
- **Sin conexión con Google** el panel de tendencias sirve las guardadas,
  diciendo de qué día son.

### Reglas de honestidad aplicadas
- Si la tienda falla no se crea ni se toca nada: se devuelve el motivo.
- `storesUsing` cuenta **solo** tiendas leídas en vivo (las del seed no suman).
- Un producto que desaparece solo se marca agotado si la lectura fue completa.
- Las tendencias caducan a los 2 días como evidencia (`DIAS_VIGENCIA_EXTRA`).
- `construirProcedencia` ya no rellena con ceros las fuentes sin columna.

### Verificación
- `npm test`: **144 pruebas** (35 nuevas de coincidencia y del parser real).
- `npm run verify:ingesta`: **37/37** — servidor local que imita
  `/products.json`, dos versiones del catálogo, cambios, agotados,
  idempotencia, cruce interno, observación MEDIDA y fallos honestos.
- Batería completa: `db:verify` ✔ (26 modelos · 17 enums, sin drift) · `tsc` ✔
  · `oxlint` 0 avisos · `npm run build` ✔ · `verify:api` 42/42 ·
  `verify:api-v1` 23/23 · `verify:pwa` 18/18 · `verify:confianza` 15/15 ·
  `build:pages` 58 páginas · `verify:pages` **60/60** (incluye la página nueva).
- `verify:confianza` se ha hecho más estricto: comprobaba que solo hubiera
  **un** producto verificado en toda la base; con datos reales ya hay varios,
  así que ahora exige que **todos** los devueltos estén medidos.
- Capturas: `26-fuentes-en-vivo.png`, `27-fuentes-completa.png`,
  `28-fuentes-error-honesto.png`, `29-dashboard-boton-actualizar.png`,
  `30-catalogo-con-datos-reales.png`, `31-movil-fuentes.png`.
- Efecto visible: tras una lectura, «Máscara LED» y «Pistola de masaje»
  pasan de **Estimado** a **Verificado**; el resto sigue estimado.

### Limitación conocida (y cómo se resuelve sola)
El sandbox de desarrollo **no tiene salida a internet**, así que la verificación
usa un servidor local con el mismo formato que Shopify. En el servidor real
(Oracle) la ruta es idéntica y lee las tiendas de verdad: no hay ningún cambio
de código pendiente.

## Mejora 3 · Bloque C — Mantenimiento de la confianza (✅)

Decisión de producto: **ninguna pantalla nueva**. Con 11 secciones ya, añadir
otra para «mirar si los datos están bien» es trabajo para el usuario. Esto se
resuelve por dentro y se cuenta en una línea.

### Qué hace
- **`src/lib/mantenimientoConfianza.ts`** recalcula el nivel de cada producto
  con la evidencia guardada (fechas reales, sin maquillarlas). Si una medición
  supera los 7 días o las fuentes se contradicen, el producto baja de nivel.
- Si un producto **pierde la verificación**, pierde también la marca de
  oportunidad dorada. Los que nunca estuvieron verificados siguen como
  «oportunidad estimada» (así se etiquetan ya) y no generan ruido.
- **Aviso en la campana** (la que ya existe) a quien sigue o guarda ese
  producto, con el motivo («la última medición tiene 11 días»). Máximo un aviso
  al día por producto y usuario: revisar dos veces no duplica nada.
- Se ejecuta **solo** al final de cada ingesta (cada 6 h). También se puede
  lanzar a mano: `POST /api/cron/confianza` (admite `{"simular": true}` para
  ver qué cambiaría sin tocar la base).
- **Una línea** en «Fuentes en vivo»: «Datos al día · 2 de 20 verificados · 4
  con medición real» o, si hay algo que refrescar, «1 con evidencia de más de
  7 días» con enlace al formulario que ya existe. Sin menús ni páginas nuevas.

### Verificación
- `npm run verify:ingesta`: **45/45** (8 nuevas). Crea un producto con
  evidencia de hace 10 días y comprueba que: la auditoría lo detecta, **no**
  modifica la base al solo informar, al revisar baja `VERIFICADO → PARCIAL`,
  deja de ser dorado, se crea **1** aviso con el motivo, y una segunda pasada
  no duplica nada.
- `npm test` 144/144 · `tsc` ✔ · `oxlint` 0 · `build` ✔.
- Capturas: `32-fuentes-datos-caducados.png` (estado de aviso) y
  `26-fuentes-en-vivo.png` (estado al día).

### Lo que NO se ha añadido
Ninguna entrada de menú, ninguna página, ningún botón nuevo en el catálogo. El
sistema se corrige solo y avisa solo.

## Mejora 4 · Equipos y asientos (✅)

Un plan Business o Agency vale para varias personas, pero hasta ahora cada
persona necesitaba su propia suscripción. Ahora el plan se comparte por plazas.

### Reglas (las mismas en la interfaz, la API y la base de datos)
- **Plazas por plan**: Free 1 · Pro 1 · Business 5 · Agency 15. El dueño ocupa
  una.
- **La plaza se ocupa al aceptar**, no al invitar: una invitación olvidada no
  bloquea el equipo.
- **Enlace de un solo uso y 14 días**. Cada invitación nueva invalida la
  anterior y solo funciona con el correo invitado (comprobado contra la sesión).
- **Roles**: `OWNER` (paga y no se puede quitar), `ADMIN` (invita y gestiona
  plazas) y `MEMBER` (usa la plataforma). Un ADMIN no puede nombrar a otro ADMIN
  ni tocar al propietario: evita escaladas dentro del equipo.
- **Plan efectivo** = el más alto entre el propio y el del equipo activo. Se
  recalcula en cada refresco de sesión; al revocar una plaza se vuelve al plan
  propio sin cortar la sesión.
- **Avisos** en la campana que ya existe: al invitar (al invitado) y al aceptar
  (al propietario). Sin correos nuevos ni pantallas extra.

### Dónde está
| Pieza | Fichero |
| --- | --- |
| Reglas y consultas | `src/lib/equipos.ts` |
| API | `src/app/api/equipos/**` |
| Pantalla | `src/app/dashboard/equipos/page.tsx` + `src/components/domain/equipo-panel.tsx` |
| Aceptación pública | `src/app/equipos/aceptar/page.tsx` + `aceptar-invitacion.tsx` |
| Sesión | `src/auth.ts` (plan efectivo + última actividad) |

Se entra desde el menú lateral («Equipo»), visible solo con Business o Agency;
así nadie ve una sección que no puede usar.

### Verificación
`npm run verify:equipos`: **33/33**. Cubre plan insuficiente (402), correo
inválido, invitación que no ocupa plaza, reinvitación que invalida el enlace
anterior, aceptación con otro correo (403), reutilización del enlace (404),
herencia del plan (FREE → BUSINESS), miembro raso que no puede invitar, y
propietario que no se puede quitar.

---

## Mejora 5 · Webhooks a Slack y Discord (✅)

Los avisos ya llegaban a la campana, al correo, a Telegram y al móvil. Faltaba
el sitio donde trabajan los equipos: **Slack, Discord y las automatizaciones**.

### Qué se ha construido
- **Alta en «Notificaciones»**, sin pantalla nueva: destino, nombre, proveedor
  (Slack / Discord / genérico) y los eventos que quieres recibir (`alerta`,
  `producto`, `precio`, `agotado`, `equipo`).
- **Cada evento se emite de verdad** desde el motor de alertas (producto y
  tienda) y al aceptar una invitación de equipo. No hay eventos decorativos.
- **Formato nativo**: Slack con *blocks* y botón al producto; Discord con
  *embed* y color por tipo; genérico con JSON plano para n8n/Make/Zapier.
- **Firma HMAC-SHA256** en `X-TrendHunter-Signature` (`sha256=…`) y evento en
  `X-TrendHunter-Event`, para que la otra punta verifique que el aviso es nuestro.
- **Seguridad**: solo `https`, se rechazan localhost, rangos privados,
  `169.254.169.254`, nombres `.internal`, credenciales en la URL y puertos que
  no sean 443/8443 (SSRF). Máximo 10 webhooks por cuenta y 10 pruebas por hora.
- **Robustez**: tiempo máximo de 8 s por envío, `redirect: "error"`, envíos en
  paralelo con tope de 5 y caché de 60 s de la configuración. Si un webhook
  falla, la alerta ya está guardada: no se pierde nada. El resultado (código y
  error) queda visible en el panel.
- La URL se guarda **ofuscada** en las respuestas y el secreto se muestra una
  única vez, al crearlo.

### Verificación
`npm run verify:equipos` incluye 10 comprobaciones de webhooks: `http://`,
`localhost`, IP de metadatos, alta con eventos, secreto `whsec_…`, prueba
(502 con el motivo cuando no hay red), pausa, y que otro usuario no pueda
borrar el webhook ajeno. Tests unitarios en
`src/lib/__tests__/equiposWebhooks.test.ts` (26 casos: planes, correos, 12 URLs
de SSRF aceptadas/rechazadas, formatos y firma).

> **Limitación honesta del sandbox**: no hay salida HTTPS a internet, así que la
> entrega real se comprueba con `construirCuerpo`/`firmarCuerpo` y con el
> resultado real de `fetch` (que falla y se registra). En el servidor con red,
> el mismo código entrega de verdad.

---

## Revisión transversal de la aplicación (✅)

Ronda de auditoría con criterio de producto: **que todo funcione, que cada botón
haga lo suyo y que se vea bien**. Lo encontrado y corregido:

| Área | Hallazgo | Arreglo |
| --- | --- | --- |
| Seguridad | Alta, recuperación y cambio de contraseña sin límite de ritmo | Límite por IP (5/h en alta y recuperación, 10/h en cambio) con `claveDeIp` |
| Seguridad | Sin cabeceras de seguridad | `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`; `Cache-Control: private, no-store` en `/api/*` |
| Seguridad | Reinvitar a un miembro activo lo sacaba del equipo | 409 «ya forma parte» y se cambia el rol desde la lista |
| Seguridad | Un miembro raso recibía 402 («mejora el plan») al invitar | 403 con el motivo real (permisos) |
| Escalabilidad | Una consulta de webhooks por cada aviso del cron | Caché de 60 s por usuario + envíos en paralelo (5 a la vez) |
| Rendimiento | 20 rutas medidas en dos cuentas: ninguna por encima de 4 s de HTML | — (sin cambios necesarios) |
| Interfaz | 0 enlaces rotos y 0 errores de consola en la navegación real de admin y usuario Pro | `npm run audit:ui` |
| Producto | El evento «equipo» de los webhooks no se emitía | Se emite al aceptar una invitación |
| Datos | `postgres-inicial.sql` se había quedado en 26 tablas | Regenerado: 29 tablas · 20 enums · 222 sentencias |
| Sesión | `/dashboard/equipos` devolvía `null` sin sesión | `redirect("/login")` como el resto del panel |

El único aviso que queda es honesto y esperado: en el sandbox
`/api/tendencias/del-dia` responde 502 porque no hay red, y la pantalla lo dice
mostrando las últimas tendencias guardadas.

## Notas de entorno
- El sandbox borra `node_modules`, `.chromium` y
  `.next` entre turnos: cada ronda empieza con
  `npm install` + `npm run chromium` +
  `npm run build`.
- Para regenerar la DB: `npm run db:setup`
  (bootstrap + seed + verify).
