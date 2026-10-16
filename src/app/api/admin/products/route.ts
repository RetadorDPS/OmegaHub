import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { toJsonInput } from "@/lib/json";
import {
  calculateMarginPercent,
  calculateTrendScoreDetailed,
  calculateVelocityScore,
  detectGoldenOpportunity,
  determineSaturationLevel,
  generateMetricSeries,
} from "@/lib/trendEngine";

/** Alta manual de productos en el catálogo (solo administradores). */
const esquema = z.object({
  title: z.string().min(6, "El título debe tener al menos 6 caracteres"),
  description: z.string().min(20, "Añade una descripción de al menos 20 caracteres"),
  mainImage: z.string().min(1, "Indica la imagen principal"),
  images: z.array(z.string()).optional(),
  category: z.string().min(2),
  nicheTag: z.string().min(2),
  costPrice: z.coerce.number().positive("El coste debe ser mayor que 0"),
  suggestedSellPrice: z.coerce.number().positive("El precio de venta debe ser mayor que 0"),
  aliExpressUrl: z.string().optional(),
  amazonUrl: z.string().optional(),
  cjUrl: z.string().optional(),
  supplierName: z.string().optional(),
  googleSearchVolume: z.coerce.number().int().min(0).default(0),
  tiktokViews: z.coerce.number().int().min(0).default(0),
  metaAdsCount: z.coerce.number().int().min(0).default(0),
  storesUsing: z.coerce.number().int().min(0).default(0),
  countryAvailability: z.array(z.string()).default(["ES"]),
  tags: z.array(z.string()).default([]),
  status: z.enum(["ACTIVE", "PENDING", "ARCHIVED"]).default("ACTIVE"),
});

export async function POST(request: Request) {
  const { respuesta } = await requireAdmin();
  if (respuesta) return respuesta;

  const validacion = esquema.safeParse(await request.json().catch(() => null));
  if (!validacion.success) {
    return NextResponse.json({ error: validacion.error.issues[0]?.message ?? "Datos no válidos" }, { status: 400 });
  }

  const datos = validacion.data;
  if (datos.suggestedSellPrice <= datos.costPrice) {
    return NextResponse.json({ error: "El precio de venta debe ser mayor que el coste" }, { status: 400 });
  }

  // Scores calculados con el motor real de tendencias.
  const metricas = {
    googleSearchVolume: datos.googleSearchVolume,
    tiktokViews: datos.tiktokViews,
    metaAdsCount: datos.metaAdsCount,
    shopifyStoresUsing: datos.storesUsing,
  };
  const detalleScore = calculateTrendScoreDetailed(metricas);
  const serie = generateMetricSeries(metricas, 30, 11, 0.15);
  const velocidad = calculateVelocityScore(serie.map((punto) => punto.calculatedScore));
  const saturacion = determineSaturationLevel(datos.storesUsing, datos.googleSearchVolume);
  const margen = calculateMarginPercent(datos.costPrice, datos.suggestedSellPrice);

  const slugBase = datos.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  const producto = await prisma.product.create({
    data: {
      title: datos.title,
      slug: `${slugBase}-${Date.now().toString(36)}`,
      description: datos.description,
      mainImage: datos.mainImage,
      images: toJsonInput(datos.images?.length ? datos.images : [datos.mainImage]) as never,
      category: datos.category,
      nicheTag: datos.nicheTag,
      tags: toJsonInput(datos.tags) as never,
      costPrice: datos.costPrice,
      suggestedSellPrice: datos.suggestedSellPrice,
      estimatedMargin: Number(margen.toFixed(1)),
      aliExpressUrl: datos.aliExpressUrl || null,
      amazonUrl: datos.amazonUrl || null,
      cjUrl: datos.cjUrl || null,
      supplierName: datos.supplierName || null,
      trendScore: detalleScore.score,
      velocityScore: velocidad,
      saturationLevel: saturacion,
      trendDirection: velocidad >= 55 ? "RISING" : velocidad <= 25 ? "FALLING" : "STABLE",
      isGoldenOpportunity: detectGoldenOpportunity({
        trendScore: detalleScore.score,
        saturationLevel: saturacion,
        velocityScore: velocidad,
      }),
      googleSearchVolume: datos.googleSearchVolume,
      tiktokViews: datos.tiktokViews,
      metaAdsCount: datos.metaAdsCount,
      storesUsing: datos.storesUsing,
      estimatedUnitsSold: Math.round(datos.googleSearchVolume * 0.08),
      estimatedMonthlyRevenue: Math.round(datos.googleSearchVolume * 0.08 * datos.suggestedSellPrice),
      status: datos.status,
      source: "admin",
      countryAvailability: toJsonInput(datos.countryAvailability) as never,
    },
  });

  // Notificación global: los productos nuevos aparecen en la campana de todos.
  const usuarios = await prisma.user.findMany({ select: { id: true }, take: 200 });
  await prisma.alertNotification.createMany({
    data: usuarios.map((usuario) => ({
      userId: usuario.id,
      type: "NEW_PRODUCT" as const,
      title: `Nuevo producto en el catálogo: ${producto.title}`,
      message: `TrendScore ${producto.trendScore}/100 · margen ${producto.estimatedMargin} % · nicho ${producto.nicheTag}.`,
      actionUrl: `/dashboard/winning-products/${producto.id}`,
    })),
  });

  return NextResponse.json(
    { ok: true, producto: { id: producto.id, slug: producto.slug, trendScore: producto.trendScore } },
    { status: 201 },
  );
}

/** Listado completo (incluye archivados y pendientes) para la tabla de administración. */
export async function GET(request: Request) {
  const { respuesta } = await requireAdmin();
  if (respuesta) return respuesta;

  const params = new URL(request.url).searchParams;
  const estado = params.get("status") ?? "TODOS";
  const busqueda = params.get("search")?.trim();

  const productos = await prisma.product.findMany({
    where: {
      ...(estado !== "TODOS" ? { status: estado as never } : {}),
      ...(busqueda ? { OR: [{ title: { contains: busqueda } }, { nicheTag: { contains: busqueda } }] } : {}),
    },
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
  });

  return NextResponse.json({
    items: productos.map((producto) => ({ ...producto, updatedAt: producto.updatedAt.toISOString() })),
    total: productos.length,
  });
}

/** Archiva o reactiva un producto. */
export async function PATCH(request: Request) {
  const { respuesta } = await requireAdmin();
  if (respuesta) return respuesta;

  const cuerpo = (await request.json().catch(() => null)) as { productId?: string; status?: string } | null;
  if (!cuerpo?.productId || !cuerpo.status) {
    return NextResponse.json({ error: "Faltan parámetros (productId y status)" }, { status: 400 });
  }

  const producto = await prisma.product.update({
    where: { id: cuerpo.productId },
    data: { status: cuerpo.status as never },
    select: { id: true, title: true, status: true },
  });

  return NextResponse.json({ ok: true, producto });
}
