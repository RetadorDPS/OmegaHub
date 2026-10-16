/**
 * Tests unitarios del motor de tendencias.
 * Validan que los cálculos devuelven los valores esperados con datos de prueba
 * y que los umbrales de negocio (saturación, oportunidad dorada, rentabilidad)
 * se comportan según lo documentado.
 */

import { describe, expect, it } from "vitest";
import {
  calculateEngagementRate,
  calculateHeatIndex,
  calculateMarginPercent,
  calculateProfitEstimate,
  calculateSaturationIndex,
  calculateTrendDirection,
  calculateTrendScore,
  calculateTrendScoreDetailed,
  calculateVelocityFromMetrics,
  calculateSignalIndex,
  calculateVelocityScore,
  detectGoldenOpportunity,
  determineSaturationLevel,
  describeTrendScore,
  generateMetricSeries,
  normalizeSignal,
  TREND_THRESHOLDS,
  toSparklineSeries,
} from "./trendEngine";

const metricasCalientes = { googleSearchVolume: 480_000, tiktokViews: 45_000_000, metaAdsCount: 480, shopifyStoresUsing: 2_800 };
const metricasFrias = { googleSearchVolume: 2_000, tiktokViews: 30_000, metaAdsCount: 3, shopifyStoresUsing: 25 };
const metricasVacias = { googleSearchVolume: 0, tiktokViews: 0, metaAdsCount: 0, shopifyStoresUsing: 0 };

