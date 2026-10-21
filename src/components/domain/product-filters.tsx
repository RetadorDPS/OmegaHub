"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { SATURATION_LABELS, type ProductFilters, type SaturationLevel } from "@/types";
import { cn } from "@/lib/utils";

interface ProductFiltersPanelProps {
  /** Nichos disponibles con su número de productos. */
  nichos: Array<{ niche: string; count: number }>;
  filtros: ProductFilters;
  /** Número total de filtros activos (se muestra en la cabecera). */
  filtrosActivos: number;
  /** Categorías disponibles (por defecto, las del catálogo). */
  categorias?: readonly string[];
  className?: string;
}

/**
 * Panel de filtros avanzados del catálogo.
 * Escribe los filtros en la URL (searchParams) para que los resultados sean
 * compartibles y el renderizado ocurra en el servidor.
 */
export function ProductFiltersPanel({
  nichos,
  filtros,
  filtrosActivos,
  categorias = PRODUCT_CATEGORIES,
  className,
}: ProductFiltersPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [score, setScore] = useState<number[]>([filtros.minScore ?? 0]);
  const [margen, setMargen] = useState<number[]>([filtros.minMargin ?? 0]);
  const [precioMax, setPrecioMax] = useState<number[]>([filtros.maxPrice ?? 120]);

  /** Aplica un cambio sobre los parámetros actuales de la URL. */
  function aplicar(cambios: Record<string, string | number | boolean | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === undefined || valor === "" || valor === false || valor === "ALL" || valor === 0) {
        params.delete(clave);
      } else {
        params.set(clave, String(valor));
      }
    }
    // Cualquier cambio de filtro vuelve a la primera página.
    params.delete("page");
    router.push(`/dashboard/winning-products?${params.toString()}`);
  }

  /** Limpia todos los filtros. */
  function limpiar() {
    setScore([0]);
    setMargen([0]);
    setPrecioMax([120]);
    router.push("/dashboard/winning-products");
  }

  return (
    <Card className={cn("h-fit lg:sticky lg:top-20", className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="size-4 text-indigo-400" />
          Filtros avanzados
          {filtrosActivos > 0 && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              {filtrosActivos}
            </Badge>
          )}
        </CardTitle>
        {filtrosActivos > 0 && (
          <Button variant="ghost" size="sm" onClick={limpiar} className="h-7 gap-1 px-2 text-xs">
            <RotateCcw className="size-3" />
            Limpiar
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Búsqueda por texto */}
        <div className="space-y-2">
          <Label htmlFor="filtro-busqueda">Búsqueda</Label>
          <Input
            id="filtro-busqueda"
            defaultValue={filtros.search ?? ""}
            placeholder="Ej. masajeador, LED, perro…"
            onKeyDown={(evento) => {
              if (evento.key === "Enter") aplicar({ search: (evento.target as HTMLInputElement).value });
            }}
            onBlur={(evento) => {
              if (evento.target.value !== (filtros.search ?? "")) aplicar({ search: evento.target.value });
            }}
          />
        </div>

        <Separator />

        {/* Categoría */}
        <div className="space-y-2">
          <Label>Categoría</Label>
          <Select
            value={filtros.category ?? "ALL"}
            onValueChange={(valor) => aplicar({ category: valor })}
          >
            <SelectTrigger aria-label="Filtrar por categoría">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las categorías</SelectItem>
              {categorias.map((categoria) => (
                <SelectItem key={categoria} value={categoria}>
                  {categoria}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Nicho */}
        <div className="space-y-2">
          <Label>Nicho</Label>
          <Select value={filtros.niche ?? "ALL"} onValueChange={(valor) => aplicar({ niche: valor })}>
            <SelectTrigger aria-label="Filtrar por nicho">
              <SelectValue placeholder="Todos los nichos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los nichos</SelectItem>
              {nichos.map((nicho) => (
                <SelectItem key={nicho.niche} value={nicho.niche}>
                  {nicho.niche} · {nicho.count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Saturación */}
        <div className="space-y-2">
          <Label>Saturación del mercado</Label>
          <div className="flex flex-wrap gap-1.5">
            {(["ALL", "LOW", "MEDIUM", "HIGH"] as const).map((nivel) => {
              const activo = (filtros.saturation ?? "ALL") === nivel;
              return (
                <button
                  key={nivel}
                  type="button"
                  onClick={() => aplicar({ saturation: nivel })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    activo
                      ? nivel === "LOW"
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : nivel === "MEDIUM"
                          ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                          : nivel === "HIGH"
                            ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                            : "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                      : "border-border text-muted-foreground hover:border-indigo-500/40 hover:text-foreground",
                  )}
                >
                  {nivel === "ALL" ? "Todas" : SATURATION_LABELS[nivel as SaturationLevel]}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Score mínimo */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>TrendScore mínimo</Label>
            <span className="text-xs font-semibold text-indigo-300 tabular-nums">{score[0]}</span>
          </div>
          <Slider
            value={score}
            min={0}
            max={95}
            step={5}
            onValueChange={setScore}
            onValueCommit={(valor) => aplicar({ minScore: valor[0] })}
            aria-label="TrendScore mínimo"
          />
        </div>

        {/* Margen mínimo */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Margen mínimo</Label>
            <span className="text-xs font-semibold text-emerald-300 tabular-nums">{margen[0]} %</span>
          </div>
          <Slider
            value={margen}
            min={0}
            max={90}
            step={5}
            onValueChange={setMargen}
            onValueCommit={(valor) => aplicar({ minMargin: valor[0] })}
            aria-label="Margen mínimo"
          />
        </div>

        {/* Precio máximo */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Precio máximo de venta</Label>
            <span className="text-xs font-semibold text-violet-300 tabular-nums">{precioMax[0]} $</span>
          </div>
          <Slider
            value={precioMax}
            min={10}
            max={200}
            step={5}
            onValueChange={setPrecioMax}
            onValueCommit={(valor) => aplicar({ maxPrice: valor[0] < 200 ? valor[0] : undefined })}
            aria-label="Precio máximo"
          />
        </div>

        <Separator />

        {/* Solo oportunidades doradas */}
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3">
          <div className="space-y-0.5">
            <Label htmlFor="filtro-doradas" className="cursor-pointer text-xs normal-case text-foreground">
              Solo oportunidades doradas
            </Label>
            <p className="text-[11px] text-muted-foreground">Score &gt; 80 y saturación baja</p>
          </div>
          <Switch
            id="filtro-doradas"
            checked={Boolean(filtros.goldenOnly)}
            onCheckedChange={(valor) => aplicar({ goldenOnly: valor })}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
          <div className="space-y-0.5">
            <Label htmlFor="filtro-verificados" className="cursor-pointer text-xs normal-case text-foreground">
              Solo datos verificados
            </Label>
            <p className="text-[11px] text-muted-foreground">2+ fuentes medidas en los últimos 7 días</p>
          </div>
          <Switch
            id="filtro-verificados"
            checked={Boolean(filtros.verificadosOnly)}
            onCheckedChange={(valor) => aplicar({ verificadosOnly: valor })}
          />
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-indigo-500/5 p-3 text-[11px] text-muted-foreground">
          <Filter className="size-3.5 shrink-0 text-indigo-400" />
          Los filtros se guardan en la URL: puedes compartir el enlace con tu equipo.
        </div>
      </CardContent>
    </Card>
  );
}
