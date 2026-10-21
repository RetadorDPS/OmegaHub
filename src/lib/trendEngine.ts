/**
 * ============================================================================
 *  MOTOR DE CÁLCULO DE TENDENCIAS (TrendHunter Pro)
 * ============================================================================
 *  Núcleo de la lógica de negocio: combina señales de múltiples fuentes
 *  (Google Trends, TikTok, Meta Ad Library y tiendas Shopify) en un único
 *  score normalizado 0-100 y deriva saturación, oportunidades doradas,
 *  velocidad, dirección de tendencia y estimaciones de rentabilidad.
 *
 *  Todas las funciones son PURAS y deterministas para poder testearlas.
 * ============================================================================
 */

import type { SaturationLevel, TrendDirection } from "@/types";

// ---------------------------------------------------------------------------
//  Configuración de ponderaciones y valores de referencia
// ---------------------------------------------------------------------------

/** Pesos de cada fuente en el score final (suman 1). */
export const TREND_WEIGHTS = {
  googleSearchVolume: 0.3,
  tiktokViews: 0.25,
  metaAdsCount: 0.2,
  shopifyStoresUsing: 0.25,
} as const;

/**
 * Valores de referencia que equivalen a una señal "perfecta" (100 puntos).
 * Se calibran con datos reales de mercado de dropshipping: por encima de estos
 * valores la señal se satura (no aporta más score).
 */
export const REFERENCE_MAXIMA = {
  /** Búsquedas mensuales en Google. */
  googleSearchVolume: 500_000,
  /** Visualizaciones acumuladas en TikTok (30 días). */
  tiktokViews: 50_000_000,
  /** Anuncios activos detectados en Meta Ad Library. */
  metaAdsCount: 500,
  /** Tiendas Shopify distintas que venden el producto. */
  shopifyStoresUsing: 1_500,
} as const;

/**
 * Umbrales de negocio (documentados y usados por los tests).
 * La saturación se mide sobre todo de forma RELATIVA a la demanda
 * (tiendas por cada 1.000 búsquedas) con guardarraíles absolutos para evitar
 * falsos "mercados vírgenes" en nichos con muchos vendedores.
 */
export const TREND_THRESHOLDS = {
  /** Score mínimo para considerar un producto "ganador". */
  winningScore: 75,
  /** Score mínimo para una "oportunidad dorada". */
  goldenScore: 80,
  /** Ratio (tiendas/1.000 búsquedas) a partir del cual la saturación es MEDIUM. */
  saturationMediumRatio: 1.5,
  /** Ratio a partir del cual la saturación es HIGH. */
  saturationHighRatio: 4,
  /** Nº absoluto de tiendas a partir del cual la saturación nunca es LOW. */
  saturationMediumStores: 450,
  /** Nº absoluto de tiendas a partir del cual la saturación es HIGH. */
  saturationHighStores: 900,
  /** Velocidad mínima exigida a una oportunidad dorada. */
  goldenMinVelocity: 50,
} as const;

// ---------------------------------------------------------------------------
//  Tipos de entrada/salida
// ---------------------------------------------------------------------------

/** Métricas crudas de las cuatro fuentes de señal. */
export interface TrendMetricsInput {
  googleSearchVolume: number;
  tiktokViews: number;
  metaAdsCount: number;
  shopifyStoresUsing: number;
  youtubeViews?: number;
}

/** Desglose del score por fuente (alimenta las gráficas del detalle). */
export interface TrendScoreBreakdown {
  googleContribution: number;
  tiktokContribution: number;
  metaAdsContribution: number;
  storesContribution: number;
}

/** Resultado detallado del cálculo de tendencia. */
export interface TrendScoreResult {
  score: number;
  breakdown: TrendScoreBreakdown;
  normalized: TrendMetricsInput;
}

/** Producto mínimo necesario para evaluar una oportunidad dorada. */
export interface GoldenOpportunityInput {
  trendScore: number;
  saturationLevel: SaturationLevel;
  velocityScore?: number;
}

