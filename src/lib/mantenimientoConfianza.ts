import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";
import { ETIQUETAS_CONFIANZA, evaluarConfianza, type NivelConfianza, type ResultadoConfianza } from "@/lib/confianza";
import { observacionesDeMetricas, recalcularConfianzaProducto } from "@/lib/confianzaProducto";

/**
 * ============================================================================
 *  MANTENIMIENTO DE LA CONFIANZA (sin pantallas nuevas)
 * ============================================================================
 *  La confianza no puede quedarse congelada: si una medición cumple días o una
 *  fuente deja de responder, el sello del producto tiene que reflejarlo.
 *
 *  Esta tarea:
 *    1. Recalcula el nivel con la evidencia REALMENTE guardada (fechas
 *       incluidas, sin maquillarlas).
 *    2. Si un producto **deja de estar verificado**, pierde también la marca de
 *       oportunidad dorada (los que nunca estuvieron verificados se quedan
 *       como «oportunidad estimada», que es como ya se muestran).
 *    3. Avisa en la campana a quien lo tiene seguido o guardado (una vez al
 *       día como máximo, para no inundar).
 *    4. Devuelve un resumen que se pinta en una línea dentro de «Fuentes en
 *       vivo»: no hay página ni entrada de menú nuevas.
 *
 *  Es idempotente: ejecutarlo dos veces seguidas no cambia nada ni duplica
 *  avisos.
 * ============================================================================
 */

/** Días que se considera «fresca» una medición (misma regla que el sello). */
export const DIAS_FRESCURA = 7;

export interface ProductoConEvidenciaVieja {
  id: string;
  titulo: string;
  nivel: NivelConfianza;
  diasSinMedir: number | null;
}

export interface Degradacion {
  id: string;
  titulo: string;
  antes: NivelConfianza;
  ahora: NivelConfianza;
  motivo: string;
}

export interface ResumenConfianza {
  total: number;
  verificados: number;
  parciales: number;
  estimados: number;
  sinDatos: number;
  /** Productos con evidencia medida, pero de hace más de 7 días. */
  caducados: ProductoConEvidenciaVieja[];
  /** Productos cuyas fuentes medidas se contradicen. */
  contradictorios: ProductoConEvidenciaVieja[];
  /** Productos que pierden nivel en esta pasada. */
  degradados: Degradacion[];
  avisosCreados: number;
  duracionMs: number;
}

type ProductoAuditado = {
  id: string;
  title: string;
  nivelConfianza: NivelConfianza;
  confianza: number;
  isGoldenOpportunity: boolean;
  evaluacion: ResultadoConfianza | null;
};

/**
 * Evalúa todos los productos activos con una sola consulta a la base.
 * No escribe nada: es la base del resumen que se pinta en la pantalla.
 */
async function evaluarProductosActivos(): Promise<ProductoAuditado[]> {
  const productos = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      nivelConfianza: true,
      confianza: true,
      isGoldenOpportunity: true,
      metrics: {
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
      },
    },
  });

  return productos.map((producto) => ({
    id: producto.id,
    title: producto.title,
    nivelConfianza: producto.nivelConfianza as NivelConfianza,
    confianza: producto.confianza,
    isGoldenOpportunity: producto.isGoldenOpportunity,
    evaluacion: producto.metrics.length > 0 ? evaluarConfianza(observacionesDeMetricas(producto.metrics)) : null,
  }));
}

/** Acumula una evaluación en el resumen (sin escribir nada). */
function acumular(resumen: ResumenConfianza, producto: ProductoAuditado): void {
  const evaluacion = producto.evaluacion;
  if (!evaluacion) {
    resumen.sinDatos += 1;
    return;
  }

  switch (evaluacion.nivel) {
    case "VERIFICADO":
      resumen.verificados += 1;
      break;
    case "PARCIAL":
      resumen.parciales += 1;
      break;
    case "ESTIMADO":
      resumen.estimados += 1;
      break;
    default:
      resumen.sinDatos += 1;
  }

  const dias = evaluacion.diasDesdeUltima;
  if (evaluacion.fuentesMedidas > 0 && (dias === null || dias > DIAS_FRESCURA)) {
    resumen.caducados.push({ id: producto.id, titulo: producto.title, nivel: evaluacion.nivel, diasSinMedir: dias });
  }

  if (evaluacion.contradicen) {
    resumen.contradictorios.push({ id: producto.id, titulo: producto.title, nivel: evaluacion.nivel, diasSinMedir: dias });
  }
}

/** Resumen para pintar (no modifica nada). */
export async function resumenSaludDelDato(): Promise<ResumenConfianza> {
  const inicio = Date.now();
  const productos = await evaluarProductosActivos();
  const resumen = resumenVacio(productos.length);

  for (const producto of productos) acumular(resumen, producto);

  resumen.duracionMs = Date.now() - inicio;
  return resumen;
}

