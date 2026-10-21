# Cómo se construyó TrendHunter Pro · paso a paso

> Guía de desarrollo del SaaS: arquitectura, decisiones
> y orden de construcción. Pensada para que cualquier
> persona (con o sin código) entienda qué es cada
> pieza y por qué existe.

---

## 0 · Decisiones previas (antes de escribir código)

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Tipo | SaaS de investigación de productos | Nicho con demanda (la competencia cobra 59 €/mes sin prueba completa) |
| Alojamiento | Oracle Cloud Always Free | Servidor 24/7 gratis para siempre |
| Base de datos | Supabase (PostgreSQL) | Gratis, fiable, respaldos incluidos |
| Pagos | Stripe en modo test | Estándar de la industria |
| Correo | Brevo (300/día gratis) | Transaccional sin coste |
| IA | Gemini Flash (1.500 peticiones/día gratis) | Calidad/precio |
| Frontend | Next.js + React, panel oscuro | Un solo framework: app + API |

**Regla de oro del proyecto:** ninguna cifra sin
**fuente + fecha + tipo de dato** (medido, importado
o estimado). Esa regla definió toda la arquitectura
de datos.

---

## 1 · Esqueleto (Fase 0)

1. Repositorio con Next.js 16 (App Router) + TypeScript.
2. Prisma como capa de datos (23 modelos: usuarios,
   productos, tiendas, métricas, seguimientos,
   alertas, clientes, histórico de precios…).
3. Variable `MODO_COSTES` (`gratis`|`produccion`):
   decide qué proveedores se intentan. Un solo
   switch, sin tocar código.
4. `/api/health` público (estado, modo, latencia,
   conteos) y `/api/diagnostics` (qué integraciones
   están vivas).

## 2 · Motor de tendencias (Fase 1)

- `src/lib/trendEngine.ts`: TrendScore (0–100),
  saturación, oportunidad dorada, beneficio
  estimado, ciclo de vida.
- Cada métrica guarda `fuente`, `fechaMedicion` y
  `tipoDato` (`MEDIDO` | `IMPORTADO` | `ESTIMADO`).
- Procedencia visible en la UI (insignia junto a
  cada cifra).

## 3 · Proveedores de datos reales (Fase 2)

- Todos los proveedores devuelven el mismo contrato:
  `{ datos, error, latenciaMs }` — nunca lanzan.
- Proveedores gratis: Shopify (catálogo público),
  Meta Ad Library, YouTube Data API, RSS de Google
  Tendencias, importador CSV/JSON.
- De pago (opcionales): SerpAPI, Apify. Vía gris
  opt-in: TikTok Creative Center.
- Registro central en `src/lib/providers/index.ts`.

## 4 · Captura diaria (Fase 3)

- `trendCapture` lee proveedores, persiste puntos
  con procedencia y recalcula scores.
- GitHub Actions: captura a las 06:00 UTC y alertas
  cada 30 min, con `CRON_SECRET` compartido.

## 5 · Auth, roles y límites (Fases 0–5)

- NextAuth (credenciales + Google), verificación de
  email, recuperación de contraseña, roles USER/ADMIN.
- Cuotas por plan en `planLimits.ts` (vistas, IA,
  análisis, guardados, seguimientos, exportaciones)
  con puerta 402.

## 6 · Panel y funciones (Fases 0–6)

- Dashboard oscuro, ⌘K búsqueda global, comparadores,
  Winning Products, Ads Spy, Shop Analyzer
  (Playwright), Store/Product Tracker, AI Studio,
  Admin.
- Extensión Chrome MV3 (local): detecta Shopify y
  deep-links al analizador con `?url=`.

## 7 · Pagos y modo agencia (Fase 5)

- Stripe: checkout, portal del cliente, webhook,
  4 planes (FREE 0 $ · PRO 19 $ · BUSINESS 49 $ ·
  AGENCY 149 $).
- Modo agencia: clientes propios, asignación a
  seguimientos.

## 8 · Informes PDF (Fase 7)

- `@react-pdf/renderer` en el servidor: informe de
  producto y de tienda, marca de agua del plan,
  procedencia de cada cifra.
- Cuota EXPORT del plan.

## 9 · Escalabilidad (Fase 8)

- Caché TTL para lecturas a proveedores, reintentos
  exponenciales, rate limiting por usuario, logs
  estructurados JSON, monitor de uptime con aviso
  por Telegram.

## 10 · Precios y alertas (Fase 10)

- `PriceHistory`: instantánea real del precio en
  cada análisis.
- Gráfica de evolución y detección de caídas ≥ 5 %
  → evento `PRICE_CHANGE` → alerta por email/
  Telegram a tiendas seguidas.

## 11 · Despliegue (Fase 9)

- `DESPLEGUE.md` + `desplegar.sh`: Docker Compose
  con app, PostgreSQL y Redis; migraciones automáticas
  al arrancar; Caddy para HTTPS; GitHub Pages para
  el sitio estático.

---

## Flujo de un dato real (ejemplo)

```
RSS Google Trends ─┐
YouTube Data API ──┼─→ trendCapture ─→ TrendMetric ─→ trendEngine ─→ UI + alertas
Shopify público ───┘   (fuente,      (con fuente    (TrendScore)
                            fecha, tipo)  y fecha)
```

Si un proveedor falla: el dato se marca `ESTIMADO`
y se dice como tal. Nunca se inventa una cifra.

## Cómo seguir desarrollando

1. `npm install` → `npm run db:setup` → `npm run dev`.
2. Toca código; `npm test` (65 tests) +
   `npm run build` antes de nada.
3. Documenta la fase en `PROGRESS.md`.
4. Despliega con `bash desplegar.sh`.
