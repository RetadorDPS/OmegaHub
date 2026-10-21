"use client";

import { Activity, Globe, Megaphone, Play, Store } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendScoreBar } from "@/components/domain/trend-score-ring";
import { TrendSparkline } from "@/components/domain/trend-sparkline";
import { ProcedenciaBadge } from "@/components/domain/procedencia-badge";
import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import { calculateSaturationIndex, TREND_WEIGHTS } from "@/lib/trendEngine";
import type { ProductDTO, TrendMetricDTO } from "@/types";

interface ProductMetricsPanelProps {
  product: ProductDTO;
  metrics: TrendMetricDTO[];
  /** Desglose por plataforma calculado en el servidor (opcional). */
  platformBreakdown?: Array<{ plataforma: string; anuncios: number; engagement: number }>;
}

/**
 * Desglose de métricas por plataforma (TikTok, Meta, Google y tiendas Shopify)
 * con su aportación al TrendScore final.
 */
export function ProductMetricsPanel({ product, metrics }: ProductMetricsPanelProps) {
  const serie = (clave: keyof Pick<TrendMetricDTO, "googleSearchVolume" | "tiktokViews" | "youtubeViews" | "metaAdsCount" | "shopifyStoresUsing">) =>
    metrics.map((metrica) => metrica[clave]);

  const indiceSaturacion = calculateSaturationIndex(product.storesUsing, product.googleSearchVolume, product.metaAdsCount);

  const fuentes = [
    {
      id: "google",
      nombre: "Google Trends",
      icono: Globe,
      valor: product.googleSearchVolume,
      formato: formatCompactNumber(product.googleSearchVolume) + " búsquedas/mes",
      serie: serie("googleSearchVolume"),
      peso: TREND_WEIGHTS.googleSearchVolume,
      color: "#34d399",
      detalle: [
        { etiqueta: "Búsquedas al mes", valor: formatCompactNumber(product.googleSearchVolume) },
        { etiqueta: "Tendencia 30 días", valor: `${variacion(serie("googleSearchVolume"))} %` },
        { etiqueta: "País principal", valor: product.countryAvailability[0] ?? "—" },
      ],
    },
    {
      id: "tiktok",
      nombre: "TikTok",
      icono: Activity,
      valor: product.tiktokViews,
      formato: formatCompactNumber(product.tiktokViews) + " visualizaciones",
      serie: serie("tiktokViews"),
      peso: TREND_WEIGHTS.tiktokViews,
      color: "#f472b6",
      detalle: [
        { etiqueta: "Visualizaciones (30 d)", valor: formatCompactNumber(product.tiktokViews) },
        { etiqueta: "Tendencia 30 días", valor: `${variacion(serie("tiktokViews"))} %` },
        { etiqueta: "Potencial UGC", valor: product.velocityScore >= 60 ? "Muy alto" : "Medio" },
      ],
    },
    {
      id: "youtube",
      nombre: "YouTube",
      icono: Play,
      valor: product.youtubeViews,
      formato: formatCompactNumber(product.youtubeViews) + " visualizaciones",
      serie: serie("youtubeViews"),
      // YouTube no suma por separado: entra en la familia vídeo junto a
      // TikTok (se toma el máximo de ambos), así que no se muestra un peso.
      peso: null,
      color: "#ef4444",
      detalle: [
        { etiqueta: "Vistas (30 d)", valor: formatCompactNumber(product.youtubeViews) },
        { etiqueta: "Familia vídeo", valor: "máx(TikTok, YouTube)" },
        { etiqueta: "Potencial UGC", valor: product.youtubeViews > 1_000_000 ? "Muy alto" : "Media" },
      ],
    },
    {
      id: "meta",
      nombre: "Meta Ad Library",
      icono: Megaphone,
      valor: product.metaAdsCount,
      formato: `${product.metaAdsCount} anuncios activos`,
      serie: serie("metaAdsCount"),
      peso: TREND_WEIGHTS.metaAdsCount,
      color: "#fbbf24",
      detalle: [
        { etiqueta: "Anuncios activos", valor: String(product.metaAdsCount) },
        { etiqueta: "Tendencia 30 días", valor: `${variacion(serie("metaAdsCount"))} %` },
        { etiqueta: "Presión publicitaria", valor: product.metaAdsCount > 350 ? "Alta" : product.metaAdsCount > 180 ? "Media" : "Baja" },
      ],
    },
    {
      id: "shopify",
      nombre: "Tiendas Shopify",
      icono: Store,
      valor: product.storesUsing,
      formato: `${formatCompactNumber(product.storesUsing)} tiendas`,
      serie: serie("shopifyStoresUsing"),
      peso: TREND_WEIGHTS.shopifyStoresUsing,
      color: "#a78bfa",
      detalle: [
        { etiqueta: "Tiendas detectadas", valor: formatCompactNumber(product.storesUsing) },
        { etiqueta: "Índice de saturación", valor: `${indiceSaturacion} / 1.000 búsq.` },
        { etiqueta: "Nivel de mercado", valor: product.saturationLevel },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {fuentes.map((fuente) => (
          <Card key={fuente.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <fuente.icono className="size-4 shrink-0" style={{ color: fuente.color }} />
                  {fuente.nombre}
                </CardTitle>
                <div className="flex shrink-0 items-center gap-1.5">
                  {metrics[0] && (
                    <ProcedenciaBadge
                      tipo={metrics[0].tipoDato}
                      fuente={metrics[0].fuente}
                      compacto
                    />
                  )}
                  <Badge variant="outline" className="whitespace-nowrap text-[10px]">
                    {fuente.peso === null ? "familia vídeo" : `peso ${Math.round(fuente.peso * 100)} %`}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-lg font-bold tabular-nums">{fuente.formato}</p>
              <TrendSparkline values={fuente.serie} stroke={fuente.color} width={220} height={40} className="w-full" />
              <dl className="space-y-1.5 border-t border-border/60 pt-2 text-xs">
                {fuente.detalle.map((dato) => (
                  <div key={dato.etiqueta} className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{dato.etiqueta}</dt>
                    <dd className="font-medium tabular-nums">{dato.valor}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Composición del TrendScore</CardTitle>
          <CardDescription>
            El score final es la suma ponderada de las cuatro fuentes: Google ({Math.round(TREND_WEIGHTS.googleSearchVolume * 100)} %),
            TikTok ({Math.round(TREND_WEIGHTS.tiktokViews * 100)} %), Meta ({Math.round(TREND_WEIGHTS.metaAdsCount * 100)} %) y
            tiendas Shopify ({Math.round(TREND_WEIGHTS.shopifyStoresUsing * 100)} %).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <TrendScoreBar score={product.trendScore} label="TrendScore final" />
            <TrendScoreBar score={Math.round(product.velocityScore)} label="Velocidad de la tendencia" />
            <TrendScoreBar
              score={Math.max(0, 100 - Math.min(100, indiceSaturacion * 15))}
              label="Hueco de mercado (inverso a saturación)"
            />
            <TrendScoreBar
              score={Math.min(100, Math.round((product.suggestedSellPrice - product.costPrice) / product.suggestedSellPrice * 100))}
              label="Atractivo del margen"
            />
          </div>
          <div className="space-y-3 rounded-xl border border-border/60 bg-surface/40 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Margen bruto</span>
              <span className="font-semibold text-emerald-400">{formatPercent(product.estimatedMargin)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Beneficio por venta</span>
              <span className="font-semibold">
                {(product.suggestedSellPrice - product.costPrice).toFixed(2)} $
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Unidades estimadas/mes</span>
              <span className="font-semibold tabular-nums">{formatCompactNumber(product.estimatedUnitsSold)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Facturación del nicho</span>
              <span className="font-semibold tabular-nums">{formatCompactNumber(product.estimatedMonthlyRevenue)} $</span>
            </div>
            <p
              className={cn(
                "rounded-lg p-2.5 text-xs",
                product.isGoldenOpportunity && product.nivelConfianza === "VERIFICADO"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-amber-500/10 text-amber-200",
              )}
            >
              {!product.isGoldenOpportunity
                ? "Este producto no cumple aún los criterios de oportunidad dorada. Revisa la saturación y la velocidad antes de invertir."
                : product.nivelConfianza === "VERIFICADO"
                  ? "Oportunidad dorada verificada: demanda alta (score > 80), competencia baja y al menos dos fuentes medidas en los últimos 7 días."
                  : "Oportunidad estimada: cumple los criterios del motor interno, pero todavía no hay dos fuentes externas que la confirmen. Trátala como una hipótesis a validar."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Variación porcentual entre el primer y el último valor de una serie. */
function variacion(serie: number[]): string {
  if (serie.length < 2) return "0,0";
  const primero = serie[0];
  const ultimo = serie[serie.length - 1];
  if (primero === 0) return ultimo === 0 ? "0,0" : "+100,0";
  return (((ultimo - primero) / primero) * 100).toFixed(1).replace(".", ",");
}
