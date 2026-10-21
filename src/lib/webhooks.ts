import { createHmac, randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseJsonArray } from "@/lib/utils";
import type { WebhookProvider } from "@/types";

/**
 * ============================================================================
 *  WEBHOOKS SALIENTES · SLACK, DISCORD Y GENÉRICOS
 * ============================================================================
 *  Cada usuario puede conectar sus propios canales. Se envían las alertas que
 *  ya existen (producto, saturación, cambio de tienda…) con el formato nativo
 *  de cada plataforma:
 *
 *    · Slack   → `blocks` con cabecera y botón al producto.
 *    · Discord → un `embed` con color según el tipo.
 *    · Genérico → JSON plano firmado con HMAC-SHA256 (n8n, Make, Zapier…).
 *
 *  Seguridad (esto es lo que evita que el webhook sea un agujero):
 *    · Solo HTTPS y hosts públicos: nada de `localhost`, IPs privadas ni
 *      metadatos del cloud (169.254.169.254) — protección contra SSRF.
 *    · Sin credenciales embebidas en la URL (https://user:pass@…).
 *    · Timeout de 8 s y cuerpo limitado: un webhook lento no bloquea el cron.
 *    · El secreto se guarda y se usa para firmar; nunca se devuelve entero.
 *    · Los fallos se cuentan y se guardan, pero no rompen la alerta.
 * ============================================================================
 */

/** Eventos a los que se puede suscribir un webhook. */
export const EVENTOS_WEBHOOK = [
  {
    id: "alerta",
    nombre: "Cualquier alerta",
    detalle: "Score, saturación y reversión de tendencia.",
  },
  {
    id: "producto",
    nombre: "Productos nuevos",
    detalle: "Altas en las tiendas que sigues.",
  },
  {
    id: "precio",
    nombre: "Cambios de precio",
    detalle: "Cuando una tienda sube o baja el precio.",
  },
  {
    id: "agotado",
    nombre: "Agotados",
    detalle: "Un producto deja de estar disponible.",
  },
  {
    id: "equipo",
    nombre: "Equipo",
    detalle: "Invitaciones aceptadas y cambios de plaza.",
  },
  {
    id: "prueba",
    nombre: "Evento de prueba",
    detalle: "Solo para comprobar que llega.",
  },
] as const;

export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number]["id"];

export interface AvisoWebhook {
  titulo: string;
  mensaje: string;
  /** Ruta interna (`/dashboard/...`) que se convierte en URL absoluta. */
  ruta?: string;
  /** Texto extra: score, tienda, precio… */
  detalle?: string;
  /** Etiqueta del evento dentro de la familia (NEW_PRODUCT, PRICE_CHANGE…). */
  tipo?: string;
  /** Color del embed en Discord (decimal). */
  color?: number;
}

export interface ResultadoEnvio {
  webhookId: string;
  nombre: string;
  ok: boolean;
  estado: number | null;
  error: string | null;
  duracionMs: number;
}

/** URL base pública, para construir enlaces clicables. */
function urlBase(): string {
  const configurada =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  return configurada.replace(/\/$/, "");
}

/** Enlace absoluto a partir de una ruta interna. */
function enlace(ruta?: string): string | null {
  if (!ruta) return null;
  if (/^https?:\/\//i.test(ruta)) return ruta;
  const base = urlBase();
  return base ? `${base}${ruta.startsWith("/") ? "" : "/"}${ruta}` : null;
}

/**
 * Valida la URL de un webhook.
 *
 * Devuelve `{ ok: true }` o `{ ok: false, motivo }`. Se aplica tanto al crear
 * como al enviar: aunque alguien cambie la URL en la base, no se envía a un
 * destino interno.
 */
export function validarUrlWebhook(url: string): {
  ok: boolean;
  motivo?: string;
} {
  let destino: URL;
  try {
    destino = new URL(url.trim());
  } catch {
    return { ok: false, motivo: "La URL no es válida." };
  }

  if (destino.protocol !== "https:") {
    return {
      ok: false,
      motivo:
        "La URL tiene que empezar por https:// (Slack y Discord ya la dan así).",
    };
  }
  if (destino.username || destino.password) {
    return {
      ok: false,
      motivo: "No se admiten credenciales dentro de la URL.",
    };
  }

  const host = destino.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Nombres internos habituales.
  const internos = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
    "metadata",
  ];
  if (
    internos.includes(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  ) {
    return {
      ok: false,
      motivo: "Esa dirección es interna y no se puede usar.",
    };
  }

  // IPv4 literal: se rechazan rangos privados, loopback, link-local y CGNAT.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const privada =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 0;
    if (privada)
      return { ok: false, motivo: "Esa dirección es privada o interna." };
  }

  // IPv6 literal: loopback, unique-local (fc00::/7) y link-local (fe80::/10).
  if (host.includes(":")) {
    if (host === "::1" || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) {
      return { ok: false, motivo: "Esa dirección IPv6 es interna." };
    }
  }

  // Sin puertos raros que apunten a servicios internos.
  if (destino.port && !["", "443", "8443"].includes(destino.port)) {
    return {
      ok: false,
      motivo: "Solo se admite el puerto 443 (o el que asigna Slack/Discord).",
    };
  }

  return { ok: true };
}

