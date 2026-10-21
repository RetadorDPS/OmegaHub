import { getDashboardStats } from "@/lib/dal";
import { autenticarApi } from "@/lib/apiAuth";
import { errorApi, preflightApi, respuestaApi } from "@/lib/apiV1";

/**
 * GET /api/v1/estadisticas
 *
 * KPIs agregados del catálogo: productos, oportunidades doradas, saturación por
 * nivel y reparto por categoría. No expone datos de usuarios.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightApi();
}

export async function GET(request: Request) {
  const auth = await autenticarApi(request, "/estadisticas");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const estadisticas = await getDashboardStats();

  return respuestaApi(
    {
      productosActivos: estadisticas.productos,
      oportunidadesDoradas: estadisticas.dorados,
      anuncios: estadisticas.anuncios,
      tiendas: estadisticas.tiendas,
      proveedores: estadisticas.proveedores,
      trendScoreMedio: estadisticas.scoreMedio,
      margenMedioPct: estadisticas.margenMedio,
      facturacionMensualEstimada: estadisticas.facturacionTotal,
      saturacion: estadisticas.saturacion,
      porCategoria: estadisticas.porCategoria,
    },
    {
      clave: auth.contexto.clave.prefijo,
      procedencia:
        "Facturación y margen son estimaciones del motor interno (tipo ESTIMADO). El catálogo indica por producto la fuente y la fecha de cada métrica.",
    },
    200,
    auth.contexto.cabeceras,
  );
}
