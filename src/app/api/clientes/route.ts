import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * ============================================================================
 *  API de clientes (modo agencia, plan BUSINESS+)
 * ============================================================================
 *  GET  /api/clientes          → lista con conteos de seguimiento
 *  POST /api/clientes          → crear cliente
 * ============================================================================
 */

/** ¿El plan permite el modo agencia? */
function esAgencia(plan: string | null | undefined): boolean {
  return plan === "BUSINESS" || plan === "AGENCY" || false;
}

export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!esAgencia(sesion.user.planType)) {
    return NextResponse.json(
      { error: "El modo agencia requiere plan Business o superior." },
      { status: 403 },
    );
  }

  const clientes = await prisma.cliente.findMany({
    where: { ownerId: sesion.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      followedStores: { select: { id: true } },
      followedProducts: { select: { id: true } },
    },
  });

  return NextResponse.json({
    items: clientes.map((cliente) => ({
      id: cliente.id,
      nombre: cliente.nombre,
      dominio: cliente.dominio,
      notas: cliente.notas,
      createdAt: cliente.createdAt.toISOString(),
      productosSeguidos: cliente.followedProducts.length,
      tiendasSeguidas: cliente.followedStores.length,
    })),
  });
}

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!esAgencia(sesion.user.planType)) {
    return NextResponse.json(
      { error: "El modo agencia requiere plan Business o superior." },
      { status: 403 },
    );
  }

  const cuerpo = (await request.json().catch(() => ({}))) as {
    nombre?: string;
    dominio?: string;
    notas?: string;
  };
  if (!cuerpo.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre del cliente es obligatorio." }, { status: 400 });
  }

  const cliente = await prisma.cliente.create({
    data: {
      ownerId: sesion.user.id,
      nombre: cuerpo.nombre.trim(),
      dominio: cuerpo.dominio?.trim() || null,
      notas: cuerpo.notas?.trim() || null,
    },
  });

  return NextResponse.json(
    { ok: true, id: cliente.id, nombre: cliente.nombre },
    { status: 201 },
  );
}
