import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SATURATION_LABELS, type SaturationLevel } from "@/types";
import { cn } from "@/lib/utils";

interface SaturationBadgeProps {
  level: SaturationLevel;
  /** Muestra la explicación emergente del nivel. */
  withTooltip?: boolean;
  className?: string;
}

const CONFIG: Record<SaturationLevel, { variant: "success" | "warning" | "danger"; icon: typeof ShieldCheck; hint: string }> = {
  LOW: {
    variant: "success",
    icon: ShieldCheck,
    hint: "Menos de 1,5 tiendas por cada 1.000 búsquedas: mercado con hueco.",
  },
  MEDIUM: {
    variant: "warning",
    icon: ShieldQuestion,
    hint: "Entre 1,5 y 4 tiendas por cada 1.000 búsquedas: competencia moderada.",
  },
  HIGH: {
    variant: "danger",
    icon: ShieldAlert,
    hint: "Más de 4 tiendas por cada 1.000 búsquedas: mercado saturado.",
  },
};

/** Insignia de nivel de saturación competitiva con icono y color semántico. */
export function SaturationBadge({ level, withTooltip = true, className }: SaturationBadgeProps) {
  const config = CONFIG[level];
  const Icono = config.icon;
  return (
    <Badge variant={config.variant} className={cn("gap-1", className)} title={withTooltip ? config.hint : undefined}>
      <Icono />
      Saturación {SATURATION_LABELS[level].toLowerCase()}
    </Badge>
  );
}
