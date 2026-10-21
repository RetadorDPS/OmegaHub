import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { crearEquipo, equipoPropio, equiposDelUsuario, planEfectivo } from "@/lib/equipos";
import { logger } from "@/lib/logger";

/**
 * Equipo del usuario.
 *
 *   GET  /api/equipos   → equipo propio + equipos a los que pertenece
 *   POST /api/equipos   → crea el equipo (idempotente) con el nombre indicado
 *
 * Solo Business y Agency tienen asientos; en Free y Pro devuelve 402 con el
 * motivo, para que la interfaz pueda ofrecer el cambio de plan.
 */

export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const [propio, membresias, plan] = await Promise.all([
    equipoPropio(sesion.user.id),
    equiposDelUsuario(sesion.user.id, sesion.user.email),
    planEfectivo(sesion.user.id, sesion.user.planType),
  ]);

  return NextResponse.json({ planEfectivo: plan, propio, membresias });
}

const esquema = z.object({ nombre: z.string().trim().min(2).max(60).optional() });

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const cuerpo = await request.json().catch(() => ({}));
  const datos = esquema.safeParse(cuerpo);
  if (!datos.success) {
    return NextResponse.json({ error: "El nombre del equipo debe tener entre 2 y 60 caracteres." }, { status: 400 });
  }

  try {
    const equipo = await crearEquipo(sesion.user.id, datos.data.nombre);
    logger.info("equipo_creado", { usuario: sesion.user.email, equipo: equipo.id });
    return NextResponse.json({ equipo }, { status: 201 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "No se pudo crear el equipo.";
    const esPlan = error instanceof Error && "codigo" in error && (error as { codigo?: string }).codigo === "PLAN";
    return NextResponse.json({ error: mensaje, plan: esPlan }, { status: esPlan ? 402 : 400 });
  }
}

/** Plazas disponibles del equipo propio (para pintar el contador sin recargar). */
export async function HEAD() {
  const sesion = await auth();
  if (!sesion?.user?.id) return new Response(null, { status: 401 });
  const equipo = await equipoPropio(sesion.user.id);
  return new Response(null, {
    status: 200,
    headers: {
      "x-asientos": String(equipo?.asientos ?? 1),
      "x-ocupados": String(equipo?.ocupados ?? 1),
    },
  });
}

/** Evita que Next cachee la respuesta: el equipo cambia con las invitaciones. */
export const dynamic = "force-dynamic";
