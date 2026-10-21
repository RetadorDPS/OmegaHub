import "server-only";

import { conCache } from "@/lib/cache";

/**
 * ============================================================================
 *  CLIENTE HTTP PARA PROVEEDORES
 * ============================================================================
 *  Contrato de toda llamada a un proveedor:
 *    { datos: T | null, error: string | null, latenciaMs: number }
 *  NUNCA lanza: un proveedor caído es un dato nulo, no un crash.
 *
 *  Además:
 *   · Caché TTL (5 min por defecto) en lecturas GET.
 *   · Reintentos exponenciales ante 5xx y fallos de red.
 *   · Timeout de 12 s.
 * ============================================================================
 */

export interface RespuestaProveedor<T> {
  datos: T | null;
  error: string | null;
  latenciaMs: number;
}

/** Cabeceras que simulan un navegador real (evita 403 de bots). */
export const CABECERAS_NAVEGADOR: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9",
};

/**
 * Petición JSON a un proveedor.
 *
 * @param url     URL completa
 * @param opciones metodo, cuerpo, cabeceras extra, timeout,
 *                 reintentos y cacheMs (0 desactiva la caché)
 */
export async function pedirJson<T>(
  url: string,
  opciones: {
    metodo?: "GET" | "POST";
    cuerpo?: unknown;
    cabeceras?: Record<string, string>;
    timeoutMs?: number;
    /** Reintentos ante fallo de red o 5xx (por defecto 1). */
    reintentos?: number;
    /** TTL de caché en ms para GET (0 = sin caché). */
    cacheMs?: number;
  } = {},
): Promise<RespuestaProveedor<T>> {
  const metodo = opciones.metodo ?? "GET";

  // Lecturas cacheables por defecto (5 min): las señales de
  // tendencia se miden a diario, no hace falta recalentarlas.
  if (metodo === "GET" && opciones.cacheMs !== 0) {
    const clave = `http:${opciones.cacheMs ?? 300_000}:${url}`;
    return conCache(clave, opciones.cacheMs ?? 300_000, () =>
      pedirJsonSinCache<T>(url, { ...opciones, metodo }),
    ) as Promise<RespuestaProveedor<T>>;
  }

  return pedirJsonSinCache<T>(url, { ...opciones, metodo });
}

/** Petición real con reintentos exponenciales. */
async function pedirJsonSinCache<T>(
  url: string,
  opciones: {
    metodo?: "GET" | "POST";
    cuerpo?: unknown;
    cabeceras?: Record<string, string>;
    timeoutMs?: number;
    reintentos?: number;
  } = {},
): Promise<RespuestaProveedor<T>> {
  const maximosReintentos = opciones.reintentos ?? 1;
  const inicio = Date.now();

  for (let intento = 0; intento <= maximosReintentos; intento += 1) {
    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      opciones.timeoutMs ?? 12_000,
    );

    try {
      const respuesta = await fetch(url, {
        method: opciones.metodo ?? "GET",
        headers: {
          ...CABECERAS_NAVEGADOR,
          ...(opciones.cuerpo ? { "Content-Type": "application/json" } : {}),
          ...opciones.cabeceras,
        },
        body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
        signal: controlador.signal,
        cache: "no-store",
      });

      if (!respuesta.ok) {
        // 5xx: reintento exponencial; 4xx: inmediato (no se arregla).
        if (respuesta.status >= 500 && intento < maximosReintentos) {
          clearTimeout(temporizador);
          await esperar(300 * 2 ** intento);
          continue;
        }
        return {
          datos: null,
          error: `${respuesta.status} ${respuesta.statusText}`.trim(),
          latenciaMs: Date.now() - inicio,
        };
      }

      const datos = (await respuesta.json()) as T;
      return { datos, error: null, latenciaMs: Date.now() - inicio };
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      if (intento < maximosReintentos && !motivo.includes("abort")) {
        clearTimeout(temporizador);
        await esperar(300 * 2 ** intento);
        continue;
      }
      return {
        datos: null,
        error: motivo.includes("abort") ? "tiempo de espera agotado" : motivo,
        latenciaMs: Date.now() - inicio,
      };
    } finally {
      clearTimeout(temporizador);
    }
  }

  return { datos: null, error: "sin respuesta", latenciaMs: Date.now() - inicio };
}

/** Pausa (para el backoff exponencial). */
function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
