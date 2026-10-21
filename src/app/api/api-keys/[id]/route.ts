import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { planConApi } from "@/lib/apiKeys";

/**
 * DELETE /api/api-keys/:id
 *
 * Revoca una clave (no se borra: conserva el histórico de uso y la auditoría).
 * Solo el propietario puede revocarla.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!planConApi(sesion.user.planType)) {
    return NextResponse.json(
      { error: "La API pública requiere el plan Business o Agency." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const clave = await prisma.apiKey.findFirst({
    where: { id, userId: sesion.user.id },
    select: { id: true, prefijo: true, revocadaEn: true },
  });
  if (!clave) {
    return NextResponse.json({ error: "Clave no encontrada" }, { status: 404 });
  }
  if (clave.revocadaEn) {
    return NextResponse.json({ ok: true, yaRevocada: true });
  }

  await prisma.apiKey.update({
    where: { id: clave.id },
    data: { revocadaEn: new Date() },
  });

  logger.info("api.clave.revocada", { prefijo: clave.prefijo, usuario: sesion.user.email });
  return NextResponse.json({ ok: true });
}
