import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toJsonInput } from "@/lib/json";
import { cambioDePrecioRelevante, coincideConTendencia, mejorCoincidencia, volumenAproximado } from "@/lib/coincidencia";
import {
  leerCatalogoPublico,
  normalizarDominio,
  type CatalogoTienda,
  type MotivoFalloCatalogo,
  type ProductoCatalogo,
} from "@/lib/providers/shopifyCatalogo";
import { tendenciasDelDia } from "@/lib/providers/tendenciasGoogle";
import { tipoDatoDeFila, type FuenteId } from "@/lib/confianza";
import {
  construirProcedencia,
  guardarProcedencia,
  leerProcedencia,
  recalcularConfianzaProducto,
  type ProcedenciaMetrica,
} from "@/lib/confianzaProducto";
import { revisarConfianza, type ResumenConfianza } from "@/lib/mantenimientoConfianza";

/**
 * ============================================================================
 *  INGESTA REAL SIN CLAVES
 * ============================================================================
 *  Convierte dos fuentes públicas en datos medidos dentro de la base:
 *
 *   1. Catálogo público de Shopify (`/products.json`): qué vende cada tienda,
 *      a qué precio y desde cuándo. Genera altas, cambios de precio y
 *      agotados en el timeline de la tienda.
 *
 *   2. Google Trends RSS: qué se está buscando hoy. Si un término casa con el
 *      título de un producto, queda registrado como observación MEDIDA con su
 *      fecha; si no casa, no se registra nada.
 *
 *  Reglas que no se rompen:
 *   · Nunca se escribe un dato que la fuente no haya devuelto.
 *   · Si la tienda falla, no se crea una tienda vacía ni se inventan productos:
 *     se devuelve el motivo exacto.
 *   · `storesUsing` solo cuenta tiendas leídas en vivo (`origen = "ingesta"`);
 *     nunca suma tiendas de demostración.
 * ============================================================================
 */

/** Un evento detectado durante la ingesta, para poder enseñarlo en pantalla. */
export interface CambioDetectado {
  tipo: "nuevo" | "precio" | "agotado";
  titulo: string;
  precioAntes?: number;
  precioAhora?: number;
  productoInterno?: string;
  /** Precio antes/después traducido a puntos de interés (0–100). */
  impacto: number;
}

export interface ResultadoIngestaTienda {
  ok: boolean;
  dominio: string;
  tiendaId: string | null;
  nombre: string | null;
  urlConsultada: string;
  productosLeidos: number;
  nuevos: number;
  actualizados: number;
  cambiosDePrecio: number;
  agotados: number;
  emparejados: number;
  eventos: number;
  cambios: CambioDetectado[];
  error: string | null;
  motivo: MotivoFalloCatalogo | null;
  latenciaMs: number;
}

export interface OpcionesIngestaTienda {
  /** Páginas del catálogo a leer (1–4). Por defecto 3 (750 productos). */
  paginas?: number;
  /** Nicho de la tienda si se conoce; si no, se deduce del catálogo. */
  nicho?: string;
  /** País de la tienda (ISO-2). Por defecto ES. */
  pais?: string;
  /** Emparejar con el catálogo interno de productos. Por defecto sí. */
  emparejar?: boolean;
  /**
   * Catálogo ya leído. Solo para pruebas y para reutilizar una lectura hecha
   * por otro proceso: evita la red y no cambia el comportamiento.
   */
  catalogo?: CatalogoTienda;
}

export interface ResultadoTendencias {
  ok: boolean;
  geo: string;
  dia: string;
  terminos: number;
  nuevos: number;
  /** Productos cuyo título casa con algún término del día. */
  coincidencias: Array<{ productoId: string; titulo: string; termino: string; volumen: string }>;
  error: string | null;
  latenciaMs: number;
}

export interface ResultadoIngestaGlobal {
  tiendas: ResultadoIngestaTienda[];
  tendencias: ResultadoTendencias | null;
  confianzasRecalculadas: number;
  /** Revisión final: qué productos han cambiado de nivel y qué se ha avisado. */
  confianza: ResumenConfianza | null;
  duracionMs: number;
}

/** Fecha del día natural en formato YYYY-MM-DD (Europe/Madrid). */
export function diaNatural(fecha: Date = new Date(), zona = "Europe/Madrid"): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

/** Inicio del día UTC, para agrupar las mediciones de una misma jornada. */
function inicioDelDia(fecha: Date = new Date()): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** Cerrojo en memoria: evita dos ingestas simultáneas de la misma tienda. */
const enCurso = new Set<string>();

