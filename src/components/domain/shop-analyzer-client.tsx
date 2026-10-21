"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeEuro,
  Boxes,
  Building2,
  CheckCircle2,
  Clock,
  Cog,
  Eye,
  Layers3,
  Loader2,
  Radar,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrackStoreButton } from "@/components/domain/track-store-button";
import { cn, formatCompactNumber, formatCurrencyPrecise, formatNumber } from "@/lib/utils";
import type { StoreAnalysisResult } from "@/types";

/** Pasos que se muestran durante el análisis (feedback de progreso real). */
const PASOS = [
  { etiqueta: "Validando la URL y el dominio", icono: CheckCircle2 },
  { etiqueta: "Detectando la plataforma (Shopify / otra)", icono: Store },
  { etiqueta: "Extrayendo catálogo y precios", icono: ShoppingCart },
  { etiqueta: "Estimando tráfico, conversión y facturación", icono: TrendingUp },
  { etiqueta: "Analizando categorías, apps y competencia", icono: Layers3 },
];

const EJEMPLOS = ["nordicnest.com", "petlabstore.com", "glowritual.es"];

interface ShopAnalyzerProps {
  /** Tiendas ya monitorizadas por el usuario (para el botón de seguimiento). */
  seguidas: Array<{ storeId: string; storeName: string }>;
  /** URL prefijada desde la extensión (deep link ?url=). */
  urlInicial?: string;
}

/**
 * Formulario + panel de resultados del Shop Analyzer.
 *
 * El análisis se ejecuta en el servidor (Playwright si hay navegador
 * disponible; motor determinista si no) y el resultado se guarda en base de
 * datos, por lo que se puede rastrear la tienda después.
 */
