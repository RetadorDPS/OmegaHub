import prisma from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/constants";
import type { PlanType, TeamRole } from "@/types";

/**
 * ============================================================================
 *  EQUIPOS Y ASIENTOS
 * ============================================================================
 *  Un equipo pertenece a la cuenta que paga (el dueño). Los miembros activos
 *  heredan su plan mientras la plaza esté activa: no se paga dos veces por la
 *  misma herramienta.
 *
 *  Reglas:
 *    · Asientos por plan: Free/Pro 1, Business 5, Agency 15.
 *    · El dueño siempre ocupa una plaza y no se puede quitar.
 *    · Invitar no consume plaza: la consume el que ACEPTA. Así una invitación
 *      olvidada no bloquea al equipo.
 *    · Un correo no puede estar dos veces en el mismo equipo.
 *    · El plan efectivo es el MAYOR entre el propio y el del equipo.
 * ============================================================================
 */

/** Orden de planes para comparar. */
const ORDEN: PlanType[] = ["FREE", "PRO", "BUSINESS", "AGENCY"];

/** ¿`a` es un plan igual o superior a `b`? */
export function planMayorOIgual(a: PlanType, b: PlanType): boolean {
  return ORDEN.indexOf(a) >= ORDEN.indexOf(b);
}

/** Plan más alto de una lista. */
export function planMasAlto(planes: PlanType[]): PlanType {
  return planes.reduce<PlanType>((mejor, plan) => (planMayorOIgual(plan, mejor) ? plan : mejor), "FREE");
}

/** Asientos que incluye un plan. */
export function asientosDelPlan(plan: PlanType): number {
  return PLAN_LIMITS[plan]?.seats ?? 1;
}

export interface EquipoResumen {
  id: string;
  nombre: string;
  propietario: string;
  propietarioEmail: string;
  plan: PlanType;
  asientos: number;
  ocupados: number;
  libres: number;
  esPropietario: boolean;
  miembros: Array<{
    id: string;
    email: string;
    nombre: string | null;
    role: TeamRole;
    status: "INVITED" | "ACTIVE" | "REVOKED";
    desde: string;
    ultimaActividad: string | null;
  }>;
}

/**
 * Plan efectivo del usuario: el suyo o el del equipo al que pertenece.
 * Se consulta poco (solo al refrescar la sesión y al crear cosas), así que la
 * consulta directa es aceptable y siempre da el dato bueno.
 */
export async function planEfectivo(userId: string, planPropio: PlanType): Promise<PlanType> {
  const membresias = await prisma.teamMember.findMany({
    where: { userId, status: "ACTIVE" },
    select: { team: { select: { owner: { select: { planType: true } } } } },
  });
  const planes = [planPropio, ...membresias.map((m) => m.team.owner.planType as PlanType)];
  return planMasAlto(planes);
}

/** Equipo del que el usuario es dueño (o null). */
export async function equipoPropio(userId: string): Promise<EquipoResumen | null> {
  const equipo = await prisma.team.findUnique({
    where: { ownerId: userId },
    include: {
      owner: { select: { name: true, email: true, planType: true } },
      members: { orderBy: [{ status: "asc" }, { invitedAt: "asc" }] },
    },
  });
  return equipo ? aResumen(equipo, true) : null;
}

/** Equipos a los que pertenece (invitaciones incluidas). */
export async function equiposDelUsuario(userId: string, email?: string | null): Promise<EquipoResumen[]> {
  const comoMiembro = await prisma.teamMember.findMany({
    where: {
      OR: [
        { userId },
        ...(email ? [{ email: email.toLowerCase(), status: "INVITED" as const }] : []),
      ],
    },
    include: {
      team: {
        include: {
          owner: { select: { name: true, email: true, planType: true } },
          members: { orderBy: [{ status: "asc" }, { invitedAt: "asc" }] },
        },
      },
    },
  });

  return comoMiembro
    .map((membresia) => aResumen(membresia.team, membresia.team.ownerId === userId))
    .filter((equipo) => equipo !== null) as EquipoResumen[];
}

type EquipoConRelaciones = {
  id: string;
  name: string;
  ownerId: string;
  seats: number;
  owner: { name: string | null; email: string; planType: PlanType };
  members: Array<{
    id: string;
    email: string;
    userId: string | null;
    role: TeamRole;
    status: "INVITED" | "ACTIVE" | "REVOKED";
    invitedAt: Date;
    joinedAt: Date | null;
    lastActiveAt: Date | null;
    user?: { name: string | null } | null;
  }>;
};

/** Convierte la fila de Prisma al DTO que usa la interfaz. */
function aResumen(equipo: EquipoConRelaciones, esPropietario: boolean): EquipoResumen {
  const activos = equipo.members.filter((miembro) => miembro.status === "ACTIVE").length;
  const asientos = Math.max(equipo.seats, asientosDelPlan(equipo.owner.planType));
  return {
    id: equipo.id,
    nombre: equipo.name,
    propietario: equipo.owner.name ?? equipo.owner.email,
    propietarioEmail: equipo.owner.email,
    plan: equipo.owner.planType as PlanType,
    asientos,
    ocupados: activos,
    libres: Math.max(0, asientos - activos),
    esPropietario,
    miembros: equipo.members.map((miembro) => ({
      id: miembro.id,
      email: miembro.email,
      nombre: miembro.user?.name ?? null,
      role: miembro.role,
      status: miembro.status,
      desde: (miembro.joinedAt ?? miembro.invitedAt).toISOString(),
      ultimaActividad: miembro.lastActiveAt ? miembro.lastActiveAt.toISOString() : null,
    })),
  };
}

/** Error de negocio con mensaje para el usuario. */
export class ErrorEquipo extends Error {
  constructor(
    message: string,
    readonly codigo: "PLAN" | "ASIENTOS" | "DUPLICADO" | "PERMISO" | "NO_ENCONTRADO" = "PERMISO",
  ) {
    super(message);
    this.name = "ErrorEquipo";
  }
}

/**
 * Crea el equipo del usuario (idempotente: si ya existe lo devuelve).
 * Solo Business y Agency tienen asientos.
 */
export async function crearEquipo(userId: string, nombre?: string) {
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, planType: true },
  });
  if (!usuario) throw new ErrorEquipo("Usuario no encontrado.", "NO_ENCONTRADO");

  const plan = await planEfectivo(userId, usuario.planType as PlanType);
  if (asientosDelPlan(plan) <= 1) {
    throw new ErrorEquipo("Tu plan no incluye equipo. Business incluye 5 plazas y Agency, 15.", "PLAN");
  }

  const existente = await prisma.team.findUnique({ where: { ownerId: userId } });
  if (existente) return existente;

  const equipo = await prisma.team.create({
    data: {
      name: nombre?.trim() || `Equipo de ${usuario.name ?? usuario.email.split("@")[0]}`,
      ownerId: userId,
      seats: asientosDelPlan(plan),
      members: {
        create: {
          userId,
          email: usuario.email.toLowerCase(),
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      },
    },
  });
  return equipo;
}

/** Normaliza y valida un correo. */
export function correoValido(email: string): string | null {
  const limpio = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio) ? limpio : null;
}
