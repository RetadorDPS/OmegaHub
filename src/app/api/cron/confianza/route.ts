import { NextResponse } from "next/server";
import { autorizarTarea } from "@/lib/cronAuth";
import { logger } from "@/lib/logger";
import { revisarConfianza } from "@/lib/mantenimientoConfianza";

/**
 * Revisión del sello de confianza.
 *
 *   POST /api/cron/confianza
 *   cabecera: x-cron-secret: <CRON_SECRET>   (o sesión de administrador)
 *
 * Qué hace: recalcula el nivel de cada producto con la evidencia guardada. Si
 * una medición ha caducado o las fuentes se contradicen, el producto baja de
 * nivel, deja de ser oportunidad dorada y avisa a quien lo sigue.
 *
 * No crea pantallas ni datos nuevos: solo corrige lo que ya no se sostiene.
 * Se ejecuta solo dentro de la ingesta; este endpoint es para lanzarlo a mano.
 */
export async function POST(request: Request) {
  const autorizacion = await autorizarTarea(request);
  if (!autorizacion.autorizado) return autorizacion.respuesta!;

  const cuerpo = (await request.json().catch(() => ({}))) as { simular?: boolean };
  const inicio = Date.now();

  const resumen = await revisarConfianza({ escribir: !cuerpo.simular, avisar: !cuerpo.simular });

  logger.info("cron_confianza", {
    via: autorizacion.via,
    simulado: Boolean(cuerpo.simular),
    total: resumen.total,
    verificados: resumen.verificados,
    degradados: resumen.degradados.length,
    caducados: resumen.caducados.length,
    duracionMs: Date.now() - inicio,
  });

  return NextResponse.json({ ...resumen, via: autorizacion.via, duracionMs: Date.now() - inicio });
}

/** Igual que POST, para planificadores que solo saben hacer GET. */
export async function GET(request: Request) {
  return POST(request);
}
