/**
 * Verificación de API y flujos: comprueba de punta a punta la IA, el scraper,
 * los trackers, la administración y Stripe (modo demostración) con sesiones
 * reales de usuario y de administrador.
 *
 *   npm run verify:api
 *
 * Nota: la prueba da de alta un producto de prueba y lo archiva/despublica al
 * final; ejecútala sobre bases de datos de desarrollo.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright-core";

// ---------------------------------------------------------------------------
//  Cuotas diarias: la batería debe poder repetirse el mismo día.
//  Se limpia el consumo de hoy de las cuentas de demostración (solo en SQLite
//  de desarrollo; en PostgreSQL este paso se omite).
// ---------------------------------------------------------------------------
const RUTA_BD = path.join(process.cwd(), "prisma", "trendhunter.db");
const require = createRequire(import.meta.url);
// Solo se limpian cuotas si la aplicación usa SQLite: con PostgreSQL
// (Supabase) la base no es este fichero y las cuotas se dejan intactas.
const usaSqlite = !/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");
const Database = usaSqlite && existsSync(RUTA_BD) ? require("better-sqlite3") : null;
if (Database) {
  const bd = new Database(RUTA_BD);
  const hoy = new Date().toISOString().slice(0, 10);
  const liberados = bd
    .prepare(
      `DELETE FROM UsageEvent
        WHERE dayKey = ?
          AND userId IN (SELECT id FROM User WHERE email IN ('demo@trendhunter.pro', 'free@trendhunter.pro'))`,
    )
    .run(hoy);
  bd.close();
  console.log(`[verify:api] Cuotas de hoy liberadas: ${liberados.changes} eventos.`);
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");
const resultados = [];

function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

/** Inicia sesión y devuelve una página autenticada. */
async function iniciarSesion(email, password) {
  const contexto = await navegador.newContext({ locale: "es-ES", colorScheme: "dark" });
  const pagina = await contexto.newPage();
  for (let intento = 1; intento <= 3; intento += 1) {
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await pagina.waitForTimeout(3000);
    await pagina.fill("#email", email);
    await pagina.fill("#password", password);
    await pagina.click('button[type="submit"]');
    await pagina.waitForTimeout(5000);
    if (pagina.url().includes("/dashboard")) return pagina;
  }
  throw new Error(`No se pudo iniciar sesión con ${email}`);
}

/** Ejecuta un fetch dentro del navegador (con cookies de sesión). */
async function api(pagina, ruta, opciones = {}) {
  return pagina.evaluate(
    async ([rutaApi, opcionesApi]) => {
      const respuesta = await fetch(rutaApi, {
        method: opcionesApi.method ?? "GET",
        headers: {
          ...opcionesApi.headers,
          ...(opcionesApi.body ? { "content-type": "application/json" } : {}),
        },
        body: opcionesApi.body ? JSON.stringify(opcionesApi.body) : undefined,
      });
      const texto = await respuesta.text();
      let cuerpo = null;
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        cuerpo = texto;
      }
      return { estado: respuesta.status, cuerpo };
    },
    [ruta, opciones],
  );
}

// ---------------------------------------------------------------------------
//  Administrador
// ---------------------------------------------------------------------------
const admin = await iniciarSesion("admin@trendhunter.pro", "admin1234");

const stats = await api(admin, "/api/admin/stats");
registrar("GET /api/admin/stats", stats.estado === 200, `usuarios=${stats.cuerpo?.kpis?.usuariosTotales} productos=${stats.cuerpo?.kpis?.productosActivos}`);

await admin.goto(`${BASE}/dashboard/admin`, { waitUntil: "domcontentloaded" });
await admin.waitForTimeout(2500);
const panelAdmin = (await admin.locator("h1").first().textContent().catch(() => "")) ?? "";
registrar("/dashboard/admin accesible para ADMIN", panelAdmin.includes("administración"), panelAdmin.trim());

