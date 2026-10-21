import "server-only";

import { pedirJson } from "./http";

/**
 * ============================================================================
 *  PROVEEDOR · TikTok Creative Center (VÍA GRIS, OPT-IN)
 * ============================================================================
 *  El panel público de tendencias de TikTok no tiene API
 *  comercial gratuita (la Research API es solo académica).
 *  Este proveedor lee el panel público SIN login: es una
 *  "vía gris" — puede romperse sin aviso — y SOLO se activa
 *  con TIKTOK_CREATIVE_CENTER=true (opt-in explícito).
 *  Nunca se usa en modo "gratis" a menos que el usuario lo
 *  encienda a sabiendas.
 * ============================================================================
 */

export interface TendenciaTikTok {
  titulo: string;
  vistas: number;
  region: string;
  url: string;
}

/** ¿Está activada la vía gris? */
export function viaGrisActiva(): boolean {
  return (process.env.TIKTOK_CREATIVE_CENTER ?? "").toLowerCase() === "true";
}

interface RespuestaCreativa {
  data?: Array<{
    title?: string;
    view_count?: number;
    region?: string;
    url?: string;
  }>;
}

/**
 * Lee las tendencias del Creative Center (vía gris).
 * Requiere TIKTOK_CREATIVE_CENTER=true.
 */
export async function tendenciasTikTok(
  region = "ES",
): Promise<{ datos: TendenciaTikTok[] | null; error: string | null; latenciaMs: number }> {
  if (!viaGrisActiva()) {
    return {
      datos: null,
      error: "Vía gris desactivada (pon TIKTOK_CREATIVE_CENTER=true)",
      latenciaMs: 0,
    };
  }

  const url = `https://ads.tiktok.com/business/creativecenter/trending/videos?region=${region}`;
  const respuesta = await pedirJson<RespuestaCreativa>(url, {
    cacheMs: 30 * 60 * 1000, // 30 min
  });

  if (respuesta.error || !respuesta.datos?.data) {
    return { datos: null, error: respuesta.error ?? "formato inesperado", latenciaMs: respuesta.latenciaMs };
  }

  const datos: TendenciaTikTok[] = respuesta.datos.data
    .filter((item) => item.title)
    .map((item) => ({
      titulo: item.title ?? "",
      vistas: Number(item.view_count ?? 0),
      region: item.region ?? region,
      url: item.url ?? "",
    }));

  return { datos, error: null, latenciaMs: respuesta.latenciaMs };
}
