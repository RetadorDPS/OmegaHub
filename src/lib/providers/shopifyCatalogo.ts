/**
 * ============================================================================
 *  PROVEEDOR · CATÁLOGO PÚBLICO DE SHOPIFY (GRATIS, SIN CLAVE)
 * ============================================================================
 *  Todo Shopify expone, por defecto, el catálogo público de su escaparate:
 *
 *      https://<tienda>/products.json?limit=250&page=1
 *
 *  Devuelve productos REALES con precio, disponibilidad, fecha de creación y
 *  variantes. No es scraping del HTML ni una estimación: es el mismo JSON que
 *  sirve el propio escaparate.
 *
 *  Lo que puede fallar (y se informa sin disimular):
 *    · tienda con contraseña o bloqueo de bots  → 401/403  → `bloqueado`
 *    · escaparate que no es Shopify o lo prohíbe → 404/HTML → `no-shopify`
 *    · red caída o timeout                      → `red`
 *    · JSON con otra forma                      → `formato`
 *
 *  Este módulo NUNCA lanza: devuelve `ok: false` con el motivo.
 *
 *  Sin `server-only` a propósito: es HTTP + parseo puro y así se puede
 *  comprobar desde los tests y desde `npm run verify:ingesta`.
 * ============================================================================
 */

/** Producto tal y como llega del catálogo público, ya normalizado. */
export interface ProductoCatalogo {
  idExterno: string;
  titulo: string;
  handle: string;
  url: string;
  imagen: string | null;
  precio: number;
  precioComparativo: number | null;
  moneda: string;
  disponible: boolean;
  tipo: string | null;
  proveedor: string | null;
  creadoEn: string | null;
  publicadoEn: string | null;
  variantes: number;
}

/** Motivo por el que una tienda no se ha podido leer. */
export type MotivoFalloCatalogo = "dominio-invalido" | "bloqueado" | "no-shopify" | "formato" | "red";

export interface CatalogoTienda {
  ok: boolean;
  dominio: string;
  nombre: string | null;
  moneda: string;
  productos: ProductoCatalogo[];
  /** Número de productos distintos devueltos. */
  total: number;
  error: string | null;
  motivo: MotivoFalloCatalogo | null;
  latenciaMs: number;
  /**
   * ¿Se ha leído el catálogo entero? Solo entonces tiene sentido dar por
   * desaparecido un producto que no aparece (si cortamos a 250 de 900, no).
   */
  completo: boolean;
  /** URL exacta consultada (para auditoría y capturas). */
  urlConsultada: string;
}

/** Forma mínima del JSON de Shopify que se consume. */
interface JsonShopify {
  products?: Array<{
    id?: number | string;
    title?: string;
    handle?: string;
    product_type?: string;
    vendor?: string;
    created_at?: string;
    published_at?: string | null;
    images?: Array<{ src?: string }>;
    variants?: Array<{
      price?: string | number;
      compare_at_price?: string | number | null;
      available?: boolean;
      sku?: string | null;
    }>;
  }>;
}

/**
 * Normaliza lo que escribe el usuario: acepta `tienda.com`,
 * `https://tienda.com/collections/all` o `www.tienda.com/`.
 * Devuelve null si no hay un dominio utilizable.
 */
