/**
 * ============================================================================
 *  CONFIANZA DEL DATO
 * ============================================================================
 *  Un producto no es «ganador» porque el motor interno lo diga: lo es cuando
 *  varias fuentes independientes lo confirman, la medición es reciente y las
 *  señales no se contradicen.
 *
 *  Este módulo es puro (sin base de datos ni red) para poder probarlo y para
 *  que la interfaz, el PDF y la API usen exactamente la misma regla.
 *
 *  Puntuación (0–100):
 *    · Cobertura   45 → cuántas fuentes independientes están medidas.
 *    · Frescura    25 → hace cuánto se midió por última vez.
 *    · Diversidad  15 → familias distintas (búsqueda, vídeo, anuncios, catálogo).
 *    · Consistencia 15 → las fuentes apuntan en la misma dirección.
 *
 *  Regla dura: solo es VERIFICADO con 2+ fuentes medidas en los últimos 7 días
 *  y 60 puntos o más. La etiqueta «Oportunidad dorada» exige ese nivel.
 * ============================================================================
 */

/** Fuentes de datos que alimentan el score. */
export type FuenteId = "google" | "tiktok" | "youtube" | "meta" | "tiendas" | "tendencias";

/** Familias: dos fuentes de la misma familia no son evidencia independiente. */
export type FamiliaFuente = "busqueda" | "social" | "video" | "ads" | "catalogo";

/** Tipo de dato de una observación (mismo vocabulario que Prisma). */
export type TipoDatoFuente = "MEDIDO" | "IMPORTADO" | "ESTIMADO" | "MIXTO";

export interface DefinicionFuente {
  id: FuenteId;
  nombre: string;
  familia: FamiliaFuente;
  /** Cómo se comprueba a mano (texto para el panel de procedencia). */
  comoSeComprueba: string;
}

export const FUENTES: Record<FuenteId, DefinicionFuente> = {
  google: {
    id: "google",
    nombre: "Google Trends",
    familia: "busqueda",
    comoSeComprueba: "trends.google.com → busca el nicho y compara el interés de 12 meses.",
  },
  tiktok: {
    id: "tiktok",
    nombre: "TikTok Creative Center",
    familia: "social",
    comoSeComprueba: "ads.tiktok.com/business/creativecenter → busca el producto en «Trends».",
  },
  youtube: {
    id: "youtube",
    nombre: "YouTube Data API",
    familia: "video",
    comoSeComprueba: "YouTube → ordena por «Este mes» y compara las visualizaciones.",
  },
  meta: {
    id: "meta",
    nombre: "Meta Ad Library",
    familia: "ads",
    comoSeComprueba: "facebook.com/ads/library → busca el producto y cuenta los anuncios activos.",
  },
  tiendas: {
    id: "tiendas",
    nombre: "Catálogo Shopify",
    familia: "catalogo",
    comoSeComprueba: "Busca el producto en Google con `site:myshopify.com` o mira la tienda citada.",
  },
  tendencias: {
    id: "tendencias",
    nombre: "Google Trends · tendencias del día",
    familia: "busqueda",
    comoSeComprueba: "trends.google.com/trending?geo=ES → comprueba si el término está hoy entre las búsquedas que más crecen.",
  },
};

export const FAMILIAS: Record<FamiliaFuente, string> = {
  busqueda: "Búsqueda",
  social: "Redes",
  video: "Vídeo",
  ads: "Publicidad",
  catalogo: "Catálogo de tiendas",
};

/** Observación de una fuente sobre un producto. */
export interface ObservacionFuente {
  fuente: FuenteId;
  tipo: TipoDatoFuente;
  /** Fecha de la medición (ISO o Date). */
  fecha: string | Date;
  /** Valor actual de la señal (búsquedas, vistas, anuncios, tiendas…). */
  valor?: number | null;
  /** Valor de la medición anterior, para medir la dirección. */
  previo?: number | null;
}

export type NivelConfianza = "VERIFICADO" | "PARCIAL" | "ESTIMADO" | "SIN_DATOS";

export interface FactorConfianza {
  id: "cobertura" | "frescura" | "diversidad" | "consistencia";
  nombre: string;
  puntos: number;
  maximo: number;
  detalle: string;
}

export interface ResultadoConfianza {
  puntos: number;
  /** ¿Las fuentes medidas apuntan en direcciones opuestas? */
  contradicen: boolean;
  nivel: NivelConfianza;
  fuentesMedidas: number;
  familiasMedidas: number;
  diasDesdeUltima: number | null;
  factores: FactorConfianza[];
  motivos: string[];
}

/** ¿Esta observación procede de una fuente real (medida o importada)? */
export function esObservacionMedida(observacion: ObservacionFuente): boolean {
  return observacion.tipo === "MEDIDO" || observacion.tipo === "IMPORTADO";
}

/** Días completos entre dos fechas (nunca negativos). */
function diasEntre(desde: Date, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000));
}

