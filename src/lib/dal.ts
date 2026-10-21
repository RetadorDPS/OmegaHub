import prisma from "@/lib/prisma";
import { parseJsonArray, parseJsonObject } from "@/lib/utils";
import type {
  AdDTO,
  AdFilters,
  NotificationDTO,
  PaginatedResult,
  ProductDTO,
  ProductFilters,
  StoreChangeDTO,
  StoreDTO,
  StoreProductDTO,
  TrendMetricDTO,
} from "@/types";

/**
 * ============================================================================
 *  CAPA DE ACCESO A DATOS (DAL)
 * ============================================================================
 *  Todas las consultas a Prisma y la serialización a DTOs viven aquí: las
 *  páginas y los componentes nunca tocan el cliente Prisma directamente.
 *  Prisma devuelve `Date` y columnas `Json` como texto en SQLite, así que los
 *  conversores normalizan fechas (ISO) y arrays (parseJsonArray).
 * ============================================================================
 */

// ---------------------------------------------------------------------------
//  Conversores de entidades → DTO
// ---------------------------------------------------------------------------

type ProductRow = Awaited<ReturnType<typeof prisma.product.findFirstOrThrow>>;

/** Convierte una fila de producto en DTO serializable. */
export function toProductDTO(producto: ProductRow): ProductDTO {
  return {
    id: producto.id,
    title: producto.title,
    slug: producto.slug,
    description: producto.description,
    mainImage: producto.mainImage,
    images: parseJsonArray<string>(producto.images),
    category: producto.category,
    nicheTag: producto.nicheTag,
    tags: parseJsonArray<string>(producto.tags),
    costPrice: producto.costPrice,
    suggestedSellPrice: producto.suggestedSellPrice,
    estimatedMargin: producto.estimatedMargin,
    aliExpressUrl: producto.aliExpressUrl,
    amazonUrl: producto.amazonUrl,
    cjUrl: producto.cjUrl,
    supplierName: producto.supplierName,
    trendScore: producto.trendScore,
    velocityScore: producto.velocityScore,
    saturationLevel: producto.saturationLevel,
    trendDirection: producto.trendDirection,
    isGoldenOpportunity: producto.isGoldenOpportunity,
    confianza: producto.confianza,
    nivelConfianza: producto.nivelConfianza,
    fuentesMedidas: producto.fuentesMedidas,
    ultimaMedicion: producto.ultimaMedicion?.toISOString() ?? null,
    googleSearchVolume: producto.googleSearchVolume,
    tiktokViews: producto.tiktokViews,
    youtubeViews: producto.youtubeViews ?? 0,
    metaAdsCount: producto.metaAdsCount,
    storesUsing: producto.storesUsing,
    estimatedMonthlyRevenue: producto.estimatedMonthlyRevenue,
    estimatedUnitsSold: producto.estimatedUnitsSold,
    status: producto.status,
    countryAvailability: parseJsonArray<string>(producto.countryAvailability),
    createdAt: producto.createdAt.toISOString(),
    updatedAt: producto.updatedAt.toISOString(),
  };
}

type StoreRow = Awaited<ReturnType<typeof prisma.store.findFirstOrThrow>>;

/** Convierte una fila de tienda en DTO serializable. */
export function toStoreDTO(tienda: StoreRow & { storeProducts?: Array<{ title: string; image: string | null; price: number; comparePrice: number | null; salesRank: number; estimatedUnitsSold: number; productUrl: string | null }> }): StoreDTO {
  const productosTienda: StoreProductDTO[] = tienda.storeProducts?.length
    ? tienda.storeProducts.map((p) => ({
        title: p.title,
        image: p.image,
        price: p.price,
        comparePrice: p.comparePrice,
        salesRank: p.salesRank,
        estimatedUnitsSold: p.estimatedUnitsSold,
        productUrl: p.productUrl,
      }))
    : parseJsonArray<StoreProductDTO>(tienda.topProducts);

  return {
    id: tienda.id,
    shopifyUrl: tienda.shopifyUrl,
    name: tienda.name,
    domain: tienda.domain,
    niche: tienda.niche,
    country: tienda.country,
    shopifyDetected: tienda.shopifyDetected,
    themeName: tienda.themeName,
    estimatedMonthlyRevenue: tienda.estimatedMonthlyRevenue,
    estimatedTraffic: tienda.estimatedTraffic,
    monthlyVisits: tienda.monthlyVisits,
    avgOrderValue: tienda.avgOrderValue,
    conversionRate: tienda.conversionRate,
    productsCount: tienda.productsCount,
    categories: parseJsonArray<string>(tienda.categories),
    appsDetected: parseJsonArray<string>(tienda.appsDetected),
    growthRate: tienda.growthRate,
    lastScannedAt: tienda.lastScannedAt?.toISOString() ?? null,
    topProducts: productosTienda,
  };
}