export function ShopAnalyzerClient({
  seguidas,
  urlInicial,
}: ShopAnalyzerProps) {
  // Deep link: si llegamos con una URL (extensión), analizar al instante.
  useEffect(() => {
    if (urlInicial) {
      void analizar(urlInicial);
    }
    // Solo al montar: si el usuario cambia la URL después, decide él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [url, setUrl] = useState(urlInicial ?? "");
  const [analizando, setAnalizando] = useState(false);
  const [pasoActual, setPasoActual] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<StoreAnalysisResult | null>(null);

  /** Lanza el análisis contra la API. */
  async function analizar(destino = url) {
    if (!destino.trim()) {
      toast.error("Introduce la URL de una tienda");
      return;
    }

    setAnalizando(true);
    setError(null);
    setResultado(null);
    setPasoActual(0);

    // Animación de pasos: refleja el trabajo real del servidor sin bloquearlo.
    const temporizador = setInterval(() => {
      setPasoActual((paso) => (paso < PASOS.length - 1 ? paso + 1 : paso));
    }, 420);

    try {
      const respuesta = await fetch("/api/shop-analyzer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: destino }),
      });
      const datos = (await respuesta.json()) as StoreAnalysisResult & { error?: string };

      if (respuesta.status === 402) {
        setError(datos.error ?? "Has agotado los análisis de tu plan por hoy");
        toast.error("Cuota de análisis agotada");
        return;
      }
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo analizar la tienda");

      setPasoActual(PASOS.length);
      setResultado(datos);
      toast.success(
        `Análisis completado con el motor ${datos.engine === "PLAYWRIGHT" ? "Playwright (navegador real)" : "determinista"}`,
      );
    } catch (fallo) {
      const mensaje = (fallo as Error).message;
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      clearInterval(temporizador);
      setAnalizando(false);
    }
  }

  const yaSeguida = resultado ? seguidas.some((tienda) => tienda.storeId === resultado.store.id) : false;

  return (
    <div className="space-y-6">
      {/* --- Formulario de análisis --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-4 text-indigo-400" />
            Analizar una tienda Shopify
          </CardTitle>
          <CardDescription>
            Introduce el dominio de cualquier tienda de la competencia. Se detectan catálogo, precios, apps, tráfico
            estimado, facturación y nicho principal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(evento) => {
              evento.preventDefault();
              void analizar();
            }}
          >
            <Input
              value={url}
              onChange={(evento) => setUrl(evento.target.value)}
              placeholder="mi-tienda-competidora.com"
              aria-label="URL de la tienda"
              disabled={analizando}
              className="h-11 sm:flex-1"
            />
            <Button type="submit" size="lg" loading={analizando} className="gap-2 sm:w-48">
              {!analizando && <Radar className="size-4" />}
              {analizando ? "Analizando…" : "Analizar tienda"}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Prueba con un ejemplo:</span>
            {EJEMPLOS.map((ejemplo) => (
              <button
                key={ejemplo}
                type="button"
                disabled={analizando}
                onClick={() => {
                  setUrl(ejemplo);
                  void analizar(ejemplo);
                }}
                className="rounded-full border border-border px-2.5 py-0.5 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 disabled:opacity-50"
              >
                {ejemplo}
              </button>
            ))}
          </div>

          {/* Progreso del análisis */}
          {analizando && (
            <div className="space-y-3 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4">
              <Progress value={((pasoActual + 1) / PASOS.length) * 100} />
              <ul className="space-y-1.5 text-sm">
                {PASOS.map((paso, indice) => {
                  const completado = indice < pasoActual;
                  const activo = indice === pasoActual;
                  return (
                    <li
                      key={paso.etiqueta}
                      className={cn(
                        "flex items-center gap-2",
                        completado && "text-emerald-300",
                        activo && "text-slate-100",
                        !completado && !activo && "text-muted-foreground",
                      )}
                    >
                      {activo ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : completado ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <Clock className="size-3.5" />
                      )}
                      {paso.etiqueta}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{error}</p>
                <p className="mt-0.5 text-rose-300/80">
                  Comprueba que el dominio sea correcto o amplía tu plan para más análisis diarios.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Resultado del análisis --- */}
      {resultado && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Cabecera del resultado */}
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg font-bold text-white">
                  {resultado.store.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {resultado.store.name}
                    {resultado.detected.shopify ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="size-3" />
                        Shopify detectado
                      </Badge>
                    ) : (
                      <Badge variant="muted">Plataforma no confirmada</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {resultado.store.domain} · nicho {resultado.store.niche} ·{" "}
                    {resultado.detected.theme ? `tema ${resultado.detected.theme}` : "tema no detectado"} ·
                    analizado en {resultado.durationMs} ms
                  </CardDescription>
                </div>
              </div>
              <TrackStoreButton
                storeId={resultado.store.id}
                companyName={resultado.store.name}
                tracked={yaSeguida}
              />
            </CardHeader>
          </Card>

          {/* KPIs del análisis */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTienda
              icono={BadgeEuro}
              etiqueta="Facturación estimada"
              valor={formatCurrencyPrecise(resultado.metrics.estimatedMonthlyRevenue)}
              detalle="por mes, con la conversión detectada"
            />
            <KpiTienda
              icono={Users}
              etiqueta="Visitas mensuales"
              valor={formatCompactNumber(resultado.metrics.estimatedMonthlyVisits)}
              detalle={`${formatNumber(resultado.metrics.estimatedMonthlyVisits)} sesiones`}
            />
            <KpiTienda
              icono={ShoppingCart}
              etiqueta="Ticket medio"
              valor={formatCurrencyPrecise(resultado.metrics.avgOrderValue)}
              detalle={`conversión ${resultado.metrics.conversionRate} %`}
            />
            <KpiTienda
              icono={Eye}
              etiqueta="Ingreso por visita"
              valor={formatCurrencyPrecise(resultado.metrics.revenuePerVisitor)}
              detalle="revenue per visitor"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Top productos */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="size-4 text-indigo-400" />
                  Top productos de la tienda
                </CardTitle>
                <CardDescription>
                  {resultado.detected.productCount} productos en el catálogo · ordenados por ventas estimadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table className="min-w-[680px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Uds./mes</TableHead>
                        <TableHead className="text-right">Peso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resultado.topProducts.map((producto) => (
                        <TableRow key={producto.title}>
                          <TableCell className="text-muted-foreground">{producto.salesRank}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {producto.image && (
                                <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                                  <Image
                                    src={producto.image}
                                    alt={producto.title}
                                    fill
                                    sizes="40px"
                                    className="object-cover"
                                  />
                                </span>
                              )}
                              <span className="line-clamp-2 text-sm text-slate-100">{producto.title}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {producto.comparePrice ? (
                              <span className="flex flex-col items-end">
                                <span>{formatCurrencyPrecise(producto.price)}</span>
                                <span className="text-xs text-muted-foreground line-through">
                                  {formatCurrencyPrecise(producto.comparePrice)}
                                </span>
                              </span>
                            ) : (
                              formatCurrencyPrecise(producto.price)
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(producto.estimatedUnitsSold)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={producto.salesRank <= 3 ? "success" : "muted"}>
                              {producto.salesRank <= 3 ? "Best seller" : "Catálogo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* Categorías */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Layers3 className="size-4 text-violet-400" />
                    Categorías detectadas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resultado.categories.map((categoria) => (
                    <div key={categoria.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-100">{categoria.name}</span>
                        <span className="tabular-nums text-muted-foreground">{categoria.share} %</span>
                      </div>
                      <Progress value={categoria.share} className="h-1.5" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Apps y tecnología */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Cog className="size-4 text-amber-400" />
                    Tecnología y apps
                  </CardTitle>
                  <CardDescription>Detectadas en el código de la tienda</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {resultado.detected.apps.map((app) => (
                    <Badge key={app} variant="outline">
                      {app}
                    </Badge>
                  ))}
                </CardContent>
              </Card>

              {/* Competencia */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 text-emerald-400" />
                    Competencia directa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resultado.competitors.map((competidor) => (
                    <div key={competidor.domain} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-slate-100">{competidor.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{competidor.domain}</p>
                      </div>
                      <span className="shrink-0 tabular-nums text-emerald-300">
                        {formatCompactNumber(competidor.estimatedRevenue)} $
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Avisos del motor */}
          {resultado.warnings.length > 0 && (
            <Card className="border-amber-500/25 bg-amber-500/5">
              <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1">
                  {resultado.warnings.map((aviso) => (
                    <p key={aviso}>{aviso}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link href="/dashboard/store-tracker">
                <Radar className="size-4" />
                Ver mis tiendas monitorizadas
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/dashboard/winning-products?search=${encodeURIComponent(resultado.store.niche)}`}>
                <Sparkles className="size-4" />
                Productos del nicho {resultado.store.niche}
              </Link>
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/** Tarjeta de KPI del análisis de tienda. */
function KpiTienda({
  icono: Icono,
  etiqueta,
  valor,
  detalle,
}: {
  icono: React.ComponentType<{ className?: string }>;
  etiqueta: string;
  valor: string;
  detalle: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/10 p-2 text-indigo-300">
          <Icono className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
          <p className="text-xl font-semibold text-slate-100">{valor}</p>
          <p className="text-[11px] text-muted-foreground">{detalle}</p>
        </div>
      </CardContent>
    </Card>
  );
}
