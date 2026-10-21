#!/usr/bin/env node
/**
 * Capturas de la sección «Fuentes en vivo».
 *
 *   npm run captura:fuentes
 *
 * Requiere el servidor en marcha (`npm start`) y haber ejecutado antes
 * `npm run verify:ingesta` para que haya una tienda leída en la base.
 */
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");
const SALIDA = path.join(process.cwd(), "screenshots-nuevas");

const CUENTA = { email: "admin@trendhunter.pro", password: "admin1234" };

async function iniciarSesion(pagina) {
  for (let intento = 1; intento <= 4; intento += 1) {
    await pagina.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(2_000);
    await pagina.fill("#email", CUENTA.email);
    await pagina.fill("#password", CUENTA.password);
    await pagina.click('button[type="submit"]');
    await pagina.waitForTimeout(4_500);
    if (pagina.url().includes("/dashboard")) return true;
  }
  return false;
}

async function main() {
  if (!existsSync(EJECUTABLE)) {
    console.error(`[captura] Falta Chromium en ${EJECUTABLE}. Ejecuta npm run chromium.`);
    process.exit(1);
  }
  mkdirSync(SALIDA, { recursive: true });

  const navegador = await chromium.launch({
    executablePath: EJECUTABLE,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars"],
    env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
  });

  try {
    const contexto = await navegador.newContext({
      viewport: { width: 1600, height: 1250 },
      locale: "es-ES",
      timezoneId: "Europe/Madrid",
      colorScheme: "dark",
    });
    const pagina = await contexto.newPage();

    if (!(await iniciarSesion(pagina))) throw new Error("No se pudo iniciar sesión");

    // 1 · Página completa de fuentes en vivo.
    await pagina.goto(`${BASE_URL}/dashboard/fuentes`, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(1_500);
    await pagina.screenshot({ path: path.join(SALIDA, "26-fuentes-en-vivo.png") });
    console.log("[captura] 26-fuentes-en-vivo.png");

    // 2 · Página completa (todo el scroll) para revisar el final.
    await pagina.screenshot({ path: path.join(SALIDA, "27-fuentes-completa.png"), fullPage: true });
    console.log("[captura] 27-fuentes-completa.png");

    // 3 · Estado del formulario tras intentar leer una tienda que no responde.
    await pagina.fill("#dominio-tienda", "dominio-que-no-existe.invalid");
    await pagina.click('button:has-text("Leer catálogo")');
    await pagina.waitForTimeout(9_000);
    await pagina.screenshot({ path: path.join(SALIDA, "28-fuentes-error-honesto.png") });
    console.log("[captura] 28-fuentes-error-honesto.png");

    // 4 · Panel general con el botón nuevo.
    await pagina.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(1_200);
    await pagina.screenshot({ path: path.join(SALIDA, "29-dashboard-boton-actualizar.png") });
    console.log("[captura] 29-dashboard-boton-actualizar.png");

    // 5 · Ficha de un producto con la observación de tiendas medida.
    await pagina.goto(`${BASE_URL}/dashboard/winning-products`, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(1_200);
    await pagina.screenshot({ path: path.join(SALIDA, "30-catalogo-con-datos-reales.png") });
    console.log("[captura] 30-catalogo-con-datos-reales.png");

    // 6 · Móvil.
    await pagina.setViewportSize({ width: 414, height: 900 });
    await pagina.goto(`${BASE_URL}/dashboard/fuentes`, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(1_500);
    await pagina.screenshot({ path: path.join(SALIDA, "31-movil-fuentes.png") });
    console.log("[captura] 31-movil-fuentes.png");

    await contexto.close();
  } finally {
    await navegador.close();
  }
}

main().catch((error) => {
  console.error("[captura] Error:", error.message);
  process.exit(1);
});
