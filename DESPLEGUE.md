# Guión de despliegue · TrendHunter Pro

> Objetivo: de la descarga a la app funcionando en
> **coste 0 €/mes**, con datos reales, en Supabase +
> Oracle Cloud. Sin código que escribir: solo claves,
> publicar y dominios.

---

## 1 · Base de datos: Supabase (gratis)

1. Entra en **supabase.com** → *New project* (plan **Free**).
   - Nombre: `trendhunter` · Contraseña de la DB: guárdala.
   - Región: la más cercana a tu audiencia (Madrid = `eu-central-1`).
2. En *Project Settings → Database* copia **dos** cadenas:
   - **Pooler** (puerto **6543**, *Transaction mode*) → `DATABASE_URL`
   - **Direct** (puerto **5432**) → `DIRECT_URL` (migraciones y respaldos)
3. El esquema lo crea el contenedor solo al arrancar
   (`arranque.mjs` → `db-bootstrap.mjs`, DDL idempotente).
   Si prefieres revisarlo o hacerlo a mano, el SQL completo está
   en **`prisma/postgres-inicial.sql`** (también se regenera con
   `npm run db:migration:postgres`): se pega en *SQL Editor* y se
   pulsa **Run**. Puedes pegarlo las veces que quieras: no
   duplica nada.

> El plan free de Supabase pausa proyectos inactivos.
> Nuestro cron diario (paso 5) lo mantiene activo.

## 2 · Servidor: Oracle Cloud Always Free (0 € permanente)

1. Crea cuenta en **cloud.oracle.com** (tarjeta solo para
   verificar identidad: **no cobra**).
2. *Compute → Instances → Create instance*:
   - Shape: **VM.Standard.A1.Flex** (2 OCPU / 12 GB RAM
     están en el free tier; con 2 OCPU y 6 GB sobra).
   - Imagen: Ubuntu 24.04 · disco: 50 GB (200 GB free).
   - Regla de entrada: puertos **80** y **443**.
3. Conéctate por SSH y copia el repo:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker $USER   # y reconecta la sesión
   git clone <tu-repo> OmegaHub && cd OmegaHub
   cp .env.example .env
   ```
   > La imagen se compila **para PostgreSQL** (`--build-arg
   > DATABASE_PROVIDER=postgresql`, ya incluido en `desplegar.sh`).
   > Prisma fija el motor al generar el cliente: compilar para
   > SQLite y ejecutar contra Supabase daría error de adaptador.

## 3 · Claves (el fichero `.env` del servidor)

| Variable | Obligatoria | Dónde |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | pooler 6543 de Supabase |
| `DIRECT_URL` | ✅ | directa 5432 de Supabase |
| `DATABASE_PROVIDER` | ✅ | `postgresql` |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | ✅ | `https://app.tudominio.com` |
| `CRON_SECRET` | ✅ | `openssl rand -base64 32` (el mismo en GitHub) |
| `MODO_COSTES` | recomendada | `gratis` (o `produccion` si tienes claves de pago) |
| `SMTP_HOST/USER/PASSWORD` | opciones gratis | Brevo: 300 correos/día gratis |
| `YOUTUBE_API_KEY` | gratis | Google Cloud → YouTube Data API v3 |
| `TELEGRAM_BOT_TOKEN/CHAT_ID` | gratis | @BotFather + @userinfobot |
| `FACEBOOK_ACCESS_TOKEN` | gratis | app de Meta verificada |
| `STRIPE_SECRET_KEY/WEBHOOK_SECRET` | cuando cobres | modo test primero |
| `STRIPE_PRICE_PRO/BUSINESS/AGENCY` | cuando cobres | precios 19/49/149 $ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | para push | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | para push | la misma orden (solo en el servidor) |
| `VAPID_SUBJECT` | para push | `mailto:tu@correo.com` |

## 4 · Arrancar (de un comando)

> `desplegar.sh` compila la imagen para PostgreSQL, levanta la app,
> crea el esquema, carga los datos de demostración si la base está
> vacía y comprueba `/api/health`. Es seguro repetirlo: no duplica
> datos. Si usas Supabase, el PostgreSQL local del compose arranca
> pero no se usa (puedes pararlo con `docker compose stop postgres`).


```bash
bash desplegar.sh
```

El script: instala Docker si falta → arranca la app +
PostgreSQL + Redis → migra → siebla datos de demo **solo
si la BD está vacía** → comprueba `/api/health`.

