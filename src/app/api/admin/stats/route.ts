import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { PLANS } from "@/lib/constants";

/** Panel de administración: métricas globales de la plataforma. */
export async function GET() {
  const { respuesta } = await requireAdmin();
  if (respuesta) return respuesta;

  const [
    usuariosTotales,
    usuariosPorPlan,
    productosActivos,
    productosDorados,
    anunciosTotales,
    tiendasTotales,
    analisisTotales,
    analisisFallidos,
    generacionesIa,
    suscripcionesActivas,
    ultimosUsuarios,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["planType"], _count: { _all: true } }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { isGoldenOpportunity: true } }),
    prisma.ad.count(),
    prisma.store.count(),
    prisma.storeScan.count(),
    prisma.storeScan.count({ where: { status: "FAILED" } }),
    prisma.aiGeneration.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, email: true, role: true, planType: true, createdAt: true, planRenewsAt: true },
    }),
  ]);

  // MRR estimado: usuarios de pago por el precio de su plan.
  const porPlan: Record<string, number> = {};
  for (const fila of usuariosPorPlan) porPlan[fila.planType] = fila._count._all;
  const precioDe = (plan: "PRO" | "BUSINESS") => PLANS.find((definicion) => definicion.id === plan)?.price ?? 0;
  const mrrEstimado = (porPlan.PRO ?? 0) * precioDe("PRO") + (porPlan.BUSINESS ?? 0) * precioDe("BUSINESS");

  return NextResponse.json({
    kpis: {
      usuariosTotales,
      usuariosPro: porPlan.PRO ?? 0,
      usuariosBusiness: porPlan.BUSINESS ?? 0,
      usuariosFree: porPlan.FREE ?? 0,
      productosActivos,
      productosDorados,
      anunciosTotales,
      tiendasTotales,
      analisisTotales,
      analisisFallidos,
      generacionesIa,
      suscripcionesActivas,
      mrrEstimado,
      arrEstimado: mrrEstimado * 12,
    },
    porPlan,
    ultimosUsuarios: ultimosUsuarios.map((usuario) => ({
      ...usuario,
      createdAt: usuario.createdAt.toISOString(),
      planRenewsAt: usuario.planRenewsAt?.toISOString() ?? null,
    })),
  });
}
