import Link from "next/link";
import { auth } from "@/auth";
import { listStores, listTrackedStores, listTrackedStoresTimeline } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { StoreCard, StoreDiscoveryCard } from "@/components/domain/store-card";
import { StoreTimeline } from "@/components/domain/store-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn, formatCompactNumber, formatCurrency, formatNumber } from "@/lib/utils";
import { Bell, Building2, History, Radar, TrendingUp } from "lucide-react";

export const metadata = {
  title: "Store Tracker",
  description: "Sigue tiendas Shopify de la competencia y recibe alertas de cada cambio detectado.",
};

/** Módulo 8 · Store Tracker: tiendas monitorizadas, timeline de cambios y radar global. */
export default async function StoreTrackerPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [seguidas, timeline, radar] = await Promise.all([
    listTrackedStores(sesion.user.id),
    listTrackedStoresTimeline(sesion.user.id, 40),
    listStores(8),
  ]);

  const idsSeguidas = new Set(seguidas.map((tienda) => tienda.id));
  const descubrir = radar.filter((tienda) => !idsSeguidas.has(tienda.id)).slice(0, 4);

  const facturacionSeguida = seguidas.reduce((suma, tienda) => suma + tienda.estimatedMonthlyRevenue, 0);
  const visitasSeguidas = seguidas.reduce((suma, tienda) => suma + tienda.monthlyVisits, 0);
  const cambiosSemana = timeline.filter(
    (evento) => Date.now() - new Date(evento.detectedAt).getTime() < 7 * 86_400_000,
  ).length;

  return (
    <>
      <PageHeading
        title="Store Tracker"
        description="Monitoriza tiendas Shopify de la competencia: cada producto nuevo, cambio de precio o pico de tráfico queda registrado en su timeline."
        actions={
          <Button asChild className="gap-2">
            <Link href="/dashboard/shop-analyzer">
              <Radar className="size-4" />
              Analizar nueva tienda
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tiendas seguidas" value={seguidas.length} icon={Building2} hint="Alertas activas" />
        <StatCard
          label="Facturación agregada"
          value={formatCurrency(facturacionSeguida)}
          icon={TrendingUp}
          accent="emerald"
          hint="Suma mensual estimada del conjunto"
        />
        <StatCard
          label="Visitas agregadas"
          value={formatCompactNumber(visitasSeguidas)}
          icon={History}
          accent="violet"
          hint={`${formatNumber(visitasSeguidas)} sesiones al mes`}
        />
        <StatCard
          label="Cambios esta semana"
          value={cambiosSemana}
          icon={Bell}
          accent="amber"
          hint="Productos, precios y tráfico"
        />
      </div>

      {seguidas.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="Aún no sigues ninguna tienda"
          description="Analiza una tienda con el Shop Analyzer y pulsa «Rastrear esta tienda» para recibir alertas de cada cambio."
          action={
            <div className="flex flex-col items-center gap-4">
              <Button asChild className="gap-2">
                <Link href="/dashboard/shop-analyzer">
                  <Radar className="size-4" />
                  Ir al Shop Analyzer
                </Link>
              </Button>
              {descubrir.length > 0 && (
                <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {descubrir.map((tienda, indice) => (
                    <StoreDiscoveryCard key={tienda.id} store={tienda} index={indice} />
                  ))}
                </div>
              )}
            </div>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {/* Tiendas seguidas */}
          <div className="space-y-5 xl:col-span-2">
            <div className="grid gap-5 lg:grid-cols-2">
              {seguidas.map((tienda, indice) => (
                <StoreCard key={tienda.id} store={tienda} index={indice} />
              ))}
            </div>

            {descubrir.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Radar className="size-4 text-indigo-400" />
                    Radar de tiendas que aún no sigues
                  </CardTitle>
                  <CardDescription>
                    Tiendas con mayor facturación estimada del ranking global. Añádelas para monitorizarlas.
                  </CardDescription>
                </CardHeader>
                <CardContent className={cn("grid gap-4 sm:grid-cols-2")}>
                  {descubrir.map((tienda, indice) => (
                    <StoreDiscoveryCard key={tienda.id} store={tienda} index={indice} />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Timeline agregado */}
          <Card className="h-fit xl:sticky xl:top-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-violet-400" />
                Timeline de cambios
              </CardTitle>
              <CardDescription>
                {timeline.length} eventos detectados en tus {seguidas.length} tiendas seguidas
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-y-auto pr-2">
              <StoreTimeline eventos={timeline} mostrarTienda limite={30} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
