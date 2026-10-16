"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { describeTrendScore } from "@/lib/trendEngine";

interface TrendScoreRingProps {
  score: number;
  /** Tamaño en píxeles del indicador. */
  size?: number;
  /** Grosor del trazo. */
  strokeWidth?: number;
  /** Muestra la etiqueta cualitativa bajo la puntuación. */
  showLabel?: boolean;
  className?: string;
}

/** Color del trazo según el valor del score (rojo → ámbar → verde). */
function colorPorScore(score: number): { desde: string; hasta: string; texto: string } {
  if (score >= 85) return { desde: "#34d399", hasta: "#22d3ee", texto: "text-emerald-300" };
  if (score >= 75) return { desde: "#818cf8", hasta: "#a78bfa", texto: "text-indigo-300" };
  if (score >= 55) return { desde: "#fbbf24", hasta: "#fb923c", texto: "text-amber-300" };
  return { desde: "#fb7185", hasta: "#f43f5e", texto: "text-rose-300" };
}

/**
 * Indicador circular animado del TrendScore (0-100).
 * Se usa en las tarjetas de producto y en el detalle.
 */
export function TrendScoreRing({
  score,
  size = 64,
  strokeWidth = 6,
  showLabel = false,
  className,
}: TrendScoreRingProps) {
  const valor = Math.max(0, Math.min(100, Math.round(score)));
  const radio = (size - strokeWidth) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const progreso = (valor / 100) * circunferencia;
  const colores = colorPorScore(valor);
  const idGradiente = `ring-${Math.round(valor)}-${size}`;
  const etiqueta = describeTrendScore(valor);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`TrendScore ${valor} de 100`}>
          <defs>
            <linearGradient id={idGradiente} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colores.desde} />
              <stop offset="100%" stopColor={colores.hasta} />
            </linearGradient>
          </defs>
          {/* Pista de fondo */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radio}
            fill="none"
            stroke="rgba(148,163,184,0.15)"
            strokeWidth={strokeWidth}
          />
          {/* Progreso animado */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radio}
            fill="none"
            stroke={`url(#${idGradiente})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circunferencia}
            initial={{ strokeDashoffset: circunferencia }}
            animate={{ strokeDashoffset: circunferencia - progreso }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-sm font-bold tabular-nums", colores.texto)} style={{ fontSize: size / 4 }}>
            {valor}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">score</span>
        </div>
      </div>
      {showLabel && <span className={cn("text-[11px] font-medium", colores.texto)}>{etiqueta.label}</span>}
    </div>
  );
}

interface ScoreBarProps {
  score: number;
  label?: string;
  className?: string;
}

/** Barra horizontal de score, para listas y comparativas. */
export function TrendScoreBar({ score, label, className }: ScoreBarProps) {
  const valor = Math.max(0, Math.min(100, Math.round(score)));
  const colores = colorPorScore(valor);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label ?? "TrendScore"}</span>
        <span className={cn("font-semibold tabular-nums", colores.texto)}>{valor}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${colores.desde}, ${colores.hasta})` }}
          initial={{ width: 0 }}
          animate={{ width: `${valor}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
