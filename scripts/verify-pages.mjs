/**
 * Verificación de páginas: recorre todas las rutas con sesiones reales (usuario
 * y administrador) y reporta el código HTTP, el título visible y los errores de
 * consola, incluidos los avisos de hidratación de React.
 *
 *   npm run verify:pages
 *
 * Variables opcionales: BASE_URL, CHROMIUM_PATH, DEMO_EMAIL, DEMO_PASSWORD.
 */
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");

const CUENTAS = {
  usuario: { email: process.env.DEMO_EMAIL ?? "demo@trendhunter.pro", password: process.env.DEMO_PASSWORD ?? "demo1234" },
  admin: { email: process.env.ADMIN_EMAIL ?? "admin@trendhunter.pro", password: process.env.ADMIN_PASSWORD ?? "admin1234" },
};

const RUTAS_PUBLICAS = ["/login", "/register", "/forgot-password", "/reset-password", "/pricing"];
const RUTAS_PANEL = [
  "/dashboard",
  "/dashboard/winning-products",
  "/dashboard/ads-spy",
  "/dashboard/fuentes",
  "/dashboard/shop-analyzer",
  "/dashboard/store-tracker",
  "/dashboard/product-tracker",
  "/dashboard/suppliers",
  "/dashboard/ai-studio",
  "/dashboard/settings",
  "/dashboard/settings/billing",
  "/dashboard/settings/notifications",
];
const RUTAS_ADMIN = ["/dashboard/admin"];

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

/** Crea un contexto de navegador nuevo (sesión aislada). */
async function nuevoContexto() {
  return navegador.newContext({ locale: "es-ES", colorScheme: "dark", viewport: { width: 1600, height: 1000 } });
}

/**
 * Inicia sesión esperando la hidratación del formulario.
 * @returns {Promise<boolean>} `true` si se llegó al panel.
 */
async function iniciarSesion(pagina, cuenta, problemas) {
  for (let intento = 1; intento <= 4; intento += 1) {
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await pagina.waitForTimeout(3000);
    await pagina.fill("#email", cuenta.email);
    await pagina.fill("#password", cuenta.password);
    await pagina.click('button[type="submit"]');
    await pagina.waitForTimeout(5000);
    if (pagina.url().includes("/dashboard")) return true;
    problemas.push(`reintento de inicio de sesión ${intento}: ${pagina.url()}`);
  }
  return false;
}

/** Visita una ruta y recoge estado, títulos y avisos de consola. */
async function visitar(pagina, ruta) {
  const problemas = [];
  const escuchar = (mensaje) => {
    if (mensaje.type() !== "error") return;
    const texto = mensaje.text().slice(0, 240);
    problemas.push(texto.includes("Hydration") ? `HIDRATACIÓN: ${texto}` : `consola: ${texto}`);
  };
  const escucharExcepcion = (error) => problemas.push(`excepción: ${String(error).slice(0, 240)}`);
  pagina.on("console", escuchar);
  pagina.on("pageerror", escucharExcepcion);

  let estado = 0;
  try {
    const respuesta = await pagina.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    estado = respuesta?.status() ?? 0;
    await pagina.waitForTimeout(1500);
  } catch (error) {
    problemas.push(`navegación: ${String(error).slice(0, 200)}`);
  }

  const h1 = await pagina.locator("h1").first().textContent().catch(() => null);
  pagina.off("console", escuchar);
  pagina.off("pageerror", escucharExcepcion);

  return { ruta, estado, h1: (h1 ?? "").trim().slice(0, 46), problemas };
}

/**
 * Ejecuta una pasada completa de comprobaciones con una cuenta.
 * @param {"usuario"|"admin"} perfil
 */
