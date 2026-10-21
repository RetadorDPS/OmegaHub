/**
 * ============================================================================
 *  PROVEEDOR · Google Trends RSS (GRATIS, SIN CLAVE)
 * ============================================================================
 *  RSS oficial de tendencias del día por país:
 *      https://trends.google.com/trending/rss?geo=ES
 *  Sin clave, sin cuota, dato MEDIDO real.
 * ============================================================================
 */

export interface TendenciaGoogle {
  titulo: string;
  busquedas: string; // volumen aproximado ("1M+", "100K+")
  fuente: string; // "Google Trends"
  url: string;
  publicado: string;
}

const RSS = "https://trends.google.com/trending/rss";

/**
 * Descarga y parsea el RSS oficial de tendencias.
 * Devuelve null (nunca lanza) si no hay red o el formato cambia.
 */
export async function tendenciasDelDia(
  geo = "ES",
): Promise<{ datos: TendenciaGoogle[] | null; error: string | null; latenciaMs: number }> {
  const inicio = Date.now();
  try {
    const respuesta = await fetch(`${RSS}?geo=${geo}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!respuesta.ok) {
      return { datos: null, error: `${respuesta.status}`, latenciaMs: Date.now() - inicio };
    }
    const texto = await respuesta.text();
    return { datos: parsearRssTendencias(texto), error: null, latenciaMs: Date.now() - inicio };
  } catch (error) {
    return {
      datos: null,
      error: error instanceof Error ? error.message : String(error),
      latenciaMs: Date.now() - inicio,
    };
  }
}

/**
 * Parseador del RSS de tendencias (pure function: testeable).
 * Formato: <item> con <title>, <ht:picture>, <ht:news_item>…
 * El volumen viene en <ht:approx_traffic> ("1,000,000+").
 */
export function parsearRssTendencias(xml: string): TendenciaGoogle[] {
  const items: TendenciaGoogle[] = [];
  const patron = /<item>([\s\S]*?)<\/item>/g;
  let grupo: RegExpExecArray | null;

  while ((grupo = patron.exec(xml)) !== null) {
    const bloque = grupo[1];
    const titulo = entre(bloque, "<title>", "</title>");
    const trafico = entre(bloque, "<ht:approx_traffic>", "</ht:approx_traffic>");
    if (!titulo) continue;

    items.push({
      titulo: limpiarXml(titulo),
      busquedas: trafico ? normalizarVolumen(trafico) : "—",
      fuente: "Google Trends",
      url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(limpiarXml(titulo))}`,
      publicado: entre(bloque, "<pubDate>", "</pubDate>") ?? "",
    });
  }

  return items;
}

/** Texto entre dos marcas (primera ocurrencia). */
function entre(texto: string, inicio: string, fin: string): string | undefined {
  const i = texto.indexOf(inicio);
  if (i === -1) return undefined;
  const j = texto.indexOf(fin, i + inicio.length);
  if (j === -1) return undefined;
  return texto.slice(i + inicio.length, j);
}

/** Limpia entidades XML básicas. */
function limpiarXml(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
}

/** "1,000,000+" → "1M+"; "50,000+" → "50K+". */
function normalizarVolumen(trafico: string): string {
  const numero = Number(trafico.replace(/[^\d]/g, ""));
  if (!Number.isFinite(numero)) return trafico;
  if (numero >= 1_000_000) return `${Math.round(numero / 1_000_000)}M+`;
  if (numero >= 1_000) return `${Math.round(numero / 1_000)}K+`;
  return `${numero}+`;
}
