"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CircleDollarSign,
  Package,
  Palette,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrencyPrecise } from "@/lib/utils";
import type { StoreChangeDTO, StoreChangeType } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

interface StoreTimelineProps {
  eventos: StoreChangeDTO[];
  /** Muestra el nombre de la tienda en cada evento (timeline agregado). */
  mostrarTienda?: boolean;
  /** Número máximo de eventos a mostrar. */
  limite?: number;
  className?: string;
}

/** Icono y color por tipo de cambio detectado. */
const ESTILOS: Record<StoreChangeType, { icono: React.ComponentType<{ className?: string }>; color: string; etiqueta: string }> = {
  NEW_PRODUCT: { icono: Package, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", etiqueta: "Producto nuevo" },
  PRICE_CHANGE: { icono: CircleDollarSign, color: "text-amber-400 bg-amber-500/10 border-amber-500/25", etiqueta: "Cambio de precio" },
  SOLD_OUT: { icono: XCircle, color: "text-rose-400 bg-rose-500/10 border-rose-500/25", etiqueta: "Agotado" },
  THEME_CHANGE: { icono: Palette, color: "text-violet-400 bg-violet-500/10 border-violet-500/25", etiqueta: "Cambio de diseño" },
  TRAFFIC_SPIKE: { icono: TrendingUp, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/25", etiqueta: "Pico de tráfico" },
  REVENUE_MILESTONE: { icono: Bell, color: "text-sky-400 bg-sky-500/10 border-sky-500/25", etiqueta: "Hito de facturación" },
};

/**
 * Timeline vertical de cambios detectados en las tiendas seguidas.
 * Cada evento muestra su impacto (0-100) y, si procede, la variación de precio.
 */
export function StoreTimeline({ eventos, mostrarTienda = false, limite, className }: StoreTimelineProps) {
  const visibles = limite ? eventos.slice(0, limite) : eventos;

  if (visibles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
        Todavía no hay cambios registrados. En cuanto una tienda segida lance productos, cambie precios o
        multiplique su tráfico, aparecerá aquí.
      </div>
    );
  }

  return (
    <ol className={cn("relative space-y-4 border-l border-border/70 pl-6", className)}>
      {visibles.map((evento, indice) => {
        const estilo = ESTILOS[evento.type] ?? ESTILOS.NEW_PRODUCT;
        const Icono = estilo.icono;
        return (
          <motion.li
            key={evento.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(indice * 0.04, 0.4) }}
            className="relative"
          >
            {/* Punto del timeline */}
            <span
              className={cn(
                "absolute -left-[31px] flex size-6 items-center justify-center rounded-full border",
                estilo.color,
              )}
            >
              <Icono className="size-3" />
            </span>

            <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {estilo.etiqueta}
                </Badge>
                {mostrarTienda && evento.storeName && (
                  <span className="text-xs font-medium text-indigo-300">{evento.storeName}</span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  <RelativeTime value={evento.detectedAt} />
                </span>
              </div>

              <div className="mt-2 flex gap-3">
                {evento.imageUrl && (
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-slate-900">
                    <Image src={evento.imageUrl} alt={evento.title} fill sizes="56px" className="object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100">{evento.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{evento.description}</p>

                  {/* Variación de precio */}
                  {evento.priceBefore !== null && evento.priceAfter !== null && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground line-through">
                        {formatCurrencyPrecise(evento.priceBefore)}
                      </span>
                      {evento.priceAfter < evento.priceBefore ? (
                        <ArrowDownRight className="size-3 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="size-3 text-rose-400" />
                      )}
                      <span
                        className={cn(
                          "font-semibold",
                          evento.priceAfter < evento.priceBefore ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {formatCurrencyPrecise(evento.priceAfter)}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Impacto */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Impacto</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      evento.impactScore >= 70
                        ? "bg-gradient-to-r from-indigo-500 to-violet-500"
                        : evento.impactScore >= 40
                          ? "bg-amber-500"
                          : "bg-slate-600",
                    )}
                    style={{ width: `${evento.impactScore}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-slate-200">{evento.impactScore}</span>
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
