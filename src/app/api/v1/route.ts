import { respuestaApi, preflightApi, CABECERAS_CORS } from "@/lib/apiV1";
import { API_PLAN_LIMITS, API_VERSION } from "@/lib/apiKeys";

/**
 * ============================================================================
 *  ÍNDICE PÚBLICO DE LA API v1
 * ============================================================================
 *  Sin clave: sirve de descubrimiento (endpoints, autenticación y límites).
 *  Los datos se sirven en `/api/v1/…` y requieren una clave de plan BUSINESS+.
 * ============================================================================
 */
export function OPTIONS() {
  return preflightApi();
}

export async function GET() {
  return respuestaApi(
    {
      nombre: "TrendHunter Pro API",
      version: API_VERSION,
      descripcion:
        "API de solo lectura sobre el catálogo de productos ganadores, tiendas analizadas y series de tendencia. Todas las cifras conservan su procedencia (medida, importada o estimada).",
      documentacion: "/dashboard/api",
      autenticacion: {
        cabeceras: ["Authorization: Bearer thp_live_…", "X-API-Key: thp_live_…"],
        planes: Object.entries(API_PLAN_LIMITS).map(([plan, limites]) => ({
          plan,
          peticionesPorMinuto: limites.porMinuto,
          peticionesPorDia: limites.porDia,
        })),
      },
      endpoints: [
        { metodo: "GET", ruta: "/api/v1/productos", descripcion: "Catálogo con filtros y paginación.", clave: true },
        { metodo: "GET", ruta: "/api/v1/productos/{id}", descripcion: "Ficha completa: métricas, anuncios y tiendas.", clave: true },
        { metodo: "GET", ruta: "/api/v1/tiendas", descripcion: "Tiendas analizadas, ordenadas por facturación estimada.", clave: true },
        { metodo: "GET", ruta: "/api/v1/tiendas/{id}", descripcion: "Tienda con productos y timeline de cambios.", clave: true },
        { metodo: "GET", ruta: "/api/v1/tendencias", descripcion: "Serie diaria agregada de los últimos 30 días.", clave: true },
        { metodo: "GET", ruta: "/api/v1/tendencias/del-dia", descripcion: "Términos del día (Google Trends RSS, dato medido).", clave: true },
        { metodo: "GET", ruta: "/api/v1/estadisticas", descripcion: "KPIs agregados del catálogo.", clave: true },
        { metodo: "GET", ruta: "/api/v1/openapi", descripcion: "Especificación OpenAPI 3.1 (esta ruta es pública).", clave: false },
      ],
    },
    { autenticada: false },
    200,
    CABECERAS_CORS,
  );
}
