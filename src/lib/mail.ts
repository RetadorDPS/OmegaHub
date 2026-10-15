import nodemailer, { type Transporter } from "nodemailer";
import { urlApp } from "@/lib/app-url";

/**
 * Envío de correo transaccional.
 *
 * Si no hay credenciales SMTP configuradas (desarrollo, demo, CI) los correos
 * se registran en consola en lugar de enviarse, de modo que el flujo de
 * registro y verificación nunca se rompe.
 */

let transporte: Transporter | null = null;

/** ¿Hay configuración SMTP disponible? */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

function getTransporte(): Transporter | null {
  if (!mailConfigured()) return null;
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporte;
}

interface EnviarParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Envía (o registra en consola) un correo electrónico. */
export async function sendMail({ to, subject, html, text }: EnviarParams): Promise<boolean> {
  const cliente = getTransporte();
  if (!cliente) {
    console.info(`[mail] SMTP no configurado. Correo para ${to} — «${subject}»`);
    return false;
  }
  await cliente.sendMail({
    from: process.env.SMTP_FROM ?? "TrendHunter Pro <no-reply@trendhunter.pro>",
    to,
    subject,
    html,
    text,
  });
  return true;
}

/** URL base de la aplicación (para enlaces en los correos). */
function appUrl(): string {
  return urlApp();
}

/** Plantilla HTML común con la identidad visual de la plataforma. */
function plantilla(titulo: string, contenido: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#0b1020;font-family:Inter,Arial,sans-serif;color:#e2e8f0">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-size:18px;font-weight:700;background:linear-gradient(90deg,#6366f1,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent">TrendHunter Pro</div>
    <div style="margin-top:24px;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#f8fafc">${titulo}</h1>
      ${contenido}
    </div>
    <p style="margin-top:20px;font-size:12px;color:#64748b">TrendHunter Pro · Inteligencia de productos para e-commerce</p>
  </div></body></html>`;
}

/** Correo de bienvenida tras el registro. */
export async function sendWelcomeEmail({ email, name }: { email: string; name?: string }) {
  return sendMail({
    to: email,
    subject: "¡Bienvenido a TrendHunter Pro!",
    html: plantilla(
      `¡Hola${name ? ` ${name.split(" ")[0]}` : ""}!`,
      `<p style="color:#94a3b8;line-height:1.6">Tu cuenta ya está activa. Ya puedes explorar productos ganadores, espiar anuncios y analizar tiendas Shopify.</p>
       <a href="${appUrl()}/dashboard/winning-products" style="display:inline-block;margin-top:16px;background:linear-gradient(90deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Ver productos ganadores</a>`,
    ),
    text: `¡Bienvenido a TrendHunter Pro! Activa tu cuenta en ${appUrl()}/dashboard/winning-products`,
  });
}

/** Correo de verificación de dirección. */
export async function sendVerificationEmail({ email, name, token }: { email: string; name?: string; token: string }) {
  const enlace = `${appUrl()}/api/auth/verify-email?token=${token}`;
  return sendMail({
    to: email,
    subject: "Verifica tu correo en TrendHunter Pro",
    html: plantilla(
      "Verifica tu correo electrónico",
      `<p style="color:#94a3b8;line-height:1.6">Hola${name ? ` ${name.split(" ")[0]}` : ""}, confirma tu dirección para desbloquear todas las funciones.</p>
       <a href="${enlace}" style="display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Verificar correo</a>
       <p style="color:#64748b;font-size:12px;margin-top:16px">El enlace caduca en 24 horas.</p>`,
    ),
    text: `Verifica tu correo en TrendHunter Pro: ${enlace}`,
  });
}

/** Correo de restablecimiento de contraseña. */
export async function sendPasswordResetEmail({ email, token }: { email: string; token: string }) {
  const enlace = `${appUrl()}/reset-password?token=${token}`;
  return sendMail({
    to: email,
    subject: "Restablece tu contraseña de TrendHunter Pro",
    html: plantilla(
      "Restablecer contraseña",
      `<p style="color:#94a3b8;line-height:1.6">Hemos recibido una solicitud para cambiar tu contraseña.</p>
       <a href="${enlace}" style="display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Crear nueva contraseña</a>
       <p style="color:#64748b;font-size:12px;margin-top:16px">Si no has sido tú, ignora este mensaje. El enlace caduca en 1 hora.</p>`,
    ),
    text: `Restablece tu contraseña: ${enlace}`,
  });
}

/** Aviso de cambio de contraseña (seguridad). */
export async function sendPasswordChangedEmail({ email }: { email: string }) {
  return sendMail({
    to: email,
    subject: "Tu contraseña de TrendHunter Pro ha cambiado",
    html: plantilla(
      "Contraseña actualizada",
      `<p style="color:#94a3b8;line-height:1.6">Tu contraseña se ha cambiado correctamente. Si no has sido tú, restablece el acceso de inmediato.</p>
       <a href="${appUrl()}/forgot-password" style="display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Restablecer contraseña</a>`,
    ),
    text: `Tu contraseña ha cambiado. Si no has sido tú, restablece el acceso en ${appUrl()}/forgot-password`,
  });
}

/** Aviso de cambio de plan (Stripe o modo demostración). */
export async function sendPlanChangedEmail({
  email,
  plan,
  montoMensual,
}: {
  email: string;
  plan: string;
  montoMensual: number;
}) {
  return sendMail({
    to: email,
    subject: `Tu plan de TrendHunter Pro es ahora ${plan}`,
    html: plantilla(
      `Plan ${plan} activado`,
      `<p style="color:#94a3b8;line-height:1.6">Tu suscripción se ha actualizado. Facturación mensual: <strong style="color:#e2e8f0">${montoMensual} $</strong>.</p>
       <a href="${appUrl()}/dashboard/settings/billing" style="display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Ver mi suscripción</a>`,
    ),
    text: `Tu plan de TrendHunter Pro es ahora ${plan} (${montoMensual} $/mes).`,
  });
}
