import "server-only";

/**
 * ============================================================================
 *  CANALES DE ENTREGA DE ALERTAS
 * ============================================================================
 *  Email (Brevo/SMTP), Telegram (bot) y webhook genérico
 *  (Slack, Discord, n8n…). Sin claves: el aviso se genera
 *  igual (campana del panel) y se registra el motivo.
 *  Nunca lanza.
 * ============================================================================
 */

export interface ResultadoEntrega {
  email: boolean;
  telegram: boolean;
  webhook: boolean;
  /** Push a los dispositivos del usuario (PWA). */
  push?: boolean;
  motivos: string[];
}

export interface CanalInfo {
  id: "email" | "telegram" | "webhook" | "push";
  nombre: string;
  configurado: boolean;
}

/** Estado REAL de cada canal (para diagnósticos). */
export function estadoCanales(): CanalInfo[] {
  return [
    {
      id: "email",
      nombre: "Correo (SMTP/Brevo)",
      configurado: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
    },
    {
      id: "telegram",
      nombre: "Telegram",
      configurado: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    },
    {
      id: "webhook",
      nombre: "Webhook (Slack/Discord/n8n)",
      configurado: Boolean(process.env.ALERT_WEBHOOK_URL),
    },
    {
      id: "push",
      nombre: "Push del navegador (PWA)",
      configurado: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    },
  ];
}

/** Entrega un aviso por todos los canales configurados. */
export async function entregarAlerta(datos: {
  email: string;
  nombre: string;
  titulo: string;
  mensaje: string;
  ruta: string;
  detalle?: string;
  /** Identificador del aviso (para que el push lo muestre sin duplicar). */
  etiqueta?: string;
  /** Usuario al que enviar el push (opcional: sin él se omite). */
  usuarioId?: string;
  /** Tipo de aviso (urgencia del push). */
  tipo?: string;
}): Promise<ResultadoEntrega> {
  const motivos: string[] = [];

  // ── Email ──
  let emailOk = false;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    emailOk = await enviarEmail(datos.email, datos.nombre, datos.titulo, datos.mensaje, datos.ruta)
      .then(() => true)
      .catch(() => false);
    if (!emailOk) motivos.push("email falló");
  } else {
    motivos.push("sin SMTP");
  }

  // ── Telegram ──
  let telegramOk = false;
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    telegramOk = await enviarTelegram(
      `${datos.titulo}\n${datos.mensaje}`,
    )
      .then(() => true)
      .catch(() => false);
    if (!telegramOk) motivos.push("telegram falló");
  } else {
    motivos.push("sin Telegram");
  }

  // ── Webhook ──
  let webhookOk = false;
  if (process.env.ALERT_WEBHOOK_URL) {
    webhookOk = await enviarWebhook(datos.titulo, datos.mensaje, datos.ruta)
      .then(() => true)
      .catch(() => false);
    if (!webhookOk) motivos.push("webhook falló");
  } else {
    motivos.push("sin webhook");
  }

  // ── Push del navegador ──
  let pushOk = false;
  if (datos.usuarioId && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      const [{ default: prisma }, { enviarPushAUsuario }] = await Promise.all([
        import("@/lib/prisma"),
        import("@/lib/push"),
      ]);
      const envio = await enviarPushAUsuario(prisma, datos.usuarioId, {
        titulo: datos.titulo,
        cuerpo: datos.mensaje.length > 140 ? `${datos.mensaje.slice(0, 137).trimEnd()}…` : datos.mensaje,
        url: datos.ruta,
        etiqueta: datos.etiqueta ?? "thp-aviso",
        tipo: datos.tipo ?? "SYSTEM",
      });
      pushOk = envio.enviados > 0;
      if (!pushOk) motivos.push(`push: ${envio.motivos.join(", ") || "sin entrega"}`);
    } catch (error) {
      motivos.push("push falló");
      void error;
    }
  }

  return { email: emailOk, telegram: telegramOk, webhook: webhookOk, push: pushOk, motivos };
}

/** Email vía SMTP (nodemailer ya está en el proyecto). */
async function enviarEmail(
  para: string,
  nombre: string,
  titulo: string,
  mensaje: string,
  ruta: string,
): Promise<void> {
  const { sendMail } = await import("@/lib/mail");
  await sendMail({
    to: para,
    subject: `TrendHunter Pro: ${titulo}`,
    text: `Hola ${nombre ?? "usuarios"}:\n\n${mensaje}\n\nDetalle: ${ruta}\n\n— El equipo de TrendHunter Pro`,
    html: `<p>Hola ${nombre ?? "usuario"}:</p><p>${mensaje}</p><p>Detalle: <a href="${ruta}">${ruta}</a></p>`,
  });
}

/** Mensaje por bot de Telegram. */
async function enviarTelegram(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!respuesta.ok) throw new Error(`telegram ${respuesta.status}`);
}

/** Webhook genérico (Slack/Discord/n8n). */
async function enviarWebhook(titulo: string, mensaje: string, ruta: string): Promise<void> {
  const respuesta = await fetch(process.env.ALERT_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: `${titulo}\n${mensaje}`, ruta }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!respuesta.ok) throw new Error(`webhook ${respuesta.status}`);
}
