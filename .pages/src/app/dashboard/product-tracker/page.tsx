import Link from "next/link";
import { auth } from "@/auth";
import { listTrackedProductAlerts, listTrackedProducts, listSavedProducts } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { TrackedProductCard } from "@/components/domain/tracked-product-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, BellRing, Bookmark, Target, TrendingUp } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { NOTIFICATION_TYPE_LABELS } from "@/types";

export const metadata = {
  title: "Product Tracker",
  description: "Sigue la evolución de productos concretos, define umbrales de alerta y revisa su historial.",
};

/** Módulo 8 · Product Tracker: seguimiento fino de productos y sus alertas. */
export default async function ProductTrackerPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [seguidos, alertas, favoritos] = await Promise.all([
    listTrackedProducts(sesion.user.id),
    listTrackedProductAlerts(sesion.user.id, 25),
    listSavedProducts(sesion.user.id),
  ]);

  const scoreMedio =
    seguidos.length > 0
      ? seguidos.reduce((suma, item) => suma + item.product.trendScore, 0) / seguidos.length
      : 0;
  const dorados = seguidos.filter((item) => item.product.isGoldenOpportunity).length;
  const objetivosAlcanzados = seguidos.filter((item) => item.product.trendScore >= item.targetTrendScore).length;

  return (
    <>
      <PageHeading
        title="Product Tracker"
        description="Evolución del TrendScore de los productos que sigues, umbrales de alerta personalizados y avisos automáticos."
        actions={
          <Button asChild className="gap-2">
            <Link href="/dashboard/winning-products">
              <TrendingUp className="size-4" />
              Añadir productos
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Productos seguidos" value={seguidos.length} icon={Target} hint="con alertas configurables" />
        <StatCard
          label="Score medio"
          value={scoreMedio.toFixed(1)}
          icon={TrendingUp}
          accent="violet"
          hint="media del TrendScore seguido"
        />
        <StatCard
          label="Objetivos alcanzados"
          value={objetivosAlcanzados}
          icon={BellRing}
          accent="emerald"
          hint="productos por encima de su umbral"
        />
        <StatCard
          label="Oportunidades doradas"
          value={dorados}
          icon={Bell}
          accent="amber"
          hint="score > 80 y saturación baja"
        />
      </div>

      <Tabs defaultValue="seguimiento">
        <TabsList>
          <TabsTrigger value="seguimiento" className="gap-1.5">
            <Target className="size-3.5" />
            En seguimiento ({seguidos.length})
          </TabsTrigger>
          <TabsTrigger value="alertas" className="gap-1.5">
            <Bell className="size-3.5" />
            Alertas ({alertas.length})
          </TabsTrigger>
          <TabsTrigger value="favoritos" className="gap-1.5">
            <Bookmark className="size-3.5" />
            Favoritos ({favoritos.length})
          </TabsTrigger>
        </TabsList>

        {/* --- Productos en seguimiento --- */}
        <TabsContent value="seguimiento" className="space-y-4">
          {seguidos.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No sigues ningún producto todavía"
              description="Entra en el catálogo de Winning Products y pulsa «Seguir» en los productos que te interesen para ver su evolución y recibir alertas."
              action={
                <Button asChild className="gap-2">
                  <Link href="/dashboard/winning-products">
                    <TrendingUp className="size-4" />
                    Explorar el catálogo
                  </Link>
                </Button>
              }
            />
          ) : (
            seguidos.map((item, indice) => <TrackedProductCard key={item.id} item={item} index={indice} />)
          )}
        </TabsContent>

        {/* --- Alertas de los productos seguidos --- */}
        <TabsContent value="alertas">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="size-4 text-amber-400" />
                Historial de alertas
              </CardTitle>
              <CardDescription>
                Avisos generados por los productos que sigues: subidas de tendencia, cambios de saturación y precios.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alertas.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  Sin alertas todavía. Cuando un producto seguido supere su umbral o cambie de tendencia, aparecerá
                  aquí y en la campana de la cabecera.
                </p>
              ) : (
                alertas.map((alerta) => (
                  <div
                    key={alerta.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/40 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={alerta.read ? "muted" : "default"}>
                          {NOTIFICATION_TYPE_LABELS[alerta.type]}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeTime(alerta.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-slate-100">{alerta.title}</p>
                      <p className="text-xs text-muted-foreground">{alerta.message}</p>
                    </div>
                    {alerta.actionUrl && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={alerta.actionUrl}>Ver producto</Link>
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Favoritos guardados --- */}
        <TabsContent value="favoritos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bookmark className="size-4 text-indigo-400" />
                Favoritos guardados
              </CardTitle>
              <CardDescription>
                Productos marcados con la estrella desde el catálogo o el detalle, con sus notas y carpetas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {favoritos.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  Todavía no has guardado ningún producto en favoritos.
                </p>
              ) : (
                favoritos.map((favorito) => (
                  <div
                    key={favorito.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/40 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100">{favorito.product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Guardado {formatRelativeTime(favorito.createdAt)} · carpeta {favorito.folder} · prioridad{" "}
                        {favorito.priority}/3
                      </p>
                      {favorito.notes && <p className="mt-1 text-xs italic text-slate-300">“{favorito.notes}”</p>}
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/winning-products/${favorito.product.id}`}>Abrir ficha</Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
