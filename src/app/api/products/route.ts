import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listProducts } from "@/lib/dal";
import { checkAndConsume } from "@/lib/planLimits";
import type { ProductFilters, ProductSortOption, SaturationLevel } from "@/types";

/**
 * Catálogo de productos con filtros.
 * Consume cuota de plan (FREE: 10 productos al día).
 */
export async function GET(request: Request) {
  const sesion = await auth();
  const params = new URL(request.url).searchParams;

  const filtros: ProductFilters = {
    search: params.get("search") ?? undefined,
    category: params.get("category") ?? undefined,
    niche: params.get("niche") ?? undefined,
    saturation: (params.get("saturation") as SaturationLevel | "ALL" | null) ?? "ALL",
    minScore: params.get("minScore") ? Number(params.get("minScore")) : undefined,
    minMargin: params.get("minMargin") ? Number(params.get("minMargin")) : undefined,
    maxPrice: params.get("maxPrice") ? Number(params.get("maxPrice")) : undefined,
    goldenOnly: params.get("goldenOnly") === "true",
    sort: (params.get("sort") as ProductSortOption | null) ?? "best-score",
    page: params.get("page") ? Number(params.get("page")) : 1,
    pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : 12,
  };

  // El control de cuota sólo aplica a usuarios autenticados (la API es privada).
  if (sesion?.user?.id) {
    try {
      await checkAndConsume(sesion.user.id, sesion.user.planType, "PRODUCT_VIEW", { origen: "api" });
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message, code: "QUOTA_EXCEEDED" },
        { status: 402 },
      );
    }
  }

  const resultado = await listProducts(filtros);
  return NextResponse.json(resultado);
}
