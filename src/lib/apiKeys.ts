/**
 * ============================================================================
 *  CLAVES DE LA API PÚBLICA (parte pura)
 * ============================================================================
 *  · La clave completa (`thp_live_…`) se muestra UNA sola vez al crearla.
 *  · En la base de datos solo vive su hash SHA-256 y un prefijo identificable.
 *  · Aquí no se toca Prisma ni la red: todo es verificable con tests.
 * ============================================================================
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Prefijo visible de toda clave de producción. */
export const PREFIJO_CLAVE = "thp_live_";

/** Planes con acceso a la API y sus límites (por clave). */
export const API_PLAN_LIMITS = {
  BUSINESS: { porMinuto: 60, porDia: 5_000 },
  AGENCY: { porMinuto: 300, porDia: 50_000 },
} as const;

export type PlanConApi = keyof typeof API_PLAN_LIMITS;

/** Número máximo de claves activas que puede tener un plan. */
export const CLAVES_POR_PLAN = {
  BUSINESS: 5,
  AGENCY: 20,
} as const;

/** Versión del contrato público. */
export const API_VERSION = "1";

/** ¿El plan contratado incluye API? */
export function planConApi(plan: string | null | undefined): plan is PlanConApi {
  return plan === "BUSINESS" || plan === "AGENCY";
}

/** Límites de la clave según el plan del propietario. */
export function limitesDePlan(plan: PlanConApi) {
  return API_PLAN_LIMITS[plan];
}

/** Hash SHA-256 (hex) de una clave. Nunca se guarda la clave en claro. */
export function hashClave(clave: string): string {
  return createHash("sha256").update(clave, "utf8").digest("hex");
}

/**
 * Genera una clave nueva.
 * `prefijo` es único y sirve para identificarla en la interfaz;
 * `hash` es lo único que se persiste.
 */
export function generarClave(): { clave: string; prefijo: string; hash: string } {
  const secreto = randomBytes(24).toString("base64url");
  const clave = `${PREFIJO_CLAVE}${secreto}`;
  return {
    clave,
    prefijo: `${PREFIJO_CLAVE}${secreto.slice(0, 6)}`,
    hash: hashClave(clave),
  };
}

/** Formato esperado: `thp_live_` + 32 caracteres base64url (o más). */
export function formatoValido(clave: string): boolean {
  return /^thp_live_[A-Za-z0-9_-]{24,64}$/.test(clave);
}

/**
 * Extrae la clave de la petición.
 * Se aceptan las dos formas habituales del sector:
 *   · `Authorization: Bearer thp_live_…`
 *   · `X-API-Key: thp_live_…`
 */
export function extraerClave(request: Request): string | null {
  const autorizacion = request.headers.get("authorization");
  if (autorizacion) {
    const [esquema, valor] = autorizacion.trim().split(/\s+/, 2);
    if (esquema.toLowerCase() === "bearer" && valor) return valor.trim();
  }
  const cabecera = request.headers.get("x-api-key");
  return cabecera?.trim() || null;
}

/** Comparación en tiempo constante (por si se compara una clave conocida). */
export function mismoHash(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/** Esconde el secreto para mostrarlo en registros y en la interfaz. */
export function claveEnmascarada(prefijo: string): string {
  return `${prefijo}••••••••`;
}