/** Estimación económica completa de un producto. */
export interface ProfitEstimate {
  /** Ingresos por unidad vendida (precio de venta). */
  revenue: number;
  /** Beneficio bruto por unidad (venta − coste). */
  grossProfit: number;
  /** Ganancia neta estimada por unidad (venta − coste − publicidad). */
  netProfit: number;
  /** Margen neto sobre el precio de venta (0-100). */
  netMarginPercent: number;
  /** Margen bruto sobre el precio de venta (0-100). */
  grossMarginPercent: number;
  /** ROAS mínimo necesario para no perder dinero con ese CPA. */
  breakEvenRoas: number;
  /** Retorno de la inversión publicitaria con el CPA indicado. */
  roas: number;
}

// ---------------------------------------------------------------------------
//  Utilidades internas
// ---------------------------------------------------------------------------

/** Limita un número al rango [min, max]. */
export function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Redondea a `decimals` decimales sin errores de coma flotante. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Normaliza una señal a 0-100 con una curva de potencia (raíz cuadrada).
 *
 * Por qué no una escala lineal: una métrica de 2.000 búsquedas frente a una de
 * 500.000 apenas aportaría nada y el score quedaría plano. La raíz cuadrada
 * (exponente 0,5) mantiene sensibilidad en el tramo bajo (los productos que
 * empiezan a despegar suben rápido) y comprime el tramo alto sin llegar a
 * saturar el score, de modo que una tendencia fuerte con poca competencia sí
 * puede alcanzar el umbral de "oportunidad dorada".
 */
export function normalizeSignal(value: number, referenceMax: number): number {
  if (value <= 0 || referenceMax <= 0) return 0;
  const ratio = Math.min(value / referenceMax, 1);
  return clamp(round(Math.sqrt(ratio) * 100, 2));
}

// ---------------------------------------------------------------------------
//  API pública del motor
// ---------------------------------------------------------------------------

/**
 * Calcula el TrendScore (0-100) ponderando las cuatro fuentes de señal.
 *
 * @example
 * calculateTrendScore({ googleSearchVolume: 120_000, tiktokViews: 8_000_000,
 *                       metaAdsCount: 90, shopifyStoresUsing: 240 }) // ≈ 71
 */
export function calculateTrendScore(metrics: TrendMetricsInput): number {
  return calculateTrendScoreDetailed(metrics).score;
}

/** Igual que `calculateTrendScore` pero devolviendo el desglose por fuente. */
export function calculateTrendScoreDetailed(metrics: TrendMetricsInput): TrendScoreResult {
  // Familia vídeo: la señal fuerte manda (TikTok o YouTube).
  const video = normalizeSignal(
    Math.max(metrics.tiktokViews, metrics.youtubeViews ?? 0),
    REFERENCE_MAXIMA.tiktokViews,
  );

  const normalized: TrendMetricsInput = {
    googleSearchVolume: normalizeSignal(metrics.googleSearchVolume, REFERENCE_MAXIMA.googleSearchVolume),
    tiktokViews: video,
    metaAdsCount: normalizeSignal(metrics.metaAdsCount, REFERENCE_MAXIMA.metaAdsCount),
    shopifyStoresUsing: normalizeSignal(metrics.shopifyStoresUsing, REFERENCE_MAXIMA.shopifyStoresUsing),
  };

  const breakdown: TrendScoreBreakdown = {
    googleContribution: round(normalized.googleSearchVolume * TREND_WEIGHTS.googleSearchVolume, 2),
    tiktokContribution: round(normalized.tiktokViews * TREND_WEIGHTS.tiktokViews, 2),
    metaAdsContribution: round(normalized.metaAdsCount * TREND_WEIGHTS.metaAdsCount, 2),
    storesContribution: round(normalized.shopifyStoresUsing * TREND_WEIGHTS.shopifyStoresUsing, 2),
  };

  const score = clamp(
    Math.round(
      breakdown.googleContribution +
        breakdown.tiktokContribution +
        breakdown.metaAdsContribution +
        breakdown.storesContribution,
    ),
  );

  return { score, breakdown, normalized };
}

