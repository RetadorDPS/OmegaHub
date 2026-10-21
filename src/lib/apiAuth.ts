/**
 * ============================================================================
 *  AUTENTICACIÓN Y CUOTAS DE LA API PÚBLICA
 * ============================================================================
 *  Cada petición a /api/v1 (salvo el índice y OpenAPI) pasa por aquí:
 *
 *   1. Se extrae la clave (`Authorization: Bearer` o `X-API-Key`).
 *   2. Se busca por hash SHA-256; la clave en claro nunca se almacena.
 *   3. Se comprueba que no esté revocada y que el plan incluya API.
 *   4. Se aplican dos ventanas de cuota: por minuto (en memoria) y por día
 *      (persistida en la propia clave, sobrevive a reinicios).
 *
 *  El resultado es una unión discriminada: las rutas no lanzan excepciones,
 *  solo traducen `ok: false` a una respuesta JSON con su código de error.
 * ============================================================================
 */
import prisma from "@/lib/prisma";
import { getDayKey } from "@/lib/utils";
import { consumidas, permitido, segundosParaReinicio } from "@/lib/limite";
import { logger } from "@/lib/logger";
import {
  extraerClave,
  formatoValido,
  hashClave,
  limitesDePlan,
  planConApi,
  type PlanConApi,
} from "@/lib/apiKeys";
import type { PlanType } from "@/types";

/** Usuario propietario de la clave (sin datos sensibles). */
export interface UsuarioApi {
  id: string;
  nombre: string | null;
  email: string;
  plan: PlanType;
}

/** Contexto que recibe cada ruta protegida. */
export interface ContextoApi {
  usuario: UsuarioApi;
  clave: { id: string; nombre: string; prefijo: string };
  limites: { porMinuto: number; porDia: number };
  /** Peticiones de hoy después de contar esta. */
  peticionesHoy: number;
  /** Cabeceras de cuota que se añaden a la respuesta. */
  cabeceras: Record<string, string>;
}

/** Fallo de autenticación o de cuota, listo para serializar. */
export interface FalloApi {
  ok: false;
  estado: number;
  codigo: string;
  mensaje: string;
  cabeceras?: Record<string, string>;
}

export type ResultadoAuth = { ok: true; contexto: ContextoApi } | FalloApi;

/** Cabeceras de cuota para una petición aceptada. */
function cabecerasDeCuota(claveId: string, limites: { porMinuto: number; porDia: number }, peticionesHoy: number) {
  return {
    "X-RateLimit-Limit": String(limites.porMinuto),
    "X-RateLimit-Remaining": String(Math.max(0, limites.porMinuto - consumidas(`api:${claveId}`))),
    "X-RateLimit-Window": "60",
    "X-Quota-Limit": String(limites.porDia),
    "X-Quota-Remaining": String(Math.max(0, limites.porDia - peticionesHoy)),
  };
}

/**
 * Valida la petición y consume una unidad de cuota.
 *
 * @param request Petición entrante de Next.js.
 * @param ruta    Ruta lógica para los registros (`/productos`).
 */
export async function autenticarApi(request: Request, ruta: string): Promise<ResultadoAuth> {
  const clave = extraerClave(request);
  if (!clave) {
    return {
      ok: false,
      estado: 401,
      codigo: "SIN_CLAVE",
      mensaje:
        "Falta la clave de API. Envíala en la cabecera «Authorization: Bearer thp_live_…» o «X-API-Key».",
      cabeceras: { "WWW-Authenticate": 'Bearer realm="trendhunter-pro"' },
    };
  }

  if (!formatoValido(clave)) {
    return {
      ok: false,
      estado: 401,
      codigo: "CLAVE_INVALIDA",
      mensaje: "La clave no tiene el formato esperado (thp_live_…).",
    };
  }

  const registro = await prisma.apiKey.findUnique({
    where: { hash: hashClave(clave) },
    include: {
      user: { select: { id: true, name: true, email: true, planType: true } },
    },
  });

  if (!registro) {
    return {
      ok: false,
      estado: 401,
      codigo: "CLAVE_INVALIDA",
      mensaje: "La clave no existe. Genera una nueva en el panel de API.",
    };
  }

  if (registro.revocadaEn) {
    return {
      ok: false,
      estado: 401,
      codigo: "CLAVE_REVOCADA",
      mensaje: "Esta clave fue revocada. Crea otra en el panel de API.",
    };
  }

  if (!planConApi(registro.user.planType)) {
    return {
      ok: false,
      estado: 403,
      codigo: "PLAN_INSUFICIENTE",
      mensaje: "La API pública requiere el plan Business o Agency.",
    };
  }

  const plan = registro.user.planType as PlanConApi;
  const limites = limitesDePlan(plan);
  const ventana = `api:${registro.id}`;

  if (!permitido(ventana, limites.porMinuto, 60_000)) {
    const espera = segundosParaReinicio(ventana);
    return {
      ok: false,
      estado: 429,
      codigo: "LIMITE_RITMO",
      mensaje: `Has superado el límite de ${limites.porMinuto} peticiones por minuto de tu plan.`,
      cabeceras: {
        "Retry-After": String(espera),
        "X-RateLimit-Limit": String(limites.porMinuto),
        "X-RateLimit-Remaining": "0",
      },
    };
  }

  const hoy = getDayKey();
  const peticionesHoy = (registro.diaUso === hoy ? registro.peticionesHoy : 0) + 1;

  if (peticionesHoy > limites.porDia) {
    return {
      ok: false,
      estado: 429,
      codigo: "CUOTA_DIARIA",
      mensaje: `Has agotado las ${limites.porDia} peticiones diarias de tu plan. Se reinicia a medianoche UTC.`,
      cabeceras: { "X-Quota-Limit": String(limites.porDia), "X-Quota-Remaining": "0" },
    };
  }

  // Contabilidad de uso: no debe tumbar la petición si falla el UPDATE.
  try {
    await prisma.apiKey.update({
      where: { id: registro.id },
      data: {
        peticiones: { increment: 1 },
        peticionesHoy,
        diaUso: hoy,
        ultimoUso: new Date(),
      },
    });
  } catch (error) {
    logger.aviso("api.contabilidad.fallo", {
      clave: registro.prefijo,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("api.peticion", {
    ruta,
    clave: registro.prefijo,
    usuario: registro.user.email,
    plan,
  });

  return {
    ok: true,
    contexto: {
      usuario: {
        id: registro.user.id,
        nombre: registro.user.name,
        email: registro.user.email,
        plan: registro.user.planType,
      },
      clave: { id: registro.id, nombre: registro.nombre, prefijo: registro.prefijo },
      limites,
      peticionesHoy,
      cabeceras: cabecerasDeCuota(registro.id, limites, peticionesHoy),
    },
  };
}
