import { NextResponse } from "next/server";
import { evaluarAlertas } from "@/lib/alerts";
import { autorizarTarea } from "@/lib/cronAuth";
import { logger } from "@/lib/logger";

/**
 * Evaluación y entrega de alertas.
 *
 *   POST /api/cron/alertas
 *   cabecera: x-cron-secret: <CRON_SECRET>   (o sesión de administrador)
 *
 * Cuerpo opcional: { "usuarioId": "...", "enviarCanales": false }
 *
 * Recomendado: cada 30 minutos. `enviarCanales: false` sirve para
 * probar la generación de avisos sin mandar correos ni mensajes reales.
 */
export async function POST(request: Request) {
  const autorizacion = await autorizarTarea(request);
  if (!autorizacion.autorizado) return autorizacion.respuesta!;

  const cuerpo = (await request.json().catch(() => ({}))) as {
    usuarioId?: string;
    enviarCanales?: boolean;
  };

  const inicio = Date.now();
  const resultado = await evaluarAlertas(cuerpo);

  logger.info("alertas_evaluadas", {
    via: autorizacion.via,
    evaluados: resultado.evaluados.productos + resultado.evaluados.tiendas,
    creadas: resultado.creadas,
    entregadasEmail: resultado.entregadas.email,
    duracionMs: Date.now() - inicio,
  });

  return NextResponse.json({ ...resultado, via: autorizacion.via });
}

/** Igual que POST, para planificadores que sólo saben hacer GET. */
export async function GET(request: Request) {
  return POST(request);
}