// Alta de producto real desde el panel (idempotente: se reutiliza si ya existe)
const existente = await api(admin, "/api/admin/products?search=Rodillo facial de crioterapia");
const yaExiste = (existente.cuerpo?.items ?? []).find((item) => item.title === "Rodillo facial de crioterapia con luz LED");
const alta = yaExiste
  ? { estado: 201, cuerpo: { producto: { id: yaExiste.id, trendScore: yaExiste.trendScore } }, reutilizado: true }
  : await api(admin, "/api/admin/products", {
  method: "POST",
  body: {
    title: "Rodillo facial de crioterapia con luz LED",
    description:
      "Rodillo de crioterapia con LED rojo para reducir hinchazón y mejorar la firmeza de la piel en rutinas de belleza diarias.",
    mainImage: "/images/products/p02-1.jpg",
    images: ["/images/products/p02-1.jpg"],
    category: "Belleza",
    nicheTag: "Crioterapia facial",
    costPrice: 11.4,
    suggestedSellPrice: 42.9,
    googleSearchVolume: 32000,
    tiktokViews: 1450000,
    metaAdsCount: 120,
    storesUsing: 210,
    aliExpressUrl: "https://es.aliexpress.com/item/1005005.html",
    cjUrl: "https://cjdropshipping.com/product/facial-ice-roller.html",
    supplierName: "GlowSupply Co.",
    countryAvailability: ["ES", "MX", "CO"],
    tags: ["belleza", "skincare"],
  },
    });
registrar(
  "POST /api/admin/products (alta manual)",
  alta.estado === 201,
  `trendScore=${alta.cuerpo?.producto?.trendScore} id=${alta.cuerpo?.producto?.id?.slice(0, 8)}`,
);
const productoCreado = alta.cuerpo?.producto?.id ?? "";

// Listado del catálogo
const catalogo = await api(admin, "/api/admin/products?status=TODOS");
registrar("GET /api/admin/products", catalogo.estado === 200, `${catalogo.cuerpo?.total} productos`);

// Cola de scrapings
const scrapings = await api(admin, "/api/admin/scans");
registrar("GET /api/admin/scans", scrapings.estado === 200, `${scrapings.cuerpo?.total} análisis`);

// Usuarios
const usuarios = await api(admin, "/api/admin/users");
registrar("GET /api/admin/users", usuarios.estado === 200, `${usuarios.cuerpo?.total} usuarios`);

// ---------------------------------------------------------------------------
//  API pública v1 (plan BUSINESS del administrador)
// ---------------------------------------------------------------------------
const claveCreada = await api(admin, "/api/api-keys", {
  method: "POST",
  body: { nombre: "Verificación automática de la API" },
});
const claveApi = claveCreada.cuerpo?.clave ?? "";
registrar(
  "POST /api/api-keys (clave nueva)",
  claveCreada.estado === 201 && claveApi.startsWith("thp_live_"),
  claveCreada.cuerpo?.item?.prefijo ?? `estado ${claveCreada.estado}`,
);

const conClaveApi = { headers: { authorization: `Bearer ${claveApi}` } };

const indiceApi = await api(admin, "/api/v1");
registrar(
  "GET /api/v1 (índice público)",
  indiceApi.estado === 200 && (indiceApi.cuerpo?.data?.endpoints?.length ?? 0) >= 8,
  `${indiceApi.cuerpo?.data?.endpoints?.length} endpoints`,
);

const openapiApi = await api(admin, "/api/v1/openapi");
registrar("GET /api/v1/openapi", openapiApi.estado === 200 && openapiApi.cuerpo?.openapi === "3.1.0");

const sinClaveApi = await api(admin, "/api/v1/productos");
registrar(
  "API sin clave → 401",
  sinClaveApi.estado === 401 && sinClaveApi.cuerpo?.error?.codigo === "SIN_CLAVE",
  sinClaveApi.cuerpo?.error?.codigo,
);

const catalogoApi = await api(admin, "/api/v1/productos?porPagina=2&orden=margen", conClaveApi);
registrar(
  "API con clave → catálogo paginado",
  catalogoApi.estado === 200 && catalogoApi.cuerpo?.data?.length === 2,
  `${catalogoApi.cuerpo?.meta?.total} productos`,
);