/**
 * Ingiere el catálogo de una tienda real.
 *
 * Es la función que usa la interfaz y el cron. Puede inyectarse `catalogo`
 * (lectura ya hecha) para pruebas sin red.
 */
export async function ingerirTienda(
  dominio: string,
  opciones: OpcionesIngestaTienda = {},
): Promise<ResultadoIngestaTienda> {
  const inicio = Date.now();
  const limpio = normalizarDominio(dominio);

  const vacio = (error: string, motivo: MotivoFalloCatalogo | null): ResultadoIngestaTienda => ({
    ok: false,
    dominio: limpio ?? dominio,
    tiendaId: null,
    nombre: null,
    urlConsultada: "",
    productosLeidos: 0,
    nuevos: 0,
    actualizados: 0,
    cambiosDePrecio: 0,
    agotados: 0,
    emparejados: 0,
    eventos: 0,
    cambios: [],
    error,
    motivo,
    latenciaMs: Date.now() - inicio,
  });

  if (!limpio) return vacio("El dominio no es válido. Ejemplo: mitienda.com", "dominio-invalido");
  if (enCurso.has(limpio)) return vacio("Ya hay una lectura de esta tienda en marcha.", "red");

  enCurso.add(limpio);
  try {
    const catalogo =
      opciones.catalogo ??
      (await leerCatalogoPublico(limpio, { paginas: opciones.paginas ?? 3 }));

    if (!catalogo.ok) {
      logger.aviso("ingesta_tienda_fallida", {
        dominio: limpio,
        motivo: catalogo.motivo,
        error: catalogo.error,
      });
      return {
        ...vacio(catalogo.error ?? "No se ha podido leer el catálogo.", catalogo.motivo),
        urlConsultada: catalogo.urlConsultada,
        latenciaMs: catalogo.latenciaMs,
      };
    }

    const resultado = await guardarCatalogo(catalogo, {
      nicho: opciones.nicho,
      pais: opciones.pais ?? "ES",
      emparejar: opciones.emparejar ?? true,
    });

    logger.info("ingesta_tienda", {
      dominio: limpio,
      leidos: resultado.productosLeidos,
      nuevos: resultado.nuevos,
      precios: resultado.cambiosDePrecio,
      agotados: resultado.agotados,
      emparejados: resultado.emparejados,
      duracionMs: Date.now() - inicio,
    });

    return { ...resultado, latenciaMs: Date.now() - inicio };
  } catch (excepcion) {
    logger.error("ingesta_tienda_excepcion", {
      dominio: limpio,
      error: excepcion instanceof Error ? excepcion.message : String(excepcion),
    });
    return vacio(
      excepcion instanceof Error ? excepcion.message : "Error inesperado al guardar el catálogo.",
      "red",
    );
  } finally {
    enCurso.delete(limpio);
  }
}

/**
 * Persiste un catálogo ya leído.
 *
 * Es la parte que se puede probar sin red: recibe exactamente lo que devolvió
 * el catálogo público y lo traduce a tienda, productos, precios y eventos.
 */
