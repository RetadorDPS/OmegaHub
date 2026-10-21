import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Bookmark,
  Boxes,
  ExternalLink,
  Flame,
  LineChart,
  Megaphone,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import { auth } from "@/auth";
import { getProductDetail, getSavedProductIds } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { ProductGallery } from "@/components/domain/product-gallery";
import { ProductMetricsPanel } from "@/components/domain/product-metrics";
import { ProductAiStudio } from "@/components/domain/product-ai-studio";
import { ProfitCalculator } from "@/components/domain/profit-calculator";
import { SaveProductButton } from "@/components/domain/save-product-button";
import { TrackProductButton } from "@/components/domain/track-product-button";
import { BotonInformePdf } from "@/components/domain/boton-informe-pdf";
import { ImportadorTendencias } from "@/components/domain/importador-tendencias";
import { ProductTrendChart } from "@/components/charts/trend-area-chart";
import { TrendScoreRing, TrendScoreBar } from "@/components/domain/trend-score-ring";
import { SaturationBadge } from "@/components/domain/saturation-badge";
import { SelloConfianza } from "@/components/domain/sello-confianza";
import { ProcedenciaPanel } from "@/components/domain/procedencia-panel";
import { obtenerProcedenciaProducto } from "@/lib/confianzaProducto";
import { etiquetaOportunidad } from "@/lib/confianza";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { COUNTRY_FLAGS, COUNTRY_NAMES } from "@/lib/constants";
import { formatCompactNumber, formatCurrency, formatCurrencyPrecise, formatPercent, formatRelativeTime } from "@/lib/utils";
import { PLATFORM_LABELS, TREND_DIRECTION_LABELS } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle de producto (genera metadatos dinámicos para SEO básico). */
export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const detalle = await getProductDetail(id);
  if (!detalle) return { title: "Producto no encontrado" };
  return {
    title: detalle.product.title,
    description: detalle.product.description.slice(0, 160),
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [detalle, sesion, procedencia] = await Promise.all([
    getProductDetail(id),
    auth(),
    obtenerProcedenciaProducto(id),
  ]);
  if (!detalle) notFound();

  const { product, metrics, ads, stores } = detalle;
  const guardados = sesion?.user?.id ? await getSavedProductIds(sesion.user.id) : [];
  const yaGuardado = guardados.includes(product.id);

  // Variación del score en los últimos 30 días (para la insignia de tendencia).
  const primerScore = metrics[0]?.calculatedScore ?? product.trendScore;
  const variacion = product.trendScore - primerScore;

  const proveedores = [
    { nombre: "AliExpress", url: product.aliExpressUrl, etiqueta: "Precio más bajo", nota: "Pedidos unitarios y envío a todo el mundo" },
    { nombre: "CJ Dropshipping", url: product.cjUrl, etiqueta: "Fulfillment europeo", nota: "Almacén en la UE: 3-5 días sin aduanas" },
    { nombre: "Amazon", url: product.amazonUrl, etiqueta: "Referencia de mercado", nota: "Precio de venta de la competencia" },
  ].filter((proveedor) => Boolean(proveedor.url));

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/dashboard/winning-products">
            <ArrowLeft />
            Volver al catálogo
          </Link>
        </Button>
      </div>

      <PageHeading
        title={product.title}
        description={`${product.category} · ${product.nicheTag} · Actualizado ${formatRelativeTime(product.updatedAt)}`}
        actions={
          <>
            <SaveProductButton productId={product.id} saved={yaGuardado} />
            <TrackProductButton productId={product.id} tracked={false} />
            <BotonInformePdf origen="producto" id={product.id} />
          </>
        }
      />

      {/* Insignias de estado */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SelloConfianza
          nivel={product.nivelConfianza}
          puntos={product.confianza}
          fuentesMedidas={product.fuentesMedidas}
          diasDesdeUltima={product.ultimaMedicion ? Math.max(0, Math.floor((Date.now() - new Date(product.ultimaMedicion).getTime()) / 86_400_000)) : null}
        />
        {product.isGoldenOpportunity && (
          <Badge
            variant={product.nivelConfianza === "VERIFICADO" ? "gradient" : "outline"}
            className={product.nivelConfianza === "VERIFICADO" ? "gap-1" : "gap-1 border-amber-500/40 bg-amber-500/10 text-amber-200"}
          >
            <Sparkles className="size-3" />
            {etiquetaOportunidad(true, product.nivelConfianza)}
          </Badge>
        )}
        <SaturationBadge level={product.saturationLevel} />
        <Badge variant={product.trendDirection === "RISING" ? "success" : product.trendDirection === "FALLING" ? "danger" : "muted"} className="gap-1">
          <TrendingUp className="size-3" />
          {TREND_DIRECTION_LABELS[product.trendDirection]} · velocidad {Math.round(product.velocityScore)}
        </Badge>
        {product.velocityScore >= 70 && (
          <Badge variant="danger" className="gap-1">
            <Flame className="size-3" />
            Producto viral
          </Badge>
        )}
        {product.countryAvailability.map((codigo) => (
          <Badge key={codigo} variant="outline" className="gap-1">
            <span aria-hidden>{COUNTRY_FLAGS[codigo] ?? "🌍"}</span>
            {COUNTRY_NAMES[codigo] ?? codigo}
          </Badge>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Columna principal */}
        <div className="min-w-0 space-y-6">
          <Tabs defaultValue="analisis">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="analisis">
                <LineChart />
                Análisis
              </TabsTrigger>
              <TabsTrigger value="metricas">
                <Boxes />
                Métricas por plataforma
              </TabsTrigger>
              <TabsTrigger value="procedencia">
                <ShieldCheck />
                Confianza
              </TabsTrigger>
            <TabsTrigger value="competencia">
                <Store />
                Competencia
              </TabsTrigger>
              <TabsTrigger value="anuncios">
                <Megaphone />
                Anuncios
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles />
                AI Marketing
              </TabsTrigger>
            </TabsList>

            {/* --- Análisis --- */}
            <TabsContent value="analisis" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Evolución del TrendScore (30 días)</CardTitle>
                  <CardDescription>
                    Score diario junto a las señales de demanda: búsquedas en Google, visualizaciones en TikTok y
                    anuncios activos en Meta.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ProductTrendChart data={metrics} />
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { etiqueta: "Score actual", valor: String(product.trendScore) },
                      { etiqueta: "Variación 30 días", valor: `${variacion >= 0 ? "+" : ""}${variacion} pts` },
                      {
                        etiqueta: "Score mínimo",
                        valor: String(Math.min(...metrics.map((metrica) => metrica.calculatedScore))),
                      },
                      {
                        etiqueta: "Score máximo",
                        valor: String(Math.max(...metrics.map((metrica) => metrica.calculatedScore))),
                      },
                    ].map((dato) => (
                      <div key={dato.etiqueta} className="rounded-lg border border-border/60 bg-surface/40 p-3">
                        <p className="text-[11px] text-muted-foreground">{dato.etiqueta}</p>
                        <p className="text-lg font-semibold tabular-nums">{dato.valor}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Ficha del producto</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-muted-foreground">{product.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {product.tags.map((etiqueta) => (
                        <Badge key={etiqueta} variant="secondary" className="text-[10px]">
                          {etiqueta}
                        </Badge>
                      ))}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Coste del proveedor</dt>
                        <dd className="font-semibold">{formatCurrencyPrecise(product.costPrice)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Precio de venta sugerido</dt>
                        <dd className="font-semibold">{formatCurrencyPrecise(product.suggestedSellPrice)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Margen bruto</dt>
                        <dd className="font-semibold text-emerald-400">{formatPercent(product.estimatedMargin)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Beneficio por unidad</dt>
                        <dd className="font-semibold text-emerald-400">
                          {formatCurrencyPrecise(product.suggestedSellPrice - product.costPrice)}
                        </dd>
                      </div>
                    </dl>
                    {product.supplierName && (
                      <p className="text-xs text-muted-foreground">
                        Proveedor de referencia: <span className="text-foreground">{product.supplierName}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>

                <ProfitCalculator costPrice={product.costPrice} sellPrice={product.suggestedSellPrice} />
              </div>
            </TabsContent>

            {/* --- Métricas por plataforma --- */}
            <TabsContent value="procedencia" className="space-y-6">
              {procedencia ? (
                <ProcedenciaPanel
                  nivel={procedencia.evaluacion.nivel}
                  evaluacion={procedencia.evaluacion}
                  items={procedencia.items}
                  consulta={procedencia.consulta}
                />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="Sin datos de procedencia"
                  description="Este producto todavía no tiene mediciones registradas."
                />
              )}
            </TabsContent>

            <TabsContent value="metricas">
              <div className="mb-4">
                <ImportadorTendencias productoId={product.id} />
              </div>

              <ProductMetricsPanel
                product={product}
                metrics={metrics}
                platformBreakdown={[]}
              />
            </TabsContent>

            {/* --- Competencia --- */}
            <TabsContent value="competencia" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tiendas que venden este producto</CardTitle>
                  <CardDescription>
                    Detectadas por el radar de tiendas Shopify. Incluye el precio al que lo venden y las unidades
                    estimadas al mes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stores.length === 0 ? (
                    <EmptyState
                      icon={Store}
                      title="Sin tiendas detectadas"
                      description="Ninguna de las tiendas del radar vende este producto por ahora."
                    />
                  ) : (
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tienda</TableHead>
                          <TableHead>País</TableHead>
                          <TableHead className="text-right">Precio</TableHead>
                          <TableHead className="text-right">Unidades/mes</TableHead>
                          <TableHead className="text-right">Facturación</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stores.map((tienda) => (
                          <TableRow key={tienda.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{tienda.name}</span>
                                <span className="text-xs text-muted-foreground">{tienda.domain}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1.5 text-sm">
                                <span aria-hidden>{COUNTRY_FLAGS[tienda.country] ?? "🌍"}</span>
                                {tienda.country}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrencyPrecise(tienda.price)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCompactNumber(tienda.estimatedUnitsSold)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(tienda.estimatedMonthlyRevenue)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild variant="ghost" size="sm">
                                <a
                                  href={tienda.productUrl ?? `https://${tienda.domain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Ver
                                  <ExternalLink className="size-3" />
                                </a>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Proveedores */}
              <Card>
                <CardHeader>
                  <CardTitle>Proveedores y enlaces directos</CardTitle>
                  <CardDescription>Compara precio, plazos de entrega y condiciones antes de comprar stock.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  {proveedores.map((proveedor) => (
                    <a
                      key={proveedor.nombre}
                      href={proveedor.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-xl border border-border/60 bg-surface/40 p-4 transition-colors hover:border-indigo-500/50 hover:bg-surface"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium group-hover:text-indigo-300">{proveedor.nombre}</span>
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                      </div>
                      <Badge variant="secondary" className="my-2 text-[10px]">
                        {proveedor.etiqueta}
                      </Badge>
                      <p className="text-xs text-muted-foreground">{proveedor.nota}</p>
                    </a>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- Anuncios --- */}
            <TabsContent value="anuncios">
              <Card>
                <CardHeader>
                  <CardTitle>Anuncios de este producto</CardTitle>
                  <CardDescription>Creatividades activas detectadas en las bibliotecas publicitarias.</CardDescription>
                </CardHeader>
                <CardContent>
                  {ads.length === 0 ? (
                    <EmptyState
                      icon={Megaphone}
                      title="Sin anuncios vinculados"
                      description="Todavía no hemos detectado anuncios activos para este producto."
                      action={
                        <Button asChild variant="outline" size="sm">
                          <Link href="/dashboard/ads-spy">Explorar Ads Spy</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {ads.map((anuncio) => (
                        <div key={anuncio.id} className="flex gap-3 rounded-xl border border-border/60 bg-surface/40 p-3">
                          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                            <Image src={anuncio.thumbnailUrl ?? anuncio.mediaUrl} alt="" fill sizes="80px" className="object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">
                                {PLATFORM_LABELS[anuncio.platform]}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">{anuncio.daysActive} días activo</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm font-medium">{anuncio.headline}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {formatCompactNumber(anuncio.likes)} me gusta · {formatCompactNumber(anuncio.comments)} comentarios
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- AI Marketing --- */}
            <TabsContent value="ai">
              <ProductAiStudio product={product} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Columna lateral: galería, score y resumen */}
        <div className="space-y-6">
          <ProductGallery images={product.images} title={product.title} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">TrendScore</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <TrendScoreRing score={product.trendScore} size={88} strokeWidth={8} showLabel />
                <div className="flex-1 space-y-2">
                  <TrendScoreBar score={product.trendScore} label="Demanda" />
                  <TrendScoreBar score={Math.round(product.velocityScore)} label="Velocidad" />
                  <TrendScoreBar
                    score={product.saturationLevel === "LOW" ? 90 : product.saturationLevel === "MEDIUM" ? 55 : 25}
                    label="Hueco de mercado"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Google</p>
                  <p className="text-sm font-semibold tabular-nums">{formatCompactNumber(product.googleSearchVolume)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">TikTok</p>
                  <p className="text-sm font-semibold tabular-nums">{formatCompactNumber(product.tiktokViews)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Meta Ads</p>
                  <p className="text-sm font-semibold tabular-nums">{product.metaAdsCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Potencial de mercado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Facturación estimada</span>
                <span className="font-semibold">{formatCurrency(product.estimatedMonthlyRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unidades al mes</span>
                <span className="font-semibold tabular-nums">{formatCompactNumber(product.estimatedUnitsSold)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tiendas compitiendo</span>
                <span className="font-semibold tabular-nums">{formatCompactNumber(product.storesUsing)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Beneficio por venta</span>
                <span className="font-semibold text-emerald-400">
                  {formatCurrencyPrecise(product.suggestedSellPrice - product.costPrice)}
                </span>
              </div>
              <Button asChild className="w-full" variant="outline" size="sm">
                <Link href="/dashboard/ads-spy">
                  <Megaphone />
                  Ver anuncios de este nicho
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShoppingCart className="size-4 text-indigo-400" />
                Acciones rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <Link href={`/dashboard/shop-analyzer?producto=${encodeURIComponent(product.title)}`}>
                  <Store />
                  Analizar tiendas de la competencia
                </Link>
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" asChild>
                <Link href="/dashboard/product-tracker">
                  <Bookmark />
                  Ver mis productos seguidos
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
