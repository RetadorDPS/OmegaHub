import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ============================================================================
 *  SUSCRIPCIÓN PUSH · BAJA
 * ============================================================================
 *  POST /api/push/unsubscribe   cuerpo: { endpoint }
 *
 *  El endpoint puede llegar desde un dispositivo que ya no existe en la base
 *  de datos: en ese caso la respuesta también es correcta (idempotente).
 * ============================================================================
 */

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!cuerpo.endpoint) {
    return NextResponse.json({ error: "Falta el endpoint del dispositivo." }, { status: 400 });
  }

  const { count } = await prisma.pushSubscription.deleteMany({
    where: { endpoint: cuerpo.endpoint, userId: sesion.user.id },
  });

  logger.info("push.baja", { usuario: sesion.user.email, eliminadas: count });

  return NextResponse.json({ ok: true, eliminadas: count });
}
