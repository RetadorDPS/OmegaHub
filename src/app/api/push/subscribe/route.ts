import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { navegadorDe, validarSuscripcion } from "@/lib/pwa";

/**
 * ============================================================================
 *  SUSCRIPCIÓN PUSH · ALTA
 * ============================================================================
 *  POST /api/push/subscribe
 *  cuerpo: { endpoint, keys: { p256dh, auth } }
 *
 *  Guarda (o reactiva) el dispositivo del usuario que hace la petición.
 *  El endpoint es único: si el navegador renueva sus claves, la fila se
 *  actualiza en lugar de duplicarse.
 * ============================================================================
 */

function fallo(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return fallo(401, "No autenticado");

  const cuerpo = await request.json().catch(() => null);
  const problema = validarSuscripcion(cuerpo);
  if (problema) return fallo(400, problema);

  const { endpoint, keys } = cuerpo as { endpoint: string; keys: { p256dh: string; auth: string } };
  const navegador = navegadorDe(request.headers.get("user-agent"));

  // Un endpoint pertenece a un solo usuario: si otro lo tenía (navegador
  // compartido), se reasigna al usuario actual.
  const existente = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (existente && existente.userId !== sesion.user.id) {
    await prisma.pushSubscription.delete({ where: { id: existente.id } });
  }

  const suscripcion = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: sesion.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      navegador,
    },
    update: {
      userId: sesion.user.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      navegador,
      activa: true,
    },
    select: { id: true, navegador: true },
  });

  logger.info("push.suscrito", { usuario: sesion.user.email, navegador });

  return NextResponse.json({ ok: true, id: suscripcion.id, navegador: suscripcion.navegador }, { status: 201 });
}
