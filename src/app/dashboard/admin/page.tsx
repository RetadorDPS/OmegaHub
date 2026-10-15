import { notFound } from "next/navigation";
import { AlertTriangle, Building2, Megaphone, Package, Users } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { AdminPanel, type AdminProduct, type AdminScan, type AdminUser } from "@/components/domain/admin-panel";
import { Card, CardContent } from "@/components/ui/card";
import { PLANS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

export const metadata = {
  title: "Panel de administración",
  description: "Gestión de usuarios, catálogo y scrapings de la plataforma.",
};

/**
 * Imágenes ya presentes en el catálogo, ofrecidas como atajo al dar de alta un
 * producto nuevo. Se obtienen de la base de datos (no del sistema de archivos)
 * para que el trazado del build no recorra el proyecto entero.
 */
async function listarImagenes(): Promise<string[]> {
  const productos = await prisma.product.findMany({
    select: { mainImage: true },
    distinct: ["mainImage"],
    take: 24,
    orderBy: { updatedAt: "desc" },
  });
  return productos.map((producto) => producto.mainImage).filter(Boolean);
}

/** Módulo 11 · Panel de administración (solo rol ADMIN). */
export default async function AdminPage() {
  const sesion = await auth();
  // El proxy() ya bloquea /dashboard/admin, pero se vuelve a comprobar aquí
  // (defensa en profundidad: nunca confiar solo en el middleware).
  if (sesion?.user?.role !== "ADMIN") notFound();

  const [
    usuarios,
    productos,
    analisis,
    imagenes,
    totalAnuncios,
    totalTiendas,
    totalProductos,
    productosDorados,
    usuariosPorPlan,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        planType: true,
        emailVerified: true,
        planRenewsAt: true,
        planCancelAtPeriodEnd: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { savedProducts: true, aiGenerations: true, scanJobs: true, trackedStores: true } },
      },
    }),
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        category: true,
        nicheTag: true,
        trendScore: true,
        estimatedMargin: true,
        saturationLevel: true,
        isGoldenOpportunity: true,
        status: true,
        source: true,
        updatedAt: true,
      },
    }),
    prisma.storeScan.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        user: { select: { email: true } },
        store: { select: { id: true, name: true, domain: true, estimatedMonthlyRevenue: true, shopifyDetected: true } },
      },
    }),
    listarImagenes(),
    prisma.ad.count(),
    prisma.store.count(),
    prisma.product.count(),
    prisma.product.count({ where: { isGoldenOpportunity: true } }),
    prisma.user.groupBy({ by: ["planType"], _count: { _all: true } }),
  ]);

  const usuariosPanel: AdminUser[] = usuarios.map((usuario) => ({
    id: usuario.id,
    nombre: usuario.name ?? "Sin nombre",
    email: usuario.email,
    rol: usuario.role,
    plan: usuario.planType,
    emailVerificado: Boolean(usuario.emailVerified),
    renuevaEn: usuario.planRenewsAt?.toISOString() ?? null,
    cancelacionProgramada: usuario.planCancelAtPeriodEnd,
    ultimoAcceso: usuario.lastLoginAt?.toISOString() ?? null,
    alta: usuario.createdAt.toISOString(),
    guardados: usuario._count.savedProducts,
    generacionesIa: usuario._count.aiGenerations,
    analisis: usuario._count.scanJobs,
    tiendasSeguidas: usuario._count.trackedStores,
  }));

  const productosPanel: AdminProduct[] = productos.map((producto) => ({
    id: producto.id,
    title: producto.title,
    category: producto.category,
    nicheTag: producto.nicheTag,
    trendScore: producto.trendScore,
    estimatedMargin: producto.estimatedMargin,
    saturationLevel: producto.saturationLevel,
    isGoldenOpportunity: producto.isGoldenOpportunity,
    status: producto.status,
    source: producto.source,
    updatedAt: producto.updatedAt.toISOString(),
  }));

  const analisisPanel: AdminScan[] = analisis.map((fila) => ({
    id: fila.id,
    url: fila.normalizedUrl,
    estado: fila.status,
    motor: fila.engine,
    progreso: fila.progress,
    duracionMs: fila.durationMs,
    error: fila.errorMessage,
    creadoEn: fila.createdAt.toISOString(),
    finalizadoEn: fila.finishedAt?.toISOString() ?? null,
    usuario: fila.user.email,
    tienda: fila.store
      ? {
          id: fila.store.id,
          nombre: fila.store.name,
          dominio: fila.store.domain,
          ingresos: fila.store.estimatedMonthlyRevenue,
          shopify: fila.store.shopifyDetected,
        }
      : null,
  }));

  const porPlan = Object.fromEntries(usuariosPorPlan.map((fila) => [fila.planType, fila._count._all]));
  const mrr =
    (porPlan.PRO ?? 0) * (PLANS.find((plan) => plan.id === "PRO")?.price ?? 0) +
    (porPlan.BUSINESS ?? 0) * (PLANS.find((plan) => plan.id === "BUSINESS")?.price ?? 0);

  return (
    <>
      <PageHeading
        title="Panel de administración"
        description="Gestión completa de la plataforma: usuarios y planes, catálogo de productos y cola de scrapings."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Usuarios registrados"
          value={usuarios.length}
          icon={Users}
          hint={`${porPlan.PRO ?? 0} Pro · ${porPlan.BUSINESS ?? 0} Business`}
        />
        <StatCard
          label="MRR estimado"
          value={formatCurrency(mrr)}
          icon={Package}
          accent="emerald"
          hint={`${formatCurrency(mrr * 12)} anuales`}
        />
        <StatCard
          label="Catálogo"
          value={`${totalProductos}`}
          icon={Megaphone}
          accent="violet"
          hint={`${productosDorados} oportunidades doradas · ${totalAnuncios} anuncios`}
        />
        <StatCard
          label="Tiendas y scrapings"
          value={`${totalTiendas}`}
          icon={Building2}
          accent="amber"
          hint={`${analisis.filter((fila) => fila.status === "FAILED").length} análisis con error`}
        />
      </div>

      {analisis.some((fila) => fila.status === "FAILED") && (
        <Card className="mb-6 border-amber-500/25 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Hay análisis descartados o fallidos</p>
              <p className="text-amber-300/80">
                Revísalos en la pestaña «Scrapings» para reintentarlos o publicar sus productos manualmente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <AdminPanel
        usuarios={usuariosPanel}
        productos={productosPanel}
        analisis={analisisPanel}
        imagenes={imagenes}
      />
    </>
  );
}