/** Dirección de una señal: 1 sube, -1 baja, 0 plana. */
export function direccionSenal(actual: number, previo: number | null | undefined): -1 | 0 | 1 {
  if (previo === null || previo === undefined || previo === 0) return 0;
  const cambio = (actual - previo) / Math.abs(previo);
  if (cambio > 0.05) return 1;
  if (cambio < -0.05) return -1;
  return 0;
}

/**
 * Evalúa la confianza de un producto a partir de las observaciones de sus
 * fuentes. Es determinista: la misma entrada da el mismo resultado.
 */
export function evaluarConfianza(
  observaciones: ObservacionFuente[],
  ahora: Date = new Date(),
): ResultadoConfianza {
  const medidas = observaciones.filter(esObservacionMedida);
  const fuentesUnicas = [...new Set(medidas.map((observacion) => observacion.fuente))];
  const familias = [...new Set(fuentesUnicas.map((fuente) => FUENTES[fuente]?.familia ?? "busqueda"))];
  const fuentesMedidas = fuentesUnicas.length;

  const fechas = medidas.map((observacion) => new Date(observacion.fecha).getTime()).filter((valor) => Number.isFinite(valor));
  const diasDesdeUltima = fechas.length > 0 ? diasEntre(new Date(Math.max(...fechas)), ahora) : null;

  // --- Cobertura (45) ------------------------------------------------------
  const cobertura = fuentesMedidas >= 3 ? 45 : fuentesMedidas === 2 ? 38 : fuentesMedidas === 1 ? 20 : 0;

  // --- Frescura (25) · solo cuenta si hay algo medido ----------------------
  let frescura = 0;
  if (diasDesdeUltima !== null) {
    frescura = diasDesdeUltima <= 2 ? 25 : diasDesdeUltima <= 7 ? 20 : diasDesdeUltima <= 14 ? 12 : diasDesdeUltima <= 30 ? 5 : 0;
  }

  // --- Diversidad (15) -----------------------------------------------------
  const diversidad = familias.length >= 3 ? 15 : familias.length === 2 ? 12 : familias.length === 1 ? 6 : 0;

  // --- Consistencia (15) ---------------------------------------------------
  const conComparacion = medidas.filter(
    (observacion) => typeof observacion.valor === "number" && typeof observacion.previo === "number",
  );
  const direcciones = conComparacion.map((observacion) => direccionSenal(observacion.valor as number, observacion.previo));
  let consistencia = 0;
  let contradicen = false;
  let detalleConsistencia = "Sin dos mediciones comparables: no se puede comprobar la dirección.";
  if (direcciones.length >= 2) {
    const suben = direcciones.filter((direccion) => direccion === 1).length;
    const bajan = direcciones.filter((direccion) => direccion === -1).length;
    if (suben > 0 && bajan > 0) {
      consistencia = 5;
      contradicen = true;
      detalleConsistencia = "Las fuentes se contradicen: unas suben y otras bajan.";
    } else {
      consistencia = 15;
      detalleConsistencia = suben > 0 ? "Todas las fuentes suben." : bajan > 0 ? "Todas las fuentes bajan." : "Todas las fuentes están planas.";
    }
  } else if (direcciones.length === 1) {
    consistencia = 5;
    detalleConsistencia = "Solo una fuente permite comparar la dirección.";
  }

  const puntos = cobertura + frescura + diversidad + consistencia;

  // --- Nivel ---------------------------------------------------------------
  let nivel: NivelConfianza;
  if (fuentesMedidas === 0) {
    nivel = observaciones.length === 0 ? "SIN_DATOS" : "ESTIMADO";
  } else if (fuentesMedidas >= 2 && (diasDesdeUltima ?? 999) <= 7 && puntos >= 60 && !contradicen) {
    nivel = "VERIFICADO";
  } else {
    nivel = "PARCIAL";
  }

  const factores: FactorConfianza[] = [
    {
      id: "cobertura",
      nombre: "Cobertura",
      puntos: cobertura,
      maximo: 45,
      detalle:
        fuentesMedidas === 0
          ? "Ninguna fuente externa medida: todo sale del motor interno."
          : `${fuentesMedidas} fuente${fuentesMedidas === 1 ? "" : "s"} medida${fuentesMedidas === 1 ? "" : "s"} (${fuentesUnicas
              .map((fuente) => FUENTES[fuente]?.nombre ?? fuente)
              .join(", ")}).`,
    },
    {
      id: "frescura",
      nombre: "Frescura",
      puntos: frescura,
      maximo: 25,
      detalle:
        diasDesdeUltima === null
          ? "Sin fecha de medición."
          : diasDesdeUltima === 0
            ? "Medido hoy."
            : `Última medición hace ${diasDesdeUltima} día${diasDesdeUltima === 1 ? "" : "s"}.`,
    },
    {
      id: "diversidad",
      nombre: "Diversidad",
      puntos: diversidad,
      maximo: 15,
      detalle:
        familias.length === 0
          ? "Sin familias de fuente."
          : `${familias.length} familia${familias.length === 1 ? "" : "s"}: ${familias.map((familia) => FAMILIAS[familia]).join(", ")}.`,
    },
    { id: "consistencia", nombre: "Consistencia", puntos: consistencia, maximo: 15, detalle: detalleConsistencia },
  ];

  const motivos: string[] = [];
  if (nivel === "SIN_DATOS") motivos.push("Todavía no hay ninguna observación registrada.");
  if (nivel === "ESTIMADO") motivos.push("Solo hay cálculos internos: ninguna fuente externa ha confirmado las cifras.");
  if (nivel === "PARCIAL" && fuentesMedidas === 1) motivos.push("Una sola fuente medida: hace falta otra independiente para verificar.");
  if (nivel === "PARCIAL" && fuentesMedidas >= 2 && (diasDesdeUltima ?? 999) > 7) {
    motivos.push(`Última medición hace ${diasDesdeUltima} días: los datos están caducados.`);
  }
  if (nivel === "PARCIAL" && contradicen) {
    motivos.push("Las fuentes medidas se contradicen: hasta que coincidan no se puede verificar.");
  } else if (nivel === "PARCIAL" && fuentesMedidas >= 2 && (diasDesdeUltima ?? 999) <= 7) {
    motivos.push("Fuentes recientes pero insuficientes para llegar a 60 puntos de confianza.");
  }
  if (nivel === "VERIFICADO") {
    motivos.push(`Confirmado por ${fuentesMedidas} fuentes en los últimos ${diasDesdeUltima} días.`);
  }

  return { puntos, nivel, contradicen, fuentesMedidas, familiasMedidas: familias.length, diasDesdeUltima, factores, motivos };
}

