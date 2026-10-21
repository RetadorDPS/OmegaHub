/**
 * ============================================================================
 *  CONTRATO COMÚN DE LA API PÚBLICA v1
 * ============================================================================
 *  Todas las respuestas comparten la misma envoltura:
 *
 *    {
 *      "data": …,
 *      "meta": { "version": "1", "generadoEn": "…", "total": 20, … }
 *    }
 *
 *  y todos los errores el mismo cuerpo:
 *
 *    { "error": { "codigo": "SIN_CLAVE", "mensaje": "…" } }
 *
 *  La API es de solo lectura, admite CORS y expone cabeceras de cuota.
 * ============================================================================
 */
import { NextResponse } from "next/server";
import { API_VERSION } from "@/lib/apiKeys";

/** Cabeceras CORS: la API puede consumirse desde cualquier origen. */
export const CABECERAS_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key",
  "Access-Control-Max-Age": "86400",
  "X-API-Version": API_VERSION,
  "Cache-Control": "no-store",
};

/** Respuesta correcta con la envoltura estándar. */
export function respuestaApi(
  datos: unknown,
  meta: Record<string, unknown> = {},
  estado = 200,
  cabeceras: Record<string, string> = {},
) {
  return NextResponse.json(
    {
      data: datos,
      meta: {
        version: API_VERSION,
        generadoEn: new Date().toISOString(),
        fuente: "TrendHunter Pro",
        ...meta,
      },
    },
    { status: estado, headers: { ...CABECERAS_CORS, ...cabeceras } },
  );
}

/** Error con código estable y mensaje legible. */
export function errorApi(
  estado: number,
  codigo: string,
  mensaje: string,
  cabeceras: Record<string, string> = {},
) {
  return NextResponse.json(
    {
      error: { codigo, mensaje },
      meta: { version: API_VERSION, generadoEn: new Date().toISOString() },
    },
    { status: estado, headers: { ...CABECERAS_CORS, ...cabeceras } },
  );
}

/** Respuesta al preflight CORS (OPTIONS). */
export function preflightApi() {
  return new Response(null, { status: 204, headers: CABECERAS_CORS });
}

/** Resultado de leer un parámetro de la URL. */
export type Parametro<T> = { ok: true; valor: T } | { ok: false; mensaje: string };

/** Entero opcional con rango y valor por defecto. */
export function leerEntero(
  url: URL,
  nombre: string,
  opciones: { min?: number; max?: number; defecto?: number } = {},
): Parametro<number | undefined> {
  const crudo = url.searchParams.get(nombre);
  if (crudo === null || crudo.trim() === "") return { ok: true, valor: opciones.defecto };

  const valor = Number(crudo);
  if (!Number.isInteger(valor)) {
    return { ok: false, mensaje: `El parámetro «${nombre}» debe ser un número entero.` };
  }
  if (opciones.min !== undefined && valor < opciones.min) {
    return { ok: false, mensaje: `El parámetro «${nombre}» debe ser mayor o igual que ${opciones.min}.` };
  }
  if (opciones.max !== undefined && valor > opciones.max) {
    return { ok: false, mensaje: `El parámetro «${nombre}» debe ser menor o igual que ${opciones.max}.` };
  }
  return { ok: true, valor };
}

/** Número decimal opcional con rango. */
export function leerDecimal(
  url: URL,
  nombre: string,
  opciones: { min?: number; max?: number } = {},
): Parametro<number | undefined> {
  const crudo = url.searchParams.get(nombre);
  if (crudo === null || crudo.trim() === "") return { ok: true, valor: undefined };

  const valor = Number(crudo);
  if (!Number.isFinite(valor)) {
    return { ok: false, mensaje: `El parámetro «${nombre}» debe ser un número.` };
  }
  if (opciones.min !== undefined && valor < opciones.min) {
    return { ok: false, mensaje: `El parámetro «${nombre}» debe ser mayor o igual que ${opciones.min}.` };
  }
  if (opciones.max !== undefined && valor > opciones.max) {
    return { ok: false, mensaje: `El parámetro «${nombre}» debe ser menor o igual que ${opciones.max}.` };
  }
  return { ok: true, valor };
}

/** Valor de una lista cerrada (case-insensitive). */
export function leerOpcion<T extends string>(
  url: URL,
  nombre: string,
  permitidos: readonly T[],
): Parametro<T | undefined> {
  const crudo = url.searchParams.get(nombre);
  if (crudo === null || crudo.trim() === "") return { ok: true, valor: undefined };
  const encontrado = permitidos.find((valor) => valor.toLowerCase() === crudo.trim().toLowerCase());
  if (!encontrado) {
    return {
      ok: false,
      mensaje: `Valor no válido para «${nombre}». Permitidos: ${permitidos.join(", ")}.`,
    };
  }
  return { ok: true, valor: encontrado };
}

/** Texto libre recortado con longitud máxima. */
export function leerTexto(url: URL, nombre: string, maximo = 120): string | undefined {
  const crudo = url.searchParams.get(nombre)?.trim();
  if (!crudo) return undefined;
  return crudo.slice(0, maximo);
}

/** Primer fallo de una lista de parámetros, o null si todos son válidos. */
export function primerFallo(...parametros: Parametro<unknown>[]): string | null {
  for (const parametro of parametros) {
    if (!parametro.ok) return parametro.mensaje;
  }
  return null;
}
