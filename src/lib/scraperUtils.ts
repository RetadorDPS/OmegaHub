/**
 * Utilidades compartidas por los scrapers.
 * Se mantienen separadas de `scraper.ts` para poder reutilizarlas en el cliente
 * sin arrastrar dependencias de Node (playwright-core).
 */

/** Normaliza una URL introducida por el usuario (añade https:// si falta). */
export function normalizeStoreUrl(input: string): string {
  let valor = (input ?? "").trim().toLowerCase();
  if (!valor) return "";
  if (!/^https?:\/\//.test(valor)) valor = `https://${valor}`;
  try {
    const url = new URL(valor);
    // Se descarta la ruta: sólo interesa el origen de la tienda.
    return `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** Extrae el dominio efectivo (sin www) de una URL. */
export function extractDomain(input: string): string {
  const normalizada = normalizeStoreUrl(input);
  if (!normalizada) return "";
  try {
    return new URL(normalizada).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Redondea a un número de decimales dado. */
export function round(valor: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}
