import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { toJsonInput } from "@/lib/json";
import { parseJsonArray } from "@/lib/utils";
import { EVENTOS_WEBHOOK, generarSecreto, olvidarWebhooks, validarUrlWebhook } from "@/lib/webhooks";
import { logger } from "@/lib/logger";

/**
 * Webhooks del usuario.
 *
 *   GET  /api/webhooks   → lista (sin secretos completos)
 *   POST /api/webhooks   → crea uno nuevo
 *
 * Reglas:
 *   · Requiere sesión.
 *   · Solo Business y Agency (los webhooks son una función de equipo).
 *   · URL https pública (validación SSRF en `validarUrlWebhook`).
 *   · Máximo 10 webhooks por usuario.
 *   · El secreto se devuelve UNA vez al crearlo; después solo su prefijo.
 */

const MAXIMO = 10;

const esquema = z.object({
  nombre: z.string().trim().min(2).max(60),
  url: z.string().url(),
  provider: z.enum(["SLACK", "DISCORD", "GENERIC"]).default("GENERIC"),
  eventos: z.array(z.string()).min(1).max(EVENTOS_WEBHOOK.length).default(["alerta"]),
});

/** ¿El plan permite webhooks? */
function planConWebhooks(plan: string): boolean {
  return plan === "BUSINESS" || plan === "AGENCY";
}

export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const webhooks = await prisma.webhook.findMany({
    where: { userId: sesion.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    webhooks: webhooks.map((webhook) => ({
      id: webhook.id,
      nombre: webhook.nombre,
      // Se oculta la parte final del token de Slack/Discord por si alguien mira la pantalla.
      url: ocultarUrl(webhook.url),
      provider: webhook.provider,
      eventos: parseJsonArray(webhook.eventos as string | null),
      activo: webhook.activo,
      tieneSecreto: Boolean(webhook.secreto),
      secretoPrefijo: webhook.secreto ? `${webhook.secreto.slice(0, 10)}…` : null,
      ultimoEstado: webhook.ultimoEstado,
      ultimoError: webhook.ultimoError,
      ultimoEnvio: webhook.ultimoEnvio?.toISOString() ?? null,
      envios: webhook.envios,
      fallos: webhook.fallos,
    })),
    disponibles: EVENTOS_WEBHOOK,
  });
}

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  if (!planConWebhooks(sesion.user.planType)) {
    return NextResponse.json(
      { error: "Los webhooks están incluidos en Business y Agency.", plan: true },
      { status: 402 },
    );
  }

  const datos = esquema.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) {
    return NextResponse.json({ error: "Revisa el nombre, la URL y al menos un evento." }, { status: 400 });
  }

  const comprobacion = validarUrlWebhook(datos.data.url);
  if (!comprobacion.ok) return NextResponse.json({ error: comprobacion.motivo }, { status: 400 });

  const total = await prisma.webhook.count({ where: { userId: sesion.user.id } });
  if (total >= MAXIMO) {
    return NextResponse.json({ error: `Máximo ${MAXIMO} webhooks por cuenta. Borra uno para crear otro.` }, { status: 409 });
  }

  const validos = new Set(EVENTOS_WEBHOOK.map((evento) => evento.id as string));
  const eventos = datos.data.eventos.filter((evento) => validos.has(evento));
  if (eventos.length === 0) return NextResponse.json({ error: "Ningún evento es válido." }, { status: 400 });

  const secreto = datos.data.provider === "GENERIC" ? generarSecreto() : null;

  const webhook = await prisma.webhook.create({
    data: {
      userId: sesion.user.id,
      nombre: datos.data.nombre,
      url: datos.data.url,
      provider: datos.data.provider,
      eventos: toJsonInput(eventos),
      secreto,
    },
  });

  olvidarWebhooks(sesion.user.id);

  logger.info("webhook_creado", {
    usuario: sesion.user.email,
    proveedor: datos.data.provider,
    eventos: eventos.length,
  });

  return NextResponse.json(
    {
      webhook: {
        id: webhook.id,
        nombre: webhook.nombre,
        provider: webhook.provider,
        eventos,
        url: ocultarUrl(webhook.url),
      },
      // Única vez que se muestra completo: sirve para verificar la firma.
      secreto,
    },
    { status: 201 },
  );
}

/** Oculta la parte sensible de la URL (token de Slack/Discord). */
function ocultarUrl(url: string): string {
  try {
    const destino = new URL(url);
    const partes = destino.pathname.split("/").filter(Boolean);
    if (partes.length === 0) return `${destino.origin}/…`;
    const ultima = partes[partes.length - 1];
    const visible = ultima.length > 8 ? `${ultima.slice(0, 6)}…${ultima.slice(-4)}` : "…";
    return `${destino.origin}/${partes.slice(0, -1).join("/")}${partes.length > 1 ? "/" : ""}${visible}`;
  } catch {
    return "URL no válida";
  }
}
