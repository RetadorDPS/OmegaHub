import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { enviarPushDePrueba, pushConfigurado } from "@/lib/push";
import { logger } from "@/lib/logger";

/**
 * ============================================================================
 *  PUSH · ENVÍO DE PRUEBA
 * ============================================================================
 *  POST /api/push/test
 *
 *  Manda una notificación a todos los dispositivos activos del usuario. Sirve
 *  para comprobar permisos, claves VAPID y entrega real del sistema operativo.
 * ============================================================================
 */

export async function POST() {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!pushConfigurado()) {
    return NextResponse.json(
      {
        error:
          "Faltan las claves VAPID en el servidor (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT).",
      },
      { status: 503 },
    );
  }

  try {
    const resultado = await enviarPushDePrueba(prisma, sesion.user.id);
    logger.info("push.prueba", {
      usuario: sesion.user.email,
      enviados: resultado.enviados,
      fallidos: resultado.fallidos,
    });

    if (resultado.enviados === 0) {
      return NextResponse.json(
        {
          ok: false,
          ...resultado,
          error: resultado.motivos[0] ?? "No hay dispositivos suscritos en este momento.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    logger.error("push.prueba.error", {
      usuario: sesion.user.email,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo enviar la notificación de prueba." }, { status: 500 });
  }
}
