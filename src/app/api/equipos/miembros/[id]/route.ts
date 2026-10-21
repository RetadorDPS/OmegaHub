import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Gestión de una plaza del equipo.
 *
 *   PATCH  /api/equipos/miembros/:id   { role }  → cambia el rol
 *   DELETE /api/equipos/miembros/:id            → revoca la plaza
 *
 * Solo el propietario (y los ADMIN, salvo para tocar al propietario) pueden
 * hacerlo. El propietario no se puede quitar ni degradar: dejaría el equipo
 * sin dueño y sin plan.
 */

const esquema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

/** Comprueba que quien pide el cambio manda en ese equipo. */
async function permiso(userId: string, miembroId: string) {
  const miembro = await prisma.teamMember.findUnique({
    where: { id: miembroId },
    include: { team: { include: { members: true } } },
  });
  if (!miembro) return { error: "La plaza no existe.", status: 404 as const, miembro: null, yo: null };

  const yo = miembro.team.members.find((otro) => otro.userId === userId && otro.status === "ACTIVE");
  if (!yo) return { error: "No perteneces a este equipo.", status: 403 as const, miembro, yo: null };
  if (yo.role !== "OWNER" && yo.role !== "ADMIN") {
    return { error: "Solo el propietario o un administrador pueden cambiar el equipo.", status: 403 as const, miembro, yo };
  }
  if (miembro.role === "OWNER") {
    return { error: "El propietario no se puede modificar ni quitar.", status: 400 as const, miembro, yo };
  }
  if (miembro.userId === userId) {
    return { error: "No puedes cambiar tu propia plaza. Pide a otro administrador que lo haga.", status: 400 as const, miembro, yo };
  }
  return { error: null, status: 200 as const, miembro, yo };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { id } = await params;
  const datos = esquema.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) return NextResponse.json({ error: "Rol no válido." }, { status: 400 });

  const revision = await permiso(sesion.user.id, id);
  if (revision.error) return NextResponse.json({ error: revision.error }, { status: revision.status });
  // Un ADMIN no puede nombrar a otro ADMIN (evita escalada de privilegios).
  if (revision.yo?.role === "ADMIN" && datos.data.role === "ADMIN") {
    return NextResponse.json({ error: "Solo el propietario puede nombrar administradores." }, { status: 403 });
  }

  const actualizado = await prisma.teamMember.update({
    where: { id },
    data: { role: datos.data.role },
    select: { id: true, email: true, role: true, status: true },
  });

  logger.info("equipo_rol_cambiado", { miembro: id, rol: datos.data.role, por: sesion.user.email });
  return NextResponse.json({ miembro: actualizado });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { id } = await params;
  const revision = await permiso(sesion.user.id, id);
  if (revision.error) return NextResponse.json({ error: revision.error }, { status: revision.status });
  if (revision.yo?.role === "ADMIN" && revision.miembro?.role === "ADMIN") {
    return NextResponse.json({ error: "Un administrador no puede quitar a otro administrador." }, { status: 403 });
  }

  // Se borra la plaza (no el usuario): así puede volver a ser invitado.
  await prisma.teamMember.delete({ where: { id } });
  logger.info("equipo_plaza_revocada", { miembro: id, por: sesion.user.email });

  return NextResponse.json({ ok: true });
}
