"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Bell, BellOff, ExternalLink, Globe, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackStoreButton } from "@/components/domain/track-store-button";
import { cn, formatCompactNumber, formatCurrency, formatCurrencyPrecise } from "@/lib/utils";
import type { StoreChangeDTO, StoreDTO } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

/** Tienda con datos de seguimiento (devuelto por `listTrackedStores`). */
export interface TrackedStore extends StoreDTO {
  notificationEnabled: boolean;
  trackedSince: string;
  ultimoCambio: StoreChangeDTO | null;
}

interface StoreCardProps {
  store: TrackedStore;
  /** Índice para la animación de entrada. */
  index?: number;
  className?: string;
}

const ETIQUETAS_CAMBIO: Record<string, string> = {
  NEW_PRODUCT: "Producto nuevo",
  PRICE_CHANGE: "Cambio de precio",
  SOLD_OUT: "Agotado",
  THEME_CHANGE: "Cambio de tema",
  TRAFFIC_SPIKE: "Pico de tráfico",
  REVENUE_MILESTONE: "Hito de facturación",
};

/**
 * Tarjeta de tienda monitorizada: métricas clave, miniaturas del catálogo,
 * último cambio detectado y control de alertas.
 */
export function StoreCard({ store, index = 0, className }: StoreCardProps) {
  const [alertas, setAlertas] = useState(store.notificationEnabled);
  const [cargando, setCargando] = useState(false);

  /** Activa o desactiva las alertas de esta tienda. */
  async function alternarAlertas() {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/trackers/stores", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId: store.id, notificationEnabled: !alertas }),
      });
      if (!respuesta.ok) throw new Error();
      setAlertas(!alertas);
      toast.success(alertas ? "Alertas desactivadas" : "Alertas activadas");
    } catch {
      toast.error("No se pudieron actualizar las alertas");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Card
      className={cn(
        "flex flex-col transition-shadow hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-950/30",
        className,
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
              {store.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{store.name}</CardTitle>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="size-3" />
                {store.domain}
                {store.shopifyDetected && <Badge variant="success" className="ml-1 px-1.5 py-0 text-[10px]">Shopify</Badge>}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            loading={cargando}
            onClick={alternarAlertas}
            aria-label={alertas ? "Desactivar alertas" : "Activar alertas"}
            title={alertas ? "Alertas activadas" : "Alertas desactivadas"}
          >
            {!cargando && (alertas ? <Bell className="size-4 text-amber-400" /> : <BellOff className="size-4 text-muted-foreground" />)}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Métricas */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metrica etiqueta="Facturación/mes" valor={formatCurrency(store.estimatedMonthlyRevenue)} />
          <Metrica etiqueta="Visitas/mes" valor={formatCompactNumber(store.monthlyVisits)} />
          <Metrica etiqueta="Ticket medio" valor={formatCurrencyPrecise(store.avgOrderValue)} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1">
            <Users className="size-3" />
            {store.productsCount} productos
          </Badge>
          <Badge variant="outline" className="gap-1">
            <TrendingUp className="size-3" />
            conversión {store.conversionRate} %
          </Badge>
          {store.themeName && <Badge variant="muted">{store.themeName}</Badge>}
        </div>

        {/* Miniaturas del catálogo */}
        {store.topProducts.length > 0 && (
          <div className="flex gap-2">
            {store.topProducts.slice(0, 4).map((producto) => (
              <div
                key={producto.title}
                className="relative size-14 overflow-hidden rounded-lg border border-border/60 bg-slate-900"
                title={`${producto.title} · ${formatCurrencyPrecise(producto.price)}`}
              >
                {producto.image && (
                  <Image src={producto.image} alt={producto.title} fill sizes="56px" className="object-cover" />
                )}
              </div>
            ))}
            <div className="flex size-14 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 text-[10px] text-muted-foreground">
              <span className="font-semibold text-slate-200">{store.productsCount}</span>
              total
            </div>
          </div>
        )}

        {/* Último cambio detectado */}
        {store.ultimoCambio ? (
          <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="violet">{ETIQUETAS_CAMBIO[store.ultimoCambio.type] ?? "Cambio"}</Badge>
              <span className="text-[11px] text-muted-foreground"><RelativeTime value={store.ultimoCambio.detectedAt} /></span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-100">{store.ultimoCambio.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{store.ultimoCambio.description}</p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
            Sin cambios detectados desde que empezaste a seguirla.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          En seguimiento desde <RelativeTime value={store.trackedSince} /> · impacto del último cambio{" "}
          {store.ultimoCambio?.impactScore ?? 0}/100
        </p>

        {/* Acciones */}
        <div className="mt-auto flex flex-wrap gap-2">
          <Button asChild size="sm" className="flex-1 gap-1.5">
            <Link href={`/dashboard/store-tracker/${store.id}`}>
              Ver historial
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={store.shopifyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" />
              Abrir tienda
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Métrica compacta con etiqueta. */
function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="text-sm font-semibold tabular-nums text-slate-100">{valor}</p>
    </div>
  );
}

/** Tarjeta de descubrimiento de tiendas (radar global, sin seguimiento). */
export function StoreDiscoveryCard({ store, index = 0 }: { store: StoreDTO; index?: number }) {
  return (
    <Card className="transition-shadow hover:border-indigo-500/40 hover:shadow-lg" style={{ animationDelay: `${index * 30}ms` }}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{store.name}</p>
            <p className="truncate text-xs text-muted-foreground">{store.domain}</p>
          </div>
          <Badge variant="muted">{store.niche}</Badge>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(store.estimatedMonthlyRevenue)} /mes</span>
          <span>{formatCompactNumber(store.monthlyVisits)} visitas</span>
        </div>
        <TrackStoreButton storeId={store.id} companyName={store.name} tracked={false} compact />
      </CardContent>
    </Card>
  );
}
