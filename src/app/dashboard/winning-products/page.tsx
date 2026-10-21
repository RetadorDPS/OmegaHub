import Link from "next/link";
import { Flame, LayoutGrid, PackageSearch, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { getNiches, getSavedProductIds, listProducts } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { ProductCard } from "@/components/domain/product-card";
import { ProductFiltersPanel } from "@/components/domain/product-filters";
import { ProductSortSelect } from "@/components/domain/product-sort";
import { RadarTendencias } from "@/components/domain/radar-tendencias";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buildQueryString } from "@/lib/utils";
import type { ProductFilters, ProductSortOption, SaturationLevel } from "@/types";

export const metadata = {
  title: "Winning Products",
  description:
    "Catálogo de productos ganadores con TrendScore, margen estimado y nivel de saturación. Filtra por categoría, precio, saturación y score.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Convierte los parámetros de la URL en filtros tipados. */
function leerFiltros(params: Record<string, string | string[] | undefined>): ProductFilters {
  const valor = (clave: string): string | undefined => {
    const dato = params[clave];
    return Array.isArray(dato) ? dato[0] : dato;
  };
  const numero = (clave: string): number | undefined => {
    const dato = valor(clave);
    if (dato === undefined || dato === "") return undefined;
    const parseado = Number(dato);
    return Number.isFinite(parseado) ? parseado : undefined;
  };

  return {
    search: valor("search"),
    category: valor("category"),
    niche: valor("niche"),
    saturation: (valor("saturation") as SaturationLevel | "ALL") ?? "ALL",
    minScore: numero("minScore"),
    minMargin: numero("minMargin"),
    minPrice: numero("minPrice"),
    maxPrice: numero("maxPrice"),
    goldenOnly: valor("goldenOnly") === "true",
    verificadosOnly: valor("verificadosOnly") === "true",
    sort: (valor("sort") as ProductSortOption) ?? "best-score",
    page: numero("page") ?? 1,
    pageSize: 12,
  };
}

export default async function WinningProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filtros = leerFiltros(params);
  const sesion = await auth();

  const [resultado, nichos, guardados] = await Promise.all([
    listProducts(filtros),
    getNiches(),
    sesion?.user?.id ? getSavedProductIds(sesion.user.id) : Promise.resolve([]),
  ]);

  const filtrosActivos = [
    filtros.category && filtros.category !== "ALL",
    filtros.niche && filtros.niche !== "ALL",
    filtros.saturation && filtros.saturation !== "ALL",
    filtros.minScore !== undefined,
    filtros.minMargin !== undefined,
    filtros.minPrice !== undefined,
    filtros.maxPrice !== undefined,
    filtros.goldenOnly,
    filtros.verificadosOnly,
    Boolean(filtros.search),
  ].filter(Boolean).length;

  /** Construye la URL de una página manteniendo el resto de filtros. */
  const urlPagina = (pagina: number) =>
    `/dashboard/winning-products${buildQueryString({ ...filtros, page: pagina })}`;

  return (
    <>
      <PageHeading
        title="Winning Products"
        description="Productos con su procedencia a la vista: Google Trends, TikTok, Meta Ad Library y el radar de tiendas Shopify. El TrendScore resume demanda, velocidad y competencia; el sello indica si está verificado o estimado."
        actions={
          <>
            <Button asChild variant={filtros.goldenOnly ? "default" : "outline"} size="sm">
              <Link href={filtros.goldenOnly ? "/dashboard/winning-products" : "/dashboard/winning-products?goldenOnly=true"}>
                <Sparkles />
                {filtros.goldenOnly ? "Viendo doradas" : "Solo doradas"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/winning-products?sort=fastest-rising">
                <Flame />
                En despegue
              </Link>
            </Button>
          </>
        }
      />

      {/* Radar de tendencias: ocupa el ancho completo antes de los filtros. */}
      <div className="mb-6">
        <RadarTendencias />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Panel de filtros */}
        <ProductFiltersPanel nichos={nichos} filtros={filtros} filtrosActivos={filtrosActivos} />

        {/* Resultados */}
        <div className="min-w-0 space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <LayoutGrid className="size-4 text-indigo-400" />
              <span className="font-medium tabular-nums">{resultado.total}</span>
              <span className="text-muted-foreground">
                {resultado.total === 1 ? "producto encontrado" : "productos encontrados"}
              </span>
              {filtrosActivos > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {filtrosActivos} {filtrosActivos === 1 ? "filtro" : "filtros"} activos
                </Badge>
              )}
            </div>
            <ProductSortSelect valor={filtros.sort ?? "best-score"} />
          </Card>

          {resultado.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Sin resultados con estos filtros"
              description="Prueba a relajar la saturación, bajar el score mínimo o ampliar el rango de precios."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/winning-products">Limpiar filtros</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {resultado.items.map((producto, indice) => (
                  <ProductCard
                    key={producto.id}
                    product={producto}
                    saved={guardados.includes(producto.id)}
                    index={indice}
                  />
                ))}
              </div>

              {/* Paginación */}
              {resultado.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button asChild variant="outline" size="sm" disabled={resultado.page <= 1}>
                    <Link
                      href={urlPagina(Math.max(1, resultado.page - 1))}
                      aria-disabled={resultado.page <= 1}
                      className={resultado.page <= 1 ? "pointer-events-none opacity-50" : ""}
                    >
                      Anterior
                    </Link>
                  </Button>
                  <span className="px-3 text-sm text-muted-foreground tabular-nums">
                    Página {resultado.page} de {resultado.totalPages}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={urlPagina(Math.min(resultado.totalPages, resultado.page + 1))}
                      aria-disabled={resultado.page >= resultado.totalPages}
                      className={resultado.page >= resultado.totalPages ? "pointer-events-none opacity-50" : ""}
                    >
                      Siguiente
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
