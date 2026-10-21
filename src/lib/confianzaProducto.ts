import prisma from "@/lib/prisma";
import { toJsonInput } from "@/lib/json";
import {
  FUENTES,
  evaluarConfianza,
  type FuenteId,
  type ObservacionFuente,
  type ResultadoConfianza,
  type TipoDatoFuente,
} from "@/lib/confianza";

/**
 * ============================================================================
 *  CONFIANZA · PARTE SERVIDOR
 * ============================================================================
 *  Lee la procedencia guardada en cada medición y calcula, con la misma regla
 *  que usa la interfaz, el nivel de confianza del producto.
 *
 *  La verdad está en `TrendMetric.procedencia`: un objeto por fuente con su
 *  tipo, su origen, su fecha y su valor. Así una fila con YouTube medido y el
 *  resto heredado queda registrada como MIXTO, nunca como «medido».
 * ============================================================================
 */

/** Procedencia de una fuente dentro de una medición. */
export interface ProcedenciaFuente {
  tipo: TipoDatoFuente;
  fuente: string;
  fecha: string;
  valor: number;
}

/** Mapa de procedencias de una fila. */
export type ProcedenciaMetrica = Partial<Record<FuenteId, ProcedenciaFuente>>;

const CLAVES_FUENTE: FuenteId[] = Object.keys(FUENTES) as FuenteId[];

/**
 * Fuentes que no tienen columna propia en `TrendMetric` (solo viven en la
 * procedencia). Hoy: las tendencias del día de Google Trends, que son una
 * observación real pero no un volumen de búsquedas mensual.
 */
const FUENTES_EXTRA: FuenteId[] = ["tendencias"];

/**
 * Días que una observación de una fuente extra sigue contando como evidencia.
 * Las tendencias del día valen para el día (y el anterior, por husos horarios);
 * pasado ese plazo se dejan de contar aunque sigan guardadas.
 */
export const DIAS_VIGENCIA_EXTRA = 2;

/** ¿Es una clave de fuente conocida? */
function esFuenteId(valor: string): valor is FuenteId {
  return (CLAVES_FUENTE as string[]).includes(valor);
}

/** Lee la procedencia guardada, descartando lo que no tenga forma válida. */
export function leerProcedencia(valor: unknown): ProcedenciaMetrica {
  if (!valor || typeof valor !== "object") return {};
  const resultado: ProcedenciaMetrica = {};
  for (const [clave, dato] of Object.entries(valor as Record<string, unknown>)) {
    if (!esFuenteId(clave) || !dato || typeof dato !== "object") continue;
    const fila = dato as Record<string, unknown>;
    if (typeof fila.valor !== "number") continue;
    const tipo = fila.tipo === "MEDIDO" || fila.tipo === "IMPORTADO" || fila.tipo === "MIXTO" ? fila.tipo : "ESTIMADO";
    resultado[clave] = {
      tipo,
      fuente: typeof fila.fuente === "string" ? fila.fuente : "motor-interno",
      fecha: typeof fila.fecha === "string" ? fila.fecha : new Date().toISOString(),
      valor: fila.valor,
    };
  }
  return resultado;
}

type MetricaMinima = {
  fechaMedicion: Date;
  procedencia: unknown;
  fuente: string;
  tipoDato: string;
  googleSearchVolume: number;
  tiktokViews: number;
  youtubeViews: number;
  metaAdsCount: number;
  shopifyStoresUsing: number;
};

/**
 * Construye las observaciones de un producto a partir de sus últimas
 * mediciones (la primera es la más reciente).
 *
 * Si una medición no tiene `procedencia` (datos antiguos), se reconstruye con
 * la procedencia de la fila: si es ESTIMADO, todas las fuentes quedan como
 * estimadas — nunca se inventan mediciones.
 */
