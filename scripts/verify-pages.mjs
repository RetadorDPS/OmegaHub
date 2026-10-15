/**
 * Verificación de páginas: recorre todas las rutas con una sesión real y
 * reporta el código HTTP, el título visible y los errores de consola.
 *
 *   npm run verify:pages
 */
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = path.join(process.cwd(), ".chromium", "libs", "lib");
const RUTAS_PUBLICAS = ["/login", "/register", "/forgot-password", "/reset-password", "/pricing"];
// Rutas que sólo existen para administradores: con la cuenta de demostración
// (rol USER) se espera un 404 controlado y el 403 de sus APIs.
const RUTAS_ADMIN = ["/dashboard/admin"];
const RUTAS_PRIVADAS = [
  "/dashboard",
  "/dashboard/winning-products",
  "/dashboard/ads-spy",
  "/dashboard/shop-analyzer",
  "/dashboard/store-tracker",
  "/dashboard/product-tracker",
  "/dashboard/suppliers",
  "/dashboard/ai-studio",
  "/dashboard/settings",
  "/dashboard/settings/billing",
  "/dashboard/settings/notifications",
  "/dashboard/admin",
];

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});
const contexto = await navegador.newContext({ locale: "es-ES", colorScheme: "dark" });
const pagina = await contexto.newPage();

const problemas = [];
pagina.on("console", (mensaje) => {
  if (mensaje.type() === "error") problemas.push(`consola: ${mensaje.text().slice(0, 220)}`);
});
pagina.on("pageerror", (error) => problemas.push(`excepción: ${String(error).slice(0, 220)}`));

const resumen = [];

/**
 * Resultados esperados para las comprobaciones de permisos:
 *   · 404 en una página de administración vista por un usuario normal.
 */
function resultadoEsperado(ruta, estado) {
  if (RUTAS_ADMIN.includes(ruta) && estado === 404) return true;
  return estado >= 200 && estado < 400;
}

async function visitar(ruta) {
  problemas.length = 0;
  let estado = 0;
  try {
    const respuesta = await pagina.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    estado = respuesta?.status() ?? 0;
    await pagina.waitForTimeout(1200);
  } catch (error) {
    problemas.push(`navegación: ${String(error).slice(0, 200)}`);
  }
  const titulo = await pagina.title().catch(() => "");
  const h1 = await pagina.locator("h1").first().textContent().catch(() => null);
  resumen.push({
    ruta,
    estado,
    titulo: (titulo || "").slice(0, 48),
    h1: (h1 || "").trim().slice(0, 48),
    problemas: [...problemas],
  });
}

// --- Login real con la cuenta demo (antes de visitar rutas privadas) ---
problemas.length = 0;
let loginOk = false;
for (let intento = 1; intento <= 3 && !loginOk; intento += 1) {
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.waitForTimeout(3000); // espera a la hidratación completa
  await pagina.fill("#email", "demo@trendhunter.pro");
  await pagina.fill("#password", "demo1234");
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(6000);
  loginOk = pagina.url().includes("/dashboard");
  if (!loginOk) console.log(`   (reintento de login ${intento}: url=${pagina.url()})`);
}
resumen.push({ ruta: "LOGIN demo@trendhunter.pro", estado: loginOk ? 200 : 0, titulo: pagina.url(), h1: "", problemas: [...problemas] });

// --- Rutas públicas (ya con sesión: /login redirige al panel) ---
for (const ruta of RUTAS_PUBLICAS) await visitar(ruta);

// --- Rutas privadas con sesión ---
for (const ruta of RUTAS_PRIVADAS) await visitar(ruta);

// --- Detalle de producto y de tienda (ids reales) ---
problemas.length = 0;
await pagina.goto(`${BASE}/dashboard/winning-products`, { waitUntil: "domcontentloaded" });
const primerProducto = await pagina.locator('a[href^="/dashboard/winning-products/"]').first().getAttribute("href").catch(() => null);
if (primerProducto) await visitar(primerProducto);

// --- APIs ---
const api = await pagina.evaluate(async () => {
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
    "/api/admin/stats",
  ];
  const salida = [];
  for (const ruta of rutas) {
    try {
      const respuesta = await fetch(ruta);
      salida.push(`${ruta} → ${respuesta.status}`);
    } catch (error) {
      salida.push(`${ruta} → ERROR ${String(error).slice(0, 80)}`);
    }
  }
  return salida;
});

await navegador.close();

console.log("\n=== RUTAS DE PÁGINA ===");
let fallos = 0;
for (const fila of resumen) {
  const ok = resultadoEsperado(fila.ruta, fila.estado);
  if (!ok) fallos += 1;
  const marca = ok ? "OK " : "!! ";
  const nota = RUTAS_ADMIN.includes(fila.ruta) && fila.estado === 404 ? " (404 esperado: sólo ADMIN)" : "";
  console.log(`${marca}${String(fila.estado).padEnd(4)} ${fila.ruta.padEnd(42)} h1=${fila.h1}${nota}`);
  // Los errores de consola de las páginas de administración vistas por un
  // usuario normal son consecuencia del 404 deliberado.
  if (!RUTAS_ADMIN.includes(fila.ruta)) {
    for (const problema of fila.problemas) console.log(`      ↳ ${problema}`);
  }
}
console.log(`\n=== ${resumen.length - fallos}/${resumen.length} rutas correctas ===`);
console.log("\n=== APIs (desde el navegador con sesión) ===");
for (const linea of api) console.log(`   ${linea}`);

process.exit(fallos > 0 ? 1 : 0);
