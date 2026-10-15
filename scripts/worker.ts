/**
 * ============================================================================
 *  WORKER DE TRABAJOS EN SEGUNDO PLANO (BullMQ + Redis)
 * ============================================================================
 *  Procesa las colas definidas en `src/lib/queue.ts`:
 *
 *    · store-scan     → análisis completo de una tienda Shopify (Shop Analyzer)
 *    · trend-recalc   → recálculo del TrendScore y de la serie de 30 días
 *    · notifications  → alertas de umbral y cambios de tienda
 *
 *  Arranque:   npm run worker
 *  Requiere:   REDIS_URL en el entorno (si falta, el script avisa y termina:
 *              la aplicación sigue funcionando con la ejecución inline).
 * ============================================================================
 */

import "dotenv/config";
import { createWorker, QUEUE_NAMES, redisConfigured } from "../src/lib/queue";
import { analyzeStore } from "../src/lib/scraper";
import { calculateTrendScore } from "../src/lib/trendEngine";
import { notifyTrackedProductThresholds, notifyTrackedStoreChanges } from "../src/lib/notifications";
import prisma from "../src/lib/prisma";

/** Registro con marca de tiempo para que los logs sean legibles en producción. */
function log(mensaje: string) {
  console.info(`[worker ${new Date().toISOString()}] ${mensaje}`);
}

/** Analiza una tienda y persiste el resultado (misma lógica que la API). */
async function procesarAnalisisDeTienda(datos: { scanId?: string; url?: string }) {
  if (!datos.url) throw new Error("El trabajo store-scan necesita una URL");

  const resultado = await analyzeStore(datos.url);

  const tienda = await prisma.store.upsert({
    where: { shopifyUrl: resultado.store.shopifyUrl },
    update: {
      name: resultado.store.name,
      niche: resultado.store.niche,
      estimatedMonthlyRevenue: resultado.store.estimatedMonthlyRevenue,
      estimatedTraffic: resultado.store.estimatedTraffic,
      monthlyVisits: resultado.store.monthlyVisits,
      avgOrderValue: resultado.store.avgOrderValue,
      conversionRate: resultado.store.conversionRate,
      productsCount: resultado.store.productsCount,
      shopifyDetected: resultado.store.shopifyDetected,
      lastScannedAt: new Date(),
    },
    create: {
      shopifyUrl: resultado.store.shopifyUrl,
      name: resultado.store.name,
      domain: resultado.store.domain,
      niche: resultado.store.niche,
      country: "ES",
      shopifyDetected: resultado.store.shopifyDetected,
      estimatedMonthlyRevenue: resultado.store.estimatedMonthlyRevenue,
      estimatedTraffic: resultado.store.estimatedTraffic,
      monthlyVisits: resultado.store.monthlyVisits,
      avgOrderValue: resultado.store.avgOrderValue,
      conversionRate: resultado.store.conversionRate,
      productsCount: resultado.store.productsCount,
      lastScannedAt: new Date(),
    },
  });

  if (datos.scanId) {
    await prisma.storeScan.update({
      where: { id: datos.scanId },
      data: {
        storeId: tienda.id,
        status: "COMPLETED",
        engine: resultado.engine,
        progress: 100,
        durationMs: resultado.durationMs,
        finishedAt: new Date(),
      },
    });
  }

  return { storeId: tienda.id, engine: resultado.engine, productos: resultado.topProducts.length };
}

/** Recalcula el TrendScore de todos los productos (o de uno concreto). */
async function recalcularTendencias(datos: { productId?: string }) {
  const productos = await prisma.product.findMany({
    where: datos.productId ? { id: datos.productId } : { status: "ACTIVE" },
    select: {
      id: true,
      googleSearchVolume: true,
      tiktokViews: true,
      metaAdsCount: true,
      storesUsing: true,
    },
  });

  let actualizados = 0;
  for (const producto of productos) {
    const score = calculateTrendScore({
      googleSearchVolume: producto.googleSearchVolume,
      tiktokViews: producto.tiktokViews,
      metaAdsCount: producto.metaAdsCount,
      shopifyStoresUsing: producto.storesUsing,
    });
    await prisma.product.update({ where: { id: producto.id }, data: { trendScore: score } });
    actualizados += 1;
  }
  return { actualizados };
}

/** Genera las alertas pendientes (umbrales de producto y cambios de tienda). */
async function generarNotificaciones() {
  const [umbrales, cambios] = await Promise.all([notifyTrackedProductThresholds(), notifyTrackedStoreChanges()]);
  return { alertasDeUmbral: umbrales, alertasDeTienda: cambios };
}

async function main() {
  if (!redisConfigured()) {
    console.warn(
      "[worker] REDIS_URL no está configurada. La plataforma funciona igual: los trabajos se ejecutan\n" +
        "         de forma inline dentro de la propia aplicación. Configura REDIS_URL para usar BullMQ.",
    );
    process.exit(0);
  }

  log("Conectando workers de BullMQ…");

  const workers = await Promise.all([
    createWorker(QUEUE_NAMES.storeScan, async (job) => {
      log(`store-scan · ${job.name} · ${JSON.stringify(job.data)}`);
      return procesarAnalisisDeTienda(job.data as { scanId?: string; url?: string });
    }, 2),
    createWorker(QUEUE_NAMES.trendRecalc, async (job) => {
      log(`trend-recalc · ${job.name}`);
      return recalcularTendencias(job.data as { productId?: string });
    }, 1),
    createWorker(QUEUE_NAMES.notifications, async (job) => {
      log(`notifications · ${job.name}`);
      return generarNotificaciones();
    }, 1),
  ]);

  // Programadores periódicos (BullMQ v6 usa Job Schedulers): recalculan las
  // tendencias y generan alertas cada 15 minutos.
  const { getQueue } = await import("../src/lib/queue");
  const colaTendencias = await getQueue(QUEUE_NAMES.trendRecalc);
  const colaAvisos = await getQueue(QUEUE_NAMES.notifications);
  await colaTendencias
    ?.upsertJobScheduler("recalculo-periodico", { every: 15 * 60 * 1000 }, { name: "recalculo-periodico", data: {} })
    .catch((error) => console.warn("[worker] No se pudo programar el recálculo periódico:", error.message));
  await colaAvisos
    ?.upsertJobScheduler("alertas-periodicas", { every: 15 * 60 * 1000 }, { name: "alertas-periodicas", data: {} })
    .catch((error) => console.warn("[worker] No se pudo programar las alertas periódicas:", error.message));

  log(`Workers activos: ${workers.map((worker) => worker?.name).filter(Boolean).join(", ")}`);

  // Cierre ordenado: se esperan los trabajos en curso antes de salir.
  const apagar = async (senal: string) => {
    log(`Recibida señal ${senal}: cerrando workers…`);
    await Promise.all(workers.map((worker) => worker?.close()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void apagar("SIGINT"));
  process.on("SIGTERM", () => void apagar("SIGTERM"));
}

main().catch(async (error) => {
  console.error("[worker] Error fatal:", error);
  await prisma.$disconnect();
  process.exit(1);
});