export function observacionesDeMetricas(
  metricas: MetricaMinima[],
  ahora: Date = new Date(),
): ObservacionFuente[] {
  const [ultima, anterior] = metricas;
  if (!ultima) return [];

  const valores: Partial<Record<FuenteId, number>> = {
    google: ultima.googleSearchVolume,
    tiktok: ultima.tiktokViews,
    youtube: ultima.youtubeViews,
    meta: ultima.metaAdsCount,
    tiendas: ultima.shopifyStoresUsing,
  };

  const procedenciaActual = leerProcedencia(ultima.procedencia);
  const procedenciaAnterior = anterior ? leerProcedencia(anterior.procedencia) : {};

  const observaciones: ObservacionFuente[] = [];
  for (const fuente of CLAVES_FUENTE) {
    // Las fuentes extra no se leen de una columna: se añaden más abajo.
    if (FUENTES_EXTRA.includes(fuente)) continue;
    const valor = valores[fuente] ?? 0;
    if (valor <= 0) continue;

    const actual = procedenciaActual[fuente] ?? {
      // Sin procedencia explícita: se hereda el tipo de la fila.
      tipo: (ultima.tipoDato as TipoDatoFuente) ?? "ESTIMADO",
      fuente: ultima.fuente,
      fecha: ultima.fechaMedicion.toISOString(),
      valor,
    };

    const previo = procedenciaAnterior[fuente]?.valor ?? null;
    observaciones.push({
      fuente,
      tipo: actual.tipo,
      fecha: actual.fecha ?? ultima.fechaMedicion.toISOString(),
      valor,
      previo,
    });
  }

  // Fuentes que solo están en la procedencia (tendencias del día).
  // Caducan: una tendencia de hace una semana no es evidencia de hoy.
  const limiteExtra = ahora.getTime() - DIAS_VIGENCIA_EXTRA * 86_400_000;
  for (const fuente of FUENTES_EXTRA) {
    const actual = procedenciaActual[fuente];
    if (!actual) continue;
    if (new Date(actual.fecha).getTime() < limiteExtra) continue;
    observaciones.push({
      fuente,
      tipo: actual.tipo,
      fecha: actual.fecha,
      valor: actual.valor,
      previo: procedenciaAnterior[fuente]?.valor ?? null,
    });
  }

  return observaciones;
}

/** Calcula la confianza de un producto sin escribir nada. */
export async function calcularConfianza(productId: string): Promise<ResultadoConfianza | null> {
  const metricas = await prisma.trendMetric.findMany({
    where: { productId },
    orderBy: { fechaMedicion: "desc" },
    take: 2,
    select: {
      fechaMedicion: true,
      procedencia: true,
      fuente: true,
      tipoDato: true,
      googleSearchVolume: true,
      tiktokViews: true,
      youtubeViews: true,
      metaAdsCount: true,
      shopifyStoresUsing: true,
    },
  });
  if (metricas.length === 0) return null;
  return evaluarConfianza(observacionesDeMetricas(metricas));
}

/** Recalcula y guarda el nivel de confianza de un producto. */
export async function recalcularConfianzaProducto(productId: string): Promise<ResultadoConfianza | null> {
  const resultado = await calcularConfianza(productId);
  if (!resultado) return null;

  const ultima = await prisma.trendMetric.findFirst({
    where: { productId, tipoDato: "MEDIDO" },
    orderBy: { fechaMedicion: "desc" },
    select: { fechaMedicion: true },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      confianza: resultado.puntos,
      nivelConfianza: resultado.nivel,
      fuentesMedidas: resultado.fuentesMedidas,
      ultimaMedicion: resultado.fuentesMedidas > 0 ? (ultima?.fechaMedicion ?? new Date()) : null,
    },
  });

  return resultado;
}

/**
 * Recalcula la confianza de todos los productos.
 * Lo usa el seed y el comando `npm run confianza:recalcular`.
 */
export async function recalcularTodasLasConfianzas(): Promise<Array<{ id: string; nivel: string; puntos: number }>> {
  const productos = await prisma.product.findMany({ select: { id: true } });
  const resultados: Array<{ id: string; nivel: string; puntos: number }> = [];

  for (const producto of productos) {
    const resultado = await recalcularConfianzaProducto(producto.id);
    if (resultado) resultados.push({ id: producto.id, nivel: resultado.nivel, puntos: resultado.puntos });
  }

  return resultados;
}

