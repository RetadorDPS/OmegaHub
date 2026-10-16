import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listProducts } from "@/lib/dal";
import { checkAndConsume } from "@/lib/planLimits";
import type { SaturationLevel } from "@/types";

/**
 * Exporta el catálogo filtrado a CSV (función reservada a planes de pago).
 * El límite diario de exportaciones depende del plan (ver PLAN_LIMITS).
 */
export async function GET(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    await checkAndConsume(sesion.user.id, sesion.user.planType, "EXPORT", { formato: "csv" });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message, code: "QUOTA_EXCEEDED" }, { status: 402 });
  }

  const params = new URL(request.url).searchParams;
  const { items } = await listProducts({
    category: params.get("category") ?? undefined,
    niche: params.get("niche") ?? undefined,
    saturation: (params.get("saturation") as SaturationLevel | "ALL" | null) ?? "ALL",
    minScore: params.get("minScore") ? Number(params.get("minScore")) : undefined,
    goldenOnly: params.get("goldenOnly") === "true",
    page: 1,
    pageSize: 48,
  });

  const cabeceras = [
    "id", "titulo", "categoria", "nicho", "trend_score", "velocidad", "saturacion",
    "coste", "precio_venta", "margen_pct", "beneficio_unidad",
    "busquedas_google", "views_tiktok", "anuncios_meta", "tiendas",
    "facturacion_mensual", "unidades_mes", "aliexpress", "actualizado",
  ];

  /** Escape CSV: comillas dobles duplicadas y campos entrecomillados. */
  const escapar = (valor: unknown): string => `"${String(valor ?? "").replace(/"/g, '""')}"`;

  const filas = items.map((producto) =>
    [
      producto.id,
      producto.title,
      producto.category,
      producto.nicheTag,
      producto.trendScore,
      Math.round(producto.velocityScore),
      producto.saturationLevel,
      producto.costPrice,
      producto.suggestedSellPrice,
      producto.estimatedMargin,
      (producto.suggestedSellPrice - producto.costPrice).toFixed(2),
      producto.googleSearchVolume,
      producto.tiktokViews,
      producto.metaAdsCount,
      producto.storesUsing,
      producto.estimatedMonthlyRevenue,
      producto.estimatedUnitsSold,
      producto.aliExpressUrl ?? "",
      producto.updatedAt,
    ]
      .map(escapar)
      .join(","),
  );

  // BOM inicial para que Excel respete los acentos.
  const csv = `\uFEFF${cabeceras.join(",")}\n${filas.join("\n")}`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="trendhunter-productos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