export async function guardarCatalogo(
  catalogo: CatalogoTienda,
  opciones: { nicho?: string; pais?: string; emparejar?: boolean } = {},
): Promise<ResultadoIngestaTienda> {
  const ahora = new Date();
  const zona = opciones.pais ?? "ES";
  const shopifyUrl = `https://${catalogo.dominio}`;

  // --- 1. La tienda ---------------------------------------------------------
  const existente = await prisma.store.findUnique({ where: { shopifyUrl } });
  const nicho =
    opciones.nicho ??
    existente?.niche ??
    tipoMasComun(catalogo.productos.map((producto) => producto.tipo)) ??
    "General";

  const datosTienda = {
    name: catalogo.nombre ?? existente?.name ?? catalogo.dominio,
    domain: catalogo.dominio,
    niche: nicho,
    country: zona,
    shopifyDetected: true,
    productsCount: catalogo.total,
    origen: "ingesta",
    lastScannedAt: ahora,
    categories: toJsonInput(
      [...new Set(catalogo.productos.map((producto) => producto.tipo).filter(Boolean))].slice(0, 12),
    ),
  };

  const tienda = existente
    ? await prisma.store.update({ where: { id: existente.id }, data: datosTienda })
    : await prisma.store.create({
        data: {
          ...datosTienda,
          shopifyUrl,
          // Campos estimados de la demo: a cero hasta que haya una medición.
          estimatedMonthlyRevenue: 0,
          estimatedTraffic: 0,
          monthlyVisits: 0,
          avgOrderValue: 0,
          conversionRate: 0,
          growthRate: 0,
        },
      });

  // --- 2. Productos ya conocidos de esa tienda ------------------------------
  const previos = await prisma.storeProduct.findMany({
    where: { storeId: tienda.id },
    select: { id: true, externalId: true, title: true, price: true, available: true },
  });

  const porExterno = new Map<string, (typeof previos)[number]>();
  const porTitulo = new Map<string, (typeof previos)[number]>();
  for (const fila of previos) {
    if (fila.externalId) porExterno.set(fila.externalId, fila);
    porTitulo.set(fila.title.trim().toLowerCase(), fila);
  }

  const cambios: CambioDetectado[] = [];
  const vistos = new Set<string>();
  let nuevos = 0;
  let actualizados = 0;
  let cambiosDePrecio = 0;
  let agotados = 0;

  for (const producto of catalogo.productos) {
    const previo =
      porExterno.get(producto.idExterno) ?? porTitulo.get(producto.titulo.trim().toLowerCase());

    if (!previo) {
      const creado = await prisma.storeProduct.create({
        data: {
          storeId: tienda.id,
          externalId: producto.idExterno,
          title: producto.titulo,
          image: producto.imagen,
          price: producto.precio,
          comparePrice: producto.precioComparativo,
          currency: producto.moneda,
          productUrl: producto.url,
          available: producto.disponible,
          detectedAt: ahora,
          lastSeenAt: ahora,
        },
        select: { id: true },
      });
      vistos.add(creado.id);
      nuevos += 1;
      cambios.push({ tipo: "nuevo", titulo: producto.titulo, precioAhora: producto.precio, impacto: 40 });
      await prisma.priceHistory.create({
        data: { storeId: tienda.id, title: producto.titulo, price: producto.precio, capturedAt: ahora },
      });
      continue;
    }

    vistos.add(previo.id);
    actualizados += 1;

    const cambioPrecio = cambioDePrecioRelevante(previo.price, producto.precio);
    const pasoAAgotado = previo.available && !producto.disponible;

    if (cambioPrecio) {
      cambiosDePrecio += 1;
      cambios.push({
        tipo: "precio",
        titulo: producto.titulo,
        precioAntes: previo.price,
        precioAhora: producto.precio,
        impacto: impactoDePrecio(previo.price, producto.precio),
      });
      await prisma.priceHistory.create({
        data: { storeId: tienda.id, title: producto.titulo, price: producto.precio, capturedAt: ahora },
      });
    }

    if (pasoAAgotado) {
      agotados += 1;
      cambios.push({
        tipo: "agotado",
        titulo: producto.titulo,
        precioAhora: producto.precio,
        impacto: 55,
      });
    }

    await prisma.storeProduct.update({
      where: { id: previo.id },
      data: {
        externalId: producto.idExterno,
        title: producto.titulo,
        image: producto.imagen ?? undefined,
        price: producto.precio,
        comparePrice: producto.precioComparativo,
        currency: producto.moneda,
        productUrl: producto.url,
        available: producto.disponible,
        lastSeenAt: ahora,
      },
    });
  }

  // --- 3. Productos que han desaparecido del catálogo -----------------------
  // Solo si se ha leído el catálogo ENTERO: si se cortó a 250 de 900, no
  // aparecer no significa nada.
  let desaparecidos = 0;
  if (catalogo.completo) {
    for (const fila of previos) {
      if (vistos.has(fila.id) || !fila.available) continue;
      desaparecidos += 1;
      cambios.push({ tipo: "agotado", titulo: fila.title, precioAhora: fila.price, impacto: 45 });
      await prisma.storeProduct.update({ where: { id: fila.id }, data: { available: false } });
    }
    agotados += desaparecidos;
  }

  // --- 4. Emparejar con el catálogo interno --------------------------------
  let emparejados = 0;
  if (opciones.emparejar !== false) {
    emparejados = await emparejarTiendaConCatalogo(tienda.id);
  }

  // --- 5. Timeline ---------------------------------------------------------
  for (const cambio of cambios.slice(0, 40)) {
    await prisma.storeChange.create({
      data: {
        storeId: tienda.id,
        type: cambio.tipo === "nuevo" ? "NEW_PRODUCT" : cambio.tipo === "precio" ? "PRICE_CHANGE" : "SOLD_OUT",
        title:
          cambio.tipo === "nuevo"
            ? `Producto nuevo en ${tienda.name}`
            : cambio.tipo === "precio"
              ? `Cambio de precio en ${tienda.name}`
              : `Producto agotado en ${tienda.name}`,
        description:
          cambio.tipo === "precio"
            ? `${cambio.titulo}: ${formatoPrecio(cambio.precioAntes)} → ${formatoPrecio(cambio.precioAhora)}`
            : cambio.tipo === "nuevo"
              ? `${cambio.titulo} · ${formatoPrecio(cambio.precioAhora)}`
              : `${cambio.titulo} ya no está disponible`,
        productTitle: cambio.titulo,
        priceBefore: cambio.precioAntes ?? null,
        priceAfter: cambio.precioAhora ?? null,
        impactScore: cambio.impacto,
        detectedAt: ahora,
      },
    });
  }

  return {
    ok: true,
    dominio: catalogo.dominio,
    tiendaId: tienda.id,
    nombre: tienda.name,
    urlConsultada: catalogo.urlConsultada,
    productosLeidos: catalogo.total,
    nuevos,
    actualizados,
    cambiosDePrecio,
    agotados,
    emparejados,
    eventos: Math.min(cambios.length, 40),
    cambios: cambios.slice(0, 40),
    error: null,
    motivo: null,
    latenciaMs: catalogo.latenciaMs,
  };
}

