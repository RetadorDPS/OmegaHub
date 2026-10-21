import { listProducts } from "@/lib/dal";
import { autenticarApi } from "@/lib/apiAuth";
import {
  errorApi,
  leerDecimal,
  leerEntero,
  leerOpcion,
  leerTexto,
  primerFallo,
  preflightApi,
  respuestaApi,
} from "@/lib/apiV1";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import type { ProductSortOption } from "@/types";

/**
 * GET /api/v1/productos
 *
 * Catálogo paginado. Parámetros:
 *   pagina, porPagina (máx. 50), busqueda, categoria, nicho, saturacion,
 *   minScore, minMargen, minPrecio, maxPrecio, dorados, orden.
 */
export const dynamic = "force-dynamic";

/** Nombre legible del orden → valor interno del catálogo. */
const ORDENES: Record<string, ProductSortOption> = {
  recientes: "recent",
  score: "best-score",
  margen: "highest-margin",
  saturacion: "least-saturated",
  velocidad: "fastest-rising",
  facturacion: "highest-revenue",
};

export function OPTIONS() {
  return preflightApi();
}

export async function GET(request: Request) {
  const auth = await autenticarApi(request, "/productos");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const url = new URL(request.url);
  const pagina = leerEntero(url, "pagina", { min: 1, max: 1000, defecto: 1 });
  const porPagina = leerEntero(url, "porPagina", { min: 1, max: 50, defecto: 12 });
  const minScore = leerEntero(url, "minScore", { min: 0, max: 100 });
  const minMargen = leerDecimal(url, "minMargen", { min: 0, max: 100 });
  const minPrecio = leerDecimal(url, "minPrecio", { min: 0 });
  const maxPrecio = leerDecimal(url, "maxPrecio", { min: 0 });
  const categoria = leerOpcion(url, "categoria", PRODUCT_CATEGORIES);
  const saturacion = leerOpcion(url, "saturacion", ["LOW", "MEDIUM", "HIGH"] as const);
  const orden = leerOpcion(url, "orden", Object.keys(ORDENES) as Array<keyof typeof ORDENES>);

  const fallo = primerFallo(pagina, porPagina, minScore, minMargen, minPrecio, maxPrecio, categoria, saturacion, orden);
  if (fallo) return errorApi(400, "PARAMETRO_INVALIDO", fallo);
  if (!pagina.ok || !porPagina.ok) return errorApi(400, "PARAMETRO_INVALIDO", "Paginación no válida.");

  const busqueda = leerTexto(url, "busqueda", 120);
  const nicho = leerTexto(url, "nicho", 80);
  const dorados = ["1", "true", "si", "sí"].includes((url.searchParams.get("dorados") ?? "").toLowerCase());
  const verificados = ["1", "true", "si", "sí"].includes((url.searchParams.get("verificados") ?? "").toLowerCase());

  const resultado = await listProducts({
    page: pagina.valor ?? 1,
    pageSize: porPagina.valor ?? 12,
    search: busqueda,
    category: categoria.ok ? categoria.valor : undefined,
    niche: nicho,
    saturation: saturacion.ok ? saturacion.valor : undefined,
    minScore: minScore.ok ? minScore.valor : undefined,
    minMargin: minMargen.ok ? minMargen.valor : undefined,
    minPrice: minPrecio.ok ? minPrecio.valor : undefined,
    maxPrice: maxPrecio.ok ? maxPrecio.valor : undefined,
    goldenOnly: dorados || undefined,
    verificadosOnly: verificados || undefined,
    sort: orden.ok && orden.valor ? ORDENES[orden.valor] : "best-score",
  });

  const enlaces: Record<string, string> = {};
  if (resultado.page > 1) {
    const anterior = new URL(url);
    anterior.searchParams.set("pagina", String(resultado.page - 1));
    enlaces.anterior = `${anterior.pathname}${anterior.search}`;
  }
  if (resultado.page < resultado.totalPages) {
    const siguiente = new URL(url);
    siguiente.searchParams.set("pagina", String(resultado.page + 1));
    enlaces.siguiente = `${siguiente.pathname}${siguiente.search}`;
  }

  return respuestaApi(
    resultado.items,
    {
      total: resultado.total,
      pagina: resultado.page,
      porPagina: resultado.pageSize,
      paginas: resultado.totalPages,
      orden: orden.ok && orden.valor ? orden.valor : "score",
      filtros: {
        busqueda: busqueda ?? null,
        categoria: categoria.ok ? (categoria.valor ?? null) : null,
        nicho: nicho ?? null,
        saturacion: saturacion.ok ? (saturacion.valor ?? null) : null,
        minScore: minScore.ok ? (minScore.valor ?? null) : null,
        dorados,
        verificados,
      },
      enlaces,
      procedencia:
        "Cada producto expone las métricas agregadas y su tendencia. La procedencia por métrica (fuente, fecha de medición y tipo de dato) está en /api/v1/productos/{id}.",
      clave: auth.contexto.clave.prefijo,
    },
    200,
    auth.contexto.cabeceras,
  );
}
