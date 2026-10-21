import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { assertQuota } from "@/lib/planLimits";
import { DocumentoTienda } from "@/lib/reportes";
import { renderToBuffer } from "@react-pdf/renderer";
import type { StoreDTO } from "@/types";

/**
 * Informe PDF de una tienda.
 *
 *   POST /api/tiendas/:id/informe
 *
 * Consume una cuota de EXPORT del plan.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { planType: true },
  });
  const plan = usuario?.planType ?? "FREE";

  try {
    await assertQuota(sesion.user.id, plan, "EXPORT", 1);
  } catch {
    return new Response(
      JSON.stringify({
        error: `Tu plan ${plan} no incluye exportaciones de informes. Mejora tu plan para generar PDFs.`,
        code: "QUOTA_EXCEEDED",
        plan,
      }),
      { status: 402, headers: { "content-type": "application/json" } },
    );
  }

  const { id } = await params;
  const tienda = await prisma.store.findUnique({ where: { id } });
  if (!tienda) {
    return new Response(JSON.stringify({ error: "Tienda no encontrada" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const dto: StoreDTO = {
    id: tienda.id,
    shopifyUrl: tienda.shopifyUrl,
    name: tienda.name,
    domain: tienda.domain,
    niche: tienda.niche,
    country: tienda.country,
    shopifyDetected: tienda.shopifyDetected,
    themeName: tienda.themeName,
    estimatedMonthlyRevenue: tienda.estimatedMonthlyRevenue,
    estimatedTraffic: tienda.estimatedTraffic,
    monthlyVisits: tienda.monthlyVisits,
    avgOrderValue: tienda.avgOrderValue,
    conversionRate: tienda.conversionRate,
    productsCount: tienda.productsCount,
    categories: (tienda.categories as unknown as string[]) ?? [],
    appsDetected: (tienda.appsDetected as unknown as string[]) ?? [],
    growthRate: tienda.growthRate,
    lastScannedAt: tienda.lastScannedAt?.toISOString() ?? null,
    topProducts: (tienda.topProducts as unknown as StoreDTO["topProducts"]) ?? [],
  };

  const pdf = await renderToBuffer(
    <DocumentoTienda tienda={dto} plan={plan} />,
  );

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="informe-tienda-${tienda.domain}.pdf"`,
    },
  });
}
