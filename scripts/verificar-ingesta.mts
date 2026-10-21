/**
 * Verificación de la ingesta real sin claves.
 *
 *   npm run verify:ingesta
 *
 * Qué hace:
 *   1. Levanta un servidor HTTP local que imita el catálogo público de Shopify
 *      con el MISMO formato (`/products.json`) y el RSS de Google Trends.
 *      (En el sandbox no hay salida a internet; en tu servidor esto se sustituye
 *      por la tienda real: la ruta de red es exactamente la misma.)
 *   2. Lee el catálogo, lo guarda y comprueba fila por fila lo que ha escrito.
 *   3. Lee una segunda versión del catálogo y verifica que detecta precio,
 *      agotado y alta nuevos.
 *   4. Comprueba el cruce con el catálogo interno y la observación MEDIDA.
 *   5. Comprueba la idempotencia: releer lo mismo no genera eventos falsos.
 *
 * Al terminar deja la tienda de prueba en la base para poder verla en
 * /dashboard/fuentes. Para limpiarla: `npm run verify:ingesta -- --limpiar`.
 */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { leerCatalogoPublico } from "@/lib/providers/shopifyCatalogo";
import { parsearRssTendencias } from "@/lib/providers/tendenciasGoogle";
import { aplicarTendenciasAProductos, diaNatural, guardarCatalogo } from "@/lib/ingesta";
import { coincideConTendencia } from "@/lib/coincidencia";
import { leerProcedencia } from "@/lib/confianzaProducto";
import { resumenSaludDelDato, revisarConfianza } from "@/lib/mantenimientoConfianza";

const DOMINIO = "nordika-living.demo";
const PUERTO = 4399;
const RAIZ = process.cwd();

let pasos = 0;
let fallos = 0;

/** Imprime el resultado de una comprobación. */
function comprobar(titulo: string, condicion: boolean, detalle = ""): void {
  pasos += 1;
  if (condicion) {
    console.log(`  ✅ ${titulo}${detalle ? ` · ${detalle}` : ""}`);
  } else {
    fallos += 1;
    console.log(`  ❌ ${titulo}${detalle ? ` · ${detalle}` : ""}`);
  }
}

function leerFixture(nombre: string): unknown {
  return JSON.parse(readFileSync(path.join(RAIZ, "prisma", "fixtures", nombre), "utf8"));
}

/** Servidor que imita Shopify: /products.json y /rss. */
function levantarServidor(json: unknown): Promise<Server> {
  const cuerpo = JSON.stringify(json);
  const rss = readFileSync(path.join(RAIZ, "prisma", "fixtures", "tendencias-rss.xml"), "utf8");

  return new Promise((resolver) => {
    const servidor = createServer((peticion, respuesta) => {
      const url = peticion.url ?? "/";
      if (url.startsWith("/products.json")) {
        respuesta.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        respuesta.end(cuerpo);
        return;
      }
      if (url.startsWith("/rss")) {
        respuesta.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
        respuesta.end(rss);
        return;
      }
      respuesta.writeHead(404, { "content-type": "text/html" });
      respuesta.end("<!doctype html><html><body>Not found</body></html>");
    });
    servidor.listen(PUERTO, "127.0.0.1", () => resolver(servidor));
  });
}