/** Genera un secreto para firmar (solo webhooks genéricos). */
export function generarSecreto(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** Firma HMAC-SHA256 del cuerpo, con el formato `sha256=…`. */
export function firmarCuerpo(cuerpo: string, secreto: string): string {
  return `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
}

/** Cabecera con emoji según el tipo de aviso (Slack y Discord). */
function iconoDe(tipo?: string): string {
  switch (tipo) {
    case "NEW_PRODUCT":
      return "🆕";
    case "PRICE_CHANGE":
      return "💸";
    case "SOLD_OUT":
      return "🚫";
    case "SATURATION_ALERT":
      return "🔥";
    case "TREND_REVERSAL":
      return "📉";
    case "SCORE_THRESHOLD":
      return "🎯";
    default:
      return "🔔";
  }
}

/** Color del embed en Discord (decimal), según el tipo. */
function colorDe(tipo?: string): number {
  switch (tipo) {
    case "NEW_PRODUCT":
      return 0x34d399;
    case "PRICE_CHANGE":
      return 0x38bdf8;
    case "SOLD_OUT":
      return 0xfbbf24;
    case "SATURATION_ALERT":
      return 0xf87171;
    case "TREND_REVERSAL":
      return 0xa78bfa;
    default:
      return 0x818cf8;
  }
}

/** Cuerpo que se envía a cada plataforma. */
export function construirCuerpo(
  proveedor: WebhookProvider,
  aviso: AvisoWebhook,
  opciones: { app?: string } = {},
): Record<string, unknown> {
  const aplicacion = opciones.app ?? "TrendHunter Pro";
  const url = enlace(aviso.ruta);
  const icono = iconoDe(aviso.tipo);

  if (proveedor === "SLACK") {
    const bloques: Array<Record<string, unknown>> = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${icono} ${aviso.titulo}`.slice(0, 150),
          emoji: true,
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: aviso.mensaje.slice(0, 2900) },
      },
    ];
    if (aviso.detalle) {
      bloques.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: aviso.detalle.slice(0, 2900) }],
      });
    }
    if (url) {
      bloques.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Abrir en TrendHunter",
              emoji: true,
            },
            url,
            style: "primary",
          },
        ],
      });
    }
    return {
      text: `${icono} ${aviso.titulo}`,
      blocks: bloques,
      // El nombre evita que Slack lo muestre como «slackbot».
      username: aplicacion,
    };
  }

  if (proveedor === "DISCORD") {
    return {
      username: aplicacion,
      embeds: [
        {
          title: `${icono} ${aviso.titulo}`.slice(0, 250),
          description:
            `${aviso.mensaje}${aviso.detalle ? `\n\n${aviso.detalle}` : ""}`.slice(
              0,
              3900,
            ),
          color: aviso.color ?? colorDe(aviso.tipo),
          url: url ?? undefined,
          timestamp: new Date().toISOString(),
          footer: { text: aplicacion },
        },
      ],
    };
  }

  return {
    evento: aviso.tipo ?? "alerta",
    aplicacion,
    titulo: aviso.titulo,
    mensaje: aviso.mensaje,
    detalle: aviso.detalle ?? null,
    url,
    enviado: new Date().toISOString(),
  };
}

/**
 * Envía un aviso a todos los webhooks activos del usuario suscritos al evento.
 * Nunca lanza: devuelve el resultado de cada envío.
 */
/**
 * Lista de webhooks activos con caché corta.
 *
 * El motor de alertas envía un aviso por producto y usuario: sin caché, cada
 * aviso haría su propia consulta. Un minuto de vida es de sobra para que un
 * cambio en la configuración se note enseguida sin castigar la base.
 */
const cacheActivos = new Map<string, { hasta: number; lista: WebhookFila[] }>();
const VIDA_CACHE_MS = 60_000;

