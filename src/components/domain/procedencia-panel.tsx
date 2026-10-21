import { AlertTriangle, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProcedenciaBadge } from "@/components/domain/procedencia-badge";
import { SelloConfianza } from "@/components/domain/sello-confianza";
import { RelativeTime } from "@/components/domain/relative-time";
import { cn } from "@/lib/utils";
import {
  ETIQUETAS_CONFIANZA,
  FUENTES,
  type FactorConfianza,
  type FuenteId,
  type NivelConfianza,
  type ResultadoConfianza,
  type TipoDatoFuente,
} from "@/lib/confianza";

/**
 * Panel «Confianza y procedencia».
 *
 * Enseña, fuente por fuente, qué se midió, cuándo y cómo comprobarlo. Es la
 * pieza que convierte una cifra en una decisión defendible: si algo es una
 * estimación, se dice; si hay medición, se enseña su fecha y su origen.
 */

export interface ProcedenciaItem {
  fuente: FuenteId;
  tipo: TipoDatoFuente;
  origen: string;
  fecha: string;
  valor: number;
  /** Enlace externo para verificarlo a mano (si la fuente lo permite). */
  enlace?: string | null;
}

interface ProcedenciaPanelProps {
  nivel: NivelConfianza;
  evaluacion: ResultadoConfianza;
  items: ProcedenciaItem[];
  /** Término de búsqueda para construir los enlaces de verificación. */
  consulta: string;
}

/** Formato corto del valor según la fuente. */
function formatearValor(fuente: FuenteId, valor: number): string {
  if (fuente === "meta") return `${valor.toLocaleString("es-ES")} anuncios activos`;
  if (fuente === "tiendas") return `${valor.toLocaleString("es-ES")} tiendas`;
  if (fuente === "youtube") return `${valor.toLocaleString("es-ES")} visualizaciones`;
  if (fuente === "tiktok") return `${valor.toLocaleString("es-ES")} visualizaciones`;
  return `${valor.toLocaleString("es-ES")} búsquedas/mes`;
}

/** Enlaces públicos para comprobar cada fuente sin salir de la app. */
export function enlaceVerificacion(fuente: FuenteId, consulta: string): string {
  const termino = encodeURIComponent(consulta);
  switch (fuente) {
    case "google":
      return `https://trends.google.com/trends/explore?q=${termino}&date=today%2012-m&geo=ES`;
    case "meta":
      return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ES&q=${termino}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${termino}&sp=CAI%3D`;
    case "tiktok":
      return `https://ads.tiktok.com/business/creativecenter/inspiration/popular/keyword/pc/en?keyword=${termino}`;
    case "tiendas":
      return `https://www.google.com/search?q=${termino}+site%3Amyshopify.com`;
    default:
      return `https://www.google.com/search?q=${termino}`;
  }
}

export function ProcedenciaPanel({ nivel, evaluacion, items, consulta }: ProcedenciaPanelProps) {
  const medidos = items.filter((item) => item.tipo === "MEDIDO" || item.tipo === "IMPORTADO");

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Confianza y procedencia</CardTitle>
          <SelloConfianza
            nivel={nivel}
            puntos={evaluacion.puntos}
            fuentesMedidas={evaluacion.fuentesMedidas}
            diasDesdeUltima={evaluacion.diasDesdeUltima}
          />
        </div>
        <CardDescription>
          Cada cifra del producto con su origen y su fecha. Las estimaciones se marcan como tales: no se presentan
          como mediciones.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Estado en una frase */}
        <p
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            nivel === "VERIFICADO"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : nivel === "PARCIAL"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : "border-slate-500/30 bg-slate-500/10 text-slate-300",
          )}
        >
          {nivel === "VERIFICADO" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span>
            <strong>{ETIQUETAS_CONFIANZA[nivel]} · {evaluacion.puntos}/100.</strong>{" "}
            {evaluacion.motivos.join(" ")}
          </span>
        </p>

        {/* Factores */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {evaluacion.factores.map((factor: FactorConfianza) => (
            <div key={factor.id} className="rounded-lg border border-border/60 p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{factor.nombre}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {factor.puntos}/{factor.maximo}
                </p>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    factor.puntos >= factor.maximo * 0.7
                      ? "bg-emerald-500"
                      : factor.puntos > 0
                        ? "bg-amber-500"
                        : "bg-slate-600",
                  )}
                  style={{ width: `${Math.round((factor.puntos / factor.maximo) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{factor.detalle}</p>
            </div>
          ))}
        </div>

        {/* Detalle por fuente */}
        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="hidden grid-cols-[1.2fr_.8fr_.9fr_1fr_auto] gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Fuente</span>
            <span>Tipo</span>
            <span>Medición</span>
            <span>Valor</span>
            <span>Comprobar</span>
          </div>
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const definicion = FUENTES[item.fuente];
              const enlace = item.enlace ?? enlaceVerificacion(item.fuente, consulta);
              return (
                <li
                  key={item.fuente}
                  className="grid gap-1.5 px-3 py-2.5 text-sm sm:grid-cols-[1.2fr_.8fr_.9fr_1fr_auto] sm:items-center sm:gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{definicion?.nombre ?? item.fuente}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{item.origen}</p>
                  </div>
                  <div>
                    <ProcedenciaBadge tipo={item.tipo} fuente={item.origen} compacto />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <RelativeTime value={item.fecha} />
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">{formatearValor(item.fuente, item.valor)}</div>
                  <a
                    href={enlace}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-indigo-200"
                  >
                    Abrir
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              );
            })}
          </ul>
          {medidos.length === 0 && (
            <p className="flex items-start gap-2 border-t border-border/60 bg-slate-500/5 px-3 py-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Ninguna de estas cifras está medida todavía: salen del motor interno. Conecta las fuentes en
              Configuración → Diagnóstico o usa «Actualizar datos» para medirlas.
            </p>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cómo se calcula: cobertura de fuentes (45), frescura (25), diversidad de familias (15) y consistencia entre
          fuentes (15). Solo se muestra «Verificado» con dos o más fuentes medidas en los últimos siete días.
        </p>
      </CardContent>
    </Card>
  );
}
