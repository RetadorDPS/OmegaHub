import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { toJsonInput } from "@/lib/json";
import { parseJsonArray } from "@/lib/utils";
import { EVENTOS_WEBHOOK, olvidarWebhooks, validarUrlWebhook } from "@/lib/webhooks";

/**
 *   PATCH  /api/webhooks/:id   { activo } → activa o pausa
 *   DELETE /api/webhooks/:id              → borra el webhook
 *
 * Siempre scoped al usuario de la sesión: nadie puede tocar el webhook de otro
 * aunque adivine el identificador.
 */

const esquema = z.object({
  activo: z.boolean().optional(),
  nombre: z.string().trim().min(2).max(60).optional(),
  url: z.string().url().optional(),
  eventos: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { id } = await params;
  const datos = esquema.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });

  const webhook = await prisma.webhook.findFirst({ where: { id, userId: sesion.user.id } });
  if (!webhook) return NextResponse.json({ error: "Webhook no encontrado." }, { status: 404 });

  if (datos.data.url) {
    const comprobacion = validarUrlWebhook(datos.data.url);
    if (!comprobacion.ok) return NextResponse.json({ error: comprobacion.motivo }, { status: 400 });
  }

  const validos = new Set(EVENTOS_WEBHOOK.map((evento) => evento.id as string));
  const eventos = datos.data.eventos?.filter((evento) => validos.has(evento));

  olvidarWebhooks(sesion.user.id);
  const actualizado = await prisma.webhook.update({
    where: { id },
    data: {
      ...(datos.data.activo === undefined ? {} : { activo: datos.data.activo }),
      ...(datos.data.nombre ? { nombre: datos.data.nombre } : {}),
      ...(datos.data.url ? { url: datos.data.url } : {}),
      ...(eventos && eventos.length > 0 ? { eventos: toJsonInput(eventos) } : {}),
    },
  });

  return NextResponse.json({
    webhook: {
      id: actualizado.id,
      activo: actualizado.activo,
      nombre: actualizado.nombre,
      eventos: parseJsonArray(actualizado.eventos as string | null),
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { id } = await params;
  const borrado = await prisma.webhook.deleteMany({ where: { id, userId: sesion.user.id } });
  if (borrado.count === 0) return NextResponse.json({ error: "Webhook no encontrado." }, { status: 404 });

  olvidarWebhooks(sesion.user.id);
  return NextResponse.json({ ok: true });
}