type AdRow = Awaited<ReturnType<typeof prisma.ad.findFirstOrThrow>> & { product?: { title: string } | null };

/** Convierte una fila de anuncio en DTO serializable. */
export function toAdDTO(anuncio: AdRow): AdDTO {
  return {
    id: anuncio.id,
    platform: anuncio.platform,
    productId: anuncio.productId,
    productTitle: anuncio.product?.title ?? null,
    mediaUrl: anuncio.mediaUrl,
    thumbnailUrl: anuncio.thumbnailUrl,
    videoUrl: anuncio.videoUrl,
    headline: anuncio.headline,
    body: anuncio.body,
    callToAction: anuncio.callToAction,
    likes: anuncio.likes,
    comments: anuncio.comments,
    shares: anuncio.shares,
    views: anuncio.views,
    daysActive: anuncio.daysActive,
    countryTargets: parseJsonArray<string>(anuncio.countryTargets),
    nicheTag: anuncio.nicheTag,
    advertiserName: anuncio.advertiserName,
    adLibraryUrl: anuncio.adLibraryUrl,
    engagementRate: anuncio.engagementRate,
    isActive: anuncio.isActive,
    firstSeenAt: anuncio.firstSeenAt.toISOString(),
  };
}

type NotificationRow = Awaited<ReturnType<typeof prisma.alertNotification.findFirstOrThrow>>;

/** Convierte una notificación en DTO serializable. */
export function toNotificationDTO(notificacion: NotificationRow): NotificationDTO {
  return {
    id: notificacion.id,
    type: notificacion.type,
    title: notificacion.title,
    message: notificacion.message,
    read: notificacion.read,
    entityType: notificacion.entityType,
    entityId: notificacion.entityId,
    actionUrl: notificacion.actionUrl,
    createdAt: notificacion.createdAt.toISOString(),
  };
}

type ChangeRow = Awaited<ReturnType<typeof prisma.storeChange.findFirstOrThrow>> & { store?: { name: string } };

/** Convierte un evento de timeline en DTO serializable. */
export function toStoreChangeDTO(evento: ChangeRow): StoreChangeDTO {
  return {
    id: evento.id,
    storeId: evento.storeId,
    storeName: evento.store?.name,
    type: evento.type,
    title: evento.title,
    description: evento.description,
    productTitle: evento.productTitle,
    imageUrl: evento.imageUrl,
    priceBefore: evento.priceBefore,
    priceAfter: evento.priceAfter,
    impactScore: evento.impactScore,
    detectedAt: evento.detectedAt.toISOString(),
  };
}

/** Convierte métricas diarias de tendencia en DTO serializable. */
export function toTrendMetricDTO(metrica: {
  date: Date;
  googleSearchVolume: number;
  tiktokViews: number;
  youtubeViews?: number;
  metaAdsCount: number;
  shopifyStoresUsing: number;
  calculatedScore: number;
  fuente?: string;
  fechaMedicion?: Date;
  tipoDato?: "MEDIDO" | "IMPORTADO" | "ESTIMADO" | "MIXTO";
}): TrendMetricDTO {
  return {
    date: metrica.date.toISOString(),
    googleSearchVolume: metrica.googleSearchVolume,
    tiktokViews: metrica.tiktokViews,
    youtubeViews: metrica.youtubeViews ?? 0,
    metaAdsCount: metrica.metaAdsCount,
    shopifyStoresUsing: metrica.shopifyStoresUsing,
    calculatedScore: metrica.calculatedScore,
    fuente: metrica.fuente ?? "motor-interno",
    fechaMedicion: (metrica.fechaMedicion ?? metrica.date).toISOString(),
    tipoDato: metrica.tipoDato ?? "ESTIMADO",
  };
}

