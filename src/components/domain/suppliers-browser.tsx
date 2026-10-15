"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Clock,
  ExternalLink,
  Filter,
  Package,
  ShieldCheck,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { cn, formatCurrencyPrecise, formatNumber } from "@/lib/utils";

/** Proveedor serializado por `listSuppliers`. */
export interface SupplierItem {
  id: string;
  name: string;
  platform: string;
  url: string;
  rating: number;
  reviewCount: number;
  minOrderValue: number;
  shippingTimeDays: number;
  shippingCost: number;
  location: string;
  categories: string[];
  verified: boolean;
  tradeAssurance: boolean;
  priceIndex: number;
  notes: string | null;
}

interface SuppliersBrowserProps {
  proveedores: SupplierItem[];
  plataformas: Array<{ valor: string; etiqueta: string }>;
  seleccion: { platform?: string; category?: string; minRating?: number };
}

/** Etiqueta legible de cada plataforma mayorista. */
const PLATAFORMA_ETIQUETAS: Record<string, string> = {
  ALIEXPRESS: "AliExpress",
  CJ_DROPSHIPPING: "CJ Dropshipping",
  ALIBABA: "Alibaba",
  AMAZON: "Amazon",
  SPOCKET: "Spocket",
  ZENDROP: "Zendrop",
};

/**
 * Navegador de proveedores con filtros reales (plataforma, categoría y
 * valoración mínima) sincronizados con la URL.
 */
export function SuppliersBrowser({ proveedores, plataformas, seleccion }: SuppliersBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [valoracion, setValoracion] = useState<number[]>([seleccion.minRating ?? 0]);
  const [orden, setOrden] = useState<"rating" | "precio" | "envio">("rating");

  /** Actualiza los filtros de la URL. */
  function aplicar(cambios: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === undefined || valor === "" || valor === "ALL" || valor === 0) params.delete(clave);
      else params.set(clave, String(valor));
    }
    router.push(`/dashboard/suppliers?${params.toString()}`);
  }

  const ordenados = [...proveedores].sort((a, b) => {
    if (orden === "precio") return a.priceIndex - b.priceIndex;
    if (orden === "envio") return a.shippingTimeDays - b.shippingTimeDays;
    return b.rating - a.rating;
  });

  return (
    <div className="space-y-6">
      {/* --- Filtros --- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="size-4 text-indigo-400" />
            Filtros de proveedores
          </CardTitle>
          <Badge variant="muted">{proveedores.length} resultados</Badge>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Plataforma</Label>
            <Select value={seleccion.platform ?? "ALL"} onValueChange={(valor) => aplicar({ platform: valor })}>
              <SelectTrigger aria-label="Filtrar por plataforma">
                <SelectValue placeholder="Todas las plataformas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas las plataformas</SelectItem>
                {plataformas.map((plataforma) => (
                  <SelectItem key={plataforma.valor} value={plataforma.valor}>
                    {plataforma.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={seleccion.category ?? "ALL"} onValueChange={(valor) => aplicar({ category: valor })}>
              <SelectTrigger aria-label="Filtrar por categoría">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas las categorías</SelectItem>
                {PRODUCT_CATEGORIES.map((categoria) => (
                  <SelectItem key={categoria} value={categoria}>
                    {categoria}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Valoración mínima</Label>
              <span className="text-xs font-semibold text-amber-300">{valoracion[0].toFixed(1)} ★</span>
            </div>
            <Slider
              value={valoracion}
              min={0}
              max={5}
              step={0.5}
              aria-label="Valoración mínima"
              onValueChange={setValoracion}
              onValueCommit={(valor) => aplicar({ minRating: valor[0] > 0 ? valor[0] : undefined })}
            />
          </div>

          <div className="space-y-2">
            <Label>Criterio de orden</Label>
            <Select value={orden} onValueChange={(valor) => setOrden(valor as typeof orden)}>
              <SelectTrigger aria-label="Ordenar proveedores">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Mejor valorados</SelectItem>
                <SelectItem value="precio">Precio más competitivo</SelectItem>
                <SelectItem value="envio">Envío más rápido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* --- Resultados --- */}
      {ordenados.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Ningún proveedor cumple estos filtros"
          description="Baja la valoración mínima o cambia la plataforma y la categoría para ver más resultados."
          action={
            <Button variant="outline" onClick={() => router.push("/dashboard/suppliers")}>
              Ver todos los proveedores
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {ordenados.map((proveedor) => (
            <SupplierCard key={proveedor.id} proveedor={proveedor} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Tarjeta de proveedor con todos sus indicadores y enlace directo. */
function SupplierCard({ proveedor }: { proveedor: SupplierItem }) {
  const indicePrecio =
    proveedor.priceIndex < 1
      ? { etiqueta: "Precio competitivo", tono: "success" as const }
      : proveedor.priceIndex <= 1.15
        ? { etiqueta: "Precio de mercado", tono: "default" as const }
        : { etiqueta: "Precio elevado", tono: "warning" as const };

  return (
    <Card className="flex flex-col transition-shadow hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-950/30">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-1.5 truncate text-base">
              {proveedor.name}
              {proveedor.verified && <BadgeCheck className="size-4 shrink-0 text-indigo-400" />}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {PLATAFORMA_ETIQUETAS[proveedor.platform] ?? proveedor.platform} ·{" "}
              {proveedor.location === "CN" ? "China" : proveedor.location}
            </p>
          </div>
          <Badge variant={indicePrecio.tono}>{indicePrecio.etiqueta}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-amber-300">
            <Star className="size-3.5 fill-amber-400" />
            <span className="font-semibold">{proveedor.rating.toFixed(1)}</span>
            <span className="text-muted-foreground">({formatNumber(proveedor.reviewCount)} reseñas)</span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3.5" />
            {proveedor.shippingTimeDays} días de envío
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border/60 bg-surface/40 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pedido mínimo</p>
            <p className="text-sm font-semibold tabular-nums text-slate-100">
              {proveedor.minOrderValue === 0 ? "Sin mínimo" : formatCurrencyPrecise(proveedor.minOrderValue)}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface/40 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Envío</p>
            <p className="text-sm font-semibold tabular-nums text-slate-100">
              {proveedor.shippingCost === 0 ? "Gratis" : formatCurrencyPrecise(proveedor.shippingCost)}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface/40 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Índice precio</p>
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                proveedor.priceIndex < 1 ? "text-emerald-400" : "text-slate-100",
              )}
            >
              {proveedor.priceIndex.toFixed(2)}×
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {proveedor.categories.slice(0, 4).map((categoria) => (
            <Badge key={categoria} variant="muted">
              {categoria}
            </Badge>
          ))}
          {proveedor.tradeAssurance && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="size-3" />
              Trade Assurance
            </Badge>
          )}
        </div>

        {proveedor.notes && (
          <p className="rounded-lg border border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
            {proveedor.notes}
          </p>
        )}

        <Button asChild variant="outline" size="sm" className="mt-auto w-full gap-1.5">
          <a href={proveedor.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" />
            Contactar proveedor
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
