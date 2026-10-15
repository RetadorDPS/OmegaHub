"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bookmark,
  Clock,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Play,
  Share2,
  ShoppingBag,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import { COUNTRY_FLAGS } from "@/lib/constants";
import { PLATFORM_LABELS, type AdDTO } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

interface AdCardProps {
  ad: AdDTO;
  index?: number;
  /** Carga la imagen con prioridad (tarjetas sobre el pliegue). */
  priority?: boolean;
  /** Indica si el producto relacionado ya está en favoritos. */
  saved?: boolean;
  className?: string;
}

/** Color de la insignia según la plataforma publicitaria. */
const PLATFORM_STYLES: Record<string, string> = {
  TIKTOK: "border-slate-100/30 bg-slate-950/80 text-slate-100",
  FACEBOOK: "border-blue-400/40 bg-blue-600/20 text-blue-200",
  INSTAGRAM: "border-fuchsia-400/40 bg-fuchsia-600/20 text-fuchsia-200",
};

/**
 * Tarjeta de anuncio en formato Pinterest (columna fluida).
 *
 * El vídeo se reproduce al pasar el ratón por encima (con audio silenciado) y
 * puede activarse el sonido con el botón superior. Las métricas proceden de la
 * biblioteca de anuncios almacenada en base de datos.
 */
export function AdCard({ ad, index = 0, priority = false, saved = false, className }: AdCardProps) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const [conSonido, setConSonido] = useState(false);
  const [guardado, setGuardado] = useState(saved);
  const [guardando, setGuardando] = useState(false);

  const engagement =
    ad.views > 0 ? ((ad.likes + ad.comments + ad.shares) / ad.views) * 100 : ad.engagementRate;

  /** Guarda el producto relacionado en favoritos. */
  async function guardarProducto() {
    if (!ad.productId) {
      toast.error("Este anuncio no tiene producto relacionado en el catálogo");
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/saved-products", {
        method: guardado ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: ad.productId }),
      });
      if (respuesta.status === 402) {
        const datos = (await respuesta.json()) as { error?: string };
        toast.error(datos.error ?? "Has alcanzado el límite de tu plan");
        return;
      }
      if (!respuesta.ok) throw new Error();
      setGuardado(!guardado);
      toast.success(guardado ? "Producto eliminado de favoritos" : "Producto guardado en favoritos");
    } catch {
      toast.error("No se pudo actualizar el favorito");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.035, 0.5) }}
      className={cn("mb-5 break-inside-avoid", className)}
    >
      <Card className="group overflow-hidden transition-shadow hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-950/30">
        {/* --- Medio (vídeo o imagen) --- */}
        <div
          className="relative"
          onMouseEnter={() => setReproduciendo(true)}
          onMouseLeave={() => {
            setReproduciendo(false);
            setConSonido(false);
          }}
        >
          {reproduciendo && ad.videoUrl ? (
            <video
              src={ad.videoUrl}
              poster={ad.thumbnailUrl ?? ad.mediaUrl}
              className="aspect-[4/5] w-full bg-slate-950 object-cover"
              autoPlay
              loop
              muted={!conSonido}
              playsInline
            />
          ) : (
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-900">
              <Image
                src={ad.thumbnailUrl ?? ad.mediaUrl}
                alt={ad.headline}
                fill
                preload={priority}
                loading={priority ? "eager" : undefined}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/40" />

          {/* Cabecera superpuesta: plataforma, días activo y sonido */}
          <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
            <Badge className={cn("border backdrop-blur", PLATFORM_STYLES[ad.platform] ?? PLATFORM_STYLES.FACEBOOK)}>
              {PLATFORM_LABELS[ad.platform]}
            </Badge>
            <div className="flex items-center gap-1.5">
              {ad.videoUrl && reproduciendo && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={conSonido ? "Silenciar vídeo" : "Activar sonido"}
                  onClick={() => setConSonido((valor) => !valor)}
                  className="bg-slate-950/70 text-slate-100 backdrop-blur hover:bg-slate-900"
                >
                  {conSonido ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                </Button>
              )}
              <Badge variant="muted" className="gap-1 border-slate-700 bg-slate-950/70 backdrop-blur">
                <Clock className="size-3" />
                {ad.daysActive} d
              </Badge>
            </div>
          </div>

          {/* Anunciante y visualizaciones */}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-100">{ad.advertiserName}</p>
              <p className="text-[11px] text-slate-400">
                {ad.countryTargets.map((codigo) => COUNTRY_FLAGS[codigo] ?? codigo).join(" ")} · {ad.nicheTag}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 backdrop-blur">
              {ad.videoUrl ? <Play className="size-3" /> : <Eye className="size-3" />}
              {formatCompactNumber(ad.views)}
            </div>
          </div>
        </div>

        {/* --- Copy del anuncio --- */}
        <div className="space-y-3 p-4">
          <div>
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">{ad.headline}</h3>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{ad.body}</p>
          </div>

          {ad.callToAction && (
            <Badge variant="success" className="text-[10px]">
              CTA: {ad.callToAction}
            </Badge>
          )}

          {/* Métricas de engagement */}
          <div className="grid grid-cols-4 gap-1 border-y border-border/60 py-2 text-center">
            <Metrica icono={<Heart className="size-3" />} valor={formatCompactNumber(ad.likes)} etiqueta="likes" />
            <Metrica
              icono={<MessageCircle className="size-3" />}
              valor={formatCompactNumber(ad.comments)}
              etiqueta="coment."
            />
            <Metrica icono={<Share2 className="size-3" />} valor={formatCompactNumber(ad.shares)} etiqueta="compart." />
            <Metrica
              icono={<Eye className="size-3" />}
              valor={formatPercent(engagement, 1)}
              etiqueta="engage."
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Detectado <RelativeTime value={ad.firstSeenAt} /> · activo {ad.daysActive} días
            {ad.daysActive >= 30 && <span className="ml-1 text-emerald-400">· anuncio escalado</span>}
          </p>

          {/* Acciones */}
          <div className="flex flex-col gap-2">
            {ad.productId ? (
              <Button asChild size="sm" className="w-full gap-1.5">
                <Link href={`/dashboard/winning-products/${ad.productId}`}>
                  <ShoppingBag className="size-3.5" />
                  Ver producto relacionado
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled className="w-full gap-1.5">
                <ShoppingBag className="size-3.5" />
                Sin producto en catálogo
              </Button>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                loading={guardando}
                onClick={guardarProducto}
                className="flex-1 gap-1.5"
              >
                {!guardando && <Bookmark className={cn("size-3.5", guardado && "fill-amber-400 text-amber-400")} />}
                {guardado ? "Guardado" : "Guardar"}
              </Button>
              {ad.adLibraryUrl && (
                <Button asChild variant="ghost" size="sm" className="gap-1.5">
                  <a href={ad.adLibraryUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                    Biblioteca
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/** Métrica compacta de la fila de engagement. */
function Metrica({ icono, valor, etiqueta }: { icono: React.ReactNode; valor: string; etiqueta: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-muted-foreground">{icono}</span>
      <span className="text-xs font-semibold tabular-nums text-slate-100">{valor}</span>
      <span className="text-[10px] text-muted-foreground">{etiqueta}</span>
    </div>
  );
}
