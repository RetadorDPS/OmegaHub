#!/usr/bin/env node
/**
 * E2E de la aplicación (navegador real).
 *
 *   LD_LIBRARY_PATH=.chromium/libs node scripts/verificar-nuevas-funciones.mjs
 *
 * 15 comprobaciones: login, páginas del dashboard,
 * PDF en vivo, cuotas, rate limit y crons.
 */
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = path.join(process.cwd(), ".chromium", "libs");

const LIBROS = [];
function comprobar(nombre, ok) {
  LIBROS.push([nombre, ok]);
  console.log(`${ok ? "✔" : "✘"} ${nombre}`);
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

try {
  const contexto = await navegador.newContext({ locale: "es-ES" });
  const pagina = await contexto.newPage();

  // ── Login demo (PRO) ──
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  await pagina.fill("#email", "demo@trendhunter.pro");
  await pagina.fill("#password", "demo1234");
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(4500);
  comprobar("Login demo redirige al dashboard", pagina.url().includes("/dashboard"));

  // ── Health con modo de costes ──
  const salud = await pagina.evaluate(async (base) => {
    const r = await fetch(`${base}/api/health`);
    return r.json();
  }, BASE);
  comprobar("/api/health informa modoCostes", salud.modoCostes === "gratis");

  // ── Páginas principales responden 200 ──
  for (const ruta of [
    "/dashboard",
    "/dashboard/winning-products",
    "/dashboard/ads-spy",
    "/dashboard/shop-analyzer",
    "/dashboard/store-tracker",
    "/dashboard/product-tracker",
    "/dashboard/ai-studio",
    "/dashboard/settings",
  ]) {
    const codigo = await pagina.evaluate(async (u) => (await fetch(u)).status, `${BASE}${ruta}`);
    comprobar(`Ruta ${ruta} responde 200`, codigo === 200);
  }

  // ── PDF en vivo (producto) ──
  const primera = await pagina.evaluate(async (base) => {
    const r = await fetch(`${base}/api/products?limit=1`);
    const j = await r.json();
    return j.items?.[0]?.id ?? j[0]?.id ?? null;
  }, BASE);
  if (primera) {
    const pdf = await pagina.evaluate(async ({ base, id }) => {
      const r = await fetch(`${base}/api/productos/${id}/informe`, { method: "POST" });
      const b = await r.arrayBuffer();
      return { estado: r.status, tipo: r.headers.get("content-type"), magico: new Uint8Array(b.slice(0, 4)).join(",") === "37,80,68,70" };
    }, { base: BASE, id: primera });
    comprobar("Informe PDF de producto (200, %PDF, application/pdf)",
      pdf.estado === 200 && pdf.magico && Boolean(pdf.tipo?.includes("pdf")));
  } else {
    comprobar("Informe PDF de producto", false);
  }

  // ── Tendencias del día (RSS: 502 sin red es esperado aquí) ──
  const tendencias = await pagina.evaluate(async (base) => (await fetch(`${base}/api/tendencias/del-dia`)).status, BASE);
  comprobar("Tendencias del día responde (200 o 502 sin red)", tendencias === 200 || tendencias === 502);

  // ── Rate limit del analizador ──
  const rapidos = [];
  for (let i = 0; i < 6; i += 1) {
    rapidos.push(await pagina.evaluate(async (base) => {
      const r = await fetch(`${base}/api/shop-analyzer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `prueba-${Date.now()}.com` }),
      });
      return r.status;
    }, BASE));
  }
  // 6º análisis seguido: 429 (rate limit) o 402 (cuota diaria del
  // plan agotada por ejecuciones repetidas del E2E). Ambas prueban
  // que la protección está viva.
  comprobar("Rate limit: 6º análisis seguido protegido (429/402)",
    rapidos[5] === 429 || rapidos[5] === 402);

  // ── Ficha de producto: pestaña Métricas con procedencia ──
  if (primera) {
    await pagina.goto(`${BASE}/dashboard/winning-products/${primera}`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);
    await pagina.getByRole("tab", { name: /Métricas/ }).click();
    await pagina.waitForTimeout(2000);
    const textoMet = await pagina.evaluate(() => document.body.innerText);
    comprobar("Panel de métricas muestra procedencia", /Medido|Importado|Estimado/i.test(textoMet));
    comprobar("Importador de tendencias presente", textoMet.includes("Importar tus datos"));
    comprobar("Tarjeta YouTube en métricas", textoMet.includes("YouTube"));
  }

  // ── Tienda: gráfica de precios ──
  // El identificador se toma de la propia interfaz (funciona igual con SQLite
  // y con PostgreSQL); si no hubiera ninguna tienda enlazada, de la base local.
  await pagina.goto(`${BASE}/dashboard/store-tracker`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  const enlaces = await pagina.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="/dashboard/store-tracker/"]')).map((a) => a.getAttribute("href")),
  );
  let tiendaUno = enlaces[0]?.split("/dashboard/store-tracker/")[1]?.split(/[?#]/)[0] ?? null;

  if (!tiendaUno) {
    try {
      tiendaUno = await new Promise((resolver) => {
        const Database = require("better-sqlite3");
        const db = new Database("prisma/trendhunter.db", { readonly: true });
        const fila = db.prepare("SELECT id FROM Store LIMIT 1").get();
        db.close();
        resolver(fila?.id ?? null);
      });
    } catch {
      tiendaUno = null;
    }
  }
  if (tiendaUno) {
    await pagina.goto(`${BASE}/dashboard/store-tracker/${tiendaUno}`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);
    const textoTienda = await pagina.evaluate(() => document.body.innerText);
    comprobar("Gráfica de evolución de precios", textoTienda.includes("Evolución de precios"));
  }

  // ── Diagnóstico: clave de cron si está configurada; si no, sesión admin ──
  const diag = await pagina.evaluate(
    async ({ base, secreto }) => {
      const r = await fetch(`${base}/api/diagnostics${secreto ? `?clave=${encodeURIComponent(secreto)}` : ""}`);
      return { estado: r.status, cuerpo: await r.json() };
    },
    { base: BASE, secreto: process.env.CRON_SECRET ?? "" },
  );

  let diagnostico = diag.cuerpo;
  let estadoDiag = diag.estado;
  if (estadoDiag !== 200) {
    // Sin CRON_SECRET en el entorno: el diagnóstico también admite una
    // sesión de administrador (la comprobación no depende del despliegue).
    const contextoAdmin = await navegador.newContext({ locale: "es-ES" });
    const admin = await contextoAdmin.newPage();
    await admin.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await admin.waitForTimeout(2500);
    await admin.fill("#email", "admin@trendhunter.pro");
    await admin.fill("#password", "admin1234");
    await admin.click('button[type="submit"]');
    await admin.waitForTimeout(4000);
    const otraVez = await admin.evaluate(async (base) => {
      const r = await fetch(`${base}/api/diagnostics`);
      return { estado: r.status, cuerpo: await r.json() };
    }, BASE);
    estadoDiag = otraVez.estado;
    diagnostico = otraVez.cuerpo;
    await contextoAdmin.close();
  }

  comprobar(
    "Diagnóstico muestra proveedores y modo",
    estadoDiag === 200 && diagnostico.modoCostes === "gratis" && Array.isArray(diagnostico.proveedores),
  );
} finally {
  await navegador.close();
}

const fallos = LIBROS.filter(([, ok]) => !ok).length;
console.log(`\n[verificación] ${LIBROS.length - fallos}/${LIBROS.length} comprobaciones correctas`);
process.exit(fallos ? 1 : 0);
