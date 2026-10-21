/**
 * ============================================================================
 *  CACHÉ EN MEMORIA (por proceso)
 * ============================================================================
 *  Evita golpear a los proveedores con la misma petición
 *  repetida. TTL corto (minutos): los datos de tendencias
 *  son diarios, así que 5 minutos es amplio y fresco.
 *
 *  En despliegue con varios procesos (worker + app) cada
 *  uno tiene su caché: es aceptable (dedupe por proceso).
 *  Con Redis (despliegue escalado) se usaría la caché compartida.
 * ============================================================================
 */

interface Entrada<T> {
  valor: T;
  caduca: number;
}

const almacen = new Map<string, Entrada<unknown>>();

/** Lee o rellena una clave con TTL. */
export async function conCache<T>(
  clave: string,
  ttlMs: number,
  cargar: () => Promise<T>,
): Promise<T> {
  const ahora = Date.now();
  const entrada = almacen.get(clave) as Entrada<T> | undefined;
  if (entrada && entrada.caduca > ahora) return entrada.valor;

  const valor = await cargar();
  almacen.set(clave, { valor, caduca: ahora + ttlMs });
  return valor;
}

/** Tamaño actual (para diagnóstico). */
export function tamanoCache(): number {
  return almacen.size;
}
