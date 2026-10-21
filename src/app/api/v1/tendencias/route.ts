import { getGlobalTrendSeries, getTrendDataStatus } from "@/lib/dal";
import { autenticarApi } from "@/lib/apiAuth";
import { errorApi, leerEntero, preflightApi, respuestaApi } from "@/lib/apiV1";

/**
 * GET /api/v1/tendencias?dias=30
 *
 * Serie diaria agregada del catálogo (media del TrendScore y de las métricas
 * de búsqueda, vídeo y anuncios). Incluye la procedencia real de la serie.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightApi();
}

export async function GET(request: Request) {
  const auth = await autenticarApi(request, "/tendencias");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const url = new URL(request.url);
  const dias = leerEntero(url, "dias", { min: 7, max: 30, defecto: 30 });
  if (!dias.ok) return errorApi(400, "PARAMETRO_INVALIDO", dias.mensaje);

  const [serie, estado] = await Promise.all([
    getGlobalTrendSeries(dias.valor ?? 30),
    getTrendDataStatus(),
  ]);

  return respuestaApi(
    serie,
    {
      dias: dias.valor ?? 30,
      puntos: serie.length,
      procedencia: {
        ...estado,
        nota:
          "Cada punto es la media de las métricas diarias del catálogo. La fuente y el tipo de dato por producto están en /api/v1/productos/{id}.",
      },
      clave: auth.contexto.clave.prefijo,
    },
    200,
    auth.contexto.cabeceras,
  );
}