async function pasada(perfil) {
  const contexto = await nuevoContexto();
  const pagina = await contexto.newPage();
  const filas = [];
  const problemas = [];
  const esAdmin = perfil === "admin";

  if (!(await iniciarSesion(pagina, CUENTAS[perfil], problemas))) {
    filas.push({ ruta: `LOGIN ${CUENTAS[perfil].email}`, estado: 0, h1: "fallo de inicio de sesión", problemas, esperado: true, estadoEsperado: 200 });
    await contexto.close();
    return { filas, api: [], esAdmin };
  }

  filas.push({
    ruta: `LOGIN ${CUENTAS[perfil].email}`,
    estado: 200,
    h1: `plan=${await pagina.evaluate(async () => (await (await fetch("/api/auth/session")).json())?.user?.planType ?? "-")}`,
    problemas: [...problemas],
    esperado: true,
    estadoEsperado: 200,
  });

  for (const ruta of [...RUTAS_PUBLICAS, ...RUTAS_PANEL, ...RUTAS_ADMIN]) {
    const fila = await visitar(pagina, ruta);
    // Con un usuario normal, /dashboard/admin devuelve 404 de forma deliberada.
    const esAdminRoute = RUTAS_ADMIN.includes(ruta);
    fila.esperado = !esAdminRoute || esAdmin;
    fila.estadoEsperado = esAdminRoute && !esAdmin ? 404 : 200;
    // Los errores de consola del 404 deliberado no cuentan como incidencia.
    if (fila.estadoEsperado === 404) fila.problemas = [];
    filas.push(fila);
  }

  // Ficha de producto y ficha de tienda con identificadores reales.
  await pagina.goto(`${BASE}/dashboard/winning-products`, { waitUntil: "domcontentloaded" });
  const detalleProducto = await pagina
    .locator('a[href^="/dashboard/winning-products/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (detalleProducto) filas.push({ ...(await visitar(pagina, detalleProducto)), esperado: true, estadoEsperado: 200 });

  await pagina.goto(`${BASE}/dashboard/store-tracker`, { waitUntil: "domcontentloaded" });
  const detalleTienda = await pagina
    .locator('a[href^="/dashboard/store-tracker/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (detalleTienda) filas.push({ ...(await visitar(pagina, detalleTienda)), esperado: true, estadoEsperado: 200 });

  // APIs visibles desde el navegador con la sesión activa.
  const api = await pagina.evaluate(async (esAdmin) => {
    const rutas = [
      "/api/products?pageSize=3",
      "/api/saved-products",
      "/api/trackers/stores",
      "/api/trackers/products",
      "/api/notifications",
      "/api/ai",
      "/api/suppliers",
      "/api/shop-analyzer",
      "/api/ai/history",
      ...(esAdmin ? ["/api/admin/stats", "/api/admin/users", "/api/admin/scans"] : []),
    ];
    const salida = [];
    for (const ruta of rutas) {
      try {
        const respuesta = await fetch(ruta);
        salida.push({ ruta, estado: respuesta.status });
      } catch (error) {
        salida.push({ ruta, estado: 0, error: String(error).slice(0, 80) });
      }
    }
    return salida;
  }, esAdmin);

  await contexto.close();
  return { filas, api, esAdmin };
}

const resultados = [await pasada("usuario"), await pasada("admin")];
await navegador.close();

// --- Informe ---
let rutas = 0;
let fallos = 0;
for (const resultado of resultados) {
  console.log(`\n=== PÁGINAS · perfil ${resultado.esAdmin ? "ADMIN" : "USUARIO"} ===`);
  for (const fila of resultado.filas) {
    const ok =
      fila.estadoEsperado === 404
        ? fila.estado === 404
        : fila.esperado && fila.estado >= 200 && fila.estado < 400;
    rutas += 1;
    if (!ok) fallos += 1;
    const nota = fila.estadoEsperado === 404 ? " (404 esperado: sólo ADMIN)" : "";
    console.log(`${ok ? "OK " : "!! "}${String(fila.estado).padEnd(4)} ${fila.ruta.padEnd(42)} h1=${fila.h1}${nota}`);
    for (const problema of fila.problemas) console.log(`      ↳ ${problema}`);
  }

  console.log(`\n=== APIs · perfil ${resultado.esAdmin ? "ADMIN" : "USUARIO"} ===`);
  for (const { ruta, estado, error } of resultado.api) {
    const ok = estado === 200;
    if (!ok) fallos += 1;
    rutas += 1;
    console.log(`   ${ok ? "OK " : "!! "}${ruta} → ${estado}${error ? ` (${error})` : ""}`);
  }
}

console.log(`\n=== RESUMEN: ${rutas - fallos}/${rutas} comprobaciones correctas ===`);
process.exit(fallos > 0 ? 1 : 0);
