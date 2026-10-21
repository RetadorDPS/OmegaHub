import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { asientosDelPlan } from "@/lib/equipos";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { enviarAWebhooks } from "@/lib/webhooks";

/**
 * Aceptar una invitación.
 *
 *   POST /api/equipos/invitaciones/aceptar  { token }
 *
 * Requisitos:
 *   · Sesión iniciada.
 *   · El correo de la sesión coincide con el de la invitación (si no, cualquiera
 *     con el enlace podría entrar a un equipo ajeno).
 *   · La plaza no está ocupada y la invitación no ha caducado.
 *
 * Al aceptar: la plaza pasa a ACTIVE, el token se invalida y el usuario hereda
 * el plan del equipo en su próxima actualización de sesión.
 */

const esquema = z.object({ token: z.string().min(16) });
const DIAS_CADUCIDAD = 14;

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id || !sesion.user.email) {
    return NextResponse.json({ error: "Inicia sesión o crea una cuenta para aceptar la invitación." }, { status: 401 });
  }

  const datos = esquema.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) return NextResponse.json({ error: "Invitación no válida." }, { status: 400 });

  const miembro = await prisma.teamMember.findUnique({
    where: { inviteToken: datos.data.token },
    include: { team: { include: { owner: { select: { planType: true, name: true } }, members: true } } },
  });

  if (!miembro) {
    return NextResponse.json({ error: "La invitación no existe o ya se ha usado." }, { status: 404 });
  }
  if (miembro.status === "ACTIVE" && miembro.userId === sesion.user.id) {
    return NextResponse.json({ ok: true, equipo: miembro.team.name, yaErasMiembro: true });
  }
  if (Date.now() - miembro.invitedAt.getTime() > DIAS_CADUCIDAD * 86_400_000) {
    return NextResponse.json({ error: "La invitación ha caducado. Pide una nueva." }, { status: 410 });
  }

  // El correo de la sesión tiene que ser el invitado.
  if (miembro.email !== sesion.user.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `Esta invitación es para ${miembro.email}. Entra con esa cuenta o pide que te inviten a la tuya.`,
      },
      { status: 403 },
    );
  }

  const plan = miembro.team.owner.planType;
  const activos = miembro.team.members.filter((otro) => otro.status === "ACTIVE").length;
  const asientos = asientosDelPlan(plan);
  if (activos >= asientos && miembro.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "El equipo ya tiene todas sus plazas ocupadas. Pide al propietario que amplíe el plan." },
      { status: 409 },
    );
  }

  await prisma.teamMember.update({
    where: { id: miembro.id },
    data: {
      userId: sesion.user.id,
      status: "ACTIVE",
      joinedAt: new Date(),
      lastActiveAt: new Date(),
      // Un solo uso: el enlace deja de servir.
      inviteToken: null,
    },
  });

  await createNotification({
    userId: miembro.team.ownerId,
    type: "SYSTEM",
    title: `${sesion.user.name ?? sesion.user.email} se ha unido a tu equipo`,
    message: `Ya tiene acceso al plan ${plan}. Puedes gestionar las plazas desde Equipo.`,
    entityType: "equipo",
    entityId: miembro.teamId,
    actionUrl: "/dashboard/equipos",
    metadata: { email: miembro.email },
  });

  // El evento «equipo» de los webhooks también se emite aquí: así el propietario
  // se entera en Slack sin tener que abrir el panel.
  await enviarAWebhooks(miembro.team.ownerId, "equipo", {
    titulo: `${sesion.user.name ?? miembro.email} se ha unido a ${miembro.team.name}`,
    mensaje: "La plaza ya está activa y esa persona usa el plan del equipo.",
    detalle: `${miembro.email} · rol ${miembro.role}`,
    ruta: "/dashboard/equipos",
    tipo: "TEAM_JOIN",
  }).catch(() => []);

  logger.info("equipo_invitacion_aceptada", {
    equipo: miembro.teamId,
    usuario: sesion.user.email,
    rol: miembro.role,
  });

  return NextResponse.json({ ok: true, equipo: miembro.team.name, plan });
}
