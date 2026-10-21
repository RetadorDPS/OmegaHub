"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, Bookmark, Flame, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendScoreRing } from "@/components/domain/trend-score-ring";
import { SaturationBadge } from "@/components/domain/saturation-badge";
import { SelloConfianza } from "@/components/domain/sello-confianza";
import { etiquetaOportunidad } from "@/lib/confianza";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";
import { TREND_DIRECTION_LABELS, type ProductDTO } from "@/types";
import { toast } from "sonner";

interface ProductCardProps {
  product: ProductDTO;
  /** Indica si el usuario ya lo tiene en favoritos. */
  saved?: boolean;
  /** Retraso de la animación de entrada (listas). */
  index?: number;
  className?: string;
}

/** Tarjeta de producto ganador para la cuadrícula del catálogo. */
export function ProductCard({ product, saved = false, index = 0, className }: ProductCardProps) {
  const router = useRouter();
  const [guardado, setGuardado] = useState(saved);
  const [cargando, setCargando] = useState(false);

  /** Guarda o quita el producto de favoritos. */
  async function alternarFavorito(evento: React.MouseEvent) {
    evento.stopPropagation();
    setCargando(true);
    try {
      const respuesta = await fetch("/api/saved-products", {
        method: guardado ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      if (!respuesta.ok) throw new Error("No se pudo guardar");
      setGuardado(!guardado);
      toast.success(guardado ? "Eliminado de favoritos" : "Guardado en favoritos");
      router.refresh();
    } catch {
      toast.error("No se pudo actualizar el favorito");
    } finally {
      setCargando(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -4 }}
    >
      <Card
        className={cn(
          "group relative flex h-full cursor-pointer flex-col overflow-hidden transition-shadow hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-950/30",
          className,
        )}
        onClick={() => router.push(`/dashboard/winning-products/${product.id}`)}
      >
        {/* Imagen */}
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
          <Image
            src={product.mainImage}
            alt={product.title}
            fill
            // Las primeras tarjetas están sobre el pliegue: se cargan con
            // prioridad (Next 16: `preload` + carga inmediata) para que sean la
            // LCP de la página.
            preload={index < 2}
            loading={index < 2 ? "eager" : undefined}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Degradado inferior para legibilidad */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />

          {/* Insignias superiores */}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {product.isGoldenOpportunity && (
              <Badge
                variant={product.nivelConfianza === "VERIFICADO" ? "gradient" : "outline"}
                className={cn("gap-1 shadow-lg", product.nivelConfianza !== "VERIFICADO" && "border-amber-500/40 bg-amber-500/15 text-amber-200")}
                title={
                  product.nivelConfianza === "VERIFICADO"
                    ? "Confirmado por dos o más fuentes medidas en los últimos 7 días."
                    : "Estimación del motor interno: todavía no hay dos fuentes medidas que la confirmen."
                }
              >
                <Sparkles className="size-3" />
                {etiquetaOportunidad(true, product.nivelConfianza)}
              </Badge>
            )}
            {product.velocityScore >= 70 && (
              <Badge variant="danger" className="gap-1">
                <Flame className="size-3" />
                Viral
              </Badge>
            )}
          </div>

          {/* Favorito */}
          <Button
            variant="ghost"
            size="icon-sm"
            loading={cargando}
            onClick={alternarFavorito}
            aria-label={guardado ? "Quitar de favoritos" : "Guardar en favoritos"}
            className={cn(
              "absolute right-3 top-3 bg-slate-950/70 backdrop-blur hover:bg-slate-900",
              guardado && "text-amber-400",
            )}
          >
            {!cargando && <Bookmark className={cn("size-4", guardado && "fill-amber-400")} />}
          </Button>

          {/* Score circular */}
          <div className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 p-1 backdrop-blur">
            <TrendScoreRing score={product.trendScore} size={56} strokeWidth={5} />
          </div>

          {/* Nicho y categoría */}
          <div className="absolute bottom-3 left-3 flex flex-col gap-1">
            <Badge variant="secondary" className="w-fit text-[10px]">
              {product.category}
            </Badge>
            <span className="text-[11px] font-medium text-slate-300">{product.nicheTag}</span>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-indigo-300">
            {product.title}
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <SelloConfianza
              nivel={product.nivelConfianza}
              puntos={product.confianza}
              fuentesMedidas={product.fuentesMedidas}
              compacto
            />
            <SaturationBadge level={product.saturationLevel} />
            <Badge variant="outline" className="gap-1 text-[10px]">
              <TrendingUp className="size-3" />
              {TREND_DIRECTION_LABELS[product.trendDirection]}
            </Badge>
          </div>

          {/* Métricas */}
          <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center [&>div]:min-w-0">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Margen</p>
              <p className="text-sm font-semibold text-emerald-400">{product.estimatedMargin.toFixed(0)} %</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Precio</p>
              {/* Sin decimales: en la tarjeta el importe debe caber entero. */}
              <p className="truncate text-sm font-semibold">{formatCurrency(product.suggestedSellPrice)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Facturación</p>
              <p className="truncate text-sm font-semibold">{formatCompactNumber(product.estimatedMonthlyRevenue)}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 group-hover:border-indigo-500/60 group-hover:text-indigo-300"
            onClick={(evento) => {
              evento.stopPropagation();
              router.push(`/dashboard/winning-products/${product.id}`);
            }}
          >
            Ver análisis completo
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
