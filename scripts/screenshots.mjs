#!/usr/bin/env node
/**
 * Capturas automáticas de la interfaz (documentación y verificación visual).
 *
 *   npm run screenshots                        # contra http://localhost:3000
 *   BASE_URL=http://localhost:3000 npm run screenshots
 *
 * Usa `playwright-core` con el Chromium empaquetado en `.chromium/` (el que
 * distribuye `@sparticuz/chromium`), por lo que funciona en entornos sin acceso
 * a los CDN de navegadores. Inicia sesión con las cuentas de demostración y
 * recorre todas las secciones en escritorio y móvil, incluyendo interacciones
 * reales (análisis de tienda, generación de IA y ficha de producto).
 */
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");
const SALIDA = path.join(process.cwd(), "screenshots");

const USUARIO = { email: "demo@trendhunter.pro", password: "demo1234" };
const ADMIN = { email: "admin@trendhunter.pro", password: "admin1234" };

/** Páginas públicas (sin sesión). */
const PUBLICAS = [
  { ruta: "/", nombre: "01-landing", ancho: 1600, alto: 1150 },
  { ruta: "/login", nombre: "02-login", ancho: 1440, alto: 900 },
  { ruta: "/register", nombre: "03-registro", ancho: 1440, alto: 1000 },
  { ruta: "/forgot-password", nombre: "04-recuperar-password", ancho: 1440, alto: 800 },
  { ruta: "/pricing", nombre: "05-precios", ancho: 1600, alto: 1250 },
  {
    ruta: "/equipos/aceptar?token=demo-invitacion-equipo-trendhunter-2026",
    nombre: "35-invitacion-equipo",
    ancho: 1440,
    alto: 900,
  },
];

/** Secciones del panel con la cuenta de demostración. */
const PANEL = [
  { ruta: "/dashboard", nombre: "06-dashboard", ancho: 1600, alto: 1300 },
  { ruta: "/dashboard/winning-products", nombre: "07-winning-products", ancho: 1600, alto: 1300 },
  { ruta: "/dashboard/ads-spy", nombre: "08-ads-spy", ancho: 1600, alto: 1250 },
  { ruta: "/dashboard/fuentes", nombre: "08b-fuentes-en-vivo", ancho: 1600, alto: 1400 },
  { ruta: "/dashboard/shop-analyzer", nombre: "09-shop-analyzer", ancho: 1600, alto: 1100 },
  { ruta: "/dashboard/store-tracker", nombre: "10-store-tracker", ancho: 1600, alto: 1250 },
  { ruta: "/dashboard/product-tracker", nombre: "11-product-tracker", ancho: 1600, alto: 1150 },
  { ruta: "/dashboard/suppliers", nombre: "12-proveedores", ancho: 1600, alto: 1150 },
  { ruta: "/dashboard/ai-studio", nombre: "13-ai-studio", ancho: 1600, alto: 1250 },
  { ruta: "/dashboard/settings", nombre: "14-configuracion", ancho: 1600, alto: 1150 },
  { ruta: "/dashboard/settings/billing", nombre: "15-facturacion", ancho: 1600, alto: 1250 },
  { ruta: "/dashboard/settings/notifications", nombre: "16-notificaciones", ancho: 1600, alto: 1150 },
  { ruta: "/dashboard/winning-products?goldenOnly=true", nombre: "17-filtro-doradas", ancho: 1600, alto: 1150 },
];

/** Panel de administración (requiere rol ADMIN). */
const ADMINISTRACION = [
  { ruta: "/dashboard/admin", nombre: "18-admin-usuarios", ancho: 1700, alto: 1250 },
  { ruta: "/dashboard/admin", nombre: "19-admin-catalogo", ancho: 1700, alto: 1250, pestana: "Catálogo" },
  { ruta: "/dashboard/admin", nombre: "20-admin-scrapings", ancho: 1700, alto: 1250, pestana: "Scrapings" },
  { ruta: "/dashboard/admin", nombre: "21-admin-alta", ancho: 1700, alto: 1400, pestana: "Añadir producto" },
  { ruta: "/dashboard/equipos", nombre: "33-equipos", ancho: 1700, alto: 1250 },
  { ruta: "/dashboard/settings/notifications", nombre: "34-webhooks", ancho: 1700, alto: 1400 },
];

/** Vistas móviles. */
const MOVIL = [
  { ruta: "/dashboard", nombre: "22-movil-dashboard" },
  { ruta: "/dashboard/winning-products", nombre: "23-movil-productos" },
  { ruta: "/dashboard/ads-spy", nombre: "24-movil-ads-spy" },
];

