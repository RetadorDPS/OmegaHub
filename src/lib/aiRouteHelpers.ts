import { analyzeProduct, generateAdCopies, generateBuyerPersona, generateStoreNames, generateVideoScript } from "@/lib/ai";
import { getProductDetail } from "@/lib/dal";
import { toJsonInput } from "@/lib/json";
import { checkAndConsume } from "@/lib/planLimits";
import type { PlanType } from "@/types";

/**
 * Utilidades compartidas por las rutas del AI Studio.
 * Evita duplicar la lógica de cuota y de despacho por herramienta.
 */
export const CONSUMO_IA = {
  /** Comprueba y consume la cuota de generaciones de IA del plan. */
  async comprobarCuota(userId: string, plan: PlanType, tool: string) {
    await checkAndConsume(userId, plan, "AI_GENERATION", { herramienta: tool });
  },

  /** Registra el consumo (se llama tras una generación correcta). */
  async consumir(userId: string, tool: string) {
    const { consumeQuota } = await import("@/lib/planLimits");
    await consumeQuota(userId, "AI_GENERATION", { herramienta: tool });
  },

  /** Convierte cualquier valor en JSON válido para Prisma. */
  aJson(valor: unknown) {
    return toJsonInput(valor) ?? {};
  },

  /**
   * Ejecuta la herramienta solicitada.
   * Las herramientas que requieren producto cargan su detalle desde la base
   * de datos para alimentar el prompt con datos reales.
   */
  async ejecutar(tool: string, productId: string | undefined, options: Record<string, unknown>) {
    // Las herramientas de nombres de tienda pueden funcionar sin producto.
    if (tool === "STORE_NAMES") {
      const producto = productId ? (await getProductDetail(productId))?.product ?? null : null;
      return generateStoreNames(
        {
          nicho: String(options.nicho ?? producto?.nicheTag ?? "e-commerce"),
          estilo: options.estilo ? String(options.estilo) : undefined,
          idioma: options.idioma ? String(options.idioma) : undefined,
          cantidad: options.cantidad ? Number(options.cantidad) : undefined,
        },
        producto,
      );
    }

    if (!productId) throw new Error("Esta herramienta necesita un producto de referencia.");
    const detalle = await getProductDetail(productId);
    if (!detalle) throw new Error("El producto indicado no existe.");
    const producto = detalle.product;

    switch (tool) {
      case "AD_COPY":
        return generateAdCopies(producto, {
          plataforma: options.plataforma ? String(options.plataforma) : undefined,
          tono: options.tono ? String(options.tono) : undefined,
          publico: options.publico ? String(options.publico) : undefined,
          cantidad: options.cantidad ? Number(options.cantidad) : undefined,
        });
      case "VIDEO_SCRIPT":
        return generateVideoScript(producto, {
          duracion: (options.duracion ? Number(options.duracion) : 30) as 15 | 30 | 60,
          plataforma: options.plataforma ? String(options.plataforma) : undefined,
          estilo: options.estilo ? String(options.estilo) : undefined,
        });
      case "BUYER_PERSONA":
        return generateBuyerPersona(producto, {
          pais: options.pais ? String(options.pais) : undefined,
          rangoEdad: options.rangoEdad ? String(options.rangoEdad) : undefined,
          genero: options.genero ? String(options.genero) : undefined,
        });
      case "PRODUCT_ANALYSIS":
        return analyzeProduct(producto);
      default:
        throw new Error(`Herramienta desconocida: ${tool}`);
    }
  },
};
