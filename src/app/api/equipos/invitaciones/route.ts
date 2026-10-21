import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { asientosDelPlan, correoValido, planEfectivo } from "@/lib/equipos";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/**
 * Invitaciones al equipo.
 *
 *   POST /api/equipos/invitaciones   { email, role }
 *   GET  /api/equipos/invitaciones?token=…   → datos públicos de la invitación
 *
 * Reglas de seguridad y negocio:
 *   · Solo el dueño o un ADMIN del equipo pueden invitar.
 *   · El correo debe ser válido y no estar ya en el equipo.
 *   · No se puede invitar si no quedan plazas libres (las ocupan los ACTIVOS).
 *   · El token es de un solo uso y caduca a los 14 días.
 *   · Si el correo ya tiene cuenta, además del enlace se le deja un aviso en la
 *     campana (así se entera sin depender del correo saliente).
 */

const DIAS_CADUCIDAD = 14;

const esquema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id || !sesion.user.email) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }

  const datos = esquema.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) {
    return NextResponse.json({ error: "Escribe un correo válido y un rol permitido." }, { status: 400 });
  }

  const email = correoValido(datos.data.email);
  if (!email) return NextResponse.json({ error: "El correo no es válido." }, { status: 400 });

  const equipo = await prisma.team.findUnique({
    where: { ownerId: sesion.user.id },
    include: { members: true },
  });
  if (!equipo) {
    // Si no es dueño pero sí miembro de un equipo, el problema es de permisos.
    const plazaAjena = await prisma.teamMember.findFirst({
      where: { userId: sesion.user.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (plazaAjena) {
      return NextResponse.json({ error: "Solo el propietario o un administrador pueden invitar." }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Primero crea el equipo (solo Business y Agency tienen plazas).", plan: true },
      { status: 402 },
    );
  }

  // Permiso: dueño o ADMIN activo del equipo.
  const yo = equipo.members.find((miembro) => miembro.userId === sesion.user.id && miembro.status === "ACTIVE");
  if (!yo || (yo.role !== "OWNER" && yo.role !== "ADMIN")) {
    return NextResponse.json({ error: "Solo el propietario o un administrador pueden invitar." }, { status: 403 });
  }

  if (email === sesion.user.email.toLowerCase()) {
    return NextResponse.json({ error: "Ya formas parte de este equipo." }, { status: 400 });
  }

  const plan = await planEfectivo(equipo.ownerId, sesion.user.planType);
  const asientos = asientosDelPlan(plan);
  const activos = equipo.members.filter((miembro) => miembro.status === "ACTIVE").length;
  const pendientes = equipo.members.filter((miembro) => miembro.status === "INVITED").length;
  if (activos >= asientos && !equipo.members.some((miembro) => miembro.email === email)) {
    return NextResponse.json(
      { error: `Tu plan incluye ${asientos} plazas y ya hay ${activos} personas dentro. ${pendientes > 0 ? "Hay invitaciones pendientes." : "Mejora el plan o libera una plaza."}` },
      { status: 409 },
    );
  }

  const existente = equipo.members.find((miembro) => miembro.email === email);
  if (existente?.status === "ACTIVE") {
    return NextResponse.json(
      { error: "Ese correo ya forma parte del equipo. Cámbiale el rol en la lista de miembros." },
      { status: 409 },
    );
  }

  const token = randomBytes(24).toString("base64url");

  const miembro = existente
    ? await prisma.teamMember.update({
        where: { id: existente.id },
        data: {
          role: datos.data.role,
          status: "INVITED",
          inviteToken: token,
          invitedAt: new Date(),
          joinedAt: null,
          // Si la plaza estaba activa, se quita el acceso hasta que acepte.
          userId: null,
        },
      })
    : await prisma.teamMember.create({
        data: { teamId: equipo.id, email, role: datos.data.role, inviteToken: token },
      });

  // Aviso en la campana si ese correo ya es usuario de la plataforma.
  const invitado = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (invitado) {
    await createNotification({
      userId: invitado.id,
      type: "SYSTEM",
      title: `${sesion.user.name ?? sesion.user.email} te invita a su equipo`,
      message: `Tendrás acceso al plan ${plan} de TrendHunter Pro mientras estés en el equipo. Acepta la invitación desde aquí.`,
      entityType: "equipo",
      entityId: equipo.id,
      actionUrl: `/equipos/aceptar?token=${token}`,
      metadata: { equipo: equipo.name, rol: datos.data.role },
    });
  }

  logger.info("equipo_invitacion", {
    equipo: equipo.id,
    por: sesion.user.email,
    invitado: email,
    rol: datos.data.role,
  });

  return NextResponse.json(
    {
      miembro: {
        id: miembro.id,
        email: miembro.email,
        role: miembro.role,
        status: miembro.status,
        desde: miembro.invitedAt.toISOString(),
      },
      enlace: `/equipos/aceptar?token=${token}`,
      caducaEnDias: DIAS_CADUCIDAD,
      yaTieneCuenta: Boolean(invitado),
      plazas: { asientos, activos, pendientes: pendientes + (existente?.status === "INVITED" ? 0 : 1) },
    },
    { status: 201 },
  );
}

/** Datos de una invitación (para pintar la pantalla de aceptación). */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (token.length < 16) return NextResponse.json({ error: "Invitación no válida." }, { status: 400 });

  const miembro = await prisma.teamMember.findUnique({
    where: { inviteToken: token },
    include: { team: { include: { owner: { select: { name: true, email: true, planType: true } } } } },
  });
  if (!miembro) return NextResponse.json({ error: "La invitación no existe o ya se ha usado." }, { status: 404 });

  const caducada = Date.now() - miembro.invitedAt.getTime() > DIAS_CADUCIDAD * 86_400_000;
  if (caducada) return NextResponse.json({ error: "La invitación ha caducado. Pide una nueva." }, { status: 410 });

  return NextResponse.json({
    invitacion: {
      email: miembro.email,
      rol: miembro.role,
      estado: miembro.status,
      equipo: miembro.team.name,
      propietario: miembro.team.owner.name ?? miembro.team.owner.email,
      plan: miembro.team.owner.planType,
    },
  });
}
