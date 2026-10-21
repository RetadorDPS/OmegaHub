import "server-only";

/**
 * ============================================================================
 *  MODO DE COSTES
 * ============================================================================
 *  "gratis"      → solo proveedores sin coste (Shopify, Meta, YouTube,
 *                  RSS de Google Tendencias, importación CSV/JSON).
 *  "produccion"  → además permite los proveedores de pago (SerpAPI,
 *                  Apify) si hay claves configuradas.
 *
 *  Se decide con UNA variable de entorno (MODO_COSTES), sin tocar
 *  código. Por defecto "gratis": el sistema funciona a 0 €/mes.
 * ============================================================================
 */

export type ModoCostes = "gratis" | "produccion";

/** Modalidad de un proveedor según su coste. */
export type ModalidadProveedor = "gratuita" | "pago" | "via-gris";

/** Modo de costes actual (por defecto: gratis). */
export function modoCostes(): ModoCostes {
  const valor = (process.env.MODO_COSTES ?? "gratis").trim().toLowerCase();
  return valor === "produccion" ? "produccion" : "gratis";
}

/** ¿Se permite intentar este proveedor en el modo actual? */
export function modalidadPermitida(modalidad: ModalidadProveedor): boolean {
  if (modoCostes() === "produccion") return true;
  // En modo gratis: gratuitas sí, vías grises solo si se activan
  // explícitamente, y los proveedores de pago nunca.
  return modalidad === "gratuita";
}

/** Explicación legible del modo (para panel de diagnóstico). */
export function explicarModo(): { modo: ModoCostes; nota: string } {
  const modo = modoCostes();
  return {
    modo,
    nota:
      modo === "gratis"
        ? "Modo coste cero: solo proveedores gratuitos. Pon MODO_COSTES=produccion para activar los de pago."
        : "Modo producción: todos los proveedores con clave configurada están activos.",
  };
}
