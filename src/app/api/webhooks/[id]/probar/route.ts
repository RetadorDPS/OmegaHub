import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { enviarUno } from "@/lib/webhooks";
import { permitido, segundosParaReinicio } from "@/lib/limite";
import { logger } from "@/lib/logger";

/**
 *   POST /api/webhooks/:id/probar
 *
 * Envía un aviso de prueba real al destino y devuelve la respuesta del otro
 * lado (estado y error). Límite: 10 pruebas por hora y usuario, para no usar
 * la cuenta como ariete contra un tercero.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const clave = `webhook-prueba:${sesion.user.id}`;
  if (!permitido(clave, 10, 3_600_000)) {
    return NextResponse.json(
      { error: `Demasiadas pruebas seguidas. Vuelve en ${Math.ceil(segundosParaReinicio(clave) / 60)} min.` },
      { status: 429 },
    );
  }

  const { id } = await params;
  const webhook = await prisma.webhook.findFirst({ where: { id, userId: sesion.user.id } });
  if (!webhook) return NextResponse.json({ error: "Webhook no encontrado." }, { status: 404 });

  const resultado = await enviarUno(webhook, {
    titulo: "Prueba desde TrendHunter Pro",
    mensaje:
      "Si estás leyendo esto, tu webhook funciona. A partir de ahora recibirás aquí las alertas que tengas marcadas.",
    ruta: "/dashboard/settings/notifications",
    detalle: `Canal: ${webhook.provider} · Enviado: ${new Date().toLocaleString("es-ES")}`,
    tipo: "prueba",
  });

  logger.info("webhook_prueba", {
    usuario: sesion.user.email,
    proveedor: webhook.provider,
    ok: resultado.ok,
    estado: resultado.estado,
  });

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
}
