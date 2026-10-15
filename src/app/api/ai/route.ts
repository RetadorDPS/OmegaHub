import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getActiveModel, getActiveProvider } from "@/lib/ai";
import { CONSUMO_IA } from "@/lib/aiRouteHelpers";

/**
 * Router único del AI Studio: recibe la herramienta y los parámetros, comprueba
 * la cuota del plan, genera el contenido, lo guarda en el historial y devuelve
 * el resultado junto con los metadatos del proveedor utilizado.
 *
 * POST /api/ai
 * { tool: "AD_COPY" | "VIDEO_SCRIPT" | "BUYER_PERSONA" | "STORE_NAMES" | "PRODUCT_ANALYSIS",
 *   productId?: string, options?: Record<string, unknown> }
 */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cuerpo = (await request.json()) as {
    tool?: string;
    productId?: string;
    options?: Record<string, unknown>;
  };

  if (!cuerpo.tool) return NextResponse.json({ error: "Falta la herramienta" }, { status: 400 });

  // 1) Cuota del plan (FREE: 3 generaciones al día, PRO: 100, BUSINESS: 500).
  try {
    await CONSUMO_IA.comprobarCuota(sesion.user.id, sesion.user.planType, cuerpo.tool);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message, code: "QUOTA_EXCEEDED" }, { status: 402 });
  }

  // 2) Generación.
  const resultado = await CONSUMO_IA.ejecutar(cuerpo.tool, cuerpo.productId, cuerpo.options ?? {});

  // 3) Historial (permite revisar y reutilizar generaciones anteriores).
  const guardado = await prisma.aiGeneration.create({
    data: {
      userId: sesion.user.id,
      productId: cuerpo.productId ?? null,
      tool: cuerpo.tool as never,
      provider: resultado.provider,
      model: resultado.model,
      input: CONSUMO_IA.aJson(cuerpo.options ?? {}),
      output: CONSUMO_IA.aJson(resultado.data),
      promptUsed: resultado.promptUsed,
      tokensUsed: resultado.tokensUsed,
      latencyMs: resultado.latencyMs,
    },
  });

  // 4) Registro de consumo.
  await CONSUMO_IA.consumir(sesion.user.id, cuerpo.tool);

  return NextResponse.json({
    id: guardado.id,
    data: resultado.data,
    provider: resultado.provider,
    model: resultado.model,
    latencyMs: resultado.latencyMs,
    tokensUsed: resultado.tokensUsed,
    providerActivo: getActiveProvider(),
    modeloActivo: getActiveModel(),
  });
}

/** Devuelve el proveedor de IA activo y si hay claves configuradas. */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({
    provider: getActiveProvider(),
    model: getActiveModel(),
    configurado: getActiveProvider() !== "SIMULATED",
  });
}