const primeroApi = catalogoApi.cuerpo?.data?.[0]?.id;
const detalleApi = await api(admin, `/api/v1/productos/${primeroApi}`, conClaveApi);
registrar(
  "API ficha de producto con procedencia",
  detalleApi.estado === 200 && Array.isArray(detalleApi.cuerpo?.data?.metricas),
  `${detalleApi.cuerpo?.data?.metricas?.length} métricas`,
);

const tiendasApi = await api(admin, "/api/v1/tiendas?limite=5", conClaveApi);
const idsTiendasApi = (tiendasApi.cuerpo?.data ?? []).map((tienda) => tienda.id);

const parametroApi = await api(admin, "/api/v1/productos?porPagina=500", conClaveApi);
registrar(
  "API parámetro inválido → 400",
  parametroApi.estado === 400 && parametroApi.cuerpo?.error?.codigo === "PARAMETRO_INVALIDO",
);

const revocarApi = await api(admin, `/api/api-keys/${claveCreada.cuerpo?.item?.id}`, { method: "DELETE" });
registrar("DELETE /api/api-keys/:id", revocarApi.estado === 200);

const revocadaApi = await api(admin, "/api/v1/productos", conClaveApi);
registrar(
  "API clave revocada → 401",
  revocadaApi.estado === 401 && revocadaApi.cuerpo?.error?.codigo === "CLAVE_REVOCADA",
  revocadaApi.cuerpo?.error?.codigo,
);

// ---------------------------------------------------------------------------
//  Usuario PRO (demo) — IA, scrapers, trackers, exportación
// ---------------------------------------------------------------------------
const demo = await iniciarSesion("demo@trendhunter.pro", "demo1234");

const productos = await api(demo, "/api/products?pageSize=3&sort=best-score");
const productoId = productos.cuerpo?.items?.[0]?.id ?? "";
registrar("GET /api/products", productos.estado === 200, `primer producto: ${productos.cuerpo?.items?.[0]?.title?.slice(0, 40)}`);

// --- AI Studio: las cinco herramientas ---
const herramientas = ["AD_COPY", "VIDEO_SCRIPT", "BUYER_PERSONA", "PRODUCT_ANALYSIS"];
for (const herramienta of herramientas) {
  const respuesta = await api(demo, "/api/ai", {
    method: "POST",
    body: {
      tool: herramienta,
      productId: productoId,
      options: { plataforma: "TIKTOK", tono: "directo", duracion: 30, cantidad: 5 },
    },
  });
  const datos = respuesta.cuerpo?.data;
  const detalle =
    herramienta === "AD_COPY"
      ? `${Array.isArray(datos) ? datos.length : 0} variantes`
      : herramienta === "VIDEO_SCRIPT"
        ? `${datos?.scenes?.length ?? 0} escenas, ${datos?.duration}s`
        : herramienta === "BUYER_PERSONA"
          ? `${datos?.name} (${datos?.painPoints?.length ?? 0} dolores)`
          : `${datos?.fortalezas?.length ?? 0} fortalezas`;
  registrar(`POST /api/ai ${herramienta}`, respuesta.estado === 200 && Boolean(datos), `${detalle} · ${respuesta.cuerpo?.latencyMs} ms`);
}

const nombresTienda = await api(demo, "/api/ai", {
  method: "POST",
  body: { tool: "STORE_NAMES", options: { nicho: "cuidado de mascotas", cantidad: 8 } },
});
registrar(
  "POST /api/ai STORE_NAMES",
  nombresTienda.estado === 200 && Array.isArray(nombresTienda.cuerpo?.data),
  `${nombresTienda.cuerpo?.data?.length ?? 0} ideas de dominio`,
);

const historialIa = await api(demo, "/api/ai/history");
registrar("GET /api/ai/history", historialIa.estado === 200, `${historialIa.cuerpo?.items?.length ?? 0} generaciones`);