async function webhooksActivos(userId: string): Promise<WebhookFila[]> {
  const ahora = Date.now();
  const guardado = cacheActivos.get(userId);
  if (guardado && guardado.hasta > ahora) return guardado.lista;

  const lista = await prisma.webhook.findMany({
    where: { userId, activo: true },
  });
  cacheActivos.set(userId, { hasta: ahora + VIDA_CACHE_MS, lista });
  // Limpieza sencilla: si el mapa crece, se vacía (no es un dato crítico).
  if (cacheActivos.size > 5_000) cacheActivos.clear();
  return lista;
}

/** Olvida la caché de un usuario (al crear, pausar o borrar un webhook). */
export function olvidarWebhooks(userId: string): void {
  cacheActivos.delete(userId);
}

export async function enviarAWebhooks(
  userId: string,
  evento: EventoWebhook,
  aviso: AvisoWebhook,
): Promise<ResultadoEnvio[]> {
  const webhooks = await webhooksActivos(userId);
  const suscritos = webhooks.filter((webhook) => {
    const eventos = parseJsonArray(
      webhook.eventos as string | null,
    ) as string[];
    // «alerta» es la suscripción general: recibe todo lo que sea aviso.
    return (
      eventos.includes(evento) || (evento === "alerta" && eventos.length === 0)
    );
  });
  if (suscritos.length === 0) return [];

  // En paralelo y con tope: un destino lento no retrasa a los demás ni bloquea
  // el bucle de alertas (cada envío tiene su propio tiempo máximo).
  const resultados: ResultadoEnvio[] = [];
  for (let i = 0; i < suscritos.length; i += 5) {
    const lote = suscritos.slice(i, i + 5);
    resultados.push(
      ...(await Promise.all(lote.map((webhook) => enviarUno(webhook, aviso)))),
    );
  }
  return resultados;
}

type WebhookFila = {
  id: string;
  nombre: string;
  url: string;
  provider: WebhookProvider;
  secreto: string | null;
  eventos: unknown;
};

/** Envía a un webhook concreto y guarda el resultado. */
export async function enviarUno(
  webhook: WebhookFila,
  aviso: AvisoWebhook,
): Promise<ResultadoEnvio> {
  const inicio = Date.now();
  const comprobacion = validarUrlWebhook(webhook.url);
  if (!comprobacion.ok) {
    await registrarResultado(
      webhook.id,
      null,
      comprobacion.motivo ?? "URL no válida",
    );
    return {
      webhookId: webhook.id,
      nombre: webhook.nombre,
      ok: false,
      estado: null,
      error: comprobacion.motivo ?? "URL no válida",
      duracionMs: Date.now() - inicio,
    };
  }

  const cuerpo = JSON.stringify(construirCuerpo(webhook.provider, aviso));
  const cabeceras: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (webhook.provider === "GENERIC" && webhook.secreto) {
    cabeceras["X-TrendHunter-Signature"] = firmarCuerpo(
      cuerpo,
      webhook.secreto,
    );
  }
  cabeceras["X-TrendHunter-Event"] = aviso.tipo ?? "alerta";

  try {
    const respuesta = await fetch(webhook.url, {
      method: "POST",
      headers: cabeceras,
      body: cuerpo,
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
    });
    const ok = respuesta.ok;
    const error = ok ? null : `El destino respondió ${respuesta.status}`;
    await registrarResultado(webhook.id, respuesta.status, error);
    return {
      webhookId: webhook.id,
      nombre: webhook.nombre,
      ok,
      estado: respuesta.status,
      error,
      duracionMs: Date.now() - inicio,
    };
  } catch (excepcion) {
    const mensaje =
      excepcion instanceof Error && /timeout|aborted/i.test(excepcion.message)
        ? "El destino no respondió en 8 s."
        : excepcion instanceof Error
          ? excepcion.message.slice(0, 200)
          : String(excepcion).slice(0, 200);
    await registrarResultado(webhook.id, null, mensaje);
    return {
      webhookId: webhook.id,
      nombre: webhook.nombre,
      ok: false,
      estado: null,
      error: mensaje,
      duracionMs: Date.now() - inicio,
    };
  }
}

/** Guarda estado, contador y último error del webhook. */
async function registrarResultado(
  webhookId: string,
  estado: number | null,
  error: string | null,
) {
  await prisma.webhook
    .update({
      where: { id: webhookId },
      data: {
        ultimoEstado: estado,
        ultimoError: error,
        ultimoEnvio: new Date(),
        ...(error
          ? { fallos: { increment: 1 } }
          : { envios: { increment: 1 } }),
      },
    })
    .catch((fallo) =>
      logger.aviso("webhook_no_actualizado", {
        webhookId,
        error: String(fallo),
      }),
    );
}