// ---------------------------------------------------------------------------
//  Consultas de productos
// ---------------------------------------------------------------------------

/** Mapa de ordenación de la URL al `orderBy` de Prisma. */
function ordenProductos(sort: ProductFilters["sort"]) {
  switch (sort) {
    case "best-score":
      return [{ trendScore: "desc" as const }, { velocityScore: "desc" as const }];
    case "highest-margin":
      return [{ estimatedMargin: "desc" as const }];
    case "least-saturated":
      return [{ saturationLevel: "asc" as const }, { trendScore: "desc" as const }];
    case "fastest-rising":
      return [{ velocityScore: "desc" as const }];
    case "highest-revenue":
      return [{ estimatedMonthlyRevenue: "desc" as const }];
    case "recent":
    default:
      return [{ createdAt: "desc" as const }];
  }
}

/**
 * Catálogo paginado con filtros avanzados.
 * Aplica búsqueda por texto, categoría, nicho, saturación, rangos de precio y
 * score mínimo, más el orden seleccionado.
 */
export async function listProducts(filtros: ProductFilters = {}): Promise<PaginatedResult<ProductDTO>> {
  const page = Math.max(1, filtros.page ?? 1);
  // Límites de seguridad: ni 0 (rompe la paginación) ni páginas enormes.
  const pageSize = Math.min(100, Math.max(1, filtros.pageSize ?? 12));

  const where = {
    status: "ACTIVE" as const,
    ...(filtros.search
      ? {
          OR: [
            { title: { contains: filtros.search } },
            { description: { contains: filtros.search } },
            { nicheTag: { contains: filtros.search } },
          ],
        }
      : {}),
    ...(filtros.category && filtros.category !== "ALL" ? { category: filtros.category } : {}),
    ...(filtros.niche && filtros.niche !== "ALL" ? { nicheTag: filtros.niche } : {}),
    ...(filtros.saturation && filtros.saturation !== "ALL" ? { saturationLevel: filtros.saturation } : {}),
    ...(typeof filtros.minScore === "number" ? { trendScore: { gte: filtros.minScore } } : {}),
    ...(typeof filtros.minMargin === "number" ? { estimatedMargin: { gte: filtros.minMargin } } : {}),
    ...(typeof filtros.minPrice === "number" || typeof filtros.maxPrice === "number"
      ? {
          suggestedSellPrice: {
            ...(typeof filtros.minPrice === "number" ? { gte: filtros.minPrice } : {}),
            ...(typeof filtros.maxPrice === "number" ? { lte: filtros.maxPrice } : {}),
          },
        }
      : {}),
    ...(filtros.goldenOnly ? { isGoldenOpportunity: true } : {}),
    ...(filtros.verificadosOnly ? { nivelConfianza: "VERIFICADO" as const } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: ordenProductos(filtros.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map(toProductDTO),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Producto completo con su histórico de 30 días y anuncios asociados. */
export async function getProductDetail(id: string) {
  const producto = await prisma.product.findUnique({
    where: { id },
    include: {
      metrics: { orderBy: { date: "asc" } },
      ads: { orderBy: { daysActive: "desc" }, take: 6 },
      storeListings: {
        include: { store: { select: { id: true, name: true, domain: true, estimatedMonthlyRevenue: true, country: true } } },
        orderBy: { estimatedUnitsSold: "desc" },
        take: 6,
      },
    },
  });
  if (!producto) return null;

  return {
    product: toProductDTO(producto),
    metrics: producto.metrics.map(toTrendMetricDTO),
    ads: producto.ads.map((anuncio) => toAdDTO(anuncio)),
    stores: producto.storeListings.map((listado) => ({
      id: listado.store.id,
      name: listado.store.name,
      domain: listado.store.domain,
      country: listado.store.country,
      estimatedMonthlyRevenue: listado.store.estimatedMonthlyRevenue,
      price: listado.price,
      estimatedUnitsSold: listado.estimatedUnitsSold,
      productUrl: listado.productUrl,
    })),
  };
}

/** Productos destacados para el panel general (los de mayor score). */
export async function getTopProducts(limite = 6): Promise<ProductDTO[]> {
  const productos = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ isGoldenOpportunity: "desc" }, { trendScore: "desc" }],
    take: limite,
  });
  return productos.map(toProductDTO);
}