/** ¿Puede destacarse como oportunidad dorada? Solo con datos verificados. */
export function puedeSerDorada(resultado: Pick<ResultadoConfianza, "nivel" | "puntos">): boolean {
  return resultado.nivel === "VERIFICADO" && resultado.puntos >= 60;
}

/** Etiqueta visible de la oportunidad según su confianza. */
export function etiquetaOportunidad(dorada: boolean, nivel: NivelConfianza): string {
  if (!dorada) return "Destacado";
  return nivel === "VERIFICADO" ? "Oportunidad dorada" : "Oportunidad estimada";
}

export const ETIQUETAS_CONFIANZA: Record<NivelConfianza, string> = {
  VERIFICADO: "Verificado",
  PARCIAL: "Parcial",
  ESTIMADO: "Estimado",
  SIN_DATOS: "Sin datos",
};

export const DESCRIPCION_CONFIANZA: Record<NivelConfianza, string> = {
  VERIFICADO: "Dos o más fuentes independientes medidas en los últimos 7 días.",
  PARCIAL: "Hay alguna medición real, pero falta una segunda fuente o está desactualizada.",
  ESTIMADO: "Las cifras salen del motor interno: ninguna fuente externa las ha confirmado.",
  SIN_DATOS: "Todavía no hay mediciones para este producto.",
};

/** Color del sello (clases de Tailwind). */
export const COLORES_CONFIANZA: Record<NivelConfianza, string> = {
  VERIFICADO: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  PARCIAL: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  ESTIMADO: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  SIN_DATOS: "border-slate-600/40 bg-slate-600/10 text-slate-400",
};

/**
 * Tipo de dato de una fila a partir de la procedencia de sus fuentes.
 * Evita el error de marcar «medido» una fila con cuatro valores heredados.
 */
export function tipoDatoDeFila(tipos: TipoDatoFuente[]): TipoDatoFuente {
  if (tipos.length === 0) return "ESTIMADO";
  const medidas = tipos.filter((tipo) => tipo === "MEDIDO").length;
  const importadas = tipos.filter((tipo) => tipo === "IMPORTADO").length;
  const reales = medidas + importadas;
  if (reales === 0) return "ESTIMADO";
  if (reales === tipos.length) return medidas === tipos.length ? "MEDIDO" : "IMPORTADO";
  return "MIXTO";
}

/** Resumen corto para listados: «3 fuentes · hoy». */
export function resumenFuentes(resultado: Pick<ResultadoConfianza, "fuentesMedidas" | "diasDesdeUltima">): string {
  if (resultado.fuentesMedidas === 0) return "sin fuentes medidas";
  const fuentes = `${resultado.fuentesMedidas} fuente${resultado.fuentesMedidas === 1 ? "" : "s"}`;
  if (resultado.diasDesdeUltima === null) return fuentes;
  const cuando = resultado.diasDesdeUltima === 0 ? "hoy" : `hace ${resultado.diasDesdeUltima} d`;
  return `${fuentes} · ${cuando}`;
}
