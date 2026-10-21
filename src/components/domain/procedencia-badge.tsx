import { cn } from "@/lib/utils";
import type { TipoDato } from "@/types";

/**
 * Insignia de procedencia de un dato.
 *
 *   MEDIDO    → procedente de una API/fuente en vivo.
 *   IMPORTADO → subido por el usuario (CSV/JSON).
 *   ESTIMADO  → calculado por el motor interno.
 *
 * Nada se esconde: cada cifra del panel lleva
 * su insignia, y el tooltip explica de dónde viene.
 */

const ESTILOS: Record<TipoDato, string> = {
  MEDIDO: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  MIXTO: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  IMPORTADO: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  ESTIMADO: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const ETIQUETAS: Record<TipoDato, string> = {
  MEDIDO: "Medido",
  MIXTO: "Mixto",
  IMPORTADO: "Importado",
  ESTIMADO: "Estimado",
};

const DESCRIPCION: Record<TipoDato, string> = {
  MEDIDO: "Dato leído en vivo de una fuente externa.",
  MIXTO: "Parte medido en vivo y parte heredado de la medición anterior.",
  IMPORTADO: "Dato subido por ti (CSV/JSON).",
  ESTIMADO: "Cálculo del motor interno (sin fuente externa).",
};

interface ProcedenciaBadgeProps {
  tipo: TipoDato;
  fuente?: string | null;
  compacto?: boolean;
}

export function ProcedenciaBadge({ tipo, fuente, compacto = false }: ProcedenciaBadgeProps) {
  return (
    <span
      title={`${DESCRIPCION[tipo]}${fuente ? ` Fuente: ${fuente}` : ""}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        ESTILOS[tipo],
        compacto && "px-1.5 py-0 text-[9px]",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {ETIQUETAS[tipo]}
    </span>
  );
}
