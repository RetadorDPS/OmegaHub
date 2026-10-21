import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  Flame,
  LineChart,
  Megaphone,
  Radar,
  Search,
  Sparkles,
  Store,
  Target,
  Truck,
  Zap,
} from "lucide-react";
import { getDashboardStats, getTopProducts } from "@/lib/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrendScoreRing } from "@/components/domain/trend-score-ring";
import { DASHBOARD_NAV, DEMO_EMAIL, DEMO_PASSWORD, PLANS } from "@/lib/constants";
import { formatCompactNumber, formatCurrency, formatCurrencyPrecise } from "@/lib/utils";

export const metadata = {
  title: "TrendHunter Pro · Encuentra productos ganadores con datos verificables",
  description:
    "Investiga productos, espía anuncios activos, analiza tiendas Shopify y genera creatividades con IA. Cada cifra lleva su fuente y su fecha: sabes qué está medido y qué es una estimación.",
};

/** Icono de cada módulo (los nombres vienen de la navegación del panel). */
const ICONOS_MODULO: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard: BarChart3,
  Trophy: Flame,
  Megaphone,
  Store,
  Radar,
  LineChart,
  Truck,
  Sparkles,
  Settings: Target,
  ShieldCheck: Bell,
};

/**
 * Landing pública.
 * Muestra datos reales de la base de datos (productos, anuncios, tiendas) para
 * que la portada no sea un escaparate vacío.
 */