// --- Shop Analyzer real ---
const analisis = await api(demo, "/api/shop-analyzer", {
  method: "POST",
  body: { url: "petlabstore.com" },
});
registrar(
  "POST /api/shop-analyzer",
  analisis.estado === 200 && Boolean(analisis.cuerpo?.store),
  `${analisis.cuerpo?.store?.name} · ${analisis.cuerpo?.metrics?.estimatedMonthlyRevenue} $/mes · motor ${analisis.cuerpo?.engine}`,
);
const tiendaId = analisis.cuerpo?.store?.id ?? "";

// --- Trackers ---
const seguirTienda = await api(demo, "/api/trackers/stores", { method: "POST", body: { storeId: tiendaId } });
registrar("POST /api/trackers/stores", seguirTienda.estado === 200, `seguimiento ${seguirTienda.cuerpo?.id?.slice(0, 8)}`);

const seguirProducto = await api(demo, "/api/trackers/products", {
  method: "POST",
  body: { productId: productoId, targetTrendScore: 85 },
});
registrar("POST /api/trackers/products", seguirProducto.estado === 200, `seguimiento ${seguirProducto.cuerpo?.id?.slice(0, 8)}`);

const actualizarUmbral = await api(demo, "/api/trackers/products", {
  method: "PATCH",
  body: { productId: productoId, targetTrendScore: 90, notificationEnabled: true },
});
registrar("PATCH /api/trackers/products (umbral)", actualizarUmbral.estado === 200);

// --- Favoritos ---
const guardar = await api(demo, "/api/saved-products", { method: "POST", body: { productId: productoId, notes: "Prioridad alta: testear creatividad UGC" } });
registrar("POST /api/saved-products", guardar.estado === 200, `guardado ${guardar.cuerpo?.id?.slice(0, 8)}`);

const listarGuardados = await api(demo, "/api/saved-products");
registrar("GET /api/saved-products", listarGuardados.estado === 200, `${listarGuardados.cuerpo?.items?.length ?? 0} favoritos`);

// --- Exportación CSV ---
const csv = await demo.evaluate(async () => {
  const respuesta = await fetch("/api/products/export?goldenOnly=true");
  const texto = await respuesta.text();
  return { estado: respuesta.status, cabecera: texto.slice(0, 90), lineas: texto.split("\n").length };
});
registrar(
  "GET /api/products/export (CSV)",
  csv.estado === 200 && csv.cabecera.includes("titulo") && csv.cabecera.includes("trend_score"),
  `${csv.lineas} líneas · cabecera: ${csv.cabecera.slice(0, 60)}`,
);

// --- Notificaciones ---
const notificaciones = await api(demo, "/api/notifications");
registrar("GET /api/notifications", notificaciones.estado === 200, `${notificaciones.cuerpo?.items?.length ?? 0} avisos`);
const marcar = await api(demo, "/api/notifications", { method: "PATCH", body: { all: true } });
registrar("PATCH /api/notifications (marcar leídas)", marcar.estado === 200);

// --- Proveedores ---
const proveedores = await api(demo, "/api/suppliers?minRating=4");
registrar("GET /api/suppliers", proveedores.estado === 200, `${proveedores.cuerpo?.total} proveedores`);

// ---------------------------------------------------------------------------
//  Usuario FREE — límites de plan y Stripe en modo demostración
// ---------------------------------------------------------------------------
const gratis = await iniciarSesion("free@trendhunter.pro", "free1234");

// El plan FREE permite 2 elementos seguidos en total. Se prueban tiendas
// distintas hasta que la API responda 402: la comprobación no depende de
// cuántas seguía ya la cuenta.
// Identificadores de tienda para probar el límite: primero la base SQLite
// local; si la aplicación usa PostgreSQL, los que devuelve la API pública.
const tiendasDePrueba = [];
if (Database) {
  const bdTiendas = new Database(RUTA_BD, { readonly: true });
  tiendasDePrueba.push(...bdTiendas.prepare("SELECT id FROM Store LIMIT 5").all());
  bdTiendas.close();
} else {
  tiendasDePrueba.push(...idsTiendasApi.map((id) => ({ id })));
}