/**
 * Índice de saturación: cuántas tiendas compiten por cada 1.000 búsquedas.
 * Un valor alto indica mercado saturado incluso con demanda alta.
 */
export function calculateSaturationIndex(storesCount: number, searchVolume: number, metaAdsCount = 0): number {
  const demand = Math.max(searchVolume / 1_000, 1);
  const adPressure = metaAdsCount > 0 ? 1 + Math.min(metaAdsCount / 1_000, 0.5) : 1;
  return round((storesCount / demand) * adPressure, 3);
}

/**
 * Determina el nivel de saturación competitiva del mercado.
 *
 * Reglas (evaluadas en orden):
 *   · HIGH   → 900+ tiendas vendiéndolo, o ratio ≥ 4 tiendas/1.000 búsquedas
 *   · MEDIUM → 450+ tiendas, o ratio ≥ 1,5 tiendas/1.000 búsquedas
 *   · LOW    → el resto: mucha demanda con pocos vendedores
 *
 * @param storesCount    Nº de tiendas Shopify detectadas vendiendo el producto.
 * @param searchVolume   Búsquedas mensuales en Google del nicho/producto.
 */
export function determineSaturationLevel(storesCount: number, searchVolume: number): SaturationLevel {
  const ratio = calculateSaturationIndex(storesCount, searchVolume);
  if (storesCount >= TREND_THRESHOLDS.saturationHighStores) return "HIGH";
  if (ratio >= TREND_THRESHOLDS.saturationHighRatio) return "HIGH";
  if (storesCount >= TREND_THRESHOLDS.saturationMediumStores) return "MEDIUM";
  if (ratio >= TREND_THRESHOLDS.saturationMediumRatio) return "MEDIUM";
  return "LOW";
}

/**
 * Oportunidad dorada: demanda muy alta (score > 80) con competencia baja.
 * Es el caso ideal de dropshipping: tendencia fuerte y mercado sin saturar.
 */
export function detectGoldenOpportunity(product: GoldenOpportunityInput): boolean {
  const velocityOk =
    product.velocityScore === undefined || product.velocityScore >= TREND_THRESHOLDS.goldenMinVelocity;
  return product.trendScore > TREND_THRESHOLDS.goldenScore && product.saturationLevel === "LOW" && velocityOk;
}

/**
 * Calcula el margen bruto porcentual sobre el precio de venta.
 */
export function calculateMarginPercent(costPrice: number, sellPrice: number): number {
  if (sellPrice <= 0) return 0;
  return clamp(round(((sellPrice - costPrice) / sellPrice) * 100, 2), -9999, 100);
}

/**
 * Estimación de ganancia neta por unidad.
 *
 * @param costPrice  Coste del proveedor (producto + envío).
 * @param sellPrice  Precio de venta al público.
 * @param adSpend    Inversión publicitaria por unidad vendida (CPA).
 */
export function calculateProfitEstimate(
  costPrice: number,
  sellPrice: number,
  adSpend: number,
): ProfitEstimate {
  const revenue = round(sellPrice, 2);
  const grossProfit = round(sellPrice - costPrice, 2);
  const netProfit = round(sellPrice - costPrice - adSpend, 2);
  const breakEvenRoas = adSpend > 0 && grossProfit > 0 ? round(sellPrice / adSpend, 2) : 0;

  return {
    revenue,
    grossProfit,
    netProfit,
    netMarginPercent: calculateMarginPercent(costPrice + adSpend, sellPrice),
    grossMarginPercent: calculateMarginPercent(costPrice, sellPrice),
    breakEvenRoas,
    roas: adSpend > 0 ? round(revenue / adSpend, 2) : 0,
  };
}

