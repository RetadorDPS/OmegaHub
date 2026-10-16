import { auth } from "@/auth";
import { listAiGenerations, listProducts } from "@/lib/dal";
import { getActiveModel, getActiveProvider } from "@/lib/ai";
import { getUsage } from "@/lib/planLimits";
import { PLAN_LIMITS } from "@/lib/constants";
import { PageHeading } from "@/components/domain/page-heading";
import { AiStudio, type GenerationHistoryItem } from "@/components/domain/ai-studio";
import { Badge } from "@/components/ui/badge";
import type { AiToolType } from "@/types";

export const metadata = {
  title: "AI Studio",
  description: "Genera copys, guiones de vídeo, buyer personas, nombres de tienda y análisis de producto con IA.",
};

/** Extracto legible del resultado guardado (para el historial). */
function extraerExtracto(salida: unknown): string {
  if (Array.isArray(salida)) {
    const primero = salida[0] as Record<string, unknown> | undefined;
    if (!primero) return "Sin resultados";
    return String(primero.headline ?? primero.name ?? primero.hook ?? JSON.stringify(primero).slice(0, 140));
  }
  if (salida && typeof salida === "object") {
    const objeto = salida as Record<string, unknown>;
    const valor = objeto.headline ?? objeto.name ?? objeto.concept ?? objeto.resumen;
    if (typeof valor === "string") return valor;
  }
  return JSON.stringify(salida).slice(0, 160);
}

/** Módulo 9 · AI Studio. */
export default async function AiStudioPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const plan = sesion.user.planType;
  const [productos, generaciones, usoIa] = await Promise.all([
    listProducts({ sort: "best-score", pageSize: 60 }),
    listAiGenerations(sesion.user.id),
    getUsage(sesion.user.id, "AI_GENERATION"),
  ]);

  const historial: GenerationHistoryItem[] = generaciones.map((generacion) => ({
    id: generacion.id,
    tool: generacion.tool as AiToolType,
    provider: generacion.provider,
    model: generacion.model,
    tokensUsed: generacion.tokensUsed,
    latencyMs: generacion.latencyMs,
    createdAt: generacion.createdAt,
    productTitle: generacion.productTitle,
    preview: extraerExtracto(generacion.output),
  }));

  const proveedorActivo = getActiveProvider();

  return (
    <>
      <PageHeading
        title="AI Studio"
        description="Tu equipo creativo con IA: cinco variantes de copy, guiones con escenas cronometradas, buyer personas, nombres de tienda y análisis estratégico de producto."
        actions={
          <Badge variant={proveedorActivo === "SIMULATED" ? "muted" : "success"} className="gap-1">
            {proveedorActivo === "SIMULATED" ? "Motor local" : `Proveedor ${proveedorActivo}`}
          </Badge>
        }
      />

      <AiStudio
        productos={productos.items.map((producto) => ({
          id: producto.id,
          title: producto.title,
          category: producto.category,
          nicheTag: producto.nicheTag,
          suggestedSellPrice: producto.suggestedSellPrice,
        }))}
        historial={historial}
        proveedor={{
          activo: proveedorActivo,
          modelo: getActiveModel(),
          configurado: proveedorActivo !== "SIMULATED",
        }}
        uso={{ usado: usoIa, limite: PLAN_LIMITS[plan].aiGenerations }}
      />
    </>
  );
}
