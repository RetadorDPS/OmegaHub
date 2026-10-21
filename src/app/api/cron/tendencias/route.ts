import { NextResponse } from "next/server";
import { autorizarTarea } from "@/lib/cronAuth";
import { capturarTendencias } from "@/lib/trendCapture";
import { logger } from "@/lib/logger";

/**
 * Captura de tendencias reales.
 *
 *   POST /api/cron/tendencias
 *   cabecera: x-cron-secret: <CRON_SECRET>   (o sesión de administrador)
 *
 * Cuerpo opcional:
 *   { "productIds": ["..."], "maxProductos": 20, "geo": "ES", "soloRecalcular": false }
 *
 * Pensado para ejecutarse a diario (GitHub Actions). Devuelve el
 * detalle de qué fuentes respondieron en cada producto.
 */
export async function POST(request: Request) {
  const autorizacion = await autorizarTarea(request);
  if (!autorizacion.autorizado) return autorizacion.respuesta!;

  const cuerpo = (await request.json().catch(() => ({}))) as {
    productIds?: string[];
    maxProductos?: number;
    geo?: string;
    soloRecalcular?: boolean;
  };

  const inicio = Date.now();
  const resultado = await capturarTendencias(cuerpo);

  logger.info("captura_diaria", {
    via: autorizacion.via,
    productos: resultado.productos.length,
    omitidos: resultado.omitidos,
    modo: resultado.modo,
    duracionMs: Date.now() - inicio,
  });

  // Sin fuentes configuradas se responde 503: es un problema
  // de despliegue, no un resultado válido, y así el
  // planificador puede avisar.
  const estado = resultado.modo === "sin-fuentes" ? 503 : 200;
  return NextResponse.json(
    {
      ...resultado,
      via: autorizacion.via,
      resumen: {
        productosActualizados: resultado.productos.length,
        omitidos: resultado.omitidos,
        doradas: resultado.productos.filter((producto) => producto.score >= 80).length,
      },
    },
    { status: estado },
  );
}

/** Igual que POST, para planificadores que sólo saben hacer GET. */
export async function GET(request: Request) {
  return POST(request);
}
