import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { listTrackedProducts } from "@/lib/dal";
import { PLAN_LIMITS } from "@/lib/constants";

/** Productos en seguimiento del usuario. */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ items: await listTrackedProducts(sesion.user.id) });
}

/** Empieza a seguir un producto (con límite por plan). */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { productId, targetTrendScore, clienteId } = (await request.json()) as {
    productId?: string;
    targetTrendScore?: number;
    clienteId?: string;
  };
  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  const usuario = await prisma.user.findUnique({ where: { id: sesion.user.id }, select: { planType: true } });
  // Asignación opcional a un cliente del modo agencia.
  let clienteValidado: string | undefined;
  if (clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, ownerId: sesion.user.id },
      select: { id: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    clienteValidado = cliente.id;
  }
  const limite = PLAN_LIMITS[usuario?.planType ?? "FREE"].trackedItems;
  const total = await prisma.trackedProduct.count({ where: { userId: sesion.user.id } });
  if (limite !== null && total >= limite) {
    return NextResponse.json(
      { error: `Tu plan ${usuario?.planType} permite seguir ${limite} productos. Mejora tu plan para seguir más.`, code: "PLAN_LIMIT" },
      { status: 402 },
    );
  }

  const seguimiento = await prisma.trackedProduct.upsert({
    where: { userId_productId: { userId: sesion.user.id, productId } },
    update: {
      notificationEnabled: true,
      ...(clienteValidado ? { clienteId: clienteValidado } : {}),
    },
    create: {
      userId: sesion.user.id,
      productId,
      targetTrendScore: targetTrendScore ?? 80,
      ...(clienteValidado ? { clienteId: clienteValidado } : {}),
    },
  });
  return NextResponse.json({ ok: true, id: seguimiento.id });
}

/**
 * Actualiza la configuración del seguimiento: umbral de alerta por TrendScore
 * y activación/desactivación de notificaciones.
 */
export async function PATCH(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { productId, targetTrendScore, notificationEnabled } = (await request.json()) as {
    productId?: string;
    targetTrendScore?: number;
    notificationEnabled?: boolean;
  };
  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  const actualizado = await prisma.trackedProduct.updateMany({
    where: { userId: sesion.user.id, productId },
    data: {
      ...(typeof targetTrendScore === "number"
        ? { targetTrendScore: Math.min(Math.max(Math.round(targetTrendScore), 40), 100) }
        : {}),
      ...(typeof notificationEnabled === "boolean" ? { notificationEnabled } : {}),
    },
  });

  if (actualizado.count === 0) {
    return NextResponse.json({ error: "No sigues este producto" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** Deja de seguir un producto. */
export async function DELETE(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { productId } = (await request.json()) as { productId?: string };
  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
  await prisma.trackedProduct.deleteMany({ where: { userId: sesion.user.id, productId } });
  return NextResponse.json({ ok: true });
}
