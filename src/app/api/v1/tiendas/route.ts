import { listStores } from "@/lib/dal";
import { autenticarApi } from "@/lib/apiAuth";
import { errorApi, leerEntero, preflightApi, respuestaApi } from "@/lib/apiV1";

/**
 * GET /api/v1/tiendas
 *
 * Tiendas analizadas, ordenadas por facturación estimada.
 * Parámetro opcional: `limite` (1–50, por defecto 20).
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightApi();
}

export async function GET(request: Request) {
  const auth = await autenticarApi(request, "/tiendas");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const url = new URL(request.url);
  const limite = leerEntero(url, "limite", { min: 1, max: 50, defecto: 20 });
  if (!limite.ok) return errorApi(400, "PARAMETRO_INVALIDO", limite.mensaje);

  const tiendas = await listStores(limite.valor ?? 20);

  return respuestaApi(
    tiendas,
    {
      total: tiendas.length,
      limite: limite.valor ?? 20,
      procedencia:
        "Las cifras de facturación y tráfico son estimaciones del motor de análisis (tipo ESTIMADO). El detalle por tienda indica la fecha del último análisis.",
      clave: auth.contexto.clave.prefijo,
    },
    200,
    auth.contexto.cabeceras,
  );
}