/** Lista de nichos con su número de productos (para los filtros). */
export async function getNiches(): Promise<Array<{ niche: string; count: number }>> {
  const grupos = await prisma.product.groupBy({ by: ["nicheTag"], _count: { _all: true }, orderBy: { nicheTag: "asc" } });
  return grupos.map((grupo) => ({ niche: grupo.nicheTag, count: grupo._count._all }));
}

// ---------------------------------------------------------------------------
//  Consultas de anuncios (Ads Spy)
// ---------------------------------------------------------------------------

/** Biblioteca de anuncios con filtros por plataforma, nicho, país y engagement. */
export async function listAds(filtros: AdFilters = {}): Promise<AdDTO[]> {
  const where = {
    ...(filtros.platform && filtros.platform !== "ALL" ? { platform: filtros.platform } : {}),
    ...(filtros.niche && filtros.niche !== "ALL" ? { nicheTag: filtros.niche } : {}),
    ...(typeof filtros.minEngagement === "number" ? { engagementRate: { gte: filtros.minEngagement } } : {}),
    ...(typeof filtros.minDaysActive === "number" ? { daysActive: { gte: filtros.minDaysActive } } : {}),
    ...(filtros.search
      ? { OR: [{ headline: { contains: filtros.search } }, { body: { contains: filtros.search } }, { advertiserName: { contains: filtros.search } }] }
      : {}),
  };

  const orderBy =
    filtros.sort === "engagement"
      ? [{ engagementRate: "desc" as const }]
      : filtros.sort === "longest-running"
        ? [{ daysActive: "desc" as const }]
        : filtros.sort === "most-liked"
          ? [{ likes: "desc" as const }]
          : [{ createdAt: "desc" as const }];

  let anuncios = await prisma.ad.findMany({ where, orderBy, include: { product: { select: { title: true } } }, take: 60 });

  // Filtro por país objetivo (almacenado como JSON de texto).
  if (filtros.country && filtros.country !== "ALL") {
    anuncios = anuncios.filter((anuncio) =>
      parseJsonArray<string>(anuncio.countryTargets).includes(filtros.country as string),
    );
  }
  return anuncios.map((anuncio) => toAdDTO(anuncio));
}

/** Nichos presentes en la biblioteca de anuncios. */
export async function getAdNiches(): Promise<string[]> {
  const grupos = await prisma.ad.groupBy({ by: ["nicheTag"], orderBy: { nicheTag: "asc" } });
  return grupos.map((grupo) => grupo.nicheTag);
}

/** Estadísticas agregadas para las tarjetas resumen de Ads Spy. */
export async function getAdStats() {
  const [total, porPlataforma, masLargo] = await Promise.all([
    prisma.ad.count(),
    prisma.ad.groupBy({ by: ["platform"], _count: { _all: true } }),
    prisma.ad.findFirst({ orderBy: { daysActive: "desc" }, select: { daysActive: true, headline: true, advertiserName: true } }),
  ]);
  return {
    total,
    porPlataforma: porPlataforma.map((fila) => ({ platform: fila.platform, count: fila._count._all })),
    masLargo,
  };
}

// ---------------------------------------------------------------------------
//  Consultas de tiendas
// ---------------------------------------------------------------------------

/** Tiendas del radar con sus productos más vendidos. */
export async function listStores(limite = 12): Promise<StoreDTO[]> {
  const tiendas = await prisma.store.findMany({
    orderBy: { estimatedMonthlyRevenue: "desc" },
    include: { storeProducts: { orderBy: { salesRank: "asc" }, take: 5 } },
    take: limite,
  });
  return tiendas.map(toStoreDTO);
}

/** Detalle de una tienda con su timeline de cambios. */
export async function getStoreDetail(id: string) {
  const tienda = await prisma.store.findUnique({
    where: { id },
    include: { storeProducts: { orderBy: { salesRank: "asc" } }, changes: { orderBy: { detectedAt: "desc" }, take: 20 } },
  });
  if (!tienda) return null;
  return {
    store: toStoreDTO(tienda),
    changes: tienda.changes.map((evento) => toStoreChangeDTO(evento)),
  };
}

