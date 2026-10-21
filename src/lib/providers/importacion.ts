import "server-only";

/**
 * ============================================================================
 *  IMPORTADOR CSV / JSON (LOCAL, GRATUITO)
 * ============================================================================
 *  El usuario sube sus propios datos de tendencias (ej. una
 *  exportación de Google Trends) y se convierten en puntos
 *  IMPORTADOS con procedencia real: fuente + fecha + tipo.
 *
 *  · CSV: separador ; o , y DECIMAL EUROPEO (1.234,56).
 *  · JSON: array de objetos con campos conocidos.
 *  Nunca lanza: devuelve { puntos, error }.
 * ============================================================================
 */

export interface PuntoImportado {
  date: string; // ISO
  googleSearchVolume?: number;
  tiktokViews?: number;
  youtubeViews?: number;
  metaAdsCount?: number;
  shopifyStoresUsing?: number;
}

export interface ResultadoImportacion {
  puntos: PuntoImportado[];
  error: string | null;
}

/**
 * Interpreta un número con formato europeo (1.234,56) o
 * inglés (1,234.56). Devuelve 0 si no se entiende.
 */
export function parsearNumero(texto: string): number {
  const limpio = texto.trim().replace(/[€$%\s]/g, "");
  if (!limpio) return 0;

  // Europeo: punto de miles, coma decimal.
  const pareceEuropeo = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio) || /,\d{1,2}$/.test(limpio);
  if (pareceEuropeo) {
    return Number(limpio.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(limpio.replace(/,/g, "")) || 0;
}

/** Cabeceras que reconoce el importador (por idioma). */
const ALIAS: Record<string, keyof PuntoImportado> = {
  date: "date",
  fecha: "date",
  "google search volume": "googleSearchVolume",
  google: "googleSearchVolume",
  busquedas: "googleSearchVolume",
  search: "googleSearchVolume",
  tiktok: "tiktokViews",
  "tiktok views": "tiktokViews",
  youtube: "youtubeViews",
  "youtube views": "youtubeViews",
  meta: "metaAdsCount",
  "meta ads": "metaAdsCount",
  anuncios: "metaAdsCount",
  shopify: "shopifyStoresUsing",
  tiendas: "shopifyStoresUsing",
  "shopify stores": "shopifyStoresUsing",
};

/** Parseador de CSV (delimitador ; o , auto-detectado). */
export function parsearCSV(texto: string): ResultadoImportacion {
  try {
    const lineas = texto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lineas.length < 2) {
      return { puntos: [], error: "El CSV necesita cabecera y al menos una fila." };
    }

    const delimitador = lineas[0].includes(";") ? ";" : ",";
    const cabeceras = lineas[0]
      .split(delimitador)
      .map((h) => h.trim().toLowerCase())
      .map((h) => ALIAS[h] ?? h);

    if (!cabeceras.includes("date")) {
      return { puntos: [], error: "Falta una columna de fecha (date/fecha)." };
    }

    const puntos: PuntoImportado[] = [];
    for (const linea of lineas.slice(1)) {
      const celdas = linea.split(delimitador).map((c) => c.trim());
      const punto: PuntoImportado = { date: celdas[cabeceras.indexOf("date")] ?? "" };
      if (!punto.date) continue;

      for (let i = 0; i < cabeceras.length; i += 1) {
        const campo = cabeceras[i];
        if (campo === "date") continue;
        if (["googleSearchVolume", "tiktokViews", "youtubeViews", "metaAdsCount", "shopifyStoresUsing"].includes(campo)) {
          (punto as unknown as Record<string, unknown>)[campo] = parsearNumero(celdas[i] ?? "0");
        }
      }
      puntos.push(punto);
    }

    return { puntos, error: puntos.length ? null : "No se pudieron leer filas válidas." };
  } catch (error) {
    return { puntos: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/** Parser de JSON (array de objetos con los mismos campos). */
export function parsearJSON(texto: string): ResultadoImportacion {
  try {
    const crudo = JSON.parse(texto) as unknown;
    const lista = Array.isArray(crudo) ? crudo : (crudo as { datos?: unknown[] }).datos;
    if (!Array.isArray(lista)) {
      return { puntos: [], error: "El JSON debe ser un array de puntos." };
    }

    const puntos: PuntoImportado[] = [];
    for (const fila of lista) {
      if (!fila || typeof fila !== "object") continue;
      const objeto = fila as Record<string, unknown>;
      const fecha = String(objeto.date ?? objeto.fecha ?? "");
      if (!fecha) continue;
      puntos.push({
        date: fecha,
        googleSearchVolume: Number(objeto.googleSearchVolume ?? objeto.google ?? objeto.busquedas ?? 0) || 0,
        tiktokViews: Number(objeto.tiktokViews ?? objeto.tiktok ?? 0) || 0,
        youtubeViews: Number(objeto.youtubeViews ?? objeto.youtube ?? 0) || 0,
        metaAdsCount: Number(objeto.metaAdsCount ?? objeto.meta ?? objeto.anuncios ?? 0) || 0,
        shopifyStoresUsing: Number(objeto.shopifyStoresUsing ?? objeto.tiendas ?? objeto.shopify ?? 0) || 0,
      });
    }

    return { puntos, error: puntos.length ? null : "No se pudieron leer filas válidas." };
  } catch (error) {
    return { puntos: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/** Detecta el formato por la extensión y parsea. */
export function importarTexto(texto: string, formato: "csv" | "json"): ResultadoImportacion {
  return formato === "json" ? parsearJSON(texto) : parsearCSV(texto);
}
