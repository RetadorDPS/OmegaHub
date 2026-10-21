import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Cog, Globe, Layers3, TrendingUp, Users } from "lucide-react";
import prisma from "@/lib/prisma";
import { getStoreDetail } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { StoreTimeline } from "@/components/domain/store-timeline";
import { TrackStoreButton } from "@/components/domain/track-store-button";
import { BotonInformePdf } from "@/components/domain/boton-informe-pdf";
import { PrecioHistoricoChart } from "@/components/charts/precio-historico-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COUNTRY_FLAGS, COUNTRY_NAMES } from "@/lib/constants";
import { formatCompactNumber, formatCurrency, formatCurrencyPrecise, formatNumber, formatRelativeTime } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Historial completo de una tienda monitorizada. */
export default async function StoreDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [detalle, seguimiento] = await Promise.all([
    getStoreDetail(id),
    prisma.trackedStore.findFirst({ where: { storeId: id } }),
  ]);

  if (!detalle) notFound();
  const { store, changes } = detalle;

  // Historial de precios REAL de los análisis previos:
  // hasta 3 productos con más instantáneas, por ronda.
  const historial = await prisma.priceHistory.findMany({
    where: { storeId: id },
    orderBy: { capturedAt: "asc" },
  });
  const conteos = new Map<string, number>();
  for (const fila of historial) conteos.set(fila.title, (conteos.get(fila.title) ?? 0) + 1);
  const titulos = [...conteos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([titulo]) => titulo);
  // Se agrupa por DÍA (no por instante): varios análisis del mismo día son un
  // solo punto en la gráfica y se conserva el último precio detectado.
  const porRonda = new Map<string, Record<string, number>>();
  for (const fila of historial) {
    if (!titulos.includes(fila.title)) continue;
    const clave = fila.capturedAt.toISOString().slice(0, 10);
    if (!porRonda.has(clave)) porRonda.set(clave, {});
    porRonda.get(clave)![fila.title] = fila.price;
  }
  const seriePrecios = [...porRonda.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, precios]) => ({ fecha, ...precios }));

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/dashboard/store-tracker">
            <ArrowLeft />
            Volver al Store Tracker
          </Link>
        </Button>
      </div>

      <PageHeading
        title={store.name}
        description={`${store.domain} · nicho ${store.niche} · ${
          store.lastScannedAt ? `último análisis ${formatRelativeTime(store.lastScannedAt)}` : "sin análisis reciente"
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TrackStoreButton storeId={store.id} companyName={store.name} tracked={Boolean(seguimiento)} />
            <BotonInformePdf origen="tienda" id={store.id} />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {store.shopifyDetected && (
          <Badge variant="success" className="gap-1">
            <Globe className="size-3" />
            Shopify confirmado
          </Badge>
        )}
        <Badge variant="outline" className="gap-1">
          <span aria-hidden>{COUNTRY_FLAGS[store.country] ?? "🌍"}</span>
          {COUNTRY_NAMES[store.country] ?? store.country}
        </Badge>
        {store.themeName && <Badge variant="muted">Tema {store.themeName}</Badge>}
        <Badge variant="violet">{store.productsCount} productos</Badge>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Facturación estimada"
          value={formatCurrency(store.estimatedMonthlyRevenue)}
          icon={TrendingUp}
          accent="emerald"
          hint="por mes"
        />
        <StatCard
          label="Visitas mensuales"
          value={formatCompactNumber(store.monthlyVisits)}
          icon={Users}
          hint={`${formatNumber(store.monthlyVisits)} sesiones`}
        />
        <StatCard
          label="Ticket medio"
          value={formatCurrencyPrecise(store.avgOrderValue)}
          icon={Boxes}
          accent="violet"
          hint={`conversión ${store.conversionRate} %`}
        />
        <StatCard
          label="Cambios detectados"
          value={changes.length}
          icon={Layers3}
          accent="amber"
          hint="en el historial disponible"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Historial de cambios</CardTitle>
            <CardDescription>
              Cada producto lanzado, precio modificado o pico de tráfico queda registrado con su impacto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
          <PrecioHistoricoChart data={seriePrecios} />
        </div>

        <StoreTimeline eventos={changes} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Categorías */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="size-4 text-indigo-400" />
                Categorías del catálogo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {store.categories.map((categoria) => {
                // Las categorías se guardan como texto ("Salud"); el peso se
                // reparte por el número de productos detectados en cada una.
                const productosCategoria = store.topProducts.filter((producto) =>
                  producto.title.toLowerCase().includes(categoria.toLowerCase()),
                ).length;
                const peso =
                  store.topProducts.length > 0
                    ? Math.max(
                        8,
                        Math.round(
                          ((productosCategoria || 1) / store.topProducts.length) * 100,
                        ),
                      )
                    : 100 / Math.max(store.categories.length, 1);
                return (
                  <div key={categoria} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-100">{categoria}</span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(peso)} %</span>
                    </div>
                    <Progress value={Number(peso.toFixed(1))} className="h-1.5" />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Apps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cog className="size-4 text-amber-400" />
                Stack tecnológico
              </CardTitle>
              <CardDescription>Apps y servicios detectados en la tienda</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {store.appsDetected.map((app) => (
                <Badge key={app} variant="outline">
                  {app}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Catálogo completo */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Catálogo y ventas estimadas</CardTitle>
          <CardDescription>Productos ordenados por volumen de ventas detectado</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Precio anterior</TableHead>
                  <TableHead className="text-right">Uds. al mes</TableHead>
                  <TableHead className="text-right">Enlace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.topProducts.map((producto) => (
                  <TableRow key={producto.title}>
                    <TableCell className="text-muted-foreground">{producto.salesRank}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {producto.image && (
                          <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                            <Image src={producto.image} alt={producto.title} fill sizes="40px" className="object-cover" />
                          </span>
                        )}
                        <span className="line-clamp-2 text-sm text-slate-100">{producto.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyPrecise(producto.price)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {producto.comparePrice ? formatCurrencyPrecise(producto.comparePrice) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(producto.estimatedUnitsSold)}</TableCell>
                    <TableCell className="text-right">
                      {producto.productUrl ? (
                        <Button asChild variant="link" size="sm">
                          <a href={producto.productUrl} target="_blank" rel="noopener noreferrer">
                            Ver
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
