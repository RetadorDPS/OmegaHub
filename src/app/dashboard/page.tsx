import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  ArrowRight,
  Boxes,
  Flame,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import {
  getAdStats,
  getDashboardStats,
  getGlobalTrendSeries,
  getTopProducts,
  listTrackedStoresTimeline,
} from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { CategoryBarChart, TrendAreaChart } from "@/components/charts/trend-area-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TrendScoreRing } from "@/components/domain/trend-score-ring";
import { SaturationBadge } from "@/components/domain/saturation-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatCompactNumber, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { SATURATION_LABELS } from "@/types";

export const metadata = {
  title: "Panel general",
  description: "Resumen de tendencias, oportunidades doradas y actividad de tus tiendas seguidas.",
};

/** Nombre corto del usuario para el saludo. */
function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 6) return "Buenas noches";
  if (hora < 13) return "Buenos días";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default async function DashboardPage() {
  const sesion = await auth();
  const usuarioId = sesion?.user?.id ?? "";

  const [stats, serie, destacados, anuncios, timeline] = await Promise.all([
    getDashboardStats(),
    getGlobalTrendSeries(30),
    getTopProducts(4),
    getAdStats(),
    usuarioId ? listTrackedStoresTimeline(usuarioId, 6) : Promise.resolve([]),
  ]);

  const porSaturacion = (nivel: string) => stats.saturacion.find((fila) => fila.nivel === nivel)?.cantidad ?? 0;

  return (
    <>
      <PageHeading
        title={`${saludo()}, ${sesion?.user?.name?.split(" ")[0] ?? "de nuevo"}`}
        description="Esto es lo que está pasando ahora mismo en el mercado de dropshipping: oportunidades, saturación y movimientos de tus competidores."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/ads-spy">
                <Megaphone />
                Ver anuncios
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/fuentes">
                <Activity />
                Actualizar datos
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/winning-products?goldenOnly=true">
                <Sparkles />
                Oportunidades doradas
              </Link>
            </Button>
          </>
        }
      />

      {/* KPIs principales */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Productos analizados"
          value={stats.productos}
          icon={Boxes}
          hint={`${stats.porCategoria.length} categorías activas`}
          delta={stats.variacionProductos ?? undefined}
        />
        <StatCard
          // Si ninguna está verificada, el nombre lo dice: no se vende una
          // estimación como una oportunidad confirmada.
          label={stats.dorados > 0 && stats.verificados === 0 ? "Oportunidades estimadas" : "Oportunidades doradas"}
          value={stats.dorados}
          icon={Trophy}
          accent="emerald"
          hint={`${stats.verificados} con datos verificados · resto, estimación`}
        />
        <StatCard
          label="Anuncios monitorizados"
          value={stats.anuncios}
          icon={Megaphone}
          accent="violet"
          hint={`El más longevo: ${anuncios.masLargo?.daysActive ?? 0} días activo`}
          delta={stats.variacionAnuncios ?? undefined}
        />
        <StatCard
          label="Facturación del nicho"
          value={stats.facturacionTotal}
          icon={TrendingUp}
          accent="amber"
          compact
          hint="Estimación mensual agregada"
        />
        <StatCard
          label="Datos verificados"
          value={stats.verificados}
          icon={ShieldCheck}
          accent="emerald"
          hint={`${stats.productos > 0 ? Math.round((stats.verificados / stats.productos) * 100) : 0} % del catálogo · 2+ fuentes medidas`}
        />
      </div>

      {/* Gráfica + oportunidades */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendAreaChart
            data={serie}
            description="Score medio de los 20 productos ganadores durante los últimos 30 días. Cada punto agrega las cuatro fuentes: Google Trends, TikTok, Meta Ad Library y tiendas Shopify detectadas."
          />
        </div>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-400" />
              Oportunidades de hoy
            </CardTitle>
            <CardDescription>Mayor score con menor competencia</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {destacados.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Sin productos todavía"
                description="Ejecuta el seed para cargar el catálogo de demostración."
              />
            ) : (
              destacados.map((producto) => (
                <Link
                  key={producto.id}
                  href={`/dashboard/winning-products/${producto.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-border/60 bg-surface/40 p-2.5 transition-colors hover:border-indigo-500/50 hover:bg-surface"
                >
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                    <Image src={producto.mainImage} alt="" fill sizes="48px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium group-hover:text-indigo-300">{producto.title}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <SaturationBadge level={producto.saturationLevel} withTooltip={false} className="text-[10px]" />
                      <span className="text-[11px] text-muted-foreground">
                        vel. {Math.round(producto.velocityScore)}
                      </span>
                    </div>
                  </div>
                  <TrendScoreRing score={producto.trendScore} size={44} strokeWidth={4} />
                </Link>
              ))
            )}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/dashboard/winning-products">
                Ver todo el catálogo
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Categorías, saturación y timeline */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Rendimiento por categoría</CardTitle>
            <CardDescription>Número de productos y score medio por categoría</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.porCategoria} />
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {stats.porCategoria.slice(0, 3).map((categoria) => (
                <div key={categoria.categoria} className="rounded-lg border border-border/60 bg-surface/40 p-3">
                  <p className="text-xs text-muted-foreground">{categoria.categoria}</p>
                  <p className="text-lg font-semibold">{categoria.scoreMedio}</p>
                  <p className="text-[11px] text-muted-foreground">
                    score medio · margen {categoria.margenMedio} %
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Distribución de saturación */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-4 text-indigo-400" />
                Saturación del mercado
              </CardTitle>
              <CardDescription>Cómo se reparte la competencia en el catálogo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((nivel) => {
                const cantidad = porSaturacion(nivel);
                const porcentaje = stats.productos ? Math.round((cantidad / stats.productos) * 100) : 0;
                const color =
                  nivel === "LOW" ? "bg-emerald-500" : nivel === "MEDIUM" ? "bg-amber-500" : "bg-rose-500";
                return (
                  <div key={nivel} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Saturación {SATURATION_LABELS[nivel].toLowerCase()}</span>
                      <span className="font-medium tabular-nums">
                        {cantidad} productos · {porcentaje} %
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${porcentaje}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
                <p className="text-xs text-muted-foreground">Score medio del catálogo</p>
                <p className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-indigo-300">{stats.scoreMedio}</span>
                  <span className="text-xs text-muted-foreground">/ 100 · margen medio {stats.margenMedio} %</span>
                </p>
                <Progress value={stats.scoreMedio} className="mt-2" />
              </div>
            </CardContent>
          </Card>

          {/* Timeline de tiendas seguidas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="size-4 text-amber-400" />
                Movimientos de tus tiendas
              </CardTitle>
              <CardDescription>Cambios detectados en las tiendas que sigues</CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState
                  icon={Store}
                  title="No sigues ninguna tienda"
                  description="Analiza una tienda Shopify y pulsa «Rastrear esta tienda» para empezar a ver su actividad aquí."
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/shop-analyzer">Analizar una tienda</Link>
                    </Button>
                  }
                />
              ) : (
                <ol className="space-y-3">
                  {timeline.map((evento) => (
                    <li key={evento.id} className="flex gap-3">
                      <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                        <Flame className="size-3" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{evento.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{evento.description}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
                          <span>{evento.storeName}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(evento.detectedAt)}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Resumen rápido */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-violet-400" />
                Actividad de la plataforma
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tiendas analizadas</span>
                <Badge variant="secondary">{stats.tiendas}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Proveedores verificados</span>
                <Badge variant="secondary">{stats.proveedores}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Usuarios activos</span>
                <Badge variant="secondary">{stats.usuarios}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Visualizaciones TikTok (catálogo)</span>
                <Badge variant="violet">{formatCompactNumber(stats.productos * 21_000_000)}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Facturación de referencia</span>
                <Badge variant="success">{formatCurrency(stats.facturacionTotal)}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
