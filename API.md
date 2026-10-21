# API pública v1 · TrendHunter Pro

API de **solo lectura** sobre el catálogo de productos ganadores, las tiendas
analizadas y las series de tendencia. Cada cifra conserva su **procedencia**
(`MEDIDO`, `IMPORTADO` o `ESTIMADO`), su **fuente** y su **fecha de medición**.

- Incluida en los planes **Business** y **Agency**.
- Claves gestionadas desde el panel: **`/dashboard/api`**.
- Especificación generada automáticamente: **`/api/v1/openapi`** (OpenAPI 3.1).

---

## 1 · Autenticación

Se aceptan las dos cabeceras habituales del sector:

```bash
curl "https://tudominio.com/api/v1/productos?porPagina=3" \
  -H "Authorization: Bearer thp_live_TU_CLAVE"
```

```bash
curl "https://tudominio.com/api/v1/productos?porPagina=3" \
  -H "X-API-Key: thp_live_TU_CLAVE"
```

**Cómo se guardan las claves.** Al crearlas se genera un secreto aleatorio de
24 bytes (`thp_live_…`). En la base de datos solo se persiste su **hash
SHA-256** y un **prefijo** identificable: el valor completo se muestra una
única vez en el panel. Si se pierde, se revoca y se crea otra. Las claves
revocadas dejan de funcionar al instante (no se borran: conservan la
auditoría de uso).

| Plan | Peticiones/minuto | Peticiones/día | Claves activas |
| --- | --- | --- | --- |
| Business | 60 | 5.000 | 5 |
| Agency | 300 | 50.000 | 20 |

Las cuotas se aplican **por clave**, no por usuario: separa integraciones y
podrás revocar una sin afectar a las demás.

---

## 2 · Formato de las respuestas

Todas las respuestas comparten la misma envoltura:

```json
{
  "data": [ ... ],
  "meta": {
    "version": "1",
    "generadoEn": "2026-10-20T19:40:00.000Z",
    "fuente": "TrendHunter Pro",
    "total": 24,
    "pagina": 1,
    "porPagina": 12
  }
}
```

Los errores son estables y programables:

```json
{
  "error": { "codigo": "PARAMETRO_INVALIDO", "mensaje": "El parámetro «porPagina» debe ser menor o igual que 50." },
  "meta": { "version": "1", "generadoEn": "..." }
}
```

| Estado | Código | Significado |
| --- | --- | --- |
| 400 | `PARAMETRO_INVALIDO` | Un filtro o parámetro no es válido |
| 401 | `SIN_CLAVE` | Falta la cabecera de autenticación |
| 401 | `CLAVE_INVALIDA` | La clave no existe o tiene un formato incorrecto |
| 401 | `CLAVE_REVOCADA` | La clave fue revocada desde el panel |
| 403 | `PLAN_INSUFICIENTE` | El plan del propietario no incluye la API |
| 404 | `NO_ENCONTRADO` | El recurso solicitado no existe |
| 429 | `LIMITE_RITMO` | Superado el límite por minuto (incluye `Retry-After`) |
| 429 | `CUOTA_DIARIA` | Cuota diaria agotada (se reinicia a medianoche UTC) |
| 502 | `FUENTE_NO_DISPONIBLE` | Una fuente externa (Google Trends) no respondió |

**Cabeceras de cuota** en cada respuesta aceptada:

```
X-RateLimit-Limit: 60        X-Quota-Limit: 5000
X-RateLimit-Remaining: 59    X-Quota-Remaining: 4999
X-RateLimit-Window: 60       X-API-Version: 1
```

La API responde a `OPTIONS` con CORS abierto (`Access-Control-Allow-Origin: *`),
así que puede consumirse desde el navegador.

---

## 3 · Endpoints

### `GET /api/v1` — índice (público)

Devuelve la lista de endpoints, la forma de autenticarse y los límites por
plan. No requiere clave: sirve para descubrimiento y monitorización.

### `GET /api/v1/productos`

