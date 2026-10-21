# PLAN · TrendHunter Pro

SaaS de investigación de productos y tendencias para
e-commerce. Datos reales con procedencia, coste 0 €/mes
en el nivel gratis, despliegue en Oracle Cloud Always
Free + Supabase.

---\

## 1 · Producto

- **Qué es**: panel para encontrar productos ganadores,
  espiar anuncios, analizar tiendas Shopify y seguir
  tendencias — con la procedencia de cada cifra
  (fuente + fecha + tipo: MEDIDO / IMPORTADO / ESTIMADO).
- **Cuña**: datos reales verificables, precio y acceso
  (perfil gratis con datos reales, prueba completa sin
  tarjeta) frente a la competencia (59 €/mes sin prueba).

## 2 · Arquitectura

| Pieza | Elección |
| --- | --- |
| App | Next.js 16 (App Router) + TypeScript |
| BD | Supabase (PostgreSQL) · pooler 6543 + directa 5432 |
| Servidor | Oracle Cloud Always Free (VM 24/7, Docker) |
| Pagos | Stripe (modo test → live) |
| Correo | Brevo (300/día gratis) |
| IA | Gemini Flash (1.500 peticiones/día gratis) |
| Scraping | Playwright + catálogo público de Shopify |
| Cron | GitHub Actions (captura 06:00 UTC, alertas 30 min) |
| Estático | GitHub Pages (`docs/`, 52 páginas) |

**Modo de costes** (`MODO_COSTES`): `gratis` (solo
proveedores sin coste) o `produccion` (todos). Un
switch, sin código.

## 3 · Fases (F0–F10, todas completas)

- **F0** Esqueleto y modo de costes: `MODO_COSTES`,
  `/api/health`, `/api/diagnostics`, registro de
  proveedores con modalidad.
- **F1** Procedencia de datos: `TipoDato` en cada
  métrica; insignia en el panel.
- **F2** Proveedores gratis: YouTube Data API, RSS de
  Google Tendencias, importador CSV/JSON, TikTok
  Creative Center (vía gris, opt-in).
- **F3** Captura diaria + cron en GitHub Actions.
- **F4** Supabase listo: pooler + DIRECT_URL,
  migraciones automáticas, respaldos.
- **F5** Pagos (Stripe test), planes 0/19/49/149 $,
  modo agencia (clientes).
- **F6** Extensión Chrome MV3 (local) + deep link
  `?url=` con autoanálisis.
- **F7** Informes PDF con marca de agua del plan y
  procedencia (cuota EXPORT).
- **F8** Escalabilidad: caché TTL, reintentos, rate
  limiting, logs JSON, monitor de uptime.
- **F9** Despliegue: `DESPLEGUE.md`, `desplegar.sh`,
  capturas, verificación completa.
- **F10** Histórico de precios (gráficas), alertas de
  caída de precio y ficha de extensión para la
  Chrome Web Store.

Detalle fase a fase y verificaciones: **`PROGRESS.md`**.
Guía de desarrollo: **`DESARROLLO.md`** (si existe).

## 4 · Costes del sistema completo en marcha

| Pieza | Gratis | Salto de pago |
| --- | --- | --- |
| Servidor 24/7 | Oracle Always Free | ~5 $/mes VPS básico |
| Base de datos | Supabase Free | ~25 $/mes Pro |
| Cron | GitHub Actions (gratis) | — |
| Correo | Brevo 300/día | ~9 €/mes |
| IA | Gemini 1.500/día | ~45 $/mes |
| Vídeo | YouTube 100 búsquedas/día | — |
| Tendencias | RSS oficial | SerpAPI 25 $/mes |
| TikTok | Creative Center (vía gris, opt-in) | Apify 39 $/mes |

**Techo real del modo gratis: 0 €/mes.**

## 5 · Riesgos

- **Vías grises** (TikTok Creative Center): pueden
  romperse; son opt-in y nunca la única fuente.
- **Supabase free** pausa proyectos inactivos: el cron
  diario lo mantiene activo.
- **Oracle free**: verificar política vigente al
  renovar; la app es portable (Docker).

## 6 · Qué NO es gratis

- Chrome Web Store: 5 $ una vez (cuenta de desarrollador).
- Dominio propio: ~10–15 €/año.
- Proveedores de pago (SerpAPI, Apify): solo en
  `MODO_COSTES=produccion`.

## 7 · Reglas del plan

- Todo listo en el repo para «colocar claves → publicar
  → conectar dominios», sin código pendiente.
- Los datos son reales: ninguna cifra sin fuente y fecha.
- Primer usuario = el dueño, todo gratis.
- Sistema de pagos creado y probado, no obligatorio.
- Sistema profesional y escalable.
