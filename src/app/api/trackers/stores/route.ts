import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { listTrackedStores, listTrackedStoresTimeline } from "@/lib/dal";
import { PLAN_LIMITS } from "@/lib/constants";

/** Tiendas seguidas y su timeline agregado. */
export async function GET(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const conTimeline = new URL(request.url).searchParams.get("timeline") === "true";
  if (conTimeline) return NextResponse.json({ items: await listTrackedStoresTimeline(sesion.user.id, 40) });
  return NextResponse.json({ items: await listTrackedStores(sesion.user.id) });
}

/** Empieza a rastrear una tienda (con límite por plan). */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { storeId, clienteId } = (await request.json()) as {
    storeId?: string;
    clienteId?: string;
  };
  if (!storeId) return NextResponse.json({ error: "Falta la tienda" }, { status: 400 });

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
  const total = await prisma.trackedStore.count({ where: { userId: sesion.user.id } });
  if (limite !== null && total >= limite) {
    return NextResponse.json(
      { error: `Tu plan ${usuario?.planType} permite rastrear ${limite} tiendas. Mejora a Pro para seguir hasta 50.`, code: "PLAN_LIMIT" },
      { status: 402 },
    );
  }

  const seguimiento = await prisma.trackedStore.upsert({
    where: { userId_storeId: { userId: sesion.user.id, storeId } },
    update: {
      notificationEnabled: true,
      ...(clienteValidado ? { clienteId: clienteValidado } : {}),
    },
    create: {
      userId: sesion.user.id,
      storeId,
      ...(clienteValidado ? { clienteId: clienteValidado } : {}), },
  });
  return NextResponse.json({ ok: true, id: seguimiento.id });
}

/** Deja de rastrear una tienda. */
export async function DELETE(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { storeId } = (await request.json()) as { storeId?: string };
  if (!storeId) return NextResponse.json({ error: "Falta la tienda" }, { status: 400 });
  await prisma.trackedStore.deleteMany({ where: { userId: sesion.user.id, storeId } });
  return NextResponse.json({ ok: true });
}