/**
 * Empareja los productos de una tienda con el catálogo interno y actualiza
 * `storesUsing` con el número REAL de tiendas leídas en vivo que lo venden.
 */
export async function emparejarTiendaConCatalogo(tiendaId: string): Promise<number> {
  const [filas, internos] = await Promise.all([
    prisma.storeProduct.findMany({
      where: { storeId: tiendaId },
      select: { id: true, title: true, productId: true },
    }),
    prisma.product.findMany({ select: { id: true, title: true } }),
  ]);

  let emparejados = 0;
  const productosTocados = new Set<string>();

  for (const fila of filas) {
    const encontrado = mejorCoincidencia(fila.title, internos);
    if (!encontrado) {
      if (fila.productId) {
        // Antes casaba y ahora no: se quita el vínculo para no contar de más.
        await prisma.storeProduct.update({ where: { id: fila.id }, data: { productId: null } });
        productosTocados.add(fila.productId);
      }
      continue;
    }
    if (fila.productId !== encontrado.producto.id) {
      await prisma.storeProduct.update({
        where: { id: fila.id },
        data: { productId: encontrado.producto.id },
      });
    }
    productosTocados.add(encontrado.producto.id);
    emparejados += 1;
  }

  // Recuento real de tiendas (solo tiendas leídas del catálogo público).
  for (const productoId of productosTocados) {
    const tiendas = await prisma.storeProduct.findMany({
      where: { productId: productoId, store: { origen: "ingesta" } },
      select: { storeId: true },
      distinct: ["storeId"],
    });
    const total = tiendas.length;
    await prisma.product.update({ where: { id: productoId }, data: { storesUsing: total } });
    if (total > 0) {
      await registrarObservaciones(productoId, [
        { fuente: "tiendas", valor: total, origen: "catalogo-shopify" },
      ]);
    }
  }

  return emparejados;
}

/**
 * Lee las tendencias del día y las guarda. Después marca los productos cuyo
 * título casa con algún término: esa observación es MEDIDA y lleva fecha.
 */
export async function ingerirTendencias(geo = "ES"): Promise<ResultadoTendencias> {
  const inicio = Date.now();
  const dia = diaNatural();
  const respuesta = await tendenciasDelDia(geo);

  if (!respuesta.datos || respuesta.datos.length === 0) {
    return {
      ok: false,
      geo,
      dia,
      terminos: 0,
      nuevos: 0,
      coincidencias: [],
      error: respuesta.error ?? "Google Trends no ha devuelto tendencias ahora mismo.",
      latenciaMs: Date.now() - inicio,
    };
  }

  let nuevos = 0;
  for (const [indice, termino] of respuesta.datos.entries()) {
    const volumen = volumenAproximado(termino.busquedas);
    const existente = await prisma.trendingTerm.findUnique({
      where: { term_geo_day: { term: termino.titulo, geo, day: dia } },
    });
    if (existente) {
      await prisma.trendingTerm.update({
        where: { id: existente.id },
        data: { volume: termino.busquedas, approxVolume: volumen, rank: indice + 1, url: termino.url },
      });
    } else {
      await prisma.trendingTerm.create({
        data: {
          term: termino.titulo,
          geo,
          day: dia,
          volume: termino.busquedas,
          approxVolume: volumen,
          rank: indice + 1,
          url: termino.url,
        },
      });
      nuevos += 1;
    }
  }

  const coincidencias = await aplicarTendenciasAProductos(dia, geo);

  logger.info("ingesta_tendencias", {
    geo,
    dia,
    terminos: respuesta.datos.length,
    nuevos,
    coincidencias: coincidencias.length,
  });

  return {
    ok: true,
    geo,
    dia,
    terminos: respuesta.datos.length,
    nuevos,
    coincidencias,
    error: null,
    latenciaMs: Date.now() - inicio,
  };
}

