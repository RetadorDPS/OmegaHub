"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Bell, BellOff, Target, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { TrendSparkline } from "@/components/domain/trend-sparkline";
import { TrendScoreRing } from "@/components/domain/trend-score-ring";
import { SaturationBadge } from "@/components/domain/saturation-badge";
import { cn, formatCurrencyPrecise } from "@/lib/utils";
import type { ProductDTO } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

/** Producto en seguimiento devuelto por `listTrackedProducts`. */
export interface TrackedProduct {
  id: string;
  notificationEnabled: boolean;
  targetTrendScore: number;
  trackedSince: string;
  product: ProductDTO;
  sparkline: number[];
}

interface TrackedProductCardProps {
  item: TrackedProduct;
  index?: number;
  className?: string;
}

/**
 * Tarjeta de producto en seguimiento.
 *
 * Muestra la evolución del TrendScore desde que se empezó a seguir, la
 * distancia al objetivo de alerta configurado y permite ajustar el umbral o
 * dejar de seguir el producto.
 */
export function TrackedProductCard({ item, index = 0, className }: TrackedProductCardProps) {
  const [alertas, setAlertas] = useState(item.notificationEnabled);
  const [objetivo, setObjetivo] = useState(item.targetTrendScore);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [descartado, setDescartado] = useState(false);

  const serie = item.sparkline.length >= 2 ? item.sparkline : [item.product.trendScore, item.product.trendScore];
  const inicio = serie[0];
  const variacion = item.product.trendScore - inicio;
  const distanciaObjetivo = Math.max(0, objetivo - item.product.trendScore);
  const progresoObjetivo = Math.min(100, (item.product.trendScore / objetivo) * 100);

  /** Guarda los ajustes del seguimiento (alertas y umbral). */
  async function actualizar(cambios: { notificationEnabled?: boolean; targetTrendScore?: number }) {
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/trackers/products", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: item.product.id, ...cambios }),
      });
      if (!respuesta.ok) throw new Error();
    } catch {
      toast.error("No se pudo guardar la configuración del seguimiento");
      // Se revierte el cambio optimista.
      if (cambios.notificationEnabled !== undefined) setAlertas(!cambios.notificationEnabled);
      if (cambios.targetTrendScore !== undefined) setObjetivo(item.targetTrendScore);
    } finally {
      setGuardando(false);
    }
  }

  /** Deja de seguir el producto. */
  async function dejarDeSeguir() {
    setEliminando(true);
    try {
      const respuesta = await fetch("/api/trackers/products", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: item.product.id }),
      });
      if (!respuesta.ok) throw new Error();
      setDescartado(true);
      toast.success(`${item.product.title} ya no está en seguimiento`);
    } catch {
      toast.error("No se pudo dejar de seguir el producto");
    } finally {
      setEliminando(false);
    }
  }

  if (descartado) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
    >
      <Card className={cn("transition-shadow hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-950/30", className)}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
          {/* Imagen + score */}
          <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-slate-900 sm:aspect-square sm:w-36">
            <Image
              src={item.product.mainImage}
              alt={item.product.title}
              fill
              sizes="(max-width: 640px) 100vw, 144px"
              className="object-cover"
            />
            <div className="absolute bottom-2 right-2 rounded-full bg-slate-950/75 p-0.5 backdrop-blur">
              <TrendScoreRing score={item.product.trendScore} size={44} strokeWidth={4} />
            </div>
          </div>

          {/* Datos */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/winning-products/${item.product.id}`}
                  className="line-clamp-2 text-sm font-semibold text-slate-100 transition-colors hover:text-indigo-300"
                >
                  {item.product.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.product.category} · {item.product.nicheTag} · siguiendo desde{" "}
                  <RelativeTime value={item.trackedSince} />
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                loading={eliminando}
                onClick={dejarDeSeguir}
                aria-label="Dejar de seguir"
                title="Dejar de seguir"
              >
                {!eliminando && <Trash2 className="size-4 text-muted-foreground hover:text-rose-400" />}
              </Button>
            </div>

            {/* Evolución */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <TrendSparkline values={serie} width={110} height={34} />
                <div>
                  <p
                    className={cn(
                      "flex items-center gap-1 text-sm font-semibold",
                      variacion >= 0 ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {variacion >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                    {variacion >= 0 ? "+" : ""}
                    {variacion.toFixed(0)} pts
                  </p>
                  <p className="text-[11px] text-muted-foreground">desde el inicio del seguimiento</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <SaturationBadge level={item.product.saturationLevel} />
                <Badge variant="outline">Margen {item.product.estimatedMargin.toFixed(0)} %</Badge>
                <Badge variant="outline">{formatCurrencyPrecise(item.product.suggestedSellPrice)}</Badge>
              </div>
            </div>

            {/* Objetivo de alerta */}
            <div className="space-y-2 rounded-xl border border-border/60 bg-surface/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                  <Target className="size-3.5 text-indigo-400" />
                  Avisar cuando el score llegue a {objetivo}
                </span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Bell className={cn("size-3.5", alertas ? "text-amber-400" : "")} />
                    Alertas
                    <Switch
                      checked={alertas}
                      disabled={guardando}
                      aria-label="Activar alertas del producto"
                      onCheckedChange={(valor) => {
                        setAlertas(valor);
                        void actualizar({ notificationEnabled: valor });
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={40}
                  max={100}
                  step={5}
                  value={objetivo}
                  aria-label="Umbral de score para la alerta"
                  disabled={guardando}
                  onChange={(evento) => setObjetivo(Number(evento.target.value))}
                  onMouseUp={() => void actualizar({ targetTrendScore: objetivo })}
                  onTouchEnd={() => void actualizar({ targetTrendScore: objetivo })}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-indigo-500"
                />
                <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                  {distanciaObjetivo === 0 ? "¡Objetivo alcanzado!" : `faltan ${distanciaObjetivo} pts`}
                </span>
              </div>
              <Progress value={progresoObjetivo} className="h-1" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/dashboard/winning-products/${item.product.id}`}>
                  Ver análisis
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
              {!alertas && (
                <Badge variant="muted" className="gap-1 self-center">
                  <BellOff className="size-3" />
                  Alertas silenciadas
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
