import Link from "next/link";
import { ArrowLeft, BarChart3, Layers3, Sparkles, Zap } from "lucide-react";
import { auth } from "@/auth";
import { PricingPlans } from "@/components/domain/pricing-plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlanType } from "@/types";

export const metadata = {
  title: "Precios",
  description:
    "Planes de TrendHunter Pro: Free (0 $), Pro (19 $/mes), Business (49 $/mes) y Agency (149 $/mes) con IA, análisis de tiendas, API pública y alertas en tiempo real.",
};

/** Página pública de precios con checkout de Stripe. */
export default async function PricingPage() {
  const sesion = await auth();

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Cabecera pública */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600">
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="font-semibold text-slate-100">TrendHunter Pro</span>
          </Link>
          <div className="flex items-center gap-2">
            {sesion?.user?.id ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Ir al panel</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Iniciar sesión</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Crear cuenta gratis</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-12 text-center">
          <Badge variant="gradient" className="mb-4 gap-1">
            <Zap className="size-3" />
            Todo lo que necesitas para encontrar productos ganadores
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-100 sm:text-5xl">
            Precios simples,{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              resultados reales
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground">
            Empieza gratis y sube de plan cuando escales. Todos los planes incluyen el catálogo de productos ganadores,
            Ads Spy, Shop Analyzer y el AI Studio con cinco herramientas de generación.
          </p>
        </div>

        <PricingPlans planActual={(sesion?.user?.planType as PlanType) ?? null} autenticado={Boolean(sesion?.user?.id)} />

        {/* Bloque de valor */}
        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {[
            {
              icono: BarChart3,
              titulo: "Datos de cuatro fuentes",
              texto:
                "Combinamos Google Trends, TikTok, la biblioteca de anuncios de Meta y el catálogo de Shopify para calcular el TrendScore de cada producto.",
            },
            {
              icono: Layers3,
              titulo: "Todo en una sola plataforma",
              texto:
                "Investigación, análisis de competencia, seguimiento de tiendas, proveedores y generación de creatividades con IA. Sin saltar entre diez herramientas.",
            },
            {
              icono: Sparkles,
              titulo: "IA aplicada a vender",
              texto:
                "Copies, guiones, buyer personas y nombres de tienda generados a partir de los datos reales del producto que has elegido.",
            },
          ].map((bloque) => (
            <div key={bloque.titulo} className="rounded-2xl border border-border/70 bg-surface/40 p-6">
              <span className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 text-indigo-300">
                <bloque.icono className="size-5" />
              </span>
              <h3 className="font-semibold text-slate-100">{bloque.titulo}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{bloque.texto}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/login">
              <ArrowLeft className="size-4" />
              Volver al inicio de sesión
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link href="/register">
              Crear cuenta gratis
              <Sparkles className="size-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
