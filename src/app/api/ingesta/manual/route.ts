import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ingerirTendencias, ingerirTienda, ingerirTodo } from "@/lib/ingesta";
import { permitido, segundosParaReinicio } from "@/lib/limite";
import { logger } from "@/lib/logger";

/**
 * Lectura manual desde la interfaz («Actualizar ahora»).
 *
 *   POST /api/ingesta/manual
 *   sesión obligatoria
 *
 * Cuerpo:
 *   { "accion": "tienda",    "dominio": "mitienda.com" }
 *   { "accion": "tendencias" }
 *   { "accion": "todo" }
 *
 * Límites: 6 lecturas de tienda por hora y 6 de tendencias por hora y usuario.
 * Nunca lanza: devuelve el motivo exacto si la fuente no responde.
 */
export async function POST(request: Request) {
  const sesion = await auth();
  const usuarioId = sesion?.user?.id;
  if (!usuarioId) {
    return NextResponse.json({ error: "Inicia sesión para actualizar los datos." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as {
    accion?: "tienda" | "tendencias" | "todo";
    dominio?: string;
    geo?: string;
  };

  const accion = cuerpo.accion ?? "tienda";
  const clave = `ingesta:${usuarioId}:${accion}`;
  if (!permitido(clave, 6, 3_600_000)) {
    return NextResponse.json(
      {
        error: `Has hecho muchas lecturas seguidas. Vuelve a intentarlo en ${Math.ceil(segundosParaReinicio(clave) / 60)} min.`,
      },
      { status: 429 },
    );
  }

  const inicio = Date.now();

  if (accion === "tendencias") {
    const tendencias = await ingerirTendencias(cuerpo.geo ?? "ES");
    logger.info("ingesta_manual_tendencias", {
      usuarioId,
      ok: tendencias.ok,
      terminos: tendencias.terminos,
      duracionMs: Date.now() - inicio,
    });
    return NextResponse.json(
      { ...tendencias, duracionMs: Date.now() - inicio },
      { status: tendencias.ok ? 200 : 503 },
    );
  }

  if (accion === "todo") {
    const resultado = await ingerirTodo({ geo: cuerpo.geo ?? "ES" });
    logger.info("ingesta_manual_todo", {
      usuarioId,
      tiendas: resultado.tiendas.length,
      duracionMs: resultado.duracionMs,
    });
    return NextResponse.json({ ...resultado, duracionMs: Date.now() - inicio });
  }

  const dominio = (cuerpo.dominio ?? "").trim();
  if (!dominio) {
    return NextResponse.json({ error: "Escribe el dominio de una tienda Shopify." }, { status: 400 });
  }

  const resultado = await ingerirTienda(dominio, { paginas: 3 });
  logger.info("ingesta_manual_tienda", {
    usuarioId,
    dominio: resultado.dominio,
    ok: resultado.ok,
    motivo: resultado.motivo,
    duracionMs: Date.now() - inicio,
  });

  return NextResponse.json({ ...resultado, duracionMs: Date.now() - inicio }, { status: resultado.ok ? 200 : 422 });
}
