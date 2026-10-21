import { tendenciasDelDia } from "@/lib/providers/tendenciasGoogle";
import { autenticarApi } from "@/lib/apiAuth";
import { errorApi, leerOpcion, preflightApi, respuestaApi } from "@/lib/apiV1";
import { TARGET_COUNTRIES } from "@/lib/constants";

/**
 * GET /api/v1/tendencias/del-dia?geo=ES
 *
 * Términos más buscados hoy según el feed RSS oficial de Google Trends.
 * Dato MEDIDO en el momento de la consulta (se cachea 5 minutos).
 */
export const dynamic = "force-dynamic";

const GEOS = TARGET_COUNTRIES.map((pais) => pais.code);

export function OPTIONS() {
  return preflightApi();
}

export async function GET(request: Request) {
  const auth = await autenticarApi(request, "/tendencias/del-dia");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const url = new URL(request.url);
  const geo = leerOpcion(url, "geo", GEOS);
  if (!geo.ok) return errorApi(400, "PARAMETRO_INVALIDO", geo.mensaje);

  const resultado = await tendenciasDelDia(geo.valor ?? "ES");
  if (resultado.error || !resultado.datos) {
    return errorApi(
      502,
      "FUENTE_NO_DISPONIBLE",
      `Google Trends no respondió: ${resultado.error ?? "sin datos"}. Reintenta en unos minutos.`,
      auth.contexto.cabeceras,
    );
  }

  return respuestaApi(
    resultado.datos,
    {
      geo: geo.valor ?? "ES",
      fuente: "google-tendencias-rss",
      tipoDato: "MEDIDO",
      latenciaMs: resultado.latenciaMs,
      clave: auth.contexto.clave.prefijo,
    },
    200,
    auth.contexto.cabeceras,
  );
}
