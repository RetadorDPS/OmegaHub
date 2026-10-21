import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * Cliente individual (modo agencia).
 *
 *   PATCH /api/clientes/:id   → actualizar
 *   DELETE /api/clientes/:id  → eliminar
 */

function esAgencia(plan: string | null | undefined): boolean {
  return plan === "BUSINESS" || plan === "AGENCY" || false;
}

async function clienteDelUsuario(usuarioId: string, id: string) {
  return prisma.cliente.findFirst({ where: { id, ownerId: usuarioId } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const cliente = await clienteDelUsuario(sesion.user.id, id);
  if (!cliente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as {
    nombre?: string;
    dominio?: string;
    notas?: string;
  };

  const actualizado = await prisma.cliente.update({
    where: { id: cliente.id },
    data: {
      ...(cuerpo.nombre?.trim() ? { nombre: cuerpo.nombre.trim() } : {}),
      ...(cuerpo.dominio !== undefined ? { dominio: cuerpo.dominio.trim() || null } : {}),
      ...(cuerpo.notas !== undefined ? { notas: cuerpo.notas.trim() || null } : {}),
    },
  });

  return NextResponse.json({ ok: true, id: actualizado.id, nombre: actualizado.nombre });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const cliente = await clienteDelUsuario(sesion.user.id, id);
  if (!cliente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  await prisma.cliente.delete({ where: { id: cliente.id } });
  return NextResponse.json({ ok: true });
}
