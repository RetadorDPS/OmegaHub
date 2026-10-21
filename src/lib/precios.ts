/**
 * ============================================================================
 *  HISTÓRICO DE PRECIOS
 * ============================================================================
 *  Cada análisis de tienda guarda una instantánea REAL
 *  del precio de cada producto detectado (PriceHistory).
 *  Con dos o más instantáneas se dibuja la evolución
 *  y se detectan bajadas para avisar.
 * ============================================================================
 */

/** Umbral por defecto para avisar de una bajada (%). */
export const UMBRAL_CAIDA_PRECIO = 5;

/**
 * Porcentaje de caída entre dos precios (positivo = bajada).
 * Ej: 100 → 90 devuelve 10 (una caída del 10 %).
 */
export function caidaPercent(precioAnterior: number, precioNuevo: number): number {
  if (!Number.isFinite(precioAnterior) || !Number.isFinite(precioNuevo)) return 0;
  if (precioAnterior <= 0) return 0;
  return Math.max(0, ((precioAnterior - precioNuevo) / precioAnterior) * 100);
}

/**
 * ¿Es una bajada relevante? Supera el umbral y el precio
 * no es 0 (0 suele significar «sin precio detectado»).
 */
export function esCaidaRelevante(
  precioAnterior: number,
  precioNuevo: number,
  umbralPercent = UMBRAL_CAIDA_PRECIO,
): boolean {
  if (precioNuevo <= 0) return false;
  return caidaPercent(precioAnterior, precioNuevo) >= umbralPercent;
}

/** Formatea una caída para el timeline: "99,99 € → 89,99 € (−10 %)". */
export function describirCaida(precioAnterior: number, precioNuevo: number, moneda = "€"): string {
  const caida = Math.round(caidaPercent(precioAnterior, precioNuevo));
  return `${precioAnterior.toFixed(2)} ${moneda} → ${precioNuevo.toFixed(2)} ${moneda} (−${caida} %)`;
}
