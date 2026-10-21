import "server-only";

import { pedirJson } from "./http";

/**
 * ============================================================================
 *  PROVEEDOR · YouTube Data API v3 (GRATIS)
 * ============================================================================
 *  10.000 unidades/día gratis; search.list = 100 unidades
 *  → ~100 búsquedas diarias para siempre.
 *  Devuelve vídeos reales de un nicho: vistas reales = señal.
 * ============================================================================
 */

export interface VideoYoutube {
  titulo: string;
  vistas: number;
  canal: string;
  url: string;
  publicado: string;
}

interface RespuestaYouTube {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
    statistics?: { viewCount?: string };
  }>;
}

/**
 * Busca vídeos recientes de YouTube sobre una consulta.
 * Requiere YOUTUBE_API_KEY (Google Cloud, gratis).
 */
export async function buscarVideosYoutube(
  consulta: string,
  region = "ES",
): Promise<{ datos: VideoYoutube[] | null; error: string | null; latenciaMs: number }> {
  const clave = process.env.YOUTUBE_API_KEY ?? "";
  if (!clave) {
    return { datos: null, error: "YOUTUBE_API_KEY no configurada", latenciaMs: 0 };
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", consulta);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "viewCount");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("regionCode", region);
  url.searchParams.set("key", clave);

  const respuesta = await pedirJson<RespuestaYouTube>(url.toString(), {
    cacheMs: 60 * 60 * 1000, // 1 h: los rankings de views apenas cambian
  });

  if (respuesta.error || !respuesta.datos?.items) {
    return { datos: null, error: respuesta.error ?? "sin resultados", latenciaMs: respuesta.latenciaMs };
  }

  const datos: VideoYoutube[] = respuesta.datos.items
    .filter((item) => item.id?.videoId && item.snippet?.title)
    .map((item) => ({
      titulo: item.snippet!.title!,
      vistas: Number(item.statistics?.viewCount ?? 0),
      canal: item.snippet?.channelTitle ?? "",
      url: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
      publicado: item.snippet?.publishedAt ?? "",
    }));

  return { datos, error: null, latenciaMs: respuesta.latenciaMs };
}

/** Suma real de vistas de los vídeos top (señal de demanda). */
export function vistasTotales(videos: VideoYoutube[]): number {
  return videos.reduce((total, video) => total + (video.vistas || 0), 0);
}