/**
 * Deja el contexto sin dependencia de internet.
 *
 * Las capturas se hacen siempre contra el servidor local; si una imagen remota
 * (Unsplash, CDN de una tienda) no responde, la página no debe quedarse
 * esperando. Se abortan solo las peticiones que NO van al servidor local.
 */
async function aislarDeInternet(contexto) {
  await contexto.route("**/*", (ruta) => {
    const url = ruta.request().url();
    const local = url.startsWith(BASE_URL) || url.startsWith("data:") || url.startsWith("blob:");
    return local ? ruta.continue() : ruta.abort();
  });
  contexto.setDefaultTimeout(45_000);
}

/** Espera a que la hidratación de React complete el formulario de acceso. */
async function iniciarSesion(pagina, cuenta) {
  for (let intento = 1; intento <= 4; intento += 1) {
    await pagina.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2_500);
    await pagina.fill("#email", cuenta.email);
    await pagina.fill("#password", cuenta.password);
    await pagina.click('button[type="submit"]');
    await pagina.waitForTimeout(5_000);
    if (pagina.url().includes("/dashboard")) return true;
  }
  return false;
}

/** Realiza la captura de una definición de página. */
async function capturar(pagina, definicion) {
  await pagina.screenshot({ path: path.join(SALIDA, `${definicion.nombre}.png`), fullPage: false });
}