Catálogo paginado con filtros y orden.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `pagina` | entero 1–1000 | Página solicitada (por defecto 1) |
| `porPagina` | entero 1–50 | Tamaño de página (por defecto 12) |
| `busqueda` | texto | Busca en título, descripción y nicho |
| `categoria` | `Salud` \| `Belleza` \| `Tecnología` \| `Mascotas` \| `Hogar` \| `Fitness` | Categoría |
| `nicho` | texto | Nicho exacto (p. ej. `Crioterapia facial`) |
| `saturacion` | `LOW` \| `MEDIUM` \| `HIGH` | Saturación del nicho |
| `minScore` | entero 0–100 | TrendScore mínimo |
| `minMargen` | decimal 0–100 | Margen estimado mínimo (%) |
| `minPrecio` / `maxPrecio` | decimal | Rango de precio de venta sugerido |
| `dorados` | booleano | Solo oportunidades doradas |
| `verificados` | booleano | Solo productos con 2+ fuentes medidas en los últimos 7 días |
| `orden` | `recientes` \| `score` \| `margen` \| `saturacion` \| `velocidad` \| `facturacion` | Orden (por defecto `score`) |

En `meta` se devuelven los filtros aplicados y los enlaces `anterior` /
`siguiente` listos para reutilizar.

```bash
# Los 20 productos de Belleza con mejor margen
curl "https://tudominio.com/api/v1/productos?categoria=Belleza&orden=margen&porPagina=20" \
  -H "Authorization: Bearer thp_live_TU_CLAVE"

# Solo lo que está confirmado por dos fuentes externas
curl "https://tudominio.com/api/v1/productos?verificados=1" \
  -H "Authorization: Bearer thp_live_TU_CLAVE"
```

Cada producto incluye su confianza para que puedas filtrar en tu propio
sistema:

| Campo | Tipo | Qué significa |
| --- | --- | --- |
| `confianza` | entero 0–100 | Cobertura (45) + frescura (25) + diversidad (15) + consistencia (15) |
| `nivelConfianza` | `VERIFICADO` \| `PARCIAL` \| `ESTIMADO` \| `SIN_DATOS` | `VERIFICADO` exige 2+ fuentes medidas en 7 días y 60 puntos |
| `fuentesMedidas` | entero | Fuentes independientes con medición real |
| `ultimaMedicion` | fecha ISO o `null` | Última observación medida |

`ESTIMADO` no es un error: significa que las cifras salen del motor interno y
ninguna fuente externa las ha confirmado todavía.

### `GET /api/v1/productos/{id}`

Ficha completa:

- `producto`: métricas agregadas, precios, saturación, tendencia y enlaces de proveedor.
- `metricas`: serie diaria (30 puntos) con `fuente`, `fechaMedicion` y `tipoDato` **por punto**.
- `anuncios`: creatividades detectadas en Ads Spy.
- `tiendas`: tiendas que venden el producto, con precio y unidades estimadas.
- `procedencia`: resumen (fuentes presentes, recuento por tipo, última medición).

### `GET /api/v1/tiendas?limite=20`

Tiendas analizadas ordenadas por facturación estimada (`limite` 1–50).
Cada tienda incluye su `lastScannedAt`: la fecha real del último análisis.

### `GET /api/v1/tiendas/{id}`

Tienda con sus productos y el timeline de cambios detectados (`cambios`).

### `GET /api/v1/tendencias?dias=30`

Serie diaria agregada del catálogo (media del TrendScore, búsquedas de Google,
vídeo de TikTok, anuncios de Meta). `dias` va de 7 a 30. En `meta.procedencia`
se indica la última medición real y cuántas observaciones aporta cada fuente.

### `GET /api/v1/tendencias/del-dia?geo=ES`

Términos más buscados hoy según el **feed RSS oficial de Google Trends**
(dato `MEDIDO`, cacheado 5 minutos). `geo` admite `ES, US, MX, AR, CO, CL, FR,
DE, IT, GB`. Si Google no responde, la API devuelve `502 FUENTE_NO_DISPONIBLE`
en lugar de inventar datos.

### `GET /api/v1/estadisticas`

KPIs agregados del catálogo: productos activos, oportunidades doradas,
anuncios, tiendas, TrendScore medio, margen medio, facturación mensual
estimada, saturación por nivel y reparto por categoría. No expone datos de
usuarios.

### `GET /api/v1/openapi`

Especificación OpenAPI 3.1 completa. Ruta pública: permite importar el contrato
en Postman/Insomnia o generar un cliente con `openapi-generator` sin exponer
ninguna clave.

```bash
curl -s https://tudominio.com/api/v1/openapi -o trendhunter-openapi.json
npx openapi-typescript trendhunter-openapi.json -o tipos-api.ts
```

---

## 4 · Gestión de claves (sesión de usuario)

