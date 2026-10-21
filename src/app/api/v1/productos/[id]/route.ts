import { getProductDetail } from "@/lib/dal";
import { autenticarApi } from "@/lib/apiAuth";
import { errorApi, preflightApi, respuestaApi } from "@/lib/apiV1";
import type { TipoDato } from "@/types";

/**
 * GET /api/v1/productos/:id
 *
 * Ficha completa: producto, métricas diarias (con fuente, fecha de medición y
 * tipo de dato), anuncios detectados y tiendas que lo venden.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightApi();
}

/** Resumen de procedencia a partir de las métricas disponibles. */
function resumirProcedencia(
  metricas: Array<{ fuente: string; fechaMedicion: string; tipoDato: TipoDato }>,
) {
  const fuentes = [...new Set(metricas.map((metrica) => metrica.fuente))];
  const porTipo = metricas.reduce<Record<string, number>>((acumulado, metrica) => {
    acumulado[metrica.tipoDato] = (acumulado[metrica.tipoDato] ?? 0) + 1;
    return acumulado;
  }, {});
  const ultima = metricas
    .map((metrica) => metrica.fechaMedicion)
    .sort()
    .at(-1);

  return {
    fuentes,
    porTipo,
    ultimaMedicion: ultima ?? null,
    observaciones: metricas.length,
    nota:
      "MEDIDO = dato obtenido de una fuente externa; IMPORTADO = facilitado por el usuario; ESTIMADO = calculado por el motor interno a partir de las series.",
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticarApi(request, "/productos/:id");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const { id } = await params;
  const detalle = await getProductDetail(id);
  if (!detalle) {
    return errorApi(404, "NO_ENCONTRADO", `No existe un producto con id «${id}».`, auth.contexto.cabeceras);
  }

  return respuestaApi(
    {
      producto: detalle.product,
      metricas: detalle.metrics,
      anuncios: detalle.ads,
      tiendas: detalle.stores,
      procedencia: resumirProcedencia(detalle.metrics),
    },
    { clave: auth.contexto.clave.prefijo },
    200,
    auth.contexto.cabeceras,
  );
}