async function main() {
  if (!existsSync(EJECUTABLE)) {
    console.error(
      `[capturas] No se encuentra el ejecutable de Chromium en ${EJECUTABLE}.\n` +
        "           Extrae el navegador de @sparticuz/chromium o define CHROMIUM_PATH.",
    );
    process.exit(1);
  }
  mkdirSync(SALIDA, { recursive: true });

  const navegador = await chromium.launch({
    executablePath: EJECUTABLE,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
    ],
    env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
  });

  const nuevoContexto = (ancho, alto, extras = {}) =>
    navegador.newContext({
      viewport: { width: ancho, height: alto },
      deviceScaleFactor: 1,
      locale: "es-ES",
      timezoneId: "Europe/Madrid",
      colorScheme: "dark",
      ...extras,
    });

  try {
    // -----------------------------------------------------------------------
    //  1 · Páginas públicas
    // -----------------------------------------------------------------------
    const contextoPublico = await nuevoContexto(1600, 1100);
    await aislarDeInternet(contextoPublico);
    const paginaPublica = await contextoPublico.newPage();
    for (const definicion of PUBLICAS) {
      console.log(`[capturas] ${definicion.ruta}`);
      await paginaPublica.setViewportSize({ width: definicion.ancho, height: definicion.alto });
      await paginaPublica.goto(`${BASE_URL}${definicion.ruta}`, { waitUntil: "domcontentloaded" });
      await paginaPublica.waitForTimeout(1_200);
      await capturar(paginaPublica, definicion);
    }
    await contextoPublico.close();

    // -----------------------------------------------------------------------
    //  2 · Panel con la cuenta de demostración
    // -----------------------------------------------------------------------
    const contexto = await nuevoContexto(1600, 1200);
    await aislarDeInternet(contexto);
    const pagina = await contexto.newPage();

    if (!(await iniciarSesion(pagina, USUARIO))) {
      throw new Error("No se pudo iniciar sesión con la cuenta de demostración");
    }
    console.log(`[capturas] Sesión iniciada como ${USUARIO.email}`);

    for (const definicion of PANEL) {
      console.log(`[capturas] ${definicion.ruta}`);
      await pagina.setViewportSize({ width: definicion.ancho, height: definicion.alto });
      await pagina.goto(`${BASE_URL}${definicion.ruta}`, { waitUntil: "domcontentloaded" });
      await pagina.waitForTimeout(definicion.ruta.includes("ai-studio") ? 1_800 : 1_300);
      await capturar(pagina, definicion);
    }

    // --- Ficha de producto completa (el id se obtiene de la propia API) ---
    console.log("[capturas] Detalle de producto");
    await pagina.setViewportSize({ width: 1600, height: 1300 });
    const primerProducto = await pagina.evaluate(async () => {
      const respuesta = await fetch("/api/products?pageSize=1&sort=best-score");
      const datos = await respuesta.json();
      return datos?.items?.[0]?.id ?? null;
    });

    if (primerProducto) {
      await pagina.goto(`${BASE_URL}/dashboard/winning-products/${primerProducto}`, { waitUntil: "domcontentloaded" });
      await pagina.waitForTimeout(2_200);
      await capturar(pagina, { nombre: "25-detalle-producto" });
      await pagina.screenshot({ path: path.join(SALIDA, "25b-detalle-producto-completo.png"), fullPage: true });

      // --- Pestaña de IA dentro de la ficha ---
      const pestanaIa = pagina.getByRole("tab", { name: /AI Marketing/i });
      if ((await pestanaIa.count()) > 0) {
        await pestanaIa.click();
        await pagina.waitForTimeout(1_500);
        await capturar(pagina, { nombre: "26-detalle-ai-marketing" });
      }
    }

    // --- Shop Analyzer con análisis real ---
    console.log("[capturas] Shop Analyzer (análisis real)");
    await pagina.setViewportSize({ width: 1600, height: 1400 });
    await pagina.goto(`${BASE_URL}/dashboard/shop-analyzer`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1_000);
    const campoUrl = pagina.locator('input[aria-label="URL de la tienda"]');
    if ((await campoUrl.count()) > 0) {
      await campoUrl.fill("aurora-pets.com");
      await pagina.getByRole("button", { name: /Analizar tienda/i }).click();
      await pagina.waitForTimeout(7_000);
      await capturar(pagina, { nombre: "27-shop-analyzer-resultado" });
      await pagina.screenshot({ path: path.join(SALIDA, "28-shop-analyzer-completo.png"), fullPage: true });
    }

    // --- AI Studio con una generación real ---
    console.log("[capturas] AI Studio (generación real)");
    await pagina.setViewportSize({ width: 1600, height: 1350 });
    await pagina.goto(`${BASE_URL}/dashboard/ai-studio`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1_500);
    const botonGenerar = pagina.getByRole("button", { name: /Generar con IA/i });
    if ((await botonGenerar.count()) > 0) {
      await botonGenerar.click();
      await pagina.waitForTimeout(6_000);
      await capturar(pagina, { nombre: "29-ai-studio-resultado" });
      await pagina.screenshot({ path: path.join(SALIDA, "30-ai-studio-completo.png"), fullPage: true });
    }

    await contexto.close();

    // -----------------------------------------------------------------------
    //  3 · Panel de administración
    // -----------------------------------------------------------------------
    const contextoAdmin = await nuevoContexto(1700, 1250);
    await aislarDeInternet(contextoAdmin);
    const paginaAdmin = await contextoAdmin.newPage();
    if (!(await iniciarSesion(paginaAdmin, ADMIN))) {
      throw new Error("No se pudo iniciar sesión con la cuenta de administración");
    }
    console.log(`[capturas] Sesión iniciada como ${ADMIN.email}`);

    for (const definicion of ADMINISTRACION) {
      console.log(`[capturas] ${definicion.ruta}${definicion.pestana ? ` · ${definicion.pestana}` : ""}`);
      await paginaAdmin.setViewportSize({ width: definicion.ancho, height: definicion.alto });
      await paginaAdmin.goto(`${BASE_URL}${definicion.ruta}`, { waitUntil: "domcontentloaded" });
      await paginaAdmin.waitForTimeout(1_300);
      if (definicion.pestana) {
        const pestana = paginaAdmin.getByRole("tab", { name: new RegExp(definicion.pestana, "i") });
        if ((await pestana.count()) > 0) {
          await pestana.click();
          await paginaAdmin.waitForTimeout(1_200);
        }
      }
      await capturar(paginaAdmin, definicion);
    }
    await contextoAdmin.close();

    // -----------------------------------------------------------------------
    //  4 · Vistas móviles
    // -----------------------------------------------------------------------
    const contextoMovil = await nuevoContexto(414, 900, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await aislarDeInternet(contextoMovil);
    const paginaMovil = await contextoMovil.newPage();
    if (!(await iniciarSesion(paginaMovil, USUARIO))) {
      throw new Error("No se pudo iniciar sesión en la vista móvil");
    }
    for (const definicion of MOVIL) {
      console.log(`[capturas] ${definicion.ruta} (móvil)`);
      await paginaMovil.goto(`${BASE_URL}${definicion.ruta}`, { waitUntil: "domcontentloaded" });
      await paginaMovil.waitForTimeout(1_400);
      await capturar(paginaMovil, definicion);
    }
    await contextoMovil.close();
  } finally {
    await navegador.close();
  }

  console.log(`[capturas] Listo. Archivos en ${SALIDA}`);
}

main().catch((error) => {
  console.error("[capturas] Error:", error.message);
  process.exit(1);
});
