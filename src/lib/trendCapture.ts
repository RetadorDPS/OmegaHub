import "server-only";

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { calculateTrendScore } from "@/lib/trendEngine";
import { hayFuentesVivas } from "@/lib/providers";
import { buscarVideosYoutube, vistasTotales } from "@/lib/providers/youtube";
import { tendenciasDelDia } from "@/lib/providers/tendenciasGoogle";
import {
  construirProcedencia,
  leerProcedencia,
  recalcularConfianzaProducto,
  guardarProcedencia,
  type ProcedenciaMetrica,
} from "@/lib/confianzaProducto";
import { tipoDatoDeFila } from "@/lib/confianza";

/**
 * ============================================================================
 *  CAPTURA DIARIA DE TENDENCIAS REALES
 * ============================================================================
 *  Para cada producto:
 *   1. YouTube: busca el nicho y suma vistas reales.
 *   2. Google Trends RSS: comprueba si el término es
 *      tendencia del día (señal cualitativa).
 *   3. Persiste la métrica CON PROCEDENCIA
 *      (fuente, fecha de medición, tipo de dato).
 *   4. Recalcula el TrendScore.
 *
 *  `soloRecalcular` no llama a proveedores: recalcula el
 *  score con los datos existentes y escribe puntos
 *  ESTIMADOS honestos (el motor interno es una estimación
 *  y se dice como tal).
 * ============================================================================
 */

export interface OpcionesCaptura {
  productIds?: string[];
  maxProductos?: number;
  geo?: string;
  soloRecalcular?: boolean;
}

export interface ResultadoCaptura {
  modo: "ok" | "sin-fuentes";
  productos: Array<{
    id: string;
    titulo: string;
    medido: boolean;
    score: number;
  }>;
  omitidos: number;
  fuentes: string[];
}

export async function capturarTendencias(
  opciones: OpcionesCaptura = {},
): Promise<ResultadoCaptura> {
  const inicio = Date.now();
  const limite = Math.min(Math.max(opciones.maxProductos ?? 20, 1), 100);
  const geo = opciones.geo ?? "ES";
  const soloRecalcular = opciones.soloRecalcular ?? false;

  const productos = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      ...(opciones.productIds?.length ? { id: { in: opciones.productIds } } : {}),
    },
    select: {
      id: true,
      title: true,
      nicheTag: true,
      youtubeViews: true,
      trendScore: true,
      isGoldenOpportunity: true,
      metrics: {
        orderBy: { date: "desc" },
        take: 1,
        select: {
          googleSearchVolume: true,
          tiktokViews: true,
          metaAdsCount: true,
          shopifyStoresUsing: true,
          procedencia: true,
        },
      },
    },
    take: limite,
  });

  // Sin fuentes vivas y sin recálculo: aviso claro (503 arriba).
  if (!soloRecalcular && !hayFuentesVivas()) {
    logger.aviso("captura_sin_fuentes", { productos: productos.length });
    return {
      modo: "sin-fuentes",
      productos: [],
      omitidos: productos.length,
      fuentes: [],
    };
  }

  const tendencias = soloRecalcular
    ? null
    : await tendenciasDelDia(geo);
  const nombresTendencia = new Set(
    (tendencias?.datos ?? []).map((t) => t.titulo.toLowerCase()),
  );

  const resultado: ResultadoCaptura = {
    modo: "ok",
    productos: [],
    omitidos: 0,
    fuentes: ["youtube", "google-tendencias-rss"],
  };

  for (const producto of productos) {
    try {
      // Señal de vídeo real (YouTube).
      let youtubeViews = producto.youtubeViews ?? 0;
      let medido = false;

      if (!soloRecalcular) {
        const busqueda = await buscarVideosYoutube(
          `${producto.title} ${producto.nicheTag}`,
          geo,
        );
        if (busqueda.datos?.length) {
          youtubeViews = vistasTotales(busqueda.datos);
          medido = true;
        }
      }

      const esTendencia = soloRecalcular
        ? false
        : nombresTendencia.size > 0 &&
          [...nombresTendencia].some((nombre) =>
            producto.title.toLowerCase().includes(nombre.slice(0, 12)),
          );

      // Procedencia POR FUENTE: solo YouTube se ha medido en esta pasada; el
      // resto hereda la medición anterior con su fecha original. La fila se
      // marca MIXTO cuando conviven valores medidos y heredados.
      const valores: Partial<Record<import("@/lib/confianza").FuenteId, number>> = {
        google: producto.metrics[0]?.googleSearchVolume ?? 0,
        tiktok: producto.metrics[0]?.tiktokViews ?? 0,
        youtube: youtubeViews,
        meta: producto.metrics[0]?.metaAdsCount ?? 0,
        tiendas: producto.metrics[0]?.shopifyStoresUsing ?? 0,
      };
      const medidoAhora = medido ? { youtube: { fuente: "youtube-api" } } : {};
      const anterior: ProcedenciaMetrica = leerProcedencia(producto.metrics[0]?.procedencia);
      const procedencia = construirProcedencia(valores, medidoAhora, anterior);
      const tipoFila = tipoDatoDeFila(Object.values(procedencia).map((fuente) => fuente.tipo));

      const metrica = await prisma.trendMetric.create({
        data: {
          productId: producto.id,
          date: new Date(),
          googleSearchVolume: valores.google,
          tiktokViews: valores.tiktok,
          youtubeViews: valores.youtube,
          metaAdsCount: valores.meta,
          shopifyStoresUsing: valores.tiendas,
          calculatedScore: producto.trendScore,
          fuente: medido ? "youtube-api" : "motor-interno",
          fechaMedicion: new Date(),
          tipoDato: tipoFila,
        },
        select: { id: true },
      });
      await guardarProcedencia(metrica.id, procedencia);

      // Recálculo honesto del score.
      const ultima = producto.metrics[0];
      const score = calculateTrendScore({
        googleSearchVolume: ultima?.googleSearchVolume ?? 0,
        tiktokViews: ultima?.tiktokViews ?? 0,
        youtubeViews,
        metaAdsCount: ultima?.metaAdsCount ?? 0,
        shopifyStoresUsing: ultima?.shopifyStoresUsing ?? 0,
      });

      await prisma.product.update({
        where: { id: producto.id },
        data: {
          trendScore: score,
          youtubeViews,
          isGoldenOpportunity: esTendencia || producto.isGoldenOpportunity,
        },
      });

      // La confianza se recalcula con la procedencia real recién guardada.
      await recalcularConfianzaProducto(producto.id);

      resultado.productos.push({ id: producto.id, titulo: producto.title, medido, score });
    } catch {
      resultado.omitidos += 1;
    }
  }

  logger.info("captura_finalizada", {
    productos: resultado.productos.length,
    omitidos: resultado.omitidos,
    medidos: resultado.productos.filter((p) => p.medido).length,
    duracionMs: Date.now() - inicio,
  });

  return resultado;
}
