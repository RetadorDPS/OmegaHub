import { BadgeCheck, CircleHelp, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  COLORES_CONFIANZA,
  DESCRIPCION_CONFIANZA,
  ETIQUETAS_CONFIANZA,
  resumenFuentes,
  type NivelConfianza,
} from "@/lib/confianza";

/**
 * Sello de confianza del dato.
 *
 *   Verificado → 2+ fuentes medidas en 7 días.
 *   Parcial    → alguna medición real, pero insuficiente o caducada.
 *   Estimado   → solo motor interno.
 *   Sin datos  → nada medido todavía.
 *
 * El texto emergente explica siempre el motivo, para que nadie confunda una
 * estimación con una medición.
 */

const ICONOS: Record<NivelConfianza, typeof ShieldCheck> = {
  VERIFICADO: BadgeCheck,
  PARCIAL: ShieldCheck,
  ESTIMADO: ShieldAlert,
  SIN_DATOS: CircleHelp,
};

interface SelloConfianzaProps {
  nivel: NivelConfianza;
  puntos?: number;
  fuentesMedidas?: number;
  diasDesdeUltima?: number | null;
  /** Versión reducida: solo la etiqueta (listados y tablas). */
  compacto?: boolean;
  className?: string;
}

export function SelloConfianza({
  nivel,
  puntos,
  fuentesMedidas,
  diasDesdeUltima,
  compacto = false,
  className,
}: SelloConfianzaProps) {
  const Icono = ICONOS[nivel] ?? CircleHelp;
  const detalle = resumenFuentes({ fuentesMedidas: fuentesMedidas ?? 0, diasDesdeUltima: diasDesdeUltima ?? null });
  const titulo = [
    DESCRIPCION_CONFIANZA[nivel],
    typeof puntos === "number" ? `Confianza: ${puntos}/100.` : null,
    fuentesMedidas ? `Fuentes medidas: ${fuentesMedidas}.` : null,
    diasDesdeUltima !== null && diasDesdeUltima !== undefined
      ? diasDesdeUltima === 0
        ? "Última medición: hoy."
        : `Última medición: hace ${diasDesdeUltima} días.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Badge
      variant="outline"
      title={titulo}
      className={cn("gap-1 whitespace-nowrap font-medium", COLORES_CONFIANZA[nivel], className)}
    >
      <Icono className="size-3 shrink-0" aria-hidden />
      {ETIQUETAS_CONFIANZA[nivel]}
      {!compacto && fuentesMedidas ? <span className="opacity-70">· {detalle}</span> : null}
      {!compacto && typeof puntos === "number" ? <span className="opacity-60">({puntos}/100)</span> : null}
    </Badge>
  );
}