async function principal(): Promise<void> {
  const limpiar = process.argv.includes("--limpiar");
  const base = `http://127.0.0.1:${PUERTO}`;

  // Limpieza previa de la propia tienda de prueba.
  const previa = await prisma.store.findFirst({ where: { domain: DOMINIO } });
  if (previa) await prisma.store.delete({ where: { id: previa.id } });

  if (limpiar) {
    console.log(`[verify:ingesta] Tienda ${DOMINIO} eliminada. Nada más que hacer.`);
    await prisma.$disconnect();
    return;
  }

  console.log("─".repeat(72));
  console.log("  INGESTA REAL SIN CLAVES · verificación de la tubería completa");
  console.log("─".repeat(72));

  // ---------------------------------------------------------------- 1 · lectura
  const servidorV1 = await levantarServidor(leerFixture("shopify-productos-v1.json"));
  const catalogoV1 = await leerCatalogoPublico(DOMINIO, { urlBase: base });

  console.log("\n1 · Lectura del catálogo público");
  comprobar("La lectura termina bien", catalogoV1.ok, `${catalogoV1.total} productos`);
  comprobar("Se sabe que el catálogo está completo", catalogoV1.completo);
  comprobar("No hay motivo de fallo", catalogoV1.motivo === null);
  comprobar("Los precios son números > 0", catalogoV1.productos.every((producto) => producto.precio > 0));
  comprobar(
    "Se lee la disponibilidad real",
    catalogoV1.productos.every((producto) => typeof producto.disponible === "boolean"),
  );
  comprobar(
    "Los compare_at_price se guardan como precio anterior",
    catalogoV1.productos.some((producto) => producto.precioComparativo !== null),
  );

  // ------------------------------------------------------------- 2 · persistencia
  console.log("\n2 · Persistencia en la base de datos");
  const ingesta1 = await guardarCatalogo(catalogoV1, { pais: "ES", emparejar: true });
  comprobar("La ingesta devuelve ok", ingesta1.ok);
  comprobar("Se han creado todos los productos", ingesta1.nuevos === catalogoV1.total, `${ingesta1.nuevos} nuevos`);

  const tienda = await prisma.store.findFirst({ where: { domain: DOMINIO } });
  comprobar("La tienda existe y viene de ingesta", tienda?.origen === "ingesta");
  comprobar("La tienda guarda el nicho deducido", Boolean(tienda?.niche), tienda?.niche ?? "");
  comprobar("La tienda tiene fecha de lectura", Boolean(tienda?.lastScannedAt));

  const productosTienda = tienda ? await prisma.storeProduct.count({ where: { storeId: tienda.id } }) : 0;
  comprobar("Los productos están vinculados a la tienda", productosTienda === catalogoV1.total, `${productosTienda}`);

  const precios = tienda ? await prisma.priceHistory.count({ where: { storeId: tienda.id } }) : 0;
  comprobar("Cada producto arranca su histórico de precio", precios === catalogoV1.total, `${precios} filas`);

  const eventosNuevos = tienda
    ? await prisma.storeChange.count({ where: { storeId: tienda.id, type: "NEW_PRODUCT" } })
    : 0;
  comprobar("Se registran las altas en el timeline", eventosNuevos === catalogoV1.total, `${eventosNuevos} eventos`);

  // ------------------------------------------------------------- 3 · cruce interno
  console.log("\n3 · Cruce con el catálogo interno");
  comprobar("Hay productos cruzados", ingesta1.emparejados > 0, `${ingesta1.emparejados} de ${catalogoV1.total}`);

  const cruzados = tienda
    ? await prisma.storeProduct.findMany({ where: { storeId: tienda.id, productId: { not: null } }, select: { productId: true } })
    : [];
  const idsInternos = [...new Set(cruzados.map((fila) => fila.productId as string))];
  comprobar("Los cruces apuntan a productos internos reales", idsInternos.length > 0, `${idsInternos.length} productos`);

  const productoInterno = idsInternos.length > 0 ? await prisma.product.findUnique({ where: { id: idsInternos[0] } }) : null;
  comprobar("El producto interno cuenta 1 tienda medida", productoInterno?.storesUsing === 1, `storesUsing=${productoInterno?.storesUsing}`);

  const metrica = productoInterno
    ? await prisma.trendMetric.findFirst({ where: { productId: productoInterno.id }, orderBy: { fechaMedicion: "desc" } })
    : null;
  const procedencia = leerProcedencia(metrica?.procedencia);
  comprobar(
    "La fuente «tiendas» queda como MEDIDO",
    procedencia.tiendas?.tipo === "MEDIDO",
    `${procedencia.tiendas?.tipo ?? "sin dato"} · ${procedencia.tiendas?.fuente ?? "—"}`,
  );
  comprobar(
    "La confianza se ha recalculado con esa evidencia",
    (productoInterno?.confianza ?? 0) > 0,
    `${productoInterno?.nivelConfianza} · ${productoInterno?.confianza} pts`,
  );

  // ------------------------------------------------------------- 4 · segunda lectura
  console.log("\n4 · Segunda lectura (cambios reales)");
  servidorV1.close();
  const servidorV2 = await levantarServidor(leerFixture("shopify-productos-v2.json"));
  const catalogoV2 = await leerCatalogoPublico(DOMINIO, { urlBase: base });
  const ingesta2 = await guardarCatalogo(catalogoV2, { pais: "ES", emparejar: true });

  comprobar("La segunda lectura termina bien", ingesta2.ok, `${ingesta2.productosLeidos} productos`);
  comprobar("Detecta el producto nuevo", ingesta2.nuevos === 1, `${ingesta2.nuevos}`);
  comprobar("Detecta los dos precios que cambian (39,90→31,90 y 64→69)", ingesta2.cambiosDePrecio === 2, `${ingesta2.cambiosDePrecio} cambios`);
  comprobar("Detecta el agotado", ingesta2.agotados === 2, `${ingesta2.agotados} entre agotado y desaparecido`);

  const cambioPrecio = tienda
    ? await prisma.storeChange.findFirst({ where: { storeId: tienda.id, type: "PRICE_CHANGE" }, orderBy: { detectedAt: "desc" } })
    : null;
  comprobar(
    "El cambio de precio guarda el antes y el después",
    typeof cambioPrecio?.priceBefore === "number" && typeof cambioPrecio?.priceAfter === "number",
    `${cambioPrecio?.priceBefore} → ${cambioPrecio?.priceAfter}`,
  );

  // ------------------------------------------------------------- 5 · idempotencia
  console.log("\n5 · Idempotencia (releer lo mismo no inventa eventos)");
  const ingesta3 = await guardarCatalogo(catalogoV2, { pais: "ES", emparejar: true });
  comprobar("No hay productos nuevos", ingesta3.nuevos === 0);
  comprobar("No hay cambios de precio", ingesta3.cambiosDePrecio === 0);
  comprobar("No hay agotados nuevos", ingesta3.agotados === 0);

  // ------------------------------------------------------------- 6 · tendencias
  console.log("\n6 · Tendencias del día (RSS oficial, mismo formato)");
  const rss = readFileSync(path.join(RAIZ, "prisma", "fixtures", "tendencias-rss.xml"), "utf8");
  const tendencias = parsearRssTendencias(rss);
  comprobar("El RSS se parsea", tendencias.length === 3, `${tendencias.length} términos`);
  comprobar("Se lee el volumen aproximado", tendencias.some((termino) => termino.busquedas.includes("K+") || termino.busquedas.includes("M+")));

  comprobar(
    "Un término que aparece en el título casa",
    coincideConTendencia("Máscara LED de terapia facial 7 colores", "máscara led"),
  );
  comprobar(
    "Un término parecido pero distinto NO casa",
    !coincideConTendencia("Máscara LED de terapia facial 7 colores", "mascarilla led"),
  );
  comprobar("Un término de otro tema no casa", !coincideConTendencia("Máscara LED de terapia facial", "selección españa"));

  const dia = diaNatural();
  for (const [indice, termino] of tendencias.entries()) {
    await prisma.trendingTerm.upsert({
      where: { term_geo_day: { term: termino.titulo, geo: "ES", day: dia } },
      create: {
        term: termino.titulo,
        geo: "ES",
        day: dia,
        volume: termino.busquedas,
        approxVolume: indice === 2 ? 1_000_000 : 100_000,
        rank: indice + 1,
        url: termino.url,
      },
      update: { rank: indice + 1 },
    });
  }

  const coincidencias = await aplicarTendenciasAProductos(dia, "ES");
  comprobar("Hay coincidencias con el catálogo interno", coincidencias.length > 0, `${coincidencias.length}`);

  const conTendencia = coincidencias[0];
  const metricaTendencia = conTendencia
    ? await prisma.trendMetric.findFirst({ where: { productId: conTendencia.productoId }, orderBy: { fechaMedicion: "desc" } })
    : null;
  const procTendencia = leerProcedencia(metricaTendencia?.procedencia);
  comprobar(
    "La tendencia queda como fuente MEDIDA con fecha",
    procTendencia.tendencias?.tipo === "MEDIDO" && Boolean(procTendencia.tendencias?.fecha),
    `${procTendencia.tendencias?.fuente ?? "—"}`,
  );

  // ------------------------------------------------------------- 7 · fallos honestos
  console.log("\n7 · Fallos honestos (no se inventa nada)");
  const dominioInvalido = await leerCatalogoPublico("no es un dominio", {});
  comprobar("Un dominio inválido se rechaza", !dominioInvalido.ok && dominioInvalido.motivo === "dominio-invalido");

  const noShopify = await leerCatalogoPublico("nordika-living.demo", { urlBase: `${base}/nada` });
  comprobar(
    "Una ruta sin catálogo se marca como «no-shopify»",
    !noShopify.ok && noShopify.motivo === "no-shopify" && noShopify.productos.length === 0,
    noShopify.motivo ?? "",
  );
  servidorV2.close();

  const antes = await prisma.store.count();
  const { ingerirTienda } = await import("@/lib/ingesta");
  const fallo = await ingerirTienda("dominio-que-no-existe.invalid", { catalogo: undefined });
  comprobar("Una tienda que no responde no se guarda a medias", !fallo.ok && (await prisma.store.count()) === antes, fallo.motivo ?? "");

  // ------------------------------------------- 8 · mantenimiento de la confianza
  console.log("\n8 · Mantenimiento de la confianza (caducidad y avisos)");
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("No hay usuario ADMIN en la base para probar los avisos.");

  const viejo = await prisma.product.create({
    data: {
      title: "PRODUCTO DE PRUEBA · evidencia caducada",
      slug: `prueba-caducidad-${Date.now()}`,
      description: "Producto temporal de la verificación.",
      mainImage: "/images/products/p01-1.jpg",
      category: "Prueba",
      nicheTag: "Prueba",
      costPrice: 5,
      suggestedSellPrice: 20,
      estimatedMargin: 75,
      nivelConfianza: "VERIFICADO",
      confianza: 90,
      fuentesMedidas: 2,
      isGoldenOpportunity: true,
    },
    select: { id: true },
  });

  const hace10 = new Date(Date.now() - 10 * 86_400_000);
  const hace9 = new Date(Date.now() - 9 * 86_400_000);
  await prisma.trendMetric.create({
    data: {
      productId: viejo.id,
      date: hace10,
      googleSearchVolume: 12000,
      youtubeViews: 50000,
      fechaMedicion: hace10,
      tipoDato: "MEDIDO",
      fuente: "prueba",
      procedencia: {
        google: { tipo: "MEDIDO", fuente: "google-trends", fecha: hace10.toISOString(), valor: 12000 },
        youtube: { tipo: "MEDIDO", fuente: "youtube-api", fecha: hace9.toISOString(), valor: 50000 },
      },
    },
  });
  await prisma.trackedProduct.create({
    data: { userId: admin.id, productId: viejo.id, targetTrendScore: 80 },
  });

  const salud = await resumenSaludDelDato();
  comprobar(
    "La auditoría detecta la evidencia caducada",
    salud.caducados.some((item) => item.id === viejo.id),
    `${salud.caducados.length} con más de 7 días`,
  );
  comprobar("La auditoría no modifica la base", (await prisma.product.findUnique({ where: { id: viejo.id } }))?.nivelConfianza === "VERIFICADO");

  const revision = await revisarConfianza();
  const degradado = revision.degradados.find((item) => item.id === viejo.id);
  comprobar("El producto baja de nivel al revisar", degradado?.ahora === "PARCIAL", `${degradado?.antes} → ${degradado?.ahora}`);

  const trasRevisar = await prisma.product.findUnique({ where: { id: viejo.id } });
  comprobar("Deja de ser oportunidad dorada", trasRevisar?.isGoldenOpportunity === false);
  comprobar("Se avisa en la campana a quien lo sigue", revision.avisosCreados >= 1, `${revision.avisosCreados} aviso(s)`);

  const avisos = await prisma.alertNotification.findMany({ where: { userId: admin.id, entityId: viejo.id } });
  comprobar("El aviso explica el motivo", avisos.length >= 1 && /días|fuentes/.test(avisos[0].message), avisos[0]?.title.slice(0, 48) ?? "");

  const segunda = await revisarConfianza();
  comprobar("Revisar dos veces no duplica avisos", segunda.avisosCreados === 0, `${segunda.avisosCreados}`);

  await prisma.alertNotification.deleteMany({ where: { entityId: viejo.id } });
  await prisma.product.delete({ where: { id: viejo.id } });
  comprobar("Producto de prueba eliminado", (await prisma.product.findUnique({ where: { id: viejo.id } })) === null);

  // ------------------------------------------------------------------- resumen
  console.log("\n" + "─".repeat(72));
  console.log(`  ${pasos - fallos}/${pasos} comprobaciones correctas${fallos > 0 ? ` · ${fallos} FALLOS` : ""}`);
  console.log(`  Tienda de prueba: ${DOMINIO} (limpiala con --limpiar)`);
  console.log("─".repeat(72));

  await prisma.$disconnect();
  if (fallos > 0) process.exit(1);
}

principal().catch(async (error) => {
  console.error("❌ La verificación ha fallado:", error);
  await prisma.$disconnect();
  process.exit(1);
});