/**
 * Procedencia de una medición nueva.
 *
 * Recibe lo medido en esta pasada y la procedencia de la anterior: lo que no
 * se ha medido ahora se hereda **con su fecha original**, para que la
 * frescura se calcule con la verdad y no con la fecha de la fila.
 */
export function construirProcedencia(
  valores: Partial<Record<FuenteId, number>>,
  medido: Partial<Record<FuenteId, { fuente: string }>>,
  anterior: ProcedenciaMetrica,
  ahora: Date = new Date(),
): ProcedenciaMetrica {
  const procedencia: ProcedenciaMetrica = {};
  for (const fuente of CLAVES_FUENTE) {
    // Las fuentes extra no tienen columna: no se inventan valores para ellas.
    if (FUENTES_EXTRA.includes(fuente)) continue;
    const previa = anterior[fuente];
    const medicion = medido[fuente];
    if (medicion) {
      procedencia[fuente] = { tipo: "MEDIDO", fuente: medicion.fuente, fecha: ahora.toISOString(), valor: valores[fuente] ?? 0 };
    } else if (previa) {
      procedencia[fuente] = { ...previa, valor: valores[fuente] ?? previa.valor };
    } else {
      procedencia[fuente] = {
        tipo: "ESTIMADO",
        fuente: "motor-interno",
        fecha: ahora.toISOString(),
        valor: valores[fuente] ?? 0,
      };
    }
  }
  return procedencia;
}

/** Guarda la procedencia en una medición recién creada. */
export async function guardarProcedencia(metricaId: string, procedencia: ProcedenciaMetrica) {
  await prisma.trendMetric.update({
    where: { id: metricaId },
    data: { procedencia: toJsonInput(procedencia) },
  });
}

/**
 * Procedencia lista para pintar: evalúa el producto y devuelve cada fuente con
 * su tipo, origen, fecha y valor, más los enlaces de comprobación.
 */
export async function obtenerProcedenciaProducto(productId: string) {
  const producto = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      title: true,
      confianza: true,
      nivelConfianza: true,
      fuentesMedidas: true,
      ultimaMedicion: true,
      googleSearchVolume: true,
      tiktokViews: true,
      youtubeViews: true,
      metaAdsCount: true,
      storesUsing: true,
    },
  });
  if (!producto) return null;

  const metricas = await prisma.trendMetric.findMany({
    where: { productId },
    orderBy: { fechaMedicion: "desc" },
    take: 2,
    select: {
      fechaMedicion: true,
      procedencia: true,
      fuente: true,
      tipoDato: true,
      googleSearchVolume: true,
      tiktokViews: true,
      youtubeViews: true,
      metaAdsCount: true,
      shopifyStoresUsing: true,
    },
  });

  const evaluacion = metricas.length > 0 ? evaluarConfianza(observacionesDeMetricas(metricas)) : {
    puntos: producto.confianza,
    nivel: producto.nivelConfianza,
    fuentesMedidas: producto.fuentesMedidas,
    contradicen: false,
    familiasMedidas: 0,
    diasDesdeUltima: null,
    factores: [],
    motivos: ["Todavía no hay ninguna observación registrada."],
  };

  const procedencia = metricas[0] ? leerProcedencia(metricas[0].procedencia) : {};
  const valores: Partial<Record<FuenteId, number>> = {
    google: producto.googleSearchVolume,
    tiktok: producto.tiktokViews,
    youtube: producto.youtubeViews,
    meta: producto.metaAdsCount,
    tiendas: producto.storesUsing,
  };

  const items = CLAVES_FUENTE.filter(
    (fuente) => (valores[fuente] ?? 0) > 0 || (FUENTES_EXTRA.includes(fuente) && procedencia[fuente]),
  ).map((fuente) => {
    const dato = procedencia[fuente];
    return {
      fuente,
      tipo: dato?.tipo ?? ("ESTIMADO" as TipoDatoFuente),
      origen: dato?.fuente ?? "motor-interno",
      fecha: dato?.fecha ?? metricas[0]?.fechaMedicion.toISOString() ?? new Date().toISOString(),
      valor: valores[fuente] ?? 0,
    };
  });

  return { evaluacion, items, consulta: producto.title };
}