/** Media aritmética de una lista de números (0 si está vacía). */
function average(list: number[]): number {
  if (list.length === 0) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

/**
 * Velocidad de la tendencia (0-100).
 * Compara la media de la segunda mitad de la serie con la de la primera:
 * un crecimiento del +50 % se considera velocidad máxima (100).
 */
export function calculateVelocityScore(scores: number[]): number {
  if (scores.length < 4) return 0;
  const half = Math.floor(scores.length / 2);
  const previousAvg = average(scores.slice(0, half));
  const recentAvg = average(scores.slice(half));
  if (previousAvg <= 0) return recentAvg > 0 ? 100 : 0;
  const growth = (recentAvg - previousAvg) / previousAvg;
  return clamp(Math.round(growth * 200), 0, 100);
}

/**
 * Índice de demanda SIN comprimir: suma ponderada de cada métrica expresada en
 * unidades de referencia (Google = 1.0 cuando alcanza su máximo de referencia).
 *
 * Se usa sólo para medir CRECIMIENTO, no para puntuar: al ser lineal (sin
 * raíces ni recortes) la variación porcentual del índice equivale a la
 * variación real de la demanda, cosa que el score 0-100 no puede reflejar.
 */
export function calculateSignalIndex(metrics: TrendMetricsInput): number {
  return (
    (metrics.googleSearchVolume / REFERENCE_MAXIMA.googleSearchVolume) * TREND_WEIGHTS.googleSearchVolume +
    (Math.max(metrics.tiktokViews, metrics.youtubeViews ?? 0) / REFERENCE_MAXIMA.tiktokViews) * TREND_WEIGHTS.tiktokViews +
    (metrics.metaAdsCount / REFERENCE_MAXIMA.metaAdsCount) * TREND_WEIGHTS.metaAdsCount +
    (metrics.shopifyStoresUsing / REFERENCE_MAXIMA.shopifyStoresUsing) * TREND_WEIGHTS.shopifyStoresUsing
  );
}

/**
 * Velocidad de la tendencia a partir de la SERIE DE MÉTRICAS (recomendado).
 *
 * Por qué es preferible a `calculateVelocityScore(scores)`: el score está
 * acotado a 0-100, así que un producto ya excelente (85-90) apenas puede subir
 * aunque su demanda se multiplique. Midiendo la señal sin saturar se detecta la
 * velocidad real (el producto más caliente también puede ser el más rápido).
 */
export function calculateVelocityFromMetrics(series: TrendMetricsInput[]): number {
  if (series.length < 4) return 0;
  const indices = series.map(calculateSignalIndex);
  const half = Math.floor(indices.length / 2);
  const previousAvg = average(indices.slice(0, half));
  const recentAvg = average(indices.slice(half));
  if (previousAvg <= 0) return recentAvg > 0 ? 100 : 0;
  const growth = (recentAvg - previousAvg) / previousAvg;
  return clamp(Math.round(growth * 200), 0, 100);
}

/**
 * Dirección de la tendencia comparando el primer cuartil con el último.
 * Se usa la diferencia relativa (no la pendiente absoluta) porque en escalas
 * 0-100 una subida de 60 → 90 es un +50 % real que una recta apenas percibe.
 *
 *   · RISING  → el último cuartil supera el primero en más de un 8 %
 *   · FALLING → cae más de un 8 %
 *   · STABLE  → el resto
 */
export function calculateTrendDirection(scores: number[]): TrendDirection {
  if (scores.length < 4) return "STABLE";
  const quarter = Math.max(1, Math.floor(scores.length / 4));
  const inicial = average(scores.slice(0, quarter));
  const final = average(scores.slice(-quarter));
  if (inicial <= 0) return final > 0 ? "RISING" : "STABLE";
  const variacion = (final - inicial) / inicial;
  if (variacion > 0.08) return "RISING";
  if (variacion < -0.08) return "FALLING";
  return "STABLE";
}

/**
 * Tasa de engagement de un anuncio en porcentaje.
 * Los comentarios y compartidos pesan más que un simple "me gusta".
 */
export function calculateEngagementRate(likes: number, comments: number, shares: number, views: number): number {
  if (views <= 0) return 0;
  const weighted = likes + comments * 2 + shares * 3;
  return round((weighted / views) * 100, 3);
}

/** Índice de "calor" comercial de un producto (0-100) usado en los rankings. */
export function calculateHeatIndex(product: {
  trendScore: number;
  velocityScore: number;
  estimatedMonthlyRevenue: number;
  saturationLevel: SaturationLevel;
}): number {
  const saturationPenalty = product.saturationLevel === "LOW" ? 1 : product.saturationLevel === "MEDIUM" ? 0.8 : 0.55;
  const revenueSignal = normalizeSignal(product.estimatedMonthlyRevenue, 1_000_000);
  const raw = product.trendScore * 0.5 + product.velocityScore * 0.25 + revenueSignal * 0.25;
  return clamp(Math.round(raw * saturationPenalty));
}

/** Etiqueta legible del score para la interfaz. */
export function describeTrendScore(score: number): { label: string; tone: "excellent" | "good" | "average" | "poor" } {
  if (score >= 85) return { label: "Excepcional", tone: "excellent" };
  if (score >= TREND_THRESHOLDS.winningScore) return { label: "Ganador", tone: "good" };
  if (score >= 55) return { label: "En ascenso", tone: "average" };
  return { label: "Frío", tone: "poor" };
}

/**
 * Genera una serie diaria sintética pero determinista (semilla por producto).
 *
 * La serie está anclada al presente: el último punto coincide con las métricas
 * base del producto y los días anteriores se escalan hacia atrás según
 * `growthBias` (positivo = tendencia creciente, negativo = decreciente).
 *
 * @param baseMetrics Métricas de hoy (último punto de la serie).
 * @param days        Número de días a generar.
 * @param seed        Semilla del generador pseudoaleatorio (reproducible).
 * @param growthBias  Pendiente: -1 (cayendo) … 0 (plano) … 1 (despegando).
 */
export function generateMetricSeries(
  baseMetrics: TrendMetricsInput,
  days: number,
  seed = 1,
  growthBias = 0,
): Array<TrendMetricsInput & { date: Date; calculatedScore: number }> {
  // Generador congruencial lineal: reproducible en seed y en tests.
  let state = seed * 9301 + 49297;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  const series: Array<TrendMetricsInput & { date: Date; calculatedScore: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const progress = (days - dayOffset) / days; // 0 → día más antiguo, 1 → hoy
    // Anclado en hoy (progress = 1 ⇒ factor 1) y escalado hacia el pasado.
    const trendFactor = 1 + growthBias * (progress - 1);
    const noise = 0.86 + random() * 0.28;
    const factor = trendFactor * noise;

    const metrics: TrendMetricsInput = {
      googleSearchVolume: Math.max(0, Math.round(baseMetrics.googleSearchVolume * factor)),
      tiktokViews: Math.max(0, Math.round(baseMetrics.tiktokViews * factor)),
      // La presión publicitaria y la competencia crecen con el tiempo.
      metaAdsCount: Math.max(0, Math.round(baseMetrics.metaAdsCount * trendFactor * (0.9 + progress * 0.12))),
      shopifyStoresUsing: Math.max(0, Math.round(baseMetrics.shopifyStoresUsing * (0.92 + progress * 0.1))),
    };

    series.push({
      ...metrics,
      date,
      calculatedScore: calculateTrendScore(metrics),
    });
  }
  return series;
}

/** Serie de 7 días de Google Trends normalizada (0-100), útil para sparklines. */
export function toSparklineSeries(scores: number[], points = 12): number[] {
  if (scores.length === 0) return [];
  if (scores.length <= points) return scores;
  const step = scores.length / points;
  return Array.from({ length: points }, (_, index) => scores[Math.min(Math.floor(index * step), scores.length - 1)]);
}
