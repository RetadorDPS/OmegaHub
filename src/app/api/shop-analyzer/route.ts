import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { analyzeStore } from "@/lib/scraper";
import { checkAndConsume } from "@/lib/planLimits";
import { toJsonInput } from "@/lib/json";
import { normalizeStoreUrl } from "@/lib/utils";
import { permitido } from "@/lib/limite";
import { logger } from "@/lib/logger";
import { esCaidaRelevante, describirCaida } from "@/lib/precios";

/**
 * Shop Analyzer: analiza una tienda Shopify.
 *
 * POST /api/shop-analyzer  { url: "https://mitienda.com" }
 *
 * Flujo: valida la URL → comprueba la cuota del plan → registra el trabajo como
 * RUNNING → ejecuta el scraper (Playwright si está disponible, simulación si no)
 * → persiste tienda, productos y eventos → devuelve el resultado completo.
 */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { url } = (await request.json()) as { url?: string };
  if (!url) return NextResponse.json({ error: "Falta la URL de la tienda" }, { status: 400 });

  const normalizada = normalizeStoreUrl(url);
  if (!normalizada) {
    return NextResponse.json(
      { error: "URL no válida. Introduce un dominio como tienda.com o https://tienda.com" },
      { status: 400 },
    );
  }

  // Cuota por plan: FREE 1 análisis/día, PRO 10, BUSINESS 50.
  try {
    await checkAndConsume(sesion.user.id, sesion.user.planType, "STORE_SCAN", { url: normalizada });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message, code: "QUOTA_EXCEEDED" }, { status: 402 });
  }

  // Ritmo: máximo 5 análisis/minuto por usuario (anti-ráfagas).
  if (!permitido(`analisis:${sesion.user.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "Demasiados análisis seguidos. Espera un minuto." },
      { status: 429 },
    );
  }

  logger.info("analisis_tienda_inicio", { userId: sesion.user.id, url: normalizada });

  // Registro del trabajo de análisis (visible en el panel de administración).
  const trabajo = await prisma.storeScan.create({
    data: {
      userId: sesion.user.id,
      url,
      normalizedUrl: normalizada,
      status: "RUNNING",
      engine: "SIMULATED",
      startedAt: new Date(),
    },
  });

  try {
    const resultado = await analyzeStore(normalizada);

    // Persistencia: la tienda se crea o se actualiza con los datos detectados.
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
        themeName: resultado.store.themeName,
        shopifyDetected: resultado.store.shopifyDetected,
        categories: toJsonInput(resultado.store.categories) as never,
        appsDetected: toJsonInput(resultado.detected.apps) as never,
        topProducts: toJsonInput(resultado.store.topProducts) as never,
        lastScannedAt: new Date(),
      },
      create: {
        shopifyUrl: resultado.store.shopifyUrl,
        name: resultado.store.name,
        domain: resultado.store.domain,
        niche: resultado.store.niche,
        country: "ES",
        shopifyDetected: resultado.store.shopifyDetected,
        themeName: resultado.store.themeName,
        estimatedMonthlyRevenue: resultado.store.estimatedMonthlyRevenue,
        estimatedTraffic: resultado.store.estimatedTraffic,
        monthlyVisits: resultado.store.monthlyVisits,
        avgOrderValue: resultado.store.avgOrderValue,
        conversionRate: resultado.store.conversionRate,
        productsCount: resultado.store.productsCount,
        categories: toJsonInput(resultado.store.categories) as never,
        appsDetected: toJsonInput(resultado.detected.apps) as never,
        topProducts: toJsonInput(resultado.store.topProducts) as never,
        lastScannedAt: new Date(),
      },
    });

    // Productos detectados en la tienda (sólo si el análisis trajo catálogo real).
    if (resultado.topProducts.length > 0) {
      // Historial de precios: instantánea REAL de este análisis
      // y detección de bajadas contra la ronda anterior.
      const anteriores = await prisma.storeProduct.findMany({
        where: { storeId: tienda.id },
        select: { title: true, price: true },
      });
      const precioAnterior = new Map(anteriores.map((fila) => [fila.title, fila.price]));

      for (const producto of resultado.topProducts) {
        await prisma.priceHistory.create({
          data: { storeId: tienda.id, title: producto.title, price: producto.price },
        });
        const antes = precioAnterior.get(producto.title);
        if (antes !== undefined && esCaidaRelevante(antes, producto.price)) {
          await prisma.storeChange.create({
            data: {
              storeId: tienda.id,
              type: "PRICE_CHANGE",
              title: `Bajada de precio: ${producto.title}`,
              description: describirCaida(antes, producto.price),
              imageUrl: producto.image ?? null,
              impactScore: Math.min(100, Math.round(((antes - producto.price) / antes) * 200)),
            },
          });
        }
      }

      await prisma.storeProduct.deleteMany({ where: { storeId: tienda.id } });
      await prisma.storeProduct.createMany({
        data: resultado.topProducts.map((producto) => ({
          storeId: tienda.id,
          title: producto.title,
          image: producto.image ?? null,
          price: producto.price,
          comparePrice: producto.comparePrice ?? null,
          salesRank: producto.salesRank,
          estimatedUnitsSold: producto.estimatedUnitsSold,
          productUrl: producto.productUrl ?? null,
        })),
      });

      // Evento en el timeline de la tienda.
      await prisma.storeChange.create({
        data: {
          storeId: tienda.id,
          type: "NEW_PRODUCT",
          title: `Análisis completado: ${resultado.topProducts.length} productos detectados`,
          description: `Análisis ejecutado con el motor ${resultado.engine}. Facturación estimada de ${resultado.metrics.estimatedMonthlyRevenue.toLocaleString("es-ES")} $ al mes.`,
          imageUrl: resultado.topProducts[0]?.image ?? null,
          impactScore: Math.min(100, Math.round(resultado.metrics.estimatedMonthlyRevenue / 10_000)),
        },
      });
    }

    await prisma.storeScan.update({
      where: { id: trabajo.id },
      data: {
        storeId: tienda.id,
        status: "COMPLETED",
        engine: resultado.engine,
        progress: 100,
        durationMs: resultado.durationMs,
        finishedAt: new Date(),
        result: toJsonInput({
          ingresos: resultado.metrics.estimatedMonthlyRevenue,
          visitas: resultado.metrics.estimatedMonthlyVisits,
          productos: resultado.topProducts.length,
        }),
      },
    });

    logger.info("analisis_tienda_ok", {
      userId: sesion.user.id,
      dominio: normalizada,
      engine: resultado.engine,
      productos: resultado.topProducts.length,
      duracionMs: resultado.durationMs,
    });
    // El resultado se devuelve con la tienda REAL de la base de datos (mismo
    // id que en el catálogo), para que el botón «rastrear esta tienda» funcione.
    return NextResponse.json({
      ok: true,
      scanId: trabajo.id,
      ...resultado,
      store: {
        ...resultado.store,
        id: tienda.id,
        name: tienda.name,
        domain: tienda.domain,
        shopifyDetected: tienda.shopifyDetected,
        themeName: tienda.themeName,
      },
    });
  } catch (error) {
    logger.error("analisis_tienda_fallo", { userId: sesion.user.id, url: normalizada, error: (error as Error).message });
    await prisma.storeScan.update({
      where: { id: trabajo.id },
      data: {
        status: "FAILED",
        errorMessage: (error as Error).message,
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Historial de análisis del usuario (últimos 10). */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const analisis = await prisma.storeScan.findMany({
    where: { userId: sesion.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { store: { select: { id: true, name: true, domain: true } } },
  });

  return NextResponse.json({
    items: analisis.map((analisisTienda) => ({
      id: analisisTienda.id,
      url: analisisTienda.normalizedUrl,
      status: analisisTienda.status,
      engine: analisisTienda.engine,
      duracionMs: analisisTienda.durationMs,
      creadoEn: analisisTienda.createdAt.toISOString(),
      tienda: analisisTienda.store
        ? { id: analisisTienda.store.id, nombre: analisisTienda.store.name, dominio: analisisTienda.store.domain }
        : null,
    })),
  });
}
