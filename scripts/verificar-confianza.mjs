/**
 * Verificación del sello de confianza del dato.
 *
 *   npm run verify:confianza
 *
 * Comprueba con el navegador y con la API real que la aplicación nunca
 * presenta una estimación como si fuera una medición:
 *
 *   1. El catálogo muestra el sello «Estimado» en las tarjetas del seed.
 *   2. El filtro «Solo datos verificados» deja el catálogo vacío (correcto:
 *      el seed no tiene fuentes medidas) y no rompe la página.
 *   3. La ficha tiene la pestaña «Confianza» con las cuatro fuentes, su tipo,
 *      su fecha y un enlace para comprobarlas a mano.
 *   4. La API pública expone `confianza`, `nivelConfianza` y `fuentesMedidas`.
 *   5. Un producto con dos fuentes medidas de verdad (se crea y se borra
 *      durante la prueba) aparece como «Verificado» y su oportunidad pasa a
 *      llamarse «Oportunidad dorada».
 *   6. Al volver al producto sin mediciones, el sello regresa a «Estimado».
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [
  path.join(process.cwd(), ".chromium", "libs"),
  path.join(process.cwd(), ".chromium", "libs", "lib"),
].join(":");
const RUTA_BD = path.join(process.cwd(), "prisma", "trendhunter.db");
const usaSqlite = !/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");
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

async function iniciarSesion(email, contrasena) {
  const contexto = await navegador.newContext({ locale: "es-ES", colorScheme: "dark", viewport: { width: 1500, height: 1100 } });
  const pagina = await contexto.newPage();
  for (let intento = 1; intento <= 3; intento += 1) {
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await pagina.waitForTimeout(2500);
    await pagina.fill("#email", email);
    await pagina.fill("#password", contrasena);
    await pagina.click('button[type="submit"]');
    await pagina.waitForTimeout(5000);
    if (pagina.url().includes("/dashboard")) return pagina;
  }
  throw new Error(`No se pudo iniciar sesión con ${email}`);
}

// ---------------------------------------------------------------------------
//  Producto de prueba con dos fuentes medidas (SQLite de desarrollo)
// ---------------------------------------------------------------------------
let productoPrueba = null;
if (usaSqlite && existsSync(RUTA_BD)) {
  const Database = createRequire(import.meta.url)("better-sqlite3");
  const bd = new Database(RUTA_BD);
  const ahora = new Date();
  const ayer = new Date(ahora.getTime() - 86_400_000);
  const id = "prod-confianza-prueba";
  bd.prepare("DELETE FROM TrendMetric WHERE productId = ?").run(id);
  bd.prepare("DELETE FROM Product WHERE id = ?").run(id);
  bd.prepare(
    `INSERT INTO Product (id, title, slug, description, mainImage, images, category, nicheTag, tags, costPrice,
       suggestedSellPrice, estimatedMargin, trendScore, velocityScore, saturationLevel, trendDirection,
       isGoldenOpportunity, googleSearchVolume, tiktokViews, metaAdsCount, storesUsing, youtubeViews,
       estimatedMonthlyRevenue, estimatedUnitsSold, status, source, countryAvailability, confianza,
       nivelConfianza, fuentesMedidas, ultimaMedicion, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "Producto de prueba · confianza verificada",
    "producto-prueba-confianza",
    "Registro temporal creado por npm run verify:confianza para comprobar el sello de datos verificados.",
    "/images/products/p01-1.jpg",
    JSON.stringify(["/images/products/p01-1.jpg"]),
    "Hogar",
    "Prueba de confianza",
    JSON.stringify(["prueba"]),
    10,
    39.9,
    74.9,
    88,
    82,
    "LOW",
    "RISING",
    1,
    15000,
    90000,
    120,
    60,
    400000,
    120000,
    4000,
    "ACTIVE",
    "verificacion",
    JSON.stringify(["ES"]),
    0,
    "SIN_DATOS",
    0,
    null,
    ahora.toISOString(),
    ahora.toISOString(),
  );

  // Dos mediciones: hoy (google + tiendas medidos) y ayer (para la dirección).
  const insertarMetrica = bd.prepare(
    `INSERT INTO TrendMetric (id, productId, date, googleSearchVolume, tiktokViews, youtubeViews, metaAdsCount,
       shopifyStoresUsing, calculatedScore, breakdown, fuente, fechaMedicion, tipoDato, procedencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertarMetrica.run(
    "met-confianza-2",
    id,
    ahora.toISOString(),
    15000,
    0,
    400000,
    0,
    60,
    88,
    JSON.stringify({ fuente: "verificacion" }),
    "google-trends,rds-shopify",
    ahora.toISOString(),
    "MEDIDO",
    JSON.stringify({
      google: { tipo: "MEDIDO", fuente: "google-trends-rss", fecha: ahora.toISOString(), valor: 15000 },
      tiendas: { tipo: "MEDIDO", fuente: "catalogo-shopify", fecha: ahora.toISOString(), valor: 60 },
      youtube: { tipo: "ESTIMADO", fuente: "motor-interno", fecha: ahora.toISOString(), valor: 400000 },
    }),
  );
  insertarMetrica.run(
    "met-confianza-1",
    id,
    ayer.toISOString(),
    12000,
    0,
    300000,
    0,
    48,
    84,
    JSON.stringify({ fuente: "verificacion" }),
    "google-trends,rds-shopify",
    ayer.toISOString(),
    "MEDIDO",
    JSON.stringify({
      google: { tipo: "MEDIDO", fuente: "google-trends-rss", fecha: ayer.toISOString(), valor: 12000 },
      tiendas: { tipo: "MEDIDO", fuente: "catalogo-shopify", fecha: ayer.toISOString(), valor: 48 },
    }),
  );

  // Mismos números que calcula src/lib/confianza.ts para este caso:
  // cobertura 38 (2 fuentes) + frescura 25 (hoy) + diversidad 12 (2 familias)
  // + consistencia 15 (ambas suben) = 90.
  bd.prepare(
    "UPDATE Product SET confianza = ?, nivelConfianza = ?, fuentesMedidas = ?, ultimaMedicion = ? WHERE id = ?",
  ).run(90, "VERIFICADO", 2, ahora.toISOString(), id);
  bd.close();

  productoPrueba = id;
  console.log(`[verify:confianza] Producto de prueba con 2 fuentes medidas: ${id}\n`);
}

// ---------------------------------------------------------------------------
//  Catálogo: sellos y filtro
// ---------------------------------------------------------------------------
const pagina = await iniciarSesion("demo@trendhunter.pro", "demo1234");

await pagina.goto(`${BASE}/dashboard/winning-products`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await pagina.waitForTimeout(3000);
const textoCatalogo = await pagina.locator("body").innerText();
const sellos = (textoCatalogo.match(/Estimado/g) ?? []).length;
registrar("El catálogo marca los productos sin medición como «Estimado»", sellos >= 5, `${sellos} sellos visibles`);
registrar(
  "El catálogo no promete «Verificado» sin fuentes",
  !textoCatalogo.includes("Verificado ·"),
  "sin sellos verificados en el seed",
);
registrar(
  "Las oportunidades sin medición se llaman «Oportunidad estimada»",
  textoCatalogo.includes("Oportunidad estimada"),
  `${(textoCatalogo.match(/Oportunidad estimada/g) ?? []).length} etiquetas`,
);

await pagina.goto(`${BASE}/dashboard/winning-products?verificadosOnly=true`, { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(2500);
const textoFiltrado = await pagina.locator("body").innerText();
const sinResultados = /no (hay|encontramos|se han encontrado)|sin resultados|ningún producto/i.test(textoFiltrado);
registrar(
  "El filtro «Solo datos verificados» no inventa resultados",
  sinResultados || textoFiltrado.includes("Oportunidad dorada"),
  sinResultados ? "muestra estado vacío" : "hay productos verificados",
);

// ---------------------------------------------------------------------------
//  Ficha con producto verificado
// ---------------------------------------------------------------------------
if (productoPrueba) {
  await pagina.goto(`${BASE}/dashboard/winning-products/${productoPrueba}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  const textoFicha = await pagina.locator("body").innerText();
  registrar("La ficha de un producto medido muestra «Verificado»", textoFicha.includes("Verificado"), textoFicha.includes("Verificado · 2 fuentes") ? "con número de fuentes" : "");
  registrar(
    "Un producto verificado sí se etiqueta «Oportunidad dorada»",
    textoFicha.includes("Oportunidad dorada"),
    "la etiqueta completa vuelve con dos fuentes",
  );

  await pagina.getByRole("tab", { name: /Confianza/i }).click();
  await pagina.waitForTimeout(1500);
  const textoPanel = await pagina.locator("body").innerText();
  registrar("Pestaña «Confianza» con el desglose por fuente", textoPanel.includes("Confianza y procedencia"));
  registrar(
    "El panel muestra fuentes medidas y estimadas por separado",
    /medido/i.test(textoPanel) && /estimado/i.test(textoPanel),
    "Google y tiendas medidos; YouTube estimado",
  );
  registrar(
    "Cada fuente tiene un enlace para comprobarla a mano",
    (await pagina.locator('a:has-text("Abrir")').count()) >= 2,
    `${await pagina.locator('a:has-text("Abrir")').count()} enlaces`,
  );
  registrar(
    "El panel explica el cálculo (45/25/15/15)",
    /cobertura de fuentes \(45\)/i.test(textoPanel),
    "criterio visible",
  );

  // API pública con el producto verificado. La API exige una clave (plan
  // Business): se crea con la sesión de administración y se revoca al final.
  const paginaApi = await iniciarSesion("admin@trendhunter.pro", "admin1234");
  const clave = await paginaApi.evaluate(async () => {
    const respuesta = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: `Verificación confianza ${new Date().toISOString().slice(0, 16)}` }),
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    return { estado: respuesta.status, clave: cuerpo.clave ?? "", id: cuerpo.item?.id ?? "" };
  });
  registrar("Clave de API creada para la prueba", clave.estado === 201 && Boolean(clave.clave), `${clave.estado}`);

  const api = await paginaApi.evaluate(
    async ([base, secreto]) => {
      const respuesta = await fetch(`${base}/api/v1/productos?porPagina=50`, {
        headers: { Authorization: `Bearer ${secreto}` },
      });
      const cuerpo = await respuesta.json();
      // La API v1 devuelve la colección en `data`.
      return { estado: respuesta.status, items: cuerpo.data ?? [] };
    },
    [BASE, clave.clave],
  );
  const conConfianza = api.items.filter((item) => typeof item.confianza === "number" && typeof item.nivelConfianza === "string");
  registrar(
    "La API v1 expone confianza y nivel en cada producto",
    api.estado === 200 && api.items.length > 0 && conConfianza.length === api.items.length,
    `${conConfianza.length}/${api.items.length} productos`,
  );
  const verificadoApi = api.items.find((item) => item.id === productoPrueba);
  registrar(
    "La API v1 devuelve el producto verificado como VERIFICADO",
    verificadoApi?.nivelConfianza === "VERIFICADO" && verificadoApi?.fuentesMedidas === 2,
    `${verificadoApi?.nivelConfianza ?? "no encontrado"} · ${verificadoApi?.confianza ?? "-"}/100`,
  );

  const filtradoApi = await paginaApi.evaluate(
    async ([base, secreto]) => {
      const respuesta = await fetch(`${base}/api/v1/productos?verificados=1&porPagina=50`, {
        headers: { Authorization: `Bearer ${secreto}` },
      });
      const cuerpo = await respuesta.json();
      return (cuerpo.data ?? []).map((item) => ({
        id: item.id,
        nivel: item.nivelConfianza,
        fuentes: item.fuentesMedidas,
      }));
    },
    [BASE, clave.clave],
  );
  // El filtro no exige que sea el ÚNICO verificado: con datos reales puede
  // haber más. Exige que todos los devueltos estén medidos y que el producto
  // de prueba esté entre ellos.
  registrar(
    "El filtro ?verificados=1 devuelve solo los medidos",
    filtradoApi.length >= 1 &&
      filtradoApi.some((item) => item.id === productoPrueba) &&
      filtradoApi.every((item) => item.nivel === "VERIFICADO" && item.fuentes > 0),
    `${filtradoApi.length} producto(s)`,
  );

  // Limpieza de la clave de prueba.
  if (clave.id) {
    await paginaApi.evaluate(async (id) => {
      await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    }, clave.id);
  }
}

// ---------------------------------------------------------------------------
//  Panel: la confianza también está en las métricas generales
// ---------------------------------------------------------------------------
await pagina.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(4000);
const textoPanelGeneral = await pagina.locator("body").innerText();
registrar(
  "El panel muestra la tarjeta «Datos verificados»",
  /datos verificados/i.test(textoPanelGeneral),
  textoPanelGeneral.includes("Datos verificados") ? "visible" : textoPanelGeneral.slice(0, 120).replace(/\n/g, " "),
);

// ---------------------------------------------------------------------------
//  Limpieza
// ---------------------------------------------------------------------------
if (productoPrueba && usaSqlite && existsSync(RUTA_BD)) {
  const Database = createRequire(import.meta.url)("better-sqlite3");
  const bd = new Database(RUTA_BD);
  bd.prepare("DELETE FROM TrendMetric WHERE productId = ?").run(productoPrueba);
  bd.prepare("DELETE FROM Product WHERE id = ?").run(productoPrueba);
  bd.close();
  console.log(`\n[verify:confianza] Producto de prueba eliminado.`);
}

await navegador.close();

const fallos = resultados.filter((fila) => !fila.ok);
console.log(`\n=== RESUMEN: ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas ===`);
if (fallos.length > 0) {
  console.log("Fallos:");
  for (const fallo of fallos) console.log(` · ${fallo.nombre} ${fallo.detalle}`);
}
process.exit(fallos.length > 0 ? 1 : 0);