Estas rutas usan la **sesión del panel**, no una clave de API:

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/api-keys` | Claves del usuario (nunca el hash) |
| `POST` | `/api/api-keys` | Crea una clave y devuelve el valor **una vez** |
| `DELETE` | `/api/api-keys/{id}` | Revoca la clave (no la borra: auditoría) |

### Equipos (Business y Agency)

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/equipos` | Equipo propio, equipos en los que participa y plan efectivo |
| `POST` | `/api/equipos` | Crea el equipo (`{ "nombre": "…" }`); 402 sin plazas en el plan |
| `POST` | `/api/equipos/invitaciones` | `{ "email", "role": "ADMIN"\|"MEMBER" }` → enlace de un solo uso |
| `GET` | `/api/equipos/invitaciones?token=` | Datos públicos de la invitación (sin ids internos) |
| `POST` | `/api/equipos/invitaciones/aceptar` | `{ "token" }`; exige sesión con el correo invitado |
| `PATCH` | `/api/equipos/miembros/{id}` | `{ "role" }`; un ADMIN no puede nombrar ADMIN |
| `DELETE` | `/api/equipos/miembros/{id}` | Revoca la plaza (el OWNER no se puede quitar) |

Plazas: Free 1 · Pro 1 · Business 5 · Agency 15. La plaza se ocupa al aceptar,
no al invitar. El enlace caduca a los 14 días y cada invitación nueva invalida
la anterior.

### Webhooks salientes

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/webhooks` | Webhooks del usuario (URL ofuscada y prefijo del secreto) |
| `POST` | `/api/webhooks` | `{ "nombre", "url", "provider", "eventos": [] }`; devuelve el secreto una vez |
| `PATCH` | `/api/webhooks/{id}` | Pausa, reanuda, cambia nombre, URL o eventos |
| `DELETE` | `/api/webhooks/{id}` | Borra |
| `POST` | `/api/webhooks/{id}/probar` | Envío de prueba real (10/hora) |

Eventos: `alerta`, `producto`, `precio`, `agotado`, `equipo`. Solo se admiten
URLs `https` públicas (se rechazan localhost, rangos privados, metadatos del
cloud, credenciales en la URL y puertos distintos de 443/8443). Cada envío
lleva `X-TrendHunter-Signature: sha256=<hmac>` calculado con el secreto y
`X-TrendHunter-Event` con el evento.

---

## 5 · Ejemplos

**JavaScript / TypeScript**

```ts
const respuesta = await fetch("https://tudominio.com/api/v1/productos?orden=margen", {
  headers: { Authorization: `Bearer ${process.env.TRENDHUNTER_API_KEY}` },
});
if (!respuesta.ok) {
  const { error } = await respuesta.json();
  throw new Error(`${error.codigo}: ${error.mensaje}`);
}
const { data, meta } = await respuesta.json();
```

**n8n / Make** — nodo *HTTP Request*:

1. Método `GET`, URL `https://tudominio.com/api/v1/tendencias/del-dia?geo=ES`.
2. Cabecera `Authorization: Bearer thp_live_…`.
3. Activa *Retry on fail* con espera progresiva y respeta `Retry-After`.

**Google Sheets (Apps Script)**

```js
function productosGanadores() {
  const respuesta = UrlFetchApp.fetch(
    "https://tudominio.com/api/v1/productos?orden=score&porPagina=25",
    { headers: { Authorization: "Bearer thp_live_TU_CLAVE" } },
  );
  const { data } = JSON.parse(respuesta.getContentText());
  return data.map((p) => [p.title, p.category, p.trendScore, p.estimatedMargin]);
}
```

---

## 6 · Buenas prácticas

1. **Cachea** las listas entre 5 y 15 minutos: el catálogo se recalcula a diario.
2. **Pagina** con `porPagina` ≤ 50 y guarda el número de página.
3. **Respeta `Retry-After`** ante un `429`: no reintentes en bucle.
4. **Una clave por integración**: si una se compromete, revócala sin romper el resto.
5. **Nunca** pongas la clave en código de navegador ni en repositorios públicos:
   úsala solo desde servidor o un gestor de secretos.
6. **Interpreta las cifras con su procedencia**: `ESTIMADO` es una estimación
   del motor interno; `MEDIDO` proviene de una fuente externa con su fecha.

---

## 7 · Verificación automática

```bash
npm run verify:api-v1     # 23 comprobaciones de punta a punta
```

Recorre el flujo real: crea la clave desde el panel, llama a todos los
endpoints, prueba filtros y errores, fuerza el `429`, revoca la clave y confirma
que deja de autenticar.