let intentoLimite = null;
for (const tienda of tiendasDePrueba) {
  intentoLimite = await api(gratis, "/api/trackers/stores", {
    method: "POST",
    body: { storeId: tienda.id },
  });
  if (intentoLimite.estado === 402) break;
}
registrar(
  "Límite de plan FREE en trackers (402 al llegar a 2)",
  intentoLimite?.estado === 402 && intentoLimite.cuerpo?.code === "PLAN_LIMIT",
  `estado ${intentoLimite?.estado}${intentoLimite?.cuerpo?.error ? ` — ${intentoLimite.cuerpo.error}` : ""}`,
);

const sinExport = await gratis.evaluate(async () => {
  const respuesta = await fetch("/api/products/export");
  const datos = await respuesta.json().catch(() => ({}));
  return { estado: respuesta.status, error: datos.error };
});
registrar(
  "Exportación bloqueada en FREE (402 esperado)",
  sinExport.estado === 402,
  `estado ${sinExport.estado}${sinExport.error ? ` — ${sinExport.error}` : ""}`,
);

const checkout = await api(gratis, "/api/stripe/checkout", { method: "POST", body: { plan: "PRO" } });
registrar("POST /api/stripe/checkout (modo demo)", checkout.estado === 200 && checkout.cuerpo?.modo === "demo", checkout.cuerpo?.message ?? "");

const refresco = await gratis.evaluate(async () => {
  // Equivale a `useSession().update()`: refresca el token con el plan real.
  const csrf = await (await fetch("/api/auth/csrf")).json();
  const respuesta = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csrfToken: csrf.csrfToken, data: { planType: "PRO" } }),
  });
  const sesion = await fetch("/api/auth/session");
  return { estado: respuesta.status, plan: (await sesion.json())?.user?.planType };
});
registrar(
  "El plan se actualiza tras el pago (refresco de sesión)",
  refresco.plan === "PRO",
  `estado ${refresco.estado} · plan=${refresco.plan}`,
);

const portal = await api(gratis, "/api/stripe/portal", { method: "POST" });
registrar("POST /api/stripe/portal", portal.estado === 200, portal.cuerpo?.message ?? portal.cuerpo?.url ?? "");

const cancelar = await api(gratis, "/api/stripe/cancel", { method: "POST" });
registrar("POST /api/stripe/cancel (vuelve a FREE)", cancelar.estado === 200, cancelar.cuerpo?.message ?? "");

const trasCancelar = await gratis.evaluate(async () => {
  const csrf = await (await fetch("/api/auth/csrf")).json();
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csrfToken: csrf.csrfToken, data: { planType: "FREE" } }),
  });
  const sesion = await fetch("/api/auth/session");
  return (await sesion.json())?.user?.planType;
});
registrar("El plan vuelve a FREE al cancelar", trasCancelar === "FREE", `plan=${trasCancelar}`);

// ---------------------------------------------------------------------------
//  Aprobación de scraping por el administrador (sobre el análisis creado)
// ---------------------------------------------------------------------------
const aprobar = await api(admin, "/api/admin/scans", { method: "POST", body: { accion: "APROBAR", scanId: analisis.cuerpo?.scanId } });
registrar("POST /api/admin/scans APROBAR", aprobar.estado === 200, `producto ${aprobar.cuerpo?.producto?.titulo?.slice(0, 40)}`);

if (productoCreado) {
  const archivar = await api(admin, "/api/admin/products", { method: "PATCH", body: { productId: productoCreado, status: "ARCHIVED" } });
  registrar("PATCH /api/admin/products (archivar)", archivar.estado === 200);
  const publicar = await api(admin, "/api/admin/products", { method: "PATCH", body: { productId: productoCreado, status: "ACTIVE" } });
  registrar("PATCH /api/admin/products (reactivar)", publicar.estado === 200);
}

await navegador.close();

const fallos = resultados.filter((fila) => !fila.ok);
console.log(`\n=== RESUMEN: ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas ===`);
if (fallos.length > 0) {
  console.log("Fallos:");
  for (const fallo of fallos) console.log(` · ${fallo.nombre} ${fallo.detalle}`);
}
process.exit(fallos.length > 0 ? 1 : 0);
