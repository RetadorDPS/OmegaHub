import { NextResponse } from "next/server";
import { CABECERAS_CORS, preflightApi } from "@/lib/apiV1";
import { API_VERSION } from "@/lib/apiKeys";

/**
 * GET /api/v1/openapi
 *
 * Especificación OpenAPI 3.1 de la API pública. Ruta pública: permite generar
 * clientes (Postman, Insomnia, SDKs) sin exponer ninguna clave.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightApi();
}

/** Parámetros reutilizables de paginación y filtros. */
const PARAMETROS = [
  { name: "pagina", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "porPagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 12 } },
  { name: "busqueda", in: "query", schema: { type: "string" } },
  {
    name: "categoria",
    in: "query",
    schema: { type: "string", enum: ["Salud", "Belleza", "Tecnología", "Mascotas", "Hogar", "Fitness"] },
  },
  { name: "nicho", in: "query", schema: { type: "string" } },
  { name: "saturacion", in: "query", schema: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] } },
  { name: "minScore", in: "query", schema: { type: "integer", minimum: 0, maximum: 100 } },
  { name: "minMargen", in: "query", schema: { type: "number", minimum: 0, maximum: 100 } },
  { name: "minPrecio", in: "query", schema: { type: "number", minimum: 0 } },
  { name: "maxPrecio", in: "query", schema: { type: "number", minimum: 0 } },
  { name: "dorados", in: "query", schema: { type: "boolean" } },
  {
    name: "orden",
    in: "query",
    schema: { type: "string", enum: ["recientes", "score", "margen", "saturacion", "velocidad", "facturacion"] },
  },
];

/** Respuesta de error común. */
const ERROR = {
  description: "Error de la API",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: { codigo: { type: "string" }, mensaje: { type: "string" } },
            required: ["codigo", "mensaje"],
          },
        },
        required: ["error"],
      },
    },
  },
};

export async function GET(request: Request) {
  const origen = new URL(request.url).origin;

  const especificacion = {
    openapi: "3.1.0",
    info: {
      title: "TrendHunter Pro API",
      version: API_VERSION,
      summary: "Productos ganadores, tiendas analizadas y series de tendencia con procedencia.",
      description:
        "API de solo lectura. Cada cifra conserva su procedencia (MEDIDO, IMPORTADO o ESTIMADO) y su fecha de medición. Requiere una clave de API de los planes Business o Agency, creada en /dashboard/api.",
      contact: { name: "TrendHunter Pro", url: "/dashboard/api" },
    },
    servers: [{ url: origen, description: "Servidor actual" }],
    security: [{ claveApi: [] }],
    tags: [
      { name: "Catálogo" },
      { name: "Tiendas" },
      { name: "Tendencias" },
      { name: "Sistema" },
    ],
    paths: {
      "/api/v1": {
        get: {
          tags: ["Sistema"],
          summary: "Índice de la API",
          description: "Ruta pública de descubrimiento: endpoints, autenticación y límites.",
          security: [],
          responses: { "200": { description: "Índice de endpoints" } },
        },
      },
      "/api/v1/productos": {
        get: {
          tags: ["Catálogo"],
          summary: "Listado de productos",
          parameters: [...PARAMETROS, { name: "Authorization", in: "header", schema: { type: "string" } }],
          responses: {
            "200": { description: "Página de productos" },
            "401": ERROR,
            "403": ERROR,
            "429": ERROR,
          },
        },
      },
      "/api/v1/productos/{id}": {
        get: {
          tags: ["Catálogo"],
          summary: "Ficha de producto",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Producto, métricas, anuncios y tiendas" },
            "404": ERROR,
            "401": ERROR,
          },
        },
      },
      "/api/v1/tiendas": {
        get: {
          tags: ["Tiendas"],
          summary: "Tiendas analizadas",
          parameters: [{ name: "limite", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } }],
          responses: { "200": { description: "Tiendas ordenadas por facturación estimada" }, "401": ERROR },
        },
      },
      "/api/v1/tiendas/{id}": {
        get: {
          tags: ["Tiendas"],
          summary: "Ficha de tienda",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Tienda con productos y cambios" }, "404": ERROR },
        },
      },
      "/api/v1/tendencias": {
        get: {
          tags: ["Tendencias"],
          summary: "Serie diaria agregada",
          parameters: [{ name: "dias", in: "query", schema: { type: "integer", minimum: 7, maximum: 30, default: 30 } }],
          responses: { "200": { description: "Serie diaria con su procedencia" }, "401": ERROR },
        },
      },
      "/api/v1/tendencias/del-dia": {
        get: {
          tags: ["Tendencias"],
          summary: "Términos del día",
          description: "Google Trends RSS: dato medido y gratuito. Puede devolver 502 si la fuente no responde.",
          parameters: [
            { name: "geo", in: "query", schema: { type: "string", enum: ["ES", "US", "MX", "AR", "CO", "CL", "FR", "DE", "IT", "GB"] } },
          ],
          responses: {
            "200": { description: "Términos del día" },
            "502": { description: "La fuente externa no respondió" },
          },
        },
      },
      "/api/v1/estadisticas": {
        get: {
          tags: ["Sistema"],
          summary: "KPIs agregados",
          responses: { "200": { description: "Estadísticas del catálogo" }, "401": ERROR },
        },
      },
      "/api/v1/openapi": {
        get: {
          tags: ["Sistema"],
          summary: "Esta especificación",
          security: [],
          responses: { "200": { description: "Documento OpenAPI 3.1" } },
        },
      },
    },
    components: {
      securitySchemes: {
        claveApi: { type: "http", scheme: "bearer", bearerFormat: "thp_live_…" },
      },
      schemas: {
        Producto: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            slug: { type: "string" },
            category: { type: "string" },
            nicheTag: { type: "string" },
            costPrice: { type: "number" },
            suggestedSellPrice: { type: "number" },
            estimatedMargin: { type: "number" },
            trendScore: { type: "integer", minimum: 0, maximum: 100 },
            velocityScore: { type: "number" },
            saturationLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            trendDirection: { type: "string", enum: ["RISING", "STABLE", "FALLING"] },
            isGoldenOpportunity: { type: "boolean" },
            confianza: { type: "integer", minimum: 0, maximum: 100, description: "Confianza del dato (0–100)." },
            nivelConfianza: {
              type: "string",
              enum: ["VERIFICADO", "PARCIAL", "ESTIMADO", "SIN_DATOS"],
              description: "VERIFICADO exige 2+ fuentes medidas en los últimos 7 días.",
            },
            fuentesMedidas: { type: "integer", description: "Fuentes independientes medidas." },
            ultimaMedicion: { type: "string", format: "date-time", nullable: true },
            googleSearchVolume: { type: "integer" },
            tiktokViews: { type: "integer" },
            youtubeViews: { type: "integer" },
            metaAdsCount: { type: "integer" },
            storesUsing: { type: "integer" },
            estimatedMonthlyRevenue: { type: "number" },
            estimatedUnitsSold: { type: "integer" },
          },
        },
      },
    },
  };

  return NextResponse.json(especificacion, { headers: { ...CABECERAS_CORS, "X-API-Version": API_VERSION } });
}
