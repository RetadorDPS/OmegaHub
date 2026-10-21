import { getStoreDetail } from "@/lib/dal";
import { autenticarApi } from "@/lib/apiAuth";
import { errorApi, preflightApi, respuestaApi } from "@/lib/apiV1";

/**
 * GET /api/v1/tiendas/:id
 *
 * Tienda analizada con sus productos y el timeline de cambios detectados.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightApi();
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticarApi(request, "/tiendas/:id");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const { id } = await params;
  const detalle = await getStoreDetail(id);
  if (!detalle) {
    return errorApi(404, "NO_ENCONTRADO", `No existe una tienda con id «${id}».`, auth.contexto.cabeceras);
  }

  return respuestaApi(
    {
      tienda: detalle.store,
      cambios: detalle.changes,
      procedencia: {
        analisis: detalle.store.lastScannedAt,
        nota:
          "La tienda se analiza con el Shopify Store Radar. `lastScannedAt` es la fecha real del último análisis; las métricas de tráfico y facturación son estimaciones del motor.",
      },
    },
    { clave: auth.contexto.clave.prefijo },
    200,
    auth.contexto.cabeceras,
  );
}
