import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { assertQuota } from "@/lib/planLimits";
import { toTrendMetricDTO, toProductDTO } from "@/lib/dal";
import { DocumentoProducto } from "@/lib/reportes";
import { renderToBuffer } from "@react-pdf/renderer";

/**
 * Informe PDF de un producto.
 *
 *   POST /api/productos/:id/informe
 *
 * Consume una cuota de EXPORT del plan
 * (FREE: 0/día → 402 con mensaje claro).
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

  // Cuota de exportación (consume una del plan).
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
  const producto = await prisma.product.findFirst({
    where: { id },
    include: { metrics: { orderBy: { date: "desc" }, take: 30 } },
  });
  if (!producto) {
    return new Response(JSON.stringify({ error: "Producto no encontrado" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const dto = toProductDTO(producto);
  const metricas = producto.metrics.map(toTrendMetricDTO);
  const pdf = await renderToBuffer(
    <DocumentoProducto producto={dto} metricas={metricas} plan={plan} />,
  );

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="informe-${producto.slug}.pdf"`,
    },
  });
}