/**
 * Recalcula y corrige la confianza de todos los productos activos.
 *
 * @param opciones.escribir `false` = solo informa. Por defecto escribe.
 * @param opciones.avisar   crea avisos en la campana. Por defecto sí.
 */
export async function revisarConfianza(
  opciones: { escribir?: boolean; avisar?: boolean } = {},
): Promise<ResumenConfianza> {
  const inicio = Date.now();
  const escribir = opciones.escribir ?? true;
  const avisar = opciones.avisar ?? true;

  const productos = await evaluarProductosActivos();
  const resumen = resumenVacio(productos.length);

  for (const producto of productos) {
    acumular(resumen, producto);
    if (!escribir || !producto.evaluacion) continue;

    const evaluacion = producto.evaluacion;
    const nivelCambia = evaluacion.nivel !== producto.nivelConfianza;
    const puntosCambian = evaluacion.puntos !== producto.confianza;

    if (nivelCambia || puntosCambian) {
      const actualizado = await recalcularConfianzaProducto(producto.id);
      if (actualizado && actualizado.nivel !== producto.nivelConfianza) {
        resumen.degradados.push({
          id: producto.id,
          titulo: producto.title,
          antes: producto.nivelConfianza,
          ahora: actualizado.nivel,
          motivo: actualizado.motivos[0] ?? "La evidencia ya no sostiene el nivel anterior.",
        });
      }
    }

    // Solo se toca el dorado cuando el producto PIERDE la verificación que
    // tenía: ahí deja de estar destacado y se avisa. Un producto que nunca
    // estuvo verificado sigue como «oportunidad estimada» (así se etiqueta ya
    // en el catálogo) y no molesta con avisos.
    if (producto.nivelConfianza === "VERIFICADO" && evaluacion.nivel !== "VERIFICADO") {
      if (producto.isGoldenOpportunity) {
        await prisma.product.update({ where: { id: producto.id }, data: { isGoldenOpportunity: false } });
      }
      if (avisar) {
        resumen.avisosCreados += await avisarPerdidaDeVerificacion(producto.id, producto.title, evaluacion);
      }
    }
  }

  resumen.duracionMs = Date.now() - inicio;
  if (escribir) {
    logger.info("confianza_revisada", {
      total: resumen.total,
      verificados: resumen.verificados,
      degradados: resumen.degradados.length,
      caducados: resumen.caducados.length,
      avisos: resumen.avisosCreados,
      duracionMs: resumen.duracionMs,
    });
  }
  return resumen;
}

/** Resumen vacío con la forma esperada. */
function resumenVacio(total: number): ResumenConfianza {
  return {
    total,
    verificados: 0,
    parciales: 0,
    estimados: 0,
    sinDatos: 0,
    caducados: [],
    contradictorios: [],
    degradados: [],
    avisosCreados: 0,
    duracionMs: 0,
  };
}

/**
 * Avisa a quien sigue o guarda el producto de que ha dejado de estar
 * verificado. Como mucho un aviso al día por producto y usuario.
 */
async function avisarPerdidaDeVerificacion(
  productoId: string,
  titulo: string,
  evaluacion: Pick<ResultadoConfianza, "nivel" | "diasDesdeUltima" | "fuentesMedidas">,
): Promise<number> {
  const [seguidores, guardados] = await Promise.all([
    prisma.trackedProduct.findMany({ where: { productId: productoId }, select: { userId: true } }),
    prisma.savedProduct.findMany({ where: { productId: productoId }, select: { userId: true } }),
  ]);

  const usuarios = [...new Set([...seguidores, ...guardados].map((fila) => fila.userId))];
  if (usuarios.length === 0) return 0;

  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yaAvisados = new Set(
    (
      await prisma.alertNotification.findMany({
        where: { entityId: productoId, entityType: "producto", createdAt: { gte: desde } },
        select: { userId: true },
      })
    ).map((fila) => fila.userId),
  );

  const motivo =
    evaluacion.diasDesdeUltima !== null && evaluacion.diasDesdeUltima > DIAS_FRESCURA
      ? `la última medición tiene ${evaluacion.diasDesdeUltima} días`
      : evaluacion.fuentesMedidas === 0
        ? "ya no tiene ninguna fuente externa"
        : "las fuentes no coinciden entre sí";

  let creados = 0;
  for (const userId of usuarios) {
    if (yaAvisados.has(userId)) continue;
    await createNotification({
      userId,
      type: "SYSTEM",
      title: `Dato rebajado a ${ETIQUETAS_CONFIANZA[evaluacion.nivel]}: ${titulo}`,
      message: `El producto ya no se sostiene como verificado porque ${motivo}. Sigue en tu catálogo, pero sin la etiqueta de oportunidad dorada.`,
      entityType: "producto",
      entityId: productoId,
      actionUrl: `/dashboard/winning-products/${productoId}`,
      metadata: { nivel: evaluacion.nivel, motivo },
    });
    creados += 1;
  }
  return creados;
}
