import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { estadoPush } from "@/lib/push";
import { endpointCorto } from "@/lib/pwa";

/**
 * ============================================================================
 *  PUSH · ESTADO
 * ============================================================================
 *  GET /api/push/estado
 *    → configuración del servidor (sin claves privadas) y dispositivos
 *      suscritos del usuario. Lo usa el panel de Ajustes y el verificador.
 * ============================================================================
 */

export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const dispositivos = await prisma.pushSubscription.findMany({
    where: { userId: sesion.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, endpoint: true, navegador: true, activa: true, ultimoUso: true, createdAt: true },
  });

  return NextResponse.json({
    servidor: estadoPush(),
    clavePublica: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    dispositivos: dispositivos.map((dispositivo) => ({
      id: dispositivo.id,
      navegador: dispositivo.navegador,
      endpoint: endpointCorto(dispositivo.endpoint),
      activa: dispositivo.activa,
      ultimoUso: dispositivo.ultimoUso?.toISOString() ?? null,
      creado: dispositivo.createdAt.toISOString(),
    })),
    total: dispositivos.length,
  });
}
