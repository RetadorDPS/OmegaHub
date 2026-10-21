import { NextResponse } from "next/server";
import { tendenciasDelDia } from "@/lib/providers/tendenciasGoogle";
import { modalidadPermitida } from "@/lib/modoCostes";
import { listTendenciasDelDia } from "@/lib/dal";

/**
 * Tendencias del día (Google Trends RSS oficial).
 *
 *   GET /api/tendencias/del-dia?geo=ES
 *
 * Dato MEDIDO real, sin clave. En modo costes
 * "gratis" siempre permitido (es gratuito).
 */
export async function GET(request: Request) {
  if (!modalidadPermitida("gratuita")) {
    return NextResponse.json(
      { error: "Proveedor no permitido en el modo de costes actual." },
      { status: 403 },
    );
  }

  const geo = new URL(request.url).searchParams.get("geo") ?? "ES";
  const resultado = await tendenciasDelDia(geo);

  if (resultado.error || !resultado.datos) {
    // Sin conexión con Google: se sirven las tendencias YA GUARDADAS, diciendo
    // de qué día son. Es un dato medido, solo que más antiguo.
    const guardadas = await listTendenciasDelDia(geo, 20);
    if (guardadas.length > 0) {
      return NextResponse.json({
        geo,
        actualizado: guardadas[0].capturada,
        fuente: "google-tendencias-rss",
        tipoDato: "MEDIDO",
        guardado: true,
        aviso: "Google Trends no responde ahora mismo: se muestran las últimas tendencias guardadas.",
        items: guardadas.map((tendencia) => ({
          titulo: tendencia.termino,
          busquedas: tendencia.volumen,
          fuente: "Google Trends",
          url: tendencia.url,
          publicado: tendencia.capturada,
        })),
      });
    }
    return NextResponse.json(
      { error: `Google Trends no respondió: ${resultado.error}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    geo,
    actualizado: new Date().toISOString(),
    fuente: "google-tendencias-rss",
    tipoDato: "MEDIDO",
    items: resultado.datos,
    latenciaMs: resultado.latenciaMs,
  });
}
