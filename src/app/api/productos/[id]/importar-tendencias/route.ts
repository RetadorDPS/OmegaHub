import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { importarTexto } from "@/lib/providers/importacion";
import { calculateTrendScore } from "@/lib/trendEngine";

/**
 * Importación de tendencias (CSV/JSON) a un producto.
 *
 *   POST /api/productos/:id/importar-tendencias
 *   body: { formato: "csv" | "json", contenido: "..." }
 *
 * Cada punto importado se guarda con procedencia:
 * fuente "importado-manual", tipoDato IMPORTADO.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const producto = await prisma.product.findFirst({
    where: { id, userId: sesion.user.id },
    select: { id: true },
  });
  if (!producto) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as {
    formato?: string;
    contenido?: string;
  };
  if (!cuerpo.contenido) {
    return NextResponse.json({ error: "Falta el contenido (contenido)." }, { status: 400 });
  }

  const formato = cuerpo.formato === "json" ? "json" : "csv";
  const { puntos, error } = importarTexto(cuerpo.contenido, formato);
  if (error || puntos.length === 0) {
    return NextResponse.json({ error: error ?? "Sin datos válidos." }, { status: 400 });
  }

  // Persistencia con procedencia explícita.
  const creados = [];
  for (const punto of puntos) {
    const fecha = new Date(punto.date);
    if (Number.isNaN(fecha.getTime())) continue;

    const metrica = await prisma.trendMetric.create({
      data: {
        productId: producto.id,
        date: fecha,
        googleSearchVolume: punto.googleSearchVolume ?? 0,
        tiktokViews: punto.tiktokViews ?? 0,
        youtubeViews: punto.youtubeViews ?? 0,
        metaAdsCount: punto.metaAdsCount ?? 0,
        shopifyStoresUsing: punto.shopifyStoresUsing ?? 0,
        calculatedScore: 0,
        fuente: "importado-manual",
        fechaMedicion: fecha,
        tipoDato: "IMPORTADO",
      },
    });

    const score = calculateTrendScore({
      googleSearchVolume: metrica.googleSearchVolume,
      tiktokViews: metrica.tiktokViews,
      youtubeViews: metrica.youtubeViews,
      metaAdsCount: metrica.metaAdsCount,
      shopifyStoresUsing: metrica.shopifyStoresUsing,
    });
    await prisma.trendMetric.update({
      where: { id: metrica.id },
      data: { calculatedScore: score },
    });
    creados.push({ date: metrica.date, calculatedScore: score });
  }

  // Recalcular el score actual del producto con el último punto.
  const ultimo = creados[creados.length - 1];
  if (ultimo) {
    await prisma.product.update({
      where: { id: producto.id },
      data: { trendScore: ultimo.calculatedScore },
    });
  }

  return NextResponse.json({
    ok: true,
    importados: creados.length,
    puntos: creados,
    procedencia: { fuente: "importado-manual", tipoDato: "IMPORTADO" },
  });
}