/** Cruza los términos del día con los productos y registra lo que case. */
export async function aplicarTendenciasAProductos(
  dia = diaNatural(),
  geo = "ES",
): Promise<Array<{ productoId: string; titulo: string; termino: string; volumen: string }>> {
  const [terminos, productos] = await Promise.all([
    prisma.trendingTerm.findMany({ where: { day: dia, geo }, orderBy: { rank: "asc" } }),
    prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, title: true } }),
  ]);

  const coincidencias: Array<{ productoId: string; titulo: string; termino: string; volumen: string }> = [];

  for (const producto of productos) {
    const casados = terminos.filter((termino) => coincideConTendencia(producto.title, termino.term));
    if (casados.length === 0) continue;

    // Se usa el término de mayor volumen como valor de la observación.
    const mejor = casados.reduce((a, b) => (b.approxVolume > a.approxVolume ? b : a));
    await registrarObservaciones(producto.id, [
      { fuente: "tendencias", valor: mejor.approxVolume, origen: "google-trends-rss" },
    ]);
    coincidencias.push({
      productoId: producto.id,
      titulo: producto.title,
      termino: mejor.term,
      volumen: mejor.volume,
    });
  }

  return coincidencias;
}

/**
 * Guarda observaciones MEDIDAS de un producto.
 *
 * Regla: se reutiliza la medición de hoy si existe (una fila por jornada) y se
 * conserva la procedencia de las demás fuentes con su fecha original. Lo que
 * no se ha medido no se toca: nunca se reescribe una fecha para parecer nuevo.
 */
export async function registrarObservaciones(
  productoId: string,
  nuevas: Array<{ fuente: FuenteId; valor: number; origen: string }>,
): Promise<void> {
  if (nuevas.length === 0) return;
  const ahora = new Date();
  const dia = inicioDelDia(ahora);

  const [producto, previa] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productoId },
      select: { googleSearchVolume: true, tiktokViews: true, youtubeViews: true, metaAdsCount: true, storesUsing: true },
    }),
    prisma.trendMetric.findFirst({
      where: { productId: productoId },
      orderBy: { fechaMedicion: "desc" },
      select: {
        id: true,
        googleSearchVolume: true,
        tiktokViews: true,
        youtubeViews: true,
        metaAdsCount: true,
        shopifyStoresUsing: true,
        procedencia: true,
        date: true,
      },
    }),
  ]);
  if (!producto) return;

  const heredado: Partial<Record<FuenteId, number>> = {
    google: previa?.googleSearchVolume ?? producto.googleSearchVolume,
    tiktok: previa?.tiktokViews ?? producto.tiktokViews,
    youtube: previa?.youtubeViews ?? producto.youtubeViews,
    meta: previa?.metaAdsCount ?? producto.metaAdsCount,
    tiendas: previa?.shopifyStoresUsing ?? producto.storesUsing,
  };

  const medido: Partial<Record<FuenteId, { fuente: string }>> = {};
  for (const nueva of nuevas) {
    medido[nueva.fuente] = { fuente: nueva.origen };
    if (nueva.fuente !== "tendencias") heredado[nueva.fuente] = nueva.valor;
  }

  const anterior: ProcedenciaMetrica = leerProcedencia(previa?.procedencia);
  const procedencia = construirProcedencia(heredado, medido, anterior, ahora);

  // Fuentes sin columna propia: se escriben solo en la procedencia.
  for (const nueva of nuevas) {
    if (nueva.fuente !== "tendencias") continue;
    procedencia.tendencias = {
      tipo: "MEDIDO",
      fuente: nueva.origen,
      fecha: ahora.toISOString(),
      valor: nueva.valor,
    };
  }

  const tipoFila = tipoDatoDeFila(Object.values(procedencia).map((fuente) => fuente.tipo));
  const datos = {
    googleSearchVolume: Math.round(heredado.google ?? 0),
    tiktokViews: Math.round(heredado.tiktok ?? 0),
    youtubeViews: Math.round(heredado.youtube ?? 0),
    metaAdsCount: Math.round(heredado.meta ?? 0),
    shopifyStoresUsing: Math.round(heredado.tiendas ?? 0),
    fuente: nuevas[0].origen,
    fechaMedicion: ahora,
    tipoDato: tipoFila,
  };

  // Una fila por jornada: si ya hay medición de hoy, se actualiza.
  const deHoy = previa && previa.date >= dia;
  const metricaId = deHoy
    ? (await prisma.trendMetric.update({ where: { id: previa.id }, data: datos })).id
    : (
        await prisma.trendMetric.create({
          data: { ...datos, productId: productoId, date: ahora, calculatedScore: 0 },
          select: { id: true },
        })
      ).id;

  await guardarProcedencia(metricaId, procedencia);
  await recalcularConfianzaProducto(productoId);
}

