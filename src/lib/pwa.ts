/**
 * ============================================================================
 *  PWA · PIEZAS COMPARTIDAS (cliente y servidor)
 * ============================================================================
 *  Aquí vive lo que necesita saber el navegador y lo que debe poder probarse
 *  con tests: la versión del service worker, el alcance, la política de caché
 *  por tipo de recurso y la validación de suscripciones push.
 *
 *  Regla de oro de esta PWA: **nunca se sirve una página desde caché cuando
 *  hay red**. Los datos del panel cambian a cada minuto y una cifra vieja es
 *  peor que un mensaje de «sin conexión».
 * ============================================================================
 */

/** Versión del service worker: al cambiarla, el anterior se descarta. */
export const VERSION_PWA = "thp-v1";

/** Ruta del service worker (se sirve desde la raíz, sin hashes). */
export const RUTA_SW = "/sw.js";

/** Alcance del service worker: toda la aplicación. */
export const ALCANCE_SW = "/";

/** Ruta que se precarga para la pantalla de «sin conexión». */
export const RUTA_OFFLINE = "/offline";

/** Cachés que gestiona el service worker. */
export const CACHES = {
  estaticos: `${VERSION_PWA}-estaticos`,
  paginas: `${VERSION_PWA}-paginas`,
  imagenes: `${VERSION_PWA}-imagenes`,
} as const;

/**
 * Política de caché por tipo de recurso.
 *
 *  · `estatico`  → cache-first (JS, CSS, fuentes, iconos): inmutables.
 *  · `imagen`    → cache-first con relleno en segundo plano.
 *  · `pagina`    → network-first con respaldo en caché y `/offline`.
 *  · `api`       → solo red (nunca se cachean datos).
 */
export type TipoRecurso = "estatico" | "imagen" | "pagina" | "api";

/** Clasifica una petición por su destino (lo usa el service worker). */
export function clasificarPeticion(destino: string, url: string): TipoRecurso {
  if (destino === "image") return "imagen";
  if (destino === "script" || destino === "style" || destino === "font" || destino === "manifest") {
    return "estatico";
  }
  const ruta = new URL(url, "https://local").pathname;
  if (ruta.startsWith("/api/") || ruta.startsWith("/_next/data/")) return "api";
  if (destino === "document") return "pagina";
  return "estatico";
}

/** ¿La petición puede servirse desde caché? (solo GET y mismo origen) */
export function sePuedeCachear(metodo: string, url: string, origen: string): boolean {
  if (metodo !== "GET") return false;
  try {
    return new URL(url).origin === origen;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
//  Suscripciones push
// ---------------------------------------------------------------------------

/** Suscripción tal y como la entrega `PushSubscription.toJSON()`. */
export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Valida una suscripción push recibida del navegador.
 * Devuelve el motivo del rechazo o `null` si es correcta.
 *
 * Los endpoints siempre deben ser HTTPS: enviar un push a un endpoint
 * `http://` permitiría redirigir las notificaciones a un servidor ajeno.
 */
export function validarSuscripcion(datos: unknown): string | null {
  if (!datos || typeof datos !== "object") return "La suscripción está vacía.";
  const suscripcion = datos as Partial<SuscripcionPush>;

  if (typeof suscripcion.endpoint !== "string" || suscripcion.endpoint.length < 12) {
    return "Falta el endpoint de la suscripción.";
  }
  let url: URL;
  try {
    url = new URL(suscripcion.endpoint);
  } catch {
    return "El endpoint no es una URL válida.";
  }
  if (url.protocol !== "https:") return "El endpoint debe usar HTTPS.";

  const claves = suscripcion.keys;
  if (!claves || typeof claves !== "object") return "Faltan las claves de cifrado (p256dh y auth).";
  if (typeof claves.p256dh !== "string" || claves.p256dh.length < 40) return "La clave p256dh no es válida.";
  if (typeof claves.auth !== "string" || claves.auth.length < 8) return "La clave auth no es válida.";

  return null;
}

/** Etiqueta legible del navegador a partir del user-agent. */
export function navegadorDe(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "Safari (iOS)";
  if (/edg\//.test(ua)) return "Edge";
  if (/chrome|crios/.test(ua) && !/chromium/.test(ua)) return "Chrome";
  if (/firefox/.test(ua)) return "Firefox";
  if (/safari/.test(ua)) return "Safari";
  return "Navegador";
}

/** Recorta el endpoint para mostrarlo sin exponer el token completo. */
export function endpointCorto(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.host}${url.pathname.slice(0, 12)}…`;
  } catch {
    return endpoint.slice(0, 24);
  }
}

/** Cuerpo del push: lo que muestra el sistema operativo. */
export interface CargaPush {
  titulo: string;
  cuerpo: string;
  url: string;
  etiqueta: string;
  tipo: string;
}

/** Construye la carga de una notificación de la campana. */
export function cargaDesdeNotificacion(notificacion: {
  id: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  type: string;
}): CargaPush {
  const mensaje = notificacion.message ?? "";
  return {
    titulo: notificacion.title,
    // Los sistemas operativos truncan: se corta en 140 caracteres de palabra.
    cuerpo: mensaje.length > 140 ? `${mensaje.slice(0, 137).trimEnd()}…` : mensaje,
    url: notificacion.actionUrl || "/dashboard",
    etiqueta: `thp-${notificacion.type.toLowerCase()}`,
    tipo: notificacion.type,
  };
}