describe("calculateTrendScore", () => {
  it("devuelve 0 cuando no hay ninguna señal", () => {
    expect(calculateTrendScore(metricasVacias)).toBe(0);
  });

  it("devuelve ~100 cuando todas las señales están en máximos", () => {
    expect(calculateTrendScore(metricasCalientes)).toBeGreaterThanOrEqual(95);
    expect(calculateTrendScore(metricasCalientes)).toBeLessThanOrEqual(100);
  });

  it("crece de forma monótona al mejorar cualquier señal", () => {
    const base = { googleSearchVolume: 100_000, tiktokViews: 5_000_000, metaAdsCount: 80, shopifyStoresUsing: 400 };
    const mejorGoogle = calculateTrendScore({ ...base, googleSearchVolume: 300_000 });
    const mejorTikTok = calculateTrendScore({ ...base, tiktokViews: 25_000_000 });
    const mejorMeta = calculateTrendScore({ ...base, metaAdsCount: 350 });
    expect(mejorGoogle).toBeGreaterThan(calculateTrendScore(base));
    expect(mejorTikTok).toBeGreaterThan(calculateTrendScore(base));
    expect(mejorMeta).toBeGreaterThan(calculateTrendScore(base));
  });

  it("mantiene el score siempre dentro del rango 0-100", () => {
    const exagerado = { googleSearchVolume: 9_999_999, tiktokViews: 999_999_999, metaAdsCount: 99_999, shopifyStoresUsing: 999_999 };
    const score = calculateTrendScore(exagerado);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("pondera cada fuente según TREND_WEIGHTS y expone el desglose", () => {
    const { score, breakdown } = calculateTrendScoreDetailed(metricasCalientes);
    const suma = breakdown.googleContribution + breakdown.tiktokContribution + breakdown.metaAdsContribution + breakdown.storesContribution;
    expect(score).toBe(Math.round(suma));
    // La contribución de Google nunca puede superar su peso máximo (30 puntos).
    expect(breakdown.googleContribution).toBeLessThanOrEqual(30);
    expect(breakdown.tiktokContribution).toBeLessThanOrEqual(25);
    expect(breakdown.metaAdsContribution).toBeLessThanOrEqual(20);
    expect(breakdown.storesContribution).toBeLessThanOrEqual(25);
  });

  it("un producto frío puntúa muy por debajo de uno caliente", () => {
    expect(calculateTrendScore(metricasFrias)).toBeLessThan(40);
    expect(calculateTrendScore(metricasCalientes)).toBeGreaterThan(calculateTrendScore(metricasFrias) + 50);
  });

  it("trata los valores negativos como ausencia de señal", () => {
    expect(calculateTrendScore({ ...metricasVacias, googleSearchVolume: -100 })).toBe(0);
  });
});

describe("normalizeSignal", () => {
  it("devuelve 0 con valor 0 y 100 con el valor de referencia", () => {
    expect(normalizeSignal(0, 1_000)).toBe(0);
    expect(normalizeSignal(1_000, 1_000)).toBe(100);
  });

  it("aplica una curva de potencia: el tramo bajo gana sensibilidad", () => {
    // Raíz cuadrada: 50 % del máximo de referencia → ~70 puntos.
    expect(normalizeSignal(500, 1_000)).toBeCloseTo(70.71, 1);
    expect(normalizeSignal(250, 1_000)).toBeCloseTo(50, 1);
  });

  it("no supera 100 aunque el valor exceda la referencia", () => {
    expect(normalizeSignal(5_000, 1_000)).toBe(100);
  });
});

describe("determineSaturationLevel", () => {
  it("marca LOW con pocas tiendas y demanda alta (ratio bajo)", () => {
    expect(determineSaturationLevel(40, 200_000)).toBe("LOW");
    expect(determineSaturationLevel(320, 800_000)).toBe("LOW");
  });

  it("marca HIGH cuando hay 900 o más tiendas", () => {
    expect(determineSaturationLevel(900, 5_000_000)).toBe("HIGH");
  });

  it("marca HIGH por ratio alto (muchas tiendas y poca demanda)", () => {
    expect(determineSaturationLevel(150, 10_000)).toBe("HIGH");
  });

  it("marca MEDIUM por número absoluto de tiendas con demanda alta", () => {
    expect(determineSaturationLevel(500, 5_000_000)).toBe("MEDIUM");
  });

  it("marca MEDIUM por ratio intermedio", () => {
    expect(determineSaturationLevel(300, 200_000)).toBe("MEDIUM");
  });

  it("nunca devuelve LOW por encima del umbral absoluto de tiendas", () => {
    expect(determineSaturationLevel(TREND_THRESHOLDS.saturationMediumStores, 5_000_000)).not.toBe("LOW");
  });

  it("permite alcanzar una oportunidad dorada con un perfil realista", () => {
    // Regresión: con la curva antigua (logarítmica) el score máximo con
    // saturación LOW nunca superaba 80 y las oportunidades doradas eran
    // matemáticamente imposibles.
    const perfilViral = { googleSearchVolume: 800_000, tiktokViews: 42_000_000, metaAdsCount: 460, shopifyStoresUsing: 320 };
    const score = calculateTrendScore(perfilViral);
    const saturation = determineSaturationLevel(perfilViral.shopifyStoresUsing, perfilViral.googleSearchVolume);
    expect(score).toBeGreaterThan(TREND_THRESHOLDS.goldenScore);
    expect(saturation).toBe("LOW");
    expect(detectGoldenOpportunity({ trendScore: score, saturationLevel: saturation, velocityScore: 72 })).toBe(true);
  });
});

describe("calculateSaturationIndex", () => {
  it("calcula tiendas por cada 1.000 búsquedas", () => {
    expect(calculateSaturationIndex(300, 100_000)).toBe(3);
  });
  it("penaliza cuando hay mucha presión publicitaria", () => {
    expect(calculateSaturationIndex(300, 100_000, 900)).toBeGreaterThan(
      calculateSaturationIndex(300, 100_000, 0),
    );
  });
});

describe("detectGoldenOpportunity", () => {
  it("exige score > 80 y saturación LOW", () => {
    expect(detectGoldenOpportunity({ trendScore: 88, saturationLevel: "LOW", velocityScore: 70 })).toBe(true);
    expect(detectGoldenOpportunity({ trendScore: 88, saturationLevel: "MEDIUM" })).toBe(false);
    expect(detectGoldenOpportunity({ trendScore: 79, saturationLevel: "LOW" })).toBe(false);
  });

  it("respeta el límite exacto de 80 (no es oportunidad dorada)", () => {
    expect(detectGoldenOpportunity({ trendScore: 80, saturationLevel: "LOW" })).toBe(false);
  });

  it("descarta velocidades decrecientes", () => {
    expect(detectGoldenOpportunity({ trendScore: 90, saturationLevel: "LOW", velocityScore: 20 })).toBe(false);
  });
});

describe("calculateProfitEstimate", () => {
  it("calcula la ganancia neta descontando publicidad", () => {
    const estimacion = calculateProfitEstimate(9.5, 39.99, 12);
    expect(estimacion.revenue).toBeCloseTo(39.99, 2);
    expect(estimacion.grossProfit).toBeCloseTo(30.49, 2);
    expect(estimacion.netProfit).toBeCloseTo(18.49, 2);
  });

  it("devuelve margen neto correcto en porcentaje", () => {
    const { netMarginPercent } = calculateProfitEstimate(10, 40, 10);
    expect(netMarginPercent).toBeCloseTo(50, 1);
  });

  it("detecta pérdidas cuando el CPA se come el margen", () => {
    const { netProfit, netMarginPercent } = calculateProfitEstimate(20, 30, 15);
    expect(netProfit).toBeLessThan(0);
    expect(netMarginPercent).toBeLessThan(0);
  });

  it("calcula el ROAS de equilibrio", () => {
    expect(calculateProfitEstimate(10, 40, 12).breakEvenRoas).toBeCloseTo(3.33, 2);
  });

  it("no rompe con valores límite", () => {
    expect(calculateProfitEstimate(0, 0, 0).netProfit).toBe(0);
    expect(calculateProfitEstimate(10, 20, 0).roas).toBe(0);
  });
});

describe("calculateMarginPercent", () => {
  it("calcula el margen bruto sobre el precio de venta", () => {
    expect(calculateMarginPercent(10, 40)).toBe(75);
  });

  it("devuelve 0 si el precio de venta es 0", () => {
    expect(calculateMarginPercent(10, 0)).toBe(0);
  });
});

describe("calculateVelocityScore", () => {
  it("devuelve velocidad alta cuando el score reciente crece", () => {
    expect(calculateVelocityScore([40, 42, 45, 60, 70, 82])).toBeGreaterThan(70);
  });

  it("devuelve 0 cuando la tendencia decrece", () => {
    expect(calculateVelocityScore([80, 78, 70, 55, 40, 30])).toBe(0);
  });

  it("devuelve 0 con series demasiado cortas", () => {
    expect(calculateVelocityScore([50, 52])).toBe(0);
  });
});

describe("calculateVelocityFromMetrics / calculateSignalIndex", () => {
  it("el índice de demanda es lineal y crece con cada métrica", () => {
    const base = { googleSearchVolume: 100_000, tiktokViews: 5_000_000, metaAdsCount: 100, shopifyStoresUsing: 300 };
    expect(calculateSignalIndex(base)).toBeGreaterThan(0);
    expect(calculateSignalIndex({ ...base, googleSearchVolume: 200_000 })).toBeGreaterThan(calculateSignalIndex(base));
  });

  it("detecta la velocidad aunque el score ya esté saturado", () => {
    // Producto excelente (score ~87) que además multiplica su demanda:
    // el score apenas puede subir, pero la velocidad debe ser máxima.
    const metricasHoy = { googleSearchVolume: 900_000, tiktokViews: 60_000_000, metaAdsCount: 500, shopifyStoresUsing: 400 };
    const serie = [
      { googleSearchVolume: 300_000, tiktokViews: 20_000_000, metaAdsCount: 150, shopifyStoresUsing: 380 },
      { googleSearchVolume: 450_000, tiktokViews: 30_000_000, metaAdsCount: 250, shopifyStoresUsing: 385 },
      { googleSearchVolume: 600_000, tiktokViews: 40_000_000, metaAdsCount: 350, shopifyStoresUsing: 390 },
      metricasHoy,
    ];
    expect(calculateVelocityFromMetrics(serie)).toBeGreaterThan(70);
    expect(calculateTrendScore(metricasHoy)).toBeGreaterThan(85);
  });

  it("devuelve 0 en series planas o demasiado cortas", () => {
    const plano = { googleSearchVolume: 100_000, tiktokViews: 5_000_000, metaAdsCount: 100, shopifyStoresUsing: 300 };
    expect(calculateVelocityFromMetrics([plano, plano, plano, plano])).toBe(0);
    expect(calculateVelocityFromMetrics([plano, plano])).toBe(0);
  });
});

describe("calculateTrendDirection", () => {
  it("detecta tendencia ascendente", () => {
    expect(calculateTrendDirection([40, 45, 50, 58, 66, 74, 80])).toBe("RISING");
  });

  it("detecta tendencia descendente", () => {
    expect(calculateTrendDirection([80, 74, 68, 60, 52, 45, 40])).toBe("FALLING");
  });

  it("detecta estabilidad", () => {
    expect(calculateTrendDirection([60, 61, 60, 61, 60, 61])).toBe("STABLE");
  });

  it("es robusto ante series planas o cortas", () => {
    expect(calculateTrendDirection([50, 50, 50])).toBe("STABLE");
    expect(calculateTrendDirection([50])).toBe("STABLE");
  });
});

describe("calculateEngagementRate", () => {
  it("pondera comentarios y compartidos por encima de los likes", () => {
    expect(calculateEngagementRate(1_000, 0, 0, 100_000)).toBeCloseTo(1, 3);
    expect(calculateEngagementRate(1_000, 200, 200, 100_000)).toBeGreaterThan(1);
  });

  it("devuelve 0 sin visualizaciones", () => {
    expect(calculateEngagementRate(100, 10, 5, 0)).toBe(0);
  });
});

describe("calculateHeatIndex", () => {
  it("penaliza la saturación alta frente a la baja", () => {
    const base = { trendScore: 85, velocityScore: 70, estimatedMonthlyRevenue: 400_000 };
    const bajo = calculateHeatIndex({ ...base, saturationLevel: "LOW" });
    const alto = calculateHeatIndex({ ...base, saturationLevel: "HIGH" });
    expect(bajo).toBeGreaterThan(alto);
  });

  it("mantiene el rango 0-100", () => {
    const valor = calculateHeatIndex({
      trendScore: 100,
      velocityScore: 100,
      estimatedMonthlyRevenue: 5_000_000,
      saturationLevel: "LOW",
    });
    expect(valor).toBeGreaterThanOrEqual(0);
    expect(valor).toBeLessThanOrEqual(100);
  });
});

describe("generateMetricSeries", () => {
  it("genera la longitud solicitada y termina en la fecha de hoy", () => {
    const serie = generateMetricSeries(metricasCalientes, 30, 7, 0.3);
    expect(serie).toHaveLength(30);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    expect(serie[serie.length - 1].date.getTime()).toBe(hoy.getTime());
  });

  it("es determinista para la misma semilla", () => {
    const primera = generateMetricSeries(metricasFrias, 10, 42, 0.2);
    const segunda = generateMetricSeries(metricasFrias, 10, 42, 0.2);
    expect(primera.map((m) => m.googleSearchVolume)).toEqual(segunda.map((m) => m.googleSearchVolume));
  });

  it("refleja el sesgo de crecimiento en las métricas", () => {
    const creciente = generateMetricSeries({ googleSearchVolume: 100_000, tiktokViews: 1_000_000, metaAdsCount: 50, shopifyStoresUsing: 100 }, 30, 3, 0.8);
    expect(creciente[creciente.length - 1].googleSearchVolume).toBeGreaterThan(creciente[0].googleSearchVolume);
  });
});

describe("utilidades de presentación", () => {
  it("describe el score con la etiqueta adecuada", () => {
    expect(describeTrendScore(92).tone).toBe("excellent");
    expect(describeTrendScore(78).tone).toBe("good");
    expect(describeTrendScore(60).tone).toBe("average");
    expect(describeTrendScore(30).tone).toBe("poor");
  });

  it("reduce la serie a los puntos solicitados para las sparklines", () => {
    const serie = Array.from({ length: 30 }, (_, index) => index);
    expect(toSparklineSeries(serie, 12)).toHaveLength(12);
    expect(toSparklineSeries([1, 2, 3], 12)).toEqual([1, 2, 3]);
  });
});
