import "server-only";

import { modalidadPermitida, type ModalidadProveedor } from "@/lib/modoCostes";

/**
 * ============================================================================
 *  REGISTRO DE PROVEEDORES
 * ============================================================================
 *  Fuentes de datos reales, cada una con su modalidad de
 *  coste. El modo de costes (MODO_COSTES) decide cuáles se
 *  intentan: en "gratis" solo las gratuitas (y las vías
 *  grises activadas a mano); en "produccion" todas.
 * ============================================================================
 */

export interface ProveedorInfo {
  id: string;
  nombre: string;
  modalidad: ModalidadProveedor;
  descripcion: string;
  /** ¿Hay clave/requisito configurado y la vía está activa? */
  disponible: boolean;
}

/**
 * Los 8 proveedores del sistema. `disponible` refleja el
 * estado REAL (clave presente, vía gris activada…).
 */
export function proveedoresRegistrados(): ProveedorInfo[] {
  return [
    {
      id: "shopify",
      nombre: "Catálogo público de Shopify",
      modalidad: "gratuita",
      descripcion: "Catálogo real de tiendas Shopify (/products.json).",
      disponible: true,
    },
    {
      id: "meta-ads",
      nombre: "Meta Ad Library",
      modalidad: "gratuita",
      descripcion: "Anuncios públicos de Facebook/Instagram.",
      disponible: Boolean(process.env.FACEBOOK_ACCESS_TOKEN),
    },
    {
      id: "youtube",
      nombre: "YouTube Data API v3",
      modalidad: "gratuita",
      descripcion: "Búsquedas y vistas reales (~100/día gratis).",
      disponible: Boolean(process.env.YOUTUBE_API_KEY),
    },
    {
      id: "google-tendencias-rss",
      nombre: "Google Trends (RSS oficial)",
      modalidad: "gratuita",
      descripcion: "Tendencias del día sin clave.",
      disponible: true,
    },
    {
      id: "importacion-csv",
      nombre: "Importación CSV/JSON",
      modalidad: "gratuita",
      descripcion: "Datos del usuario, con formato europeo.",
      disponible: true,
    },
    {
      id: "google-trends",
      nombre: "Google Trends (SerpAPI)",
      modalidad: "pago",
      descripcion: "Series históricas vía SerpAPI (desde 75 $/mes).",
      disponible: Boolean(process.env.SERPAPI_KEY),
    },
    {
      id: "tiktok",
      nombre: "TikTok (Apify)",
      modalidad: "pago",
      descripcion: "Vídeo a vídeo vía actor de Apify (desde 39 $/mes).",
      disponible: Boolean(process.env.APIFY_TOKEN),
    },
    {
      id: "tiktok-creative-center",
      nombre: "TikTok Creative Center",
      modalidad: "via-gris",
      descripcion: "Panel público sin login; puede romperse.",
      disponible:
        (process.env.TIKTOK_CREATIVE_CENTER ?? "").toLowerCase() === "true",
    },
  ];
}

/** Proveedores permitidos en el modo de costes actual. */
export function proveedoresPermitidos(): ProveedorInfo[] {
  return proveedoresRegistrados().filter((p) =>
    modalidadPermitida(p.modalidad),
  );
}

/** ¿Al menos una señal externa está disponible? */
export function hayFuentesVivas(): boolean {
  return proveedoresPermitidos().some((p) => p.disponible);
}
