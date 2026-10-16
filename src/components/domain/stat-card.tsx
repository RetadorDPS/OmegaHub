import { type LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, formatCompactNumber } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  /** Variación porcentual respecto al periodo anterior. */
  delta?: number;
  icon: LucideIcon;
  hint?: string;
  /** Formatea el valor como número compacto (1.2 M). */
  compact?: boolean;
  accent?: "indigo" | "violet" | "emerald" | "amber" | "rose";
  className?: string;
}

const ACENTOS = {
  indigo: "from-indigo-500/20 to-indigo-500/5 text-indigo-300",
  violet: "from-violet-500/20 to-violet-500/5 text-violet-300",
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300",
  amber: "from-amber-500/20 to-amber-500/5 text-amber-300",
  rose: "from-rose-500/20 to-rose-500/5 text-rose-300",
} as const;

/** Tarjeta de KPI del panel general (valor, icono y variación). */
export function StatCard({
  label,
  value,
  delta,
  icon: Icono,
  hint,
  compact = false,
  accent = "indigo",
  className,
}: StatCardProps) {
  const valorMostrado = typeof value === "number" && compact ? formatCompactNumber(value) : value;

  return (
    <Card className={cn("relative overflow-hidden p-5", className)}>
      {/* Halo decorativo */}
      <div className={cn("pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-gradient-to-br blur-2xl", ACENTOS[accent])} />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-bold tracking-tight tabular-nums">{valorMostrado}</p>
          {typeof delta === "number" && (
            <p
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                delta >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)} % vs. mes anterior
            </p>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br", ACENTOS[accent])}>
          <Icono className="size-5" />
        </span>
      </div>
    </Card>
  );
}