/** Busca una tienda por dominio o URL normalizada. */
export async function findStoreByDomain(dominio: string) {
  const tienda = await prisma.store.findFirst({
    where: { OR: [{ domain: dominio }, { shopifyUrl: { contains: dominio } }] },
    include: { storeProducts: { orderBy: { salesRank: "asc" }, take: 10 } },
  });
  return tienda ? toStoreDTO(tienda) : null;
}

/** Tiendas monitorizadas por un usuario, con su último cambio detectado. */
export async function listTrackedStores(userId: string) {
  const seguimientos = await prisma.trackedStore.findMany({
    where: { userId },
    include: {
      store: {
        include: {
          changes: { orderBy: { detectedAt: "desc" }, take: 1 },
          storeProducts: { orderBy: { salesRank: "asc" }, take: 4 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return seguimientos.map((seguimiento) => ({
    ...toStoreDTO(seguimiento.store),
    notificationEnabled: seguimiento.notificationEnabled,
    trackedSince: seguimiento.createdAt.toISOString(),
    ultimoCambio: seguimiento.store.changes[0] ? toStoreChangeDTO(seguimiento.store.changes[0]) : null,
  }));
}

/** Timeline agregado de todas las tiendas seguidas por un usuario. */
export async function listTrackedStoresTimeline(userId: string, limite = 25): Promise<StoreChangeDTO[]> {
  const eventos = await prisma.storeChange.findMany({
    where: { store: { trackedBy: { some: { userId } } } },
    include: { store: { select: { name: true } } },
    orderBy: { detectedAt: "desc" },
    take: limite,
  });
  return eventos.map((evento) => toStoreChangeDTO(evento));
}

// ---------------------------------------------------------------------------
//  Trackers, guardados y notificaciones
// ---------------------------------------------------------------------------

/** Productos en seguimiento de un usuario con su tendencia actual. */
export async function listTrackedProducts(userId: string) {
  const seguimientos = await prisma.trackedProduct.findMany({
    where: { userId },
    include: { product: { include: { metrics: { orderBy: { date: "asc" }, select: { date: true, calculatedScore: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return seguimientos.map((seguimiento) => ({
    id: seguimiento.id,
    notificationEnabled: seguimiento.notificationEnabled,
    targetTrendScore: seguimiento.targetTrendScore,
    trackedSince: seguimiento.createdAt.toISOString(),
    product: toProductDTO(seguimiento.product),
    // Serie lista para la sparkline de la tarjeta.
    sparkline: seguimiento.product.metrics.map((metrica) => metrica.calculatedScore),
  }));
}

/** Identificadores de los productos guardados por un usuario. */
export async function getSavedProductIds(userId: string): Promise<string[]> {
  const guardados = await prisma.savedProduct.findMany({ where: { userId }, select: { productId: true } });
  return guardados.map((guardado) => guardado.productId);
}

/** Favoritos con notas del usuario. */
export async function listSavedProducts(userId: string) {
  const guardados = await prisma.savedProduct.findMany({
    where: { userId },
    include: { product: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return guardados.map((guardado) => ({
    id: guardado.id,
    folder: guardado.folder,
    notes: guardado.notes,
    priority: guardado.priority,
    createdAt: guardado.createdAt.toISOString(),
    product: toProductDTO(guardado.product),
  }));
}

/** Notificaciones de la campana, ordenadas de más reciente a más antigua. */
export async function listNotifications(userId: string, limite = 20): Promise<NotificationDTO[]> {
  const notificaciones = await prisma.alertNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
  return notificaciones.map(toNotificationDTO);
}

/** Número de notificaciones sin leer. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.alertNotification.count({ where: { userId, read: false } });
}

// ---------------------------------------------------------------------------
//  Estadísticas del panel general
// ---------------------------------------------------------------------------

/** Métricas resumen que alimentan las tarjetas y gráficas del dashboard. */
export async function getDashboardStats() {
  const [productos, dorados, anuncios, tiendas, proveedores, usuarios] = await Promise.all([
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { isGoldenOpportunity: true } }),
    prisma.ad.count(),
    prisma.store.count(),
    prisma.supplier.count(),
    prisma.user.count(),
  ]);

  const [verificados, conMedicion] = await Promise.all([
    prisma.product.count({ where: { status: "ACTIVE", nivelConfianza: "VERIFICADO" } }),
    prisma.product.count({ where: { status: "ACTIVE", fuentesMedidas: { gt: 0 } } }),
  ]);

  // Variación real mes a mes (nada de porcentajes escritos a mano).
  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  const hace60 = new Date(Date.now() - 60 * 86_400_000);
  const [productosUltimoMes, productosMesAnterior, anunciosUltimoMes, anunciosMesAnterior] = await Promise.all([
    prisma.product.count({ where: { status: "ACTIVE", createdAt: { gte: hace30 } } }),
    prisma.product.count({ where: { status: "ACTIVE", createdAt: { gte: hace60, lt: hace30 } } }),
    prisma.ad.count({ where: { createdAt: { gte: hace30 } } }),
    prisma.ad.count({ where: { createdAt: { gte: hace60, lt: hace30 } } }),
  ]);

  /** Variación porcentual; `null` si no hay base con la que comparar. */
  const variacion = (actual: number, anterior: number): number | null =>
    anterior > 0 ? Math.round(((actual - anterior) / anterior) * 1000) / 10 : null;

  const [scoreMedio, facturacionTotal, saturacion] = await Promise.all([
    prisma.product.aggregate({ _avg: { trendScore: true, estimatedMargin: true } }),
    prisma.product.aggregate({ _sum: { estimatedMonthlyRevenue: true } }),
    prisma.product.groupBy({ by: ["saturationLevel"], _count: { _all: true } }),
  ]);

  const porCategoria = await prisma.product.groupBy({
    by: ["category"],
    _count: { _all: true },
    _avg: { trendScore: true, estimatedMargin: true },
  });

  return {
    productos,
    dorados,
    anuncios,
    tiendas,
    proveedores,
    usuarios,
    verificados,
    conMedicion,
    variacionProductos: variacion(productosUltimoMes, productosMesAnterior),
    variacionAnuncios: variacion(anunciosUltimoMes, anunciosMesAnterior),
    scoreMedio: Math.round(scoreMedio._avg.trendScore ?? 0),
    margenMedio: Math.round((scoreMedio._avg.estimatedMargin ?? 0) * 10) / 10,
    facturacionTotal: facturacionTotal._sum.estimatedMonthlyRevenue ?? 0,
    saturacion: saturacion.map((fila) => ({ nivel: fila.saturationLevel, cantidad: fila._count._all })),
    porCategoria: porCategoria
      .map((fila) => ({
        categoria: fila.category,
        cantidad: fila._count._all,
        scoreMedio: Math.round(fila._avg.trendScore ?? 0),
        margenMedio: Math.round((fila._avg.estimatedMargin ?? 0) * 10) / 10,
      }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

/** Evolución media del trend score de los últimos N días (gráfica principal). */
export async function getGlobalTrendSeries(dias = 30) {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));

  const metricas = await prisma.trendMetric.groupBy({
    by: ["date"],
    where: { date: { gte: desde } },
    _avg: { calculatedScore: true, googleSearchVolume: true, tiktokViews: true, metaAdsCount: true },
    orderBy: { date: "asc" },
  });

  return metricas.map((fila) => ({
    date: fila.date.toISOString(),
    score: Math.round(fila._avg.calculatedScore ?? 0),
    google: Math.round(fila._avg.googleSearchVolume ?? 0),
    tiktok: Math.round(fila._avg.tiktokViews ?? 0),
    meta: Math.round(fila._avg.metaAdsCount ?? 0),
  }));
}

/**
 * Estado real de la serie de tendencias: última medición y fuentes presentes.
 * Lo consume la API pública para no presentar una media sin procedencia.
 */
export async function getTrendDataStatus() {
  const [ultima, fuentes] = await Promise.all([
    prisma.trendMetric.findFirst({
      orderBy: { fechaMedicion: "desc" },
      select: { fechaMedicion: true, fuente: true, tipoDato: true },
    }),
    prisma.trendMetric.groupBy({ by: ["fuente"], _count: { _all: true }, orderBy: { fuente: "asc" } }),
  ]);

  return {
    ultimaMedicion: ultima?.fechaMedicion.toISOString() ?? null,
    ultimaFuente: ultima?.fuente ?? null,
    ultimoTipo: ultima?.tipoDato ?? null,
    fuentes: fuentes.map((fila) => ({ fuente: fila.fuente, observaciones: fila._count._all })),
  };
}

// ---------------------------------------------------------------------------
//  Proveedores
// ---------------------------------------------------------------------------

/** Proveedores con filtros por plataforma, categoría y valoración mínima. */
export async function listSuppliers(filtros: { platform?: string; category?: string; minRating?: number } = {}) {
  const proveedores = await prisma.supplier.findMany({
    where: {
      ...(filtros.platform && filtros.platform !== "ALL" ? { platform: filtros.platform as never } : {}),
      ...(typeof filtros.minRating === "number" ? { rating: { gte: filtros.minRating } } : {}),
    },
    orderBy: [{ rating: "desc" }, { shippingTimeDays: "asc" }],
  });

  return proveedores
    .filter((proveedor) =>
      !filtros.category || filtros.category === "ALL"
        ? true
        : parseJsonArray<string>(proveedor.categories).includes(filtros.category),
    )
    .map((proveedor) => ({
      id: proveedor.id,
      name: proveedor.name,
      platform: proveedor.platform,
      url: proveedor.url,
      rating: proveedor.rating,
      reviewCount: proveedor.reviewCount,
      minOrderValue: proveedor.minOrderValue,
      shippingTimeDays: proveedor.shippingTimeDays,
      shippingCost: proveedor.shippingCost,
      location: proveedor.location,
      categories: parseJsonArray<string>(proveedor.categories),
      verified: proveedor.verified,
      tradeAssurance: proveedor.tradeAssurance,
      priceIndex: proveedor.priceIndex,
      notes: proveedor.notes,
    }));
}

// ---------------------------------------------------------------------------
//  Historial de IA
// ---------------------------------------------------------------------------

/** Generaciones de IA del usuario (AI Studio). */
export async function listAiGenerations(userId: string, tool?: string) {
  const generaciones = await prisma.aiGeneration.findMany({
    where: { userId, ...(tool && tool !== "ALL" ? { tool: tool as never } : {}) },
    include: { product: { select: { title: true, mainImage: true } } },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  return generaciones.map((generacion) => ({
    id: generacion.id,
    tool: generacion.tool,
    provider: generacion.provider,
    model: generacion.model,
    input: parseJsonObject<Record<string, unknown>>(generacion.input) ?? {},
    output: (() => {
      const valor = generacion.output as unknown;
      if (typeof valor === "string") {
        try {
          return JSON.parse(valor) as unknown;
        } catch {
          return valor;
        }
      }
      return valor;
    })(),
    tokensUsed: generacion.tokensUsed,
    latencyMs: generacion.latencyMs,
    isFavorite: generacion.isFavorite,
    createdAt: generacion.createdAt.toISOString(),
    productTitle: generacion.product?.title ?? null,
    productImage: generacion.product?.mainImage ?? null,
  }));
}

/**
 * Alertas generadas por los productos en seguimiento (subidas de tendencia,
 * cambios de precio o saturación). Se usa en el Product Tracker.
 */
export async function listTrackedProductAlerts(userId: string, limite = 20): Promise<NotificationDTO[]> {
  const seguimientos = await prisma.trackedProduct.findMany({
    where: { userId },
    select: { productId: true },
  });
  const ids = seguimientos.map((seguimiento) => seguimiento.productId);
  if (ids.length === 0) return [];

  const alertas = await prisma.alertNotification.findMany({
    where: { userId, entityId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
  return alertas.map(toNotificationDTO);
}

// ---------------------------------------------------------------------------
//  Ingesta real (catálogo público de Shopify + Google Trends RSS)
// ---------------------------------------------------------------------------

export interface TiendaEnVivoDTO {
  id: string;
  nombre: string;
  dominio: string;
  nicho: string;
  pais: string;
  productos: number;
  disponibles: number;
  emparejados: number;
  ultimaLectura: string | null;
  url: string;
}

/** Tiendas leídas del catálogo público real (las de la demo no cuentan). */
export async function listTiendasEnVivo(limite = 20): Promise<TiendaEnVivoDTO[]> {
  const tiendas = await prisma.store.findMany({
    where: { origen: "ingesta" },
    orderBy: { lastScannedAt: "desc" },
    take: limite,
    include: { storeProducts: { select: { available: true, productId: true } } },
  });

  return tiendas.map((tienda) => ({
    id: tienda.id,
    nombre: tienda.name,
    dominio: tienda.domain,
    nicho: tienda.niche,
    pais: tienda.country,
    productos: tienda.storeProducts.length,
    disponibles: tienda.storeProducts.filter((producto) => producto.available).length,
    emparejados: tienda.storeProducts.filter((producto) => producto.productId).length,
    ultimaLectura: tienda.lastScannedAt ? tienda.lastScannedAt.toISOString() : null,
    url: `https://${tienda.domain}`,
  }));
}

/** Cambios detectados en las tiendas leídas en vivo (timeline de la ingesta). */
export async function listCambiosIngesta(limite = 12): Promise<StoreChangeDTO[]> {
  const cambios = await prisma.storeChange.findMany({
    where: { store: { origen: "ingesta" } },
    orderBy: { detectedAt: "desc" },
    take: limite,
    include: { store: { select: { name: true } } },
  });
  return cambios.map((cambio) => toStoreChangeDTO(cambio as Parameters<typeof toStoreChangeDTO>[0]));
}

export interface TendenciaDiaDTO {
  id: string;
  termino: string;
  volumen: string;
  posicion: number;
  url: string;
  capturada: string;
  /** Productos del catálogo cuyo título casa con el término. */
  productos: Array<{ id: string; titulo: string }>;
}

/** Términos que Google Trends publicó como tendencia en un día y país. */
export async function listTendenciasDelDia(geo = "ES", limite = 25): Promise<TendenciaDiaDTO[]> {
  const ultimo = await prisma.trendingTerm.findFirst({
    where: { geo },
    orderBy: { capturedAt: "desc" },
    select: { day: true },
  });
  if (!ultimo) return [];

  const [terminos, productos] = await Promise.all([
    prisma.trendingTerm.findMany({
      where: { geo, day: ultimo.day },
      orderBy: { rank: "asc" },
      take: limite,
    }),
    prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, title: true } }),
  ]);

  const normalizar = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  return terminos.map((termino) => {
    const palabras = normalizar(termino.term)
      .split(/[^a-z0-9áéíóúñ]+/)
      .filter((palabra) => palabra.length >= 4);
    const casan = productos.filter((producto) => {
      const titulo = normalizar(producto.title);
      return palabras.length > 0 && palabras.every((palabra) => titulo.includes(palabra.slice(0, 6)));
    });
    return {
      id: termino.id,
      termino: termino.term,
      volumen: termino.volume,
      posicion: termino.rank,
      url: termino.url,
      capturada: termino.capturedAt.toISOString(),
      productos: casan.slice(0, 3).map((producto) => ({ id: producto.id, titulo: producto.title })),
    };
  });
}

/** Estado global de la ingesta: qué hay medido de verdad y cuándo. */
export async function getEstadoIngesta() {
  const [tiendas, productosEnTienda, terminos, ultimaMetrica, emparejados, verificados] = await Promise.all([
    prisma.store.count({ where: { origen: "ingesta" } }),
    prisma.storeProduct.count({ where: { store: { origen: "ingesta" } } }),
    prisma.trendingTerm.count(),
    prisma.trendMetric.findFirst({
      where: { tipoDato: { in: ["MEDIDO", "MIXTO"] } },
      orderBy: { fechaMedicion: "desc" },
      select: { fechaMedicion: true },
    }),
    prisma.storeProduct.count({ where: { productId: { not: null }, store: { origen: "ingesta" } } }),
    prisma.product.count({ where: { nivelConfianza: "VERIFICADO" } }),
  ]);

  return {
    tiendas,
    productosEnTienda,
    terminos,
    emparejados,
    verificados,
    ultimaMedicion: ultimaMetrica?.fechaMedicion.toISOString() ?? null,
  };
}
