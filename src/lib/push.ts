import "server-only";

/**
 * ============================================================================
 *  NOTIFICACIONES PUSH (Web Push / VAPID)
 * ============================================================================
 *  Envía a cada dispositivo suscrito del usuario un push a través del servicio
 *  del navegador (FCM, Mozilla, Apple…), cifrado de extremo a extremo con las
 *  claves del propio navegador.
 *
 *  Configuración (una sola vez):
 *    npx web-push generate-vapid-keys
 *      → NEXT_PUBLIC_VAPID_PUBLIC_KEY  (pública, va al navegador)
 *      → VAPID_PRIVATE_KEY             (privada, solo servidor)
 *      → VAPID_SUBJECT="mailto:tu@correo"
 *
 *  Sin claves: todo sigue funcionando (campana, email, Telegram y webhook);
 *  `estadoPush()` lo indica en el panel y la API responde 503 al pedir la vista.
 *  Nunca lanza: si un push falla, la alerta ya está en la campana.
 * ============================================================================
 */
import { endpointCorto } from "@/lib/pwa";
import { logger } from "@/lib/logger";

/** ¿Hay claves VAPID configuradas? */
export function pushConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

/** Estado para diagnósticos (nunca expone la clave privada). */
export function estadoPush() {
  return {
    configurado: pushConfigurado(),
    clavePublica: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? "configurada" : "falta",
    clavePrivada: process.env.VAPID_PRIVATE_KEY ? "configurada" : "falta",
    asunto: process.env.VAPID_SUBJECT ? "configurado" : "falta",
    nota: pushConfigurado()
      ? "Los avisos se envían a los dispositivos suscritos."
      : "Sin claves VAPID: las alertas siguen en la campana, por correo, Telegram y webhook.",
  };
}

/**
 * Lo único que necesita el envío push del cliente de base de datos.
 * Se declara de forma estructural para poder probarlo con un doble en tests.
 */
export interface ClientePush {
  pushSubscription: {
    findMany: (args: {
      where: { userId: string; activa: boolean };
      select: { id: true; endpoint: true; p256dh: true; auth: true };
    }) => Promise<Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>;
    update: (args: { where: { id: string }; data: { ultimoUso?: Date; activa?: boolean } }) => Promise<unknown>;
  };
}

/** Resultado del envío a los dispositivos de un usuario. */
export interface ResultadoPush {
  enviados: number;
  fallidos: number;
  desactivados: number;
  motivos: string[];
}

interface PeticionPush {
  titulo: string;
  cuerpo: string;
  url: string;
  etiqueta: string;
  tipo: string;
}

/**
 * Envía un push a todos los dispositivos activos del usuario.
 *
 * Los endpoints que devuelven 404 o 410 se marcan como inactivos: el navegador
 * los retiró (app desinstalada, permisos revocados). Así no se reintenta
 * indefinidamente.
 */
export async function enviarPushAUsuario(
  prisma: ClientePush,
  userId: string,
  datos: PeticionPush,
): Promise<ResultadoPush> {
  const resultado: ResultadoPush = { enviados: 0, fallidos: 0, desactivados: 0, motivos: [] };

  if (!pushConfigurado()) {
    resultado.motivos.push("sin claves VAPID");
    return resultado;
  }

  const suscripciones = await prisma.pushSubscription.findMany({
    where: { userId, activa: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (suscripciones.length === 0) {
    resultado.motivos.push("sin dispositivos suscritos");
    return resultado;
  }

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const carga = JSON.stringify(datos);

  for (const suscripcion of suscripciones) {
    try {
      await webpush.sendNotification(
        {
          endpoint: suscripcion.endpoint,
          keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth },
        },
        carga,
        { TTL: 3600, urgency: datos.tipo === "PRICE_CHANGE" ? "high" : "normal" },
      );
      resultado.enviados += 1;
      await prisma.pushSubscription.update({
        where: { id: suscripcion.id },
        data: { ultimoUso: new Date() },
      });
    } catch (error) {
      const estado = (error as { statusCode?: number }).statusCode;
      resultado.fallidos += 1;
      if (estado === 404 || estado === 410) {
        resultado.desactivados += 1;
        await prisma.pushSubscription.update({
          where: { id: suscripcion.id },
          data: { activa: false },
        });
        resultado.motivos.push(`${endpointCorto(suscripcion.endpoint)}: dispositivo retirado`);
      } else {
        resultado.motivos.push(`${endpointCorto(suscripcion.endpoint)}: ${estado ?? "error"}`);
        logger.aviso("push.fallo", {
          endpoint: endpointCorto(suscripcion.endpoint),
          estado: estado ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return resultado;
}

/** Prueba manual: envía un push al usuario y devuelve el resultado. */
export async function enviarPushDePrueba(
  prisma: ClientePush,
  userId: string,
): Promise<ResultadoPush> {
  return enviarPushAUsuario(prisma, userId, {
    titulo: "Notificaciones activadas",
    cuerpo: "Este dispositivo recibirá los avisos de productos y tiendas que sigues.",
    url: "/dashboard/settings/notifications",
    etiqueta: "thp-prueba",
    tipo: "SYSTEM",
  });
}
