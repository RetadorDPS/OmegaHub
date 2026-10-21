import { NextResponse } from "next/server";
import { autorizarTarea } from "@/lib/cronAuth";
import { ingerirTendencias, ingerirTienda, ingerirTodo } from "@/lib/ingesta";
import { logger } from "@/lib/logger";

/**
 * Ingesta de datos reales sin claves.
 *
 *   POST /api/ingesta
 *   cabecera: x-cron-secret: <CRON_SECRET>   (o sesión de administrador)
 *
 * Cuerpo (todos los campos opcionales):
 *   {
 *     "dominios": ["mitienda.com"],  // lee solo esas tiendas
 *     "geo": "ES",                   // país de Google Trends
 *     "tendencias": true,            // leer también las tendencias del día
 *     "paginas": 3,                  // páginas del catálogo por tienda (1–4)
 *     "maxTiendas": 8                // si no se pasan dominios
 *   }
 *
 * Respuesta: qué se ha leído, qué ha cambiado y qué ha fallado (con motivo).
 * Recomendado: cada 6 horas (GitHub Actions u `curl` desde cron-job.org).
 */
export async function POST(request: Request) {
  const autorizacion = await autorizarTarea(request);
  if (!autorizacion.autorizado) return autorizacion.respuesta!;

  const cuerpo = (await request.json().catch(() => ({}))) as {
    dominios?: string[];
    geo?: string;
    tendencias?: boolean;
    paginas?: number;
    maxTiendas?: number;
    soloTendencias?: boolean;
  };

  const inicio = Date.now();

  // Modo ligero: solo tendencias (no toca tiendas).
  if (cuerpo.soloTendencias) {
    const tendencias = await ingerirTendencias(cuerpo.geo ?? "ES");
    logger.info("api_ingesta_tendencias", {
      via: autorizacion.via,
      ok: tendencias.ok,
      terminos: tendencias.terminos,
      coincidencias: tendencias.coincidencias.length,
      duracionMs: Date.now() - inicio,
    });
    return NextResponse.json(
      { ...tendencias, via: autorizacion.via },
      { status: tendencias.ok ? 200 : 503 },
    );
  }

  // Un solo dominio: se devuelve el detalle completo (útil desde la interfaz).
  if (cuerpo.dominios?.length === 1 && !cuerpo.tendencias) {
    const resultado = await ingerirTienda(cuerpo.dominios[0], { paginas: cuerpo.paginas });
    logger.info("api_ingesta_tienda", {
      via: autorizacion.via,
      dominio: resultado.dominio,
      ok: resultado.ok,
      motivo: resultado.motivo,
      duracionMs: Date.now() - inicio,
    });
    return NextResponse.json({ ...resultado, via: autorizacion.via }, { status: resultado.ok ? 200 : 422 });
  }

  const resultado = await ingerirTodo({
    dominios: cuerpo.dominios,
    geo: cuerpo.geo,
    tendencias: cuerpo.tendencias,
    paginas: cuerpo.paginas,
    maxTiendas: cuerpo.maxTiendas,
  });

  logger.info("api_ingesta", {
    via: autorizacion.via,
    tiendas: resultado.tiendas.length,
    tendencias: resultado.tendencias?.terminos ?? 0,
    confianzas: resultado.confianzasRecalculadas,
    duracionMs: resultado.duracionMs,
  });

  return NextResponse.json({ ...resultado, via: autorizacion.via });
}

/** Igual que POST, para planificadores que solo saben hacer GET. */
export async function GET(request: Request) {
  return POST(request);
}