export function normalizarDominio(entrada: string): string | null {
  const limpio = entrada.trim().toLowerCase();
  if (!limpio) return null;

  let host = limpio;
  host = host.replace(/^https?:\/\//, "");
  host = host.split(/[/?#]/)[0];
  host = host.replace(/:\d+$/, "");
  host = host.replace(/^www\./, "");
  host = host.replace(/\.$/, "");

  // Un host válido: etiquetas alfanuméricas con guiones y al menos un punto.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
  if (host.length > 253) return null;
  return host;
}

/** URL del catálogo público, con paginación opcional. */
export function construirUrlCatalogo(dominio: string, pagina = 1, limite = 250): string {
  const limpio = normalizarDominio(dominio);
  if (!limpio) throw new Error("Dominio inválido");
  return `https://${limpio}/products.json?limit=${limite}&page=${pagina}`;
}

/** Convierte un precio de Shopify ("24.90" o 24.9) en número seguro. */
function numero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string") {
    const convertido = Number(valor.replace(",", "."));
    return Number.isFinite(convertido) ? convertido : null;
  }
  return null;
}

/** Fecha ISO válida o null (Shopify a veces manda cadenas raras). */
function fecha(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null;
  const convertida = new Date(valor);
  return Number.isNaN(convertida.getTime()) ? null : convertida.toISOString();
}

/**
 * Parsea el JSON del catálogo público.
 *
 * Es una función pura: se prueba con un JSON real sin tocar la red.
 * Descarta productos sin título o sin precio válido (no se inventan ceros).
 */
export function parsearCatalogo(
  datos: unknown,
  dominio: string,
  opciones: { urlBase?: string } = {},
): { productos: ProductoCatalogo[]; motivo: MotivoFalloCatalogo | null } {
  const json = datos as JsonShopify;
  if (!json || typeof json !== "object" || !Array.isArray(json.products)) {
    return { productos: [], motivo: "formato" };
  }

  const base = (opciones.urlBase ?? `https://${dominio}`).replace(/\/$/, "");
  const productos: ProductoCatalogo[] = [];
  const vistos = new Set<string>();

  for (const bruto of json.products) {
    const titulo = typeof bruto.title === "string" ? bruto.title.trim() : "";
    const handle = typeof bruto.handle === "string" ? bruto.handle.trim() : "";
    const precio = numero(bruto.variants?.[0]?.price);
    if (!titulo || precio === null || precio <= 0) continue;

    const clave = handle || titulo.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const comparativo = numero(bruto.variants?.[0]?.compare_at_price);
    const imagen = bruto.images?.[0]?.src;

    productos.push({
      idExterno: String(bruto.id ?? handle ?? titulo),
      titulo,
      handle,
      url: handle ? `${base}/products/${handle}` : base,
      imagen: typeof imagen === "string" && imagen ? imagen : null,
      precio,
      // Solo se guarda un precio "antes" si es mayor: si no, no es una oferta.
      precioComparativo: comparativo !== null && comparativo > precio ? comparativo : null,
      moneda: "EUR",
      disponible: bruto.variants?.[0]?.available !== false,
      tipo: typeof bruto.product_type === "string" && bruto.product_type ? bruto.product_type : null,
      proveedor: typeof bruto.vendor === "string" && bruto.vendor ? bruto.vendor : null,
      creadoEn: fecha(bruto.created_at),
      publicadoEn: fecha(bruto.published_at),
      variantes: bruto.variants?.length ?? 0,
    });
  }

  return { productos, motivo: null };
}

/**
 * Lee el catálogo público de una tienda.
 *
 * @param dominio  dominio o URL de la tienda
 * @param opciones pagina, limite por página, máximo de páginas, timeout
 *                 y `urlBase` (solo pruebas: apunta a un servidor local)
 */
export async function leerCatalogoPublico(
  dominio: string,
  opciones: {
    paginas?: number;
    limite?: number;
    timeoutMs?: number;
    urlBase?: string;
    userAgent?: string;
  } = {},
): Promise<CatalogoTienda> {
  const inicio = Date.now();
  const limpio = normalizarDominio(dominio);
  const { paginas = 1, limite = 250, timeoutMs = 12_000, urlBase } = opciones;

  if (!limpio) {
    return {
      ok: false,
      dominio: dominio.slice(0, 80),
      nombre: null,
      moneda: "EUR",
      productos: [],
      total: 0,
      error: "El dominio no es válido.",
      motivo: "dominio-invalido",
      latenciaMs: 0,
      completo: false,
      urlConsultada: "",
    };
  }

  const base = (urlBase ?? `https://${limpio}`).replace(/\/$/, "");
  const url = `${base}/products.json?limit=${limite}&page=1`;
  const acumulado: ProductoCatalogo[] = [];
  let motivo: MotivoFalloCatalogo | null = null;
  let error: string | null = null;
  let nombre: string | null = null;
  let completo = false;

  for (let pagina = 1; pagina <= Math.min(Math.max(paginas, 1), 4); pagina += 1) {
    try {
      const respuesta = await fetch(`${base}/products.json?limit=${limite}&page=${pagina}`, {
        headers: {
          "User-Agent":
            opciones.userAgent ??
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        redirect: "follow",
      });

      if (respuesta.status === 401 || respuesta.status === 403) {
        motivo = "bloqueado";
        error = `La tienda ha rechazado la lectura (${respuesta.status}). Suele ser una tienda con contraseña o protección anti-bots.`;
        break;
      }
      if (respuesta.status === 404) {
        motivo = "no-shopify";
        error = "No existe /products.json: la tienda no es Shopify o ha desactivado el catálogo público.";
        break;
      }
      if (!respuesta.ok) {
        motivo = "red";
        error = `El servidor respondió ${respuesta.status}.`;
        break;
      }

      const tipoContenido = respuesta.headers.get("content-type") ?? "";
      const texto = await respuesta.text();
      if (tipoContenido.includes("text/html") || /^\s*<!doctype html/i.test(texto)) {
        motivo = "no-shopify";
        error = "El escaparate devolvió HTML en lugar del catálogo público: no es Shopify o lo bloquea.";
        break;
      }

      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        motivo = "formato";
        error = "La respuesta no es JSON válido.";
        break;
      }

      const { productos, motivo: problema } = parsearCatalogo(json, limpio, { urlBase: base });
      if (problema) {
        motivo = problema;
        error = "El JSON no tiene la forma del catálogo público.";
        break;
      }

      nombre = nombre ?? extraerNombre(json);
      acumulado.push(...productos);
      // Una página incompleta significa que el catálogo se ha terminado.
      if (productos.length < limite) {
        completo = true;
        break;
      }
    } catch (excepcion) {
      const esTimeout = excepcion instanceof Error && /timeout|aborted/i.test(excepcion.message);
      motivo = "red";
      error = esTimeout
        ? `La tienda no respondió en ${Math.round(timeoutMs / 1000)} s.`
        : excepcion instanceof Error
          ? excepcion.message
          : String(excepcion);
      break;
    }
  }

  // Deduplicado por handle entre páginas.
  const unicos = new Map<string, ProductoCatalogo>();
  for (const producto of acumulado) unicos.set(producto.handle || producto.titulo.toLowerCase(), producto);

  return {
    ok: motivo === null && unicos.size > 0,
    dominio: limpio,
    nombre,
    moneda: "EUR",
    productos: [...unicos.values()],
    total: unicos.size,
    error: motivo === null && unicos.size === 0 ? "El catálogo no devolvió ningún producto con precio." : error,
    motivo: motivo ?? (unicos.size === 0 ? "formato" : null),
    latenciaMs: Date.now() - inicio,
    completo: motivo === null && completo,
    urlConsultada: url,
  };
}

/** Nombre de la tienda si el JSON lo incluye (algunos temas no lo hacen). */
function extraerNombre(json: unknown): string | null {
  const posible = (json as { shop?: { name?: unknown } }).shop?.name;
  return typeof posible === "string" && posible.trim() ? posible.trim() : null;
}