export default async function LandingPage() {
  const [stats, destacados] = await Promise.all([getDashboardStats(), getTopProducts(3)]);

  const metricas = [
    { valor: stats.productos, etiqueta: "productos analizados", icono: BarChart3 },
    { valor: stats.anuncios, etiqueta: "anuncios vigilados", icono: Megaphone },
    { valor: stats.tiendas, etiqueta: "tiendas Shopify en el radar", icono: Store },
    { valor: stats.dorados, etiqueta: "oportunidades doradas activas", icono: Flame },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* --- Cabecera --- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50">
              <Zap className="size-4 text-white" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">TrendHunter</span>
              <span className="text-[11px] font-medium text-indigo-400">PRO</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#modulos" className="transition-colors hover:text-foreground">
              Módulos
            </a>
            <a href="#productos" className="transition-colors hover:text-foreground">
              Productos destacados
            </a>
            <a href="#precios" className="transition-colors hover:text-foreground">
              Precios
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/register">
                Empezar gratis
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* --- Hero --- */}
      <section className="relative overflow-hidden">
        <div className="hero-glow absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center">
          <Badge variant="gradient" className="mb-5 gap-1.5">
            <Sparkles className="size-3" />
            Cada dato con fuente y fecha · Google Trends · TikTok · Meta Ads · Shopify
          </Badge>

          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Encuentra el{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              producto ganador
            </span>{" "}
            antes que tu competencia
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            TrendHunter Pro cruza señales de búsqueda, vídeo, publicidad y tiendas Shopify para darte un único
            <span className="text-slate-200"> TrendScore de 0 a 100</span>. Después te ayuda a venderlo: análisis de
            competencia, proveedores y creatividades generadas con IA.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="/register">
                Crear cuenta gratis
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link href={`/login?email=${DEMO_EMAIL}`}>
                <Search className="size-4" />
                Probar la demo
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Cuenta de demostración: <span className="font-mono text-slate-300">{DEMO_EMAIL}</span> /{" "}
            <span className="font-mono text-slate-300">{DEMO_PASSWORD}</span>
          </p>

          {/* Métricas reales */}
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricas.map((metrica) => (
              <Card key={metrica.etiqueta} className="border-border/60 bg-surface/40">
                <CardContent className="flex items-center gap-3 p-4 text-left">
                  <span className="rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/10 p-2 text-indigo-300">
                    <metrica.icono className="size-4" />
                  </span>
                  <div>
                    <p className="text-2xl font-bold text-slate-100">{metrica.valor}</p>
                    <p className="text-xs text-muted-foreground">{metrica.etiqueta}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* --- Productos destacados (datos reales) --- */}
      <section id="productos" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Oportunidades del catálogo</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Score medio actual de {stats.scoreMedio}/100 y un margen bruto medio del {stats.margenMedio} %. Estos son
              los productos con mejor combinación de demanda, velocidad y baja competencia. Cada ficha indica si sus
              datos están <strong className="text-foreground">verificados</strong> por fuentes externas o siguen siendo
              una <strong className="text-foreground">estimación</strong> del motor interno.
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/winning-products">
              Ver los {stats.productos} productos
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {destacados.map((producto) => (
            <Card
              key={producto.id}
              className="group overflow-hidden transition-shadow hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-950/30"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                <Image
                  src={producto.mainImage}
                  alt={producto.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/10 to-transparent" />
                <div className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 p-1 backdrop-blur">
                  <TrendScoreRing score={producto.trendScore} size={54} strokeWidth={5} />
                </div>
                <div className="absolute bottom-3 left-3 flex flex-col gap-1">
                  <Badge variant="secondary" className="w-fit text-[10px]">
                    {producto.category}
                  </Badge>
                  <span className="text-[11px] font-medium text-slate-300">{producto.nicheTag}</span>
                </div>
              </div>
              <CardContent className="space-y-2 p-4">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{producto.title}</h3>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Margen <span className="font-medium text-emerald-400">{producto.estimatedMargin.toFixed(0)} %</span>
                  </span>
                  <span>{formatCurrencyPrecise(producto.suggestedSellPrice)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCompactNumber(producto.tiktokViews)} visualizaciones en TikTok ·{" "}
                  {producto.storesUsing} tiendas vendiéndolo
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* --- Módulos --- */}
      <section id="modulos" className="border-y border-border/60 bg-surface/20 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Todo el ciclo de investigación, en una plataforma</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Diez módulos conectados entre sí: los datos que descubres en uno alimentan las decisiones del siguiente.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DASHBOARD_NAV.filter((item) => !item.adminOnly).map((item) => {
              const Icono = ICONOS_MODULO[item.icon] ?? Target;
              return (
                <Card key={item.href} className="border-border/60 transition-colors hover:border-indigo-500/40">
                  <CardContent className="flex gap-3 p-5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-surface/60 text-indigo-300">
                      <Icono className="size-4" />
                    </span>
                    <div>
                      <p className="font-medium text-slate-100">{item.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Card className="border-indigo-500/30 bg-indigo-500/5">
              <CardContent className="flex gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/10 text-indigo-300">
                  <Bot className="size-4" />
                </span>
                <div>
                  <p className="font-medium text-slate-100">IA con degradación elegante</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    OpenAI o Gemini si hay claves; motor de plantillas propio si no. La plataforma nunca se queda sin
                    respuesta.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* --- Cómo funciona --- */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Del dato bruto a la campaña en cuatro pasos</h2>
            <ol className="mt-6 space-y-5">
              {[
                {
                  titulo: "1 · Detecta la tendencia",
                  texto:
                    "El TrendScore pondera búsquedas en Google, visualizaciones en TikTok, anuncios activos en Meta y tiendas Shopify que ya lo venden.",
                },
                {
                  titulo: "2 · Valida la competencia",
                  texto:
                    "Analiza cualquier tienda con el Shop Analyzer: catálogo, precios, apps, tráfico estimado y facturación mensual.",
                },
                {
                  titulo: "3 · Vigila el mercado",
                  texto:
                    "Sigue tiendas y productos: cada producto nuevo, cambio de precio o pico de tráfico queda en un timeline con alertas.",
                },
                {
                  titulo: "4 · Lanza la campaña",
                  texto:
                    "Genera copies, guiones de 15/30/60 s, buyer personas y nombres de tienda con el AI Studio, y calcula el beneficio real por unidad.",
                },
              ].map((paso) => (
                <li key={paso.titulo} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-indigo-400" />
                  <div>
                    <p className="font-medium text-slate-100">{paso.titulo}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{paso.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <Card className="border-border/70 bg-surface/40">
            <CardContent className="space-y-4 p-6">
              <p className="text-sm font-medium text-slate-100">Resumen del mercado ahora mismo</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <DatoMercado etiqueta="Score medio" valor={`${stats.scoreMedio}/100`} />
                <DatoMercado etiqueta="Margen medio" valor={`${stats.margenMedio} %`} />
                <DatoMercado etiqueta="Facturación agregada" valor={formatCurrency(stats.facturacionTotal)} />
                <DatoMercado etiqueta="Proveedores evaluados" valor={String(stats.proveedores)} />
                <DatoMercado etiqueta="Productos saturados" valor={String(stats.saturacion.find((f) => f.nivel === "HIGH")?.cantidad ?? 0)} />
                <DatoMercado etiqueta="Categorías activas" valor={String(stats.porCategoria.length)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Datos calculados en vivo desde la base de datos de la plataforma (se actualizan con cada análisis).
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* --- Precios resumidos --- */}
      <section id="precios" className="border-t border-border/60 bg-surface/20 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Empieza gratis, escala cuando vendas</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Sin permanencia y con 14 días de garantía. Cambia o cancela el plan desde tu panel en un clic.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={plan.highlighted ? "border-violet-500/50 shadow-xl shadow-violet-950/20" : "border-border/60"}
              >
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-100">{plan.name}</p>
                    {plan.highlighted && <Badge variant="gradient">Más elegido</Badge>}
                  </div>
                  <p className="text-3xl font-bold text-slate-100">{plan.priceLabel}</p>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {plan.features.slice(0, 4).map((caracteristica) => (
                      <li key={caracteristica}>· {caracteristica}</li>
                    ))}
                  </ul>
                  <Button asChild className="w-full" variant={plan.highlighted ? "default" : "outline"}>
                    <Link href={plan.id === "FREE" ? "/register" : `/pricing?plan=${plan.id}`}>
                      {plan.id === "FREE" ? "Empezar gratis" : `Elegir ${plan.name}`}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* --- Pie --- */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row">
          <p>TrendHunter Pro · Inteligencia de productos para e-commerce</p>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="transition-colors hover:text-foreground">
              Precios
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Iniciar sesión
            </Link>
            <Link href="/register" className="transition-colors hover:text-foreground">
              Crear cuenta
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Dato del panel de resumen del mercado. */
function DatoMercado({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-slate-950/50 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 font-semibold text-slate-100">{valor}</p>
    </div>
  );
}
