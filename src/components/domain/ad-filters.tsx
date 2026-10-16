"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Flame, RotateCcw, Search, Timer, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TARGET_COUNTRIES } from "@/lib/constants";
import { cn, formatCompactNumber } from "@/lib/utils";

interface AdFiltersBarProps {
  nichos: string[];
  /** Estadísticas para los chips de resumen. */
  stats: { total: number; tiktok: number; facebook: number; instagram: number; masLargoDias: number };
  seleccion: {
    platform?: string;
    niche?: string;
    country?: string;
    sort?: string;
    minEngagement?: number;
    minDaysActive?: number;
    search?: string;
  };
}

const ORDENACIONES = [
  { valor: "recent", etiqueta: "Más recientes", icono: TrendingUp },
  { valor: "engagement", etiqueta: "Mayor engagement", icono: Flame },
  { valor: "longest-running", etiqueta: "Más tiempo activos", icono: Timer },
  { valor: "most-liked", etiqueta: "Más likes", icono: Flame },
];

/**
 * Barra de filtros de Ads Spy.
 * Todo se escribe en la URL para que el filtrado ocurra en el servidor.
 */
export function AdFiltersBar({ nichos, stats, seleccion }: AdFiltersBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busqueda, setBusqueda] = useState(seleccion.search ?? "");

  useEffect(() => {
    setBusqueda(seleccion.search ?? "");
  }, [seleccion.search]);

  /** Aplica un cambio sobre los parámetros actuales. */
  function aplicar(cambios: Record<string, string | number | boolean | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === undefined || valor === "" || valor === "ALL" || valor === 0 || valor === false) {
        params.delete(clave);
      } else {
        params.set(clave, String(valor));
      }
    }
    router.push(`/dashboard/ads-spy?${params.toString()}`);
  }

  /** Restablece todos los filtros. */
  function limpiar() {
    setBusqueda("");
    router.push("/dashboard/ads-spy");
  }

  const hayFiltros = Boolean(
    seleccion.platform ||
      seleccion.niche ||
      seleccion.country ||
      seleccion.sort ||
      seleccion.minEngagement ||
      seleccion.minDaysActive ||
      seleccion.search,
  );

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-4">
        {/* Chips de resumen por plataforma */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            activo={!seleccion.platform}
            onClick={() => aplicar({ platform: undefined })}
            etiqueta={`Todas · ${stats.total}`}
          />
          <Chip
            activo={seleccion.platform === "TIKTOK"}
            onClick={() => aplicar({ platform: "TIKTOK" })}
            etiqueta={`TikTok · ${stats.tiktok}`}
            color="slate"
          />
          <Chip
            activo={seleccion.platform === "FACEBOOK"}
            onClick={() => aplicar({ platform: "FACEBOOK" })}
            etiqueta={`Facebook · ${stats.facebook}`}
            color="blue"
          />
          <Chip
            activo={seleccion.platform === "INSTAGRAM"}
            onClick={() => aplicar({ platform: "INSTAGRAM" })}
            etiqueta={`Instagram · ${stats.instagram}`}
            color="fuchsia"
          />
          <Badge variant="outline" className="ml-auto gap-1">
            <Timer className="size-3" />
            El más longevo lleva {stats.masLargoDias} días activo
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {/* Búsqueda */}
          <div className="space-y-1.5 xl:col-span-2">
            <Label htmlFor="ads-busqueda">Búsqueda</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ads-busqueda"
                value={busqueda}
                placeholder="Titular, copy o anunciante…"
                className="pl-9"
                onChange={(evento) => setBusqueda(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter") aplicar({ search: busqueda });
                }}
                onBlur={() => {
                  if (busqueda !== (seleccion.search ?? "")) aplicar({ search: busqueda });
                }}
              />
            </div>
          </div>

          {/* Nicho */}
          <div className="space-y-1.5">
            <Label>Nicho</Label>
            <Select value={seleccion.niche ?? "ALL"} onValueChange={(valor) => aplicar({ niche: valor })}>
              <SelectTrigger aria-label="Filtrar por nicho">
                <SelectValue placeholder="Todos los nichos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los nichos</SelectItem>
                {nichos.map((nicho) => (
                  <SelectItem key={nicho} value={nicho}>
                    {nicho}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* País */}
          <div className="space-y-1.5">
            <Label>País objetivo</Label>
            <Select value={seleccion.country ?? "ALL"} onValueChange={(valor) => aplicar({ country: valor })}>
              <SelectTrigger aria-label="Filtrar por país">
                <SelectValue placeholder="Todos los países" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los países</SelectItem>
                {TARGET_COUNTRIES.map((pais) => (
                  <SelectItem key={pais.code} value={pais.code}>
                    {pais.flag} {pais.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Orden */}
          <div className="space-y-1.5">
            <Label>Ordenar por</Label>
            <Select value={seleccion.sort ?? "recent"} onValueChange={(valor) => aplicar({ sort: valor })}>
              <SelectTrigger aria-label="Ordenar anuncios">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDENACIONES.map((orden) => (
                  <SelectItem key={orden.valor} value={orden.valor}>
                    {orden.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filtros rápidos + limpiar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={seleccion.minDaysActive === 30 ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => aplicar({ minDaysActive: seleccion.minDaysActive === 30 ? undefined : 30 })}
          >
            <Timer className="size-3.5" />
            Activos +30 días
          </Button>
          <Button
            variant={seleccion.minEngagement === 5 ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => aplicar({ minEngagement: seleccion.minEngagement === 5 ? undefined : 5 })}
          >
            <Flame className="size-3.5" />
            Engagement +5 %
          </Button>
          <Button
            variant={seleccion.minDaysActive === 60 ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => aplicar({ minDaysActive: seleccion.minDaysActive === 60 ? undefined : 60 })}
          >
            <Timer className="size-3.5" />
            Escalados +60 días
          </Button>

          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={limpiar} className="ml-auto gap-1.5">
              <RotateCcw className="size-3.5" />
              Limpiar filtros
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {formatCompactNumber(stats.total)} creatividades reales de la biblioteca de anuncios · pasa el ratón por
          encima de una tarjeta para reproducir el vídeo.
        </p>
      </CardContent>
    </Card>
  );
}

/** Chip de filtrado por plataforma. */
function Chip({
  activo,
  onClick,
  etiqueta,
  color = "indigo",
}: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
  color?: "indigo" | "slate" | "blue" | "fuchsia";
}) {
  const colores: Record<string, string> = {
    indigo: "border-indigo-500/50 bg-indigo-500/15 text-indigo-300",
    slate: "border-slate-400/50 bg-slate-500/20 text-slate-200",
    blue: "border-blue-500/50 bg-blue-500/15 text-blue-300",
    fuchsia: "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        activo ? colores[color] : "border-border text-muted-foreground hover:border-indigo-500/40 hover:text-foreground",
      )}
    >
      {etiqueta}
    </button>
  );
}