/** Ejecuta la ingesta completa: tendencias del día + todas las tiendas vivas. */
export async function ingerirTodo(
  opciones: { geo?: string; dominios?: string[]; paginas?: number; tendencias?: boolean; maxTiendas?: number } = {},
): Promise<ResultadoIngestaGlobal> {
  const inicio = Date.now();
  const geo = opciones.geo ?? "ES";
  const incluirTendencias = opciones.tendencias !== false;

  const dominios =
    opciones.dominios?.length
      ? opciones.dominios
      : (
          await prisma.store.findMany({
            where: { origen: "ingesta" },
            select: { domain: true },
            orderBy: { lastScannedAt: "asc" },
            take: Math.min(Math.max(opciones.maxTiendas ?? 8, 1), 20),
          })
        ).map((tienda) => tienda.domain);

  const tiendas: ResultadoIngestaTienda[] = [];
  for (const dominio of dominios) {
    tiendas.push(await ingerirTienda(dominio, { paginas: opciones.paginas }));
  }

  const tendencias = incluirTendencias ? await ingerirTendencias(geo) : null;

  // La confianza se recalcula al final: así una tienda nueva puede convertir
  // un producto ESTIMADO en PARCIAL con evidencia real, y una medición que ha
  // caducado hace que baje de nivel (y pierda el dorado) al momento.
  const revision = await revisarConfianza();
  const confianzasRecalculadas = revision.total - revision.sinDatos;

  return {
    tiendas,
    tendencias,
    confianzasRecalculadas,
    confianza: revision,
    duracionMs: Date.now() - inicio,
  };
}

// ---------------------------------------------------------------------------
//  Utilidades internas
// ---------------------------------------------------------------------------

/** Valor más repetido de una lista (para deducir el nicho del catálogo). */
function tipoMasComun(valores: Array<string | null>): string | null {
  const conteo = new Map<string, number>();
  for (const valor of valores) {
    if (!valor) continue;
    const limpio = valor.trim();
    if (!limpio) continue;
    conteo.set(limpio, (conteo.get(limpio) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let maximo = 0;
  for (const [valor, veces] of conteo) {
    if (veces > maximo) {
      mejor = valor;
      maximo = veces;
    }
  }
  return mejor;
}

/** Interés del cambio de precio: 5 puntos por cada 10 % de variación (máx. 90). */
function impactoDePrecio(antes: number, ahora: number): number {
  if (antes <= 0) return 30;
  const variacion = Math.abs(ahora - antes) / antes;
  return Math.min(90, Math.max(20, Math.round(variacion * 500)));
}

/** Precio legible para las descripciones del timeline. */
function formatoPrecio(valor?: number): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(2).replace(".", ",")} €`;
}

/** Tipo de producto más común de una tienda, para mostrarlo en la ficha. */
export function resumenCatalogo(productos: ProductoCatalogo[]): { tipos: string[]; rango: [number, number] } {
  const tipos = [...new Set(productos.map((producto) => producto.tipo).filter((tipo): tipo is string => Boolean(tipo)))];
  const precios = productos.map((producto) => producto.precio).filter((precio) => precio > 0);
  return {
    tipos: tipos.slice(0, 5),
    rango: precios.length > 0 ? [Math.min(...precios), Math.max(...precios)] : [0, 0],
  };
}