A mano sería lo mismo:
```bash
docker compose build --build-arg DATABASE_PROVIDER=postgresql
docker compose up -d          # crea el esquema y siebla si está vacía
docker compose exec app npm run db:seed   # solo si quieres recargar la demo
curl http://localhost:3000/api/health     # {"estado":"ok",…}
```

El panel de **Configuración → Estado de las integraciones**
(admin) y `/api/diagnostics?clave=<CRON_SECRET>` confirman
qué hay vivo.

## 5 · Cron gratis: GitHub Actions

En el repo: *Settings → Secrets and variables → Actions → New*:
- `APP_URL` = `https://app.tudominio.com`
- `CRON_SECRET` = el mismo del `.env`

Los flujos ya existen y se activan solos al subir el repo:
- `captura-diaria.yml` → 06:00 UTC (también a mano en *Actions*)
- `ingesta.yml` → cada 6 horas: catálogos públicos + tendencias del día
- `alertas.yml` → cada 30 minutos
- `uptime.yml` → `/api/health` cada 10 min; avisa por
  Telegram si la app no responde (necesita
  `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)

## 6 · Dominio y HTTPS

1. Apunta el dominio (registro A a la IP de Oracle) y
   activa HTTPS con Caddy (incluido en `docker-compose.yml`)
   o Cloudflare (proxy gratuito).
2. El sitio estático ya vive en GitHub Pages
   (`https://retadordps.github.io/OmegaHub/`): en *Settings →
   Pages* elige rama `main` y carpeta `/docs`.

## 7 · Stripe (modo test → live)

1. Crea cuenta en stripe.com. *Developers → API keys*:
   `STRIPE_SECRET_KEY=sk_test_…` y publicable.
2. *Webhooks → Add endpoint*: `${APP_URL}/api/stripe/webhook`,
   eventos `checkout.session.completed` → `STRIPE_WEBHOOK_SECRET`.
3. Crea los precios recurrentes (FREE no necesita precio):
   PRO 19 $/mes, BUSINESS 49 $/mes y AGENCY 149 $/mes
   → sus `price_…` en `.env` (`STRIPE_PRICE_PRO`,
   `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_AGENCY`).
4. Prueba con tarjeta **4242 4242 4242 4242**.
5. Para cobrar de verdad: cambia a claves `sk_live_…` y reinicia.

## 7b · Lo que ya funciona sin tocar nada

- **Informes PDF** (cuota EXPORT del plan): botón
  «Informe PDF» en productos y tiendas.
- **Modo agencia** (plan BUSINESS+): página *Clientes*;
  asigna clientes a seguimientos.
- **Histórico de precios**: cada análisis de tienda
  guarda el precio real; gráfica en la ficha de tienda
  y alertas de caída ≥ 5 %.
- **Extensión de Chrome** (`extension/`): carga
  *unpacked* desde chrome://extensions para uso local;
  publicación en `extension/store-listing.md` (5 $).
- **Proveedores gratis** activos sin clave: RSS de
  Google Tendencias, catálogo público de Shopify,
  importación CSV/JSON. Con claves gratis: YouTube
  Data API (100 búsquedas/día), Meta Ad Library.

## 7c · API pública v1 (incluida en Business y Agency)

No hay nada que configurar: funciona con la misma base de datos.

1. Entra con tu cuenta (plan Business o Agency) en
   **Panel → API pública** (`/dashboard/api`).
2. Pulsa **Crear clave**, ponle un nombre («n8n», «Notion»…) y
   **copia la clave**: solo se muestra una vez.
3. Prueba desde la terminal:

   ```bash
   curl "https://TU-DOMINIO/api/v1/productos?porPagina=3" \
     -H "Authorization: Bearer thp_live_TU_CLAVE"
   ```

4. Documentación completa: `API.md` en este repositorio.
   Contrato importable en Postman: `https://TU-DOMINIO/api/v1/openapi`.

Detalles que conviene saber:

- Solo se guarda el **hash SHA-256** de cada clave; el valor en claro
  nunca se almacena. Revocar una clave es inmediato.
- Cuotas por clave: **Business** 60/min y 5.000/día (5 claves);
  **Agency** 300/min y 50.000/día (20 claves).
- Límites en memoria reinician al reiniciar el proceso; la cuota
  diaria se guarda en la propia clave y sobrevive a reinicios.
- La API es de **solo lectura**: no crea productos ni modifica
  seguimientos.
- Verificación automática: `npm run verify:api-v1` (23 pruebas).

## 7d · Notificaciones al móvil (PWA + push, gratis)

La app se instala como aplicación (Android, iPhone y escritorio) y puede
avisar al teléfono con las mismas alertas de la campana.

1. Genera el par de claves **una sola vez** (en tu ordenador o por SSH):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Copia las tres líneas al `.env` del servidor y reinicia:

   ```env
   NEXT_PUBLIC_VAPID_PUBLIC_KEY="B…"
   VAPID_PRIVATE_KEY="…"
   VAPID_SUBJECT="mailto:tu@correo.com"
   ```

3. Abre `https://TU-DOMINIO` en el móvil (debe ser **HTTPS**; los avisos
   push no funcionan en `http://` salvo en `localhost`).

   - **Android/Chrome**: menú ⋮ → *Instalar aplicación*. Después:
     **Configuración → Notificaciones → Avisos al móvil → Activar avisos**.
   - **iPhone/iPad (iOS 16.4 o superior)**: Safari → *Compartir* →
     *Añadir a pantalla de inicio*. Abre la app **desde el icono** y activa
     los avisos ahí (Safari no los ofrece fuera de la app instalada).

4. Pulsa **Enviar prueba**: debe aparecer una notificación del sistema. En la
   misma tarjeta se ven los dispositivos suscritos y cuándo fue el último
   envío.

Detalles que conviene saber:

- Sin claves VAPID **no se rompe nada**: las alertas siguen en la campana y
  se entregan por correo, Telegram y webhook. La tarjeta lo indica.
- Cada navegador es un dispositivo. Si el usuario revoca el permiso o
  desinstala la app, el servicio push responde 404/410 y la suscripción se
  marca como retirada (no se reintenta para siempre).
- La app **no cachea datos**: si no hay red se muestra una pantalla de aviso,
  nunca cifras antiguas. Sí se cachean los recursos estáticos para que abra
  al instante.
- Verificación automática: `npm run verify:pwa` (22 comprobaciones con
  navegador real) y 5 pruebas de `web-push` en `npm test`.

## 7e · Confianza del dato (no hay nada que configurar)

Cada producto lleva un sello que dice si sus cifras están confirmadas por
fuentes externas:

- **Verificado**: dos o más fuentes medidas en los últimos 7 días y 60 puntos
  o más de confianza. Es la única etiqueta que permite llamar a algo
  «Oportunidad dorada».
- **Parcial**: hay medición real, pero de una sola fuente o con datos viejos.
- **Estimado**: solo motor interno (es lo que verás con el catálogo de
  demostración del seed).

El sello se recalcula solo cada vez que el sistema mide (`/api/cron/trends`).
Si cambias datos a mano y quieres refrescarlo:

```bash
npm run confianza:recalcular
```

En la ficha del producto, la pestaña **Confianza** enseña cada fuente con su
tipo, su fecha y un enlace para comprobarla a mano (Google Trends, Meta Ad
Library, YouTube, TikTok o catálogo Shopify). El informe PDF incluye el sello.

**La confianza se mantiene sola.** Al final de cada ingesta el sistema revisa
los productos activos: si una medición ha caducado o las fuentes se
contradicen, el producto baja de nivel, pierde la marca de «oportunidad
dorada» y avisa en la campana a quien lo sigue. No hay nada que configurar y
no hay pantallas nuevas: el resumen aparece en una línea dentro de
**Fuentes en vivo**.

Si quieres forzarlo (por ejemplo, tras importar un CSV antiguo):

```bash
curl -X POST "$APP_URL/api/cron/confianza" -H "x-cron-secret: $CRON_SECRET"
# con {"simular": true} solo informa de lo que cambiaría, sin tocar nada
```

## 7e-bis · Equipos y webhooks (solo Business y Agency)

**Equipos** no necesita configuración. Business incluye 5 plazas y Agency 15; se
gestionan desde **Equipo** en el menú lateral. Las invitaciones son enlaces de
un solo uso válidos 14 días y solo sirven con el correo invitado, así que se
pueden enviar por donde quieras (correo, Slack, WhatsApp).

**Webhooks** se configuran en **Configuración → Notificaciones**. Slack y
Discord ya dan la URL lista para pegar (`https://hooks.slack.com/services/…`,
`https://discord.com/api/webhooks/…`); para n8n, Make o Zapier elige
«Genérico» y verifica la firma:

```js
import crypto from "node:crypto";

const firma = `sha256=${crypto.createHmac("sha256", SECRETO).update(cuerpoCrudo).digest("hex")}`;
const valida = crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(req.headers["x-trendhunter-signature"]));
```

Lo que conviene saber en producción:

- Solo se aceptan URLs **https públicas**. Se rechazan `localhost`, rangos
  privados, `169.254.169.254`, nombres `.internal` y puertos que no sean
  443/8443 (protección contra SSRF).
- Cada envío tiene **8 s** de tiempo máximo y los fallos no bloquean las
  alertas: la notificación ya está guardada en la campana.
- Define `NEXT_PUBLIC_APP_URL` para que los avisos de Slack y Discord incluyan
  el botón al producto. Sin esa variable el aviso llega igual, pero sin enlace.
- Máximo 10 webhooks por cuenta y 10 envíos de prueba por hora.

> En el sandbox de desarrollo no hay salida HTTPS, así que un webhook real
> fallará con `fetch failed` y quedará registrado en el panel. Es el
> comportamiento correcto: no se inventa una entrega.

## 7f · Datos reales sin claves (lo más importante)

Dos fuentes gratuitas y públicas alimentan la base **sin ninguna clave**:

| Fuente | Qué trae | Endpoint |
| --- | --- | --- |
| Catálogo público de Shopify | Productos, precios, disponibilidad y fecha de alta de cualquier tienda Shopify | `https://<tienda>/products.json?limit=250&page=1` |
| Google Trends RSS | Los términos que más crecen hoy en un país | `https://trends.google.com/trending/rss?geo=ES` |

### Cómo se usa desde la aplicación

1. Entra con tu cuenta y abre **Fuentes en vivo** (menú lateral, etiqueta `LIVE`).
2. Escribe el dominio de una tienda Shopify (por ejemplo `allbirds.com`) y
   pulsa **Leer catálogo**.
3. Verás cuántos productos ha leído, cuántos son nuevos, cuántos han cambiado
   de precio y cuáles se han agotado. Cada alta, cambio y agotado aparece en el
   timeline de la tienda.
4. Pulsa **Tendencias de hoy** para guardar los términos del día. Si un término
   aparece en el título de un producto del catálogo, ese producto recibe una
   observación **MEDIDA** con la fecha y deja de ser una estimación.

### Cómo se ejecuta solo

- A mano: `curl -X POST "$APP_URL/api/ingesta" -H "x-cron-secret: $CRON_SECRET"`
- Automático: el flujo `ingesta.yml` lo hace cada 6 horas.

### Garantías (esto es lo que hace que el dato sea de fiar)

- Si la tienda no responde, **no se guarda nada** y se explica el motivo
  (`bloqueado`, `no-shopify`, `formato`, `red`). Nunca se rellena con
  estimaciones.
- `storesUsing` solo cuenta tiendas **leídas en vivo**. Las tiendas de
  demostración del seed no suman.
- Los cambios se detectan comparando dos lecturas. Si solo hay una, no se
  anuncia ningún cambio.
- Un producto que no aparece en el catálogo solo se marca como agotado si la
  lectura fue **completa** (no si se cortó a 750 productos).
- Las tendencias caducan a los 2 días: no se presume de una tendencia vieja.

### Comprobarlo tú mismo

```bash
npm run verify:ingesta      # 37 comprobaciones, sin red externa
```

Abre en el navegador `https://<tienda>/products.json?limit=5` y compara: es
exactamente el JSON que lee el sistema.

## 8 · Respaldos

- Supabase free incluye respaldo diario (7 días).
- Semanal, adicional: GitHub Action que ejecuta
  `DIRECT_URL=… npm run respaldo` (volcado `pg_dump`
  en artifacts, retiene 14).

## 9 · Antes de celebrar

- `/api/health` → `{"estado":"ok"}`
- `/api/diagnostics?clave=…` → proveedores y su estado
- Analiza una tienda real en Shop Analyzer (motor
  `SHOPIFY_PUBLICO` = catálogo real)
- Lee una tienda real en **Fuentes en vivo** y comprueba que el producto
  cruzado pasa de `Estimado` a `Parcial` o `Verificado`
- Sube un CSV de Google Trends a un producto → puntos IMPORTADOS
- Fuerza una alerta → recíbela en Telegram
- Instala la app en el móvil y pulsa **Enviar prueba** en Notificaciones →
  llega la notificación push
- Crea una clave en `/dashboard/api` y llama a `/api/v1/productos`
  (200 con datos; sin clave, 401 `SIN_CLAVE`)
