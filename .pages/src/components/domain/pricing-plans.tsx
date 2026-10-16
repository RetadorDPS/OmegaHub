"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { BadgeCheck, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/types";

interface PricingPlansProps {
  /** Plan del usuario si hay sesión iniciada. */
  planActual: PlanType | null;
  autenticado: boolean;
}

const COMPARATIVA = [
  { caracteristica: "Productos ganadores al día", free: "10", pro: "Ilimitado", business: "Ilimitado" },
  { caracteristica: "Generaciones de IA al día", free: "3", pro: "100", business: "500" },
  { caracteristica: "Análisis de tiendas al día", free: "1", pro: "10", business: "50" },
  { caracteristica: "Productos guardados", free: "5", pro: "200", business: "Ilimitado" },
  { caracteristica: "Tiendas y productos seguidos", free: "2", pro: "50", business: "Ilimitado" },
  { caracteristica: "Exportación a CSV", free: "—", pro: "20/día", business: "Ilimitada" },
  { caracteristica: "Histórico de tendencias", free: "7 días", pro: "30 días", business: "30 días" },
  { caracteristica: "Alertas en tiempo real", free: "—", pro: "Sí", business: "Prioritarias" },
  { caracteristica: "Soporte", free: "Comunidad", pro: "Email", business: "Dedicado" },
];

/**
 * Tarjetas de precios con comparativa y activación del plan.
 *
 * Con sesión iniciada el botón lanza el checkout de Stripe (o activa el plan en
 * modo demostración si no hay claves); sin sesión, lleva al registro.
 */
export function PricingPlans({ planActual, autenticado }: PricingPlansProps) {
  const router = useRouter();
  const { update: actualizarSesion } = useSession();
  const [procesando, setProcesando] = useState<string | null>(null);

  /** Inicia la contratación del plan indicado. */
  async function contratar(plan: PlanType) {
    if (!autenticado) {
      router.push(`/register?plan=${plan}`);
      return;
    }

    setProcesando(plan);
    try {
      const respuesta = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const datos = (await respuesta.json()) as { url?: string; message?: string; modo?: string; error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo iniciar la contratación");

      if (datos.modo === "stripe" && datos.url) {
        window.location.href = datos.url;
        return;
      }
      toast.success(datos.message ?? `Plan ${plan} activado`);
      await actualizarSesion({ planType: plan }).catch(() => null);
      router.push("/dashboard/settings/billing");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="space-y-12">
      {/* --- Tarjetas --- */}
      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan, indice) => {
          const esActual = planActual === plan.id;
          const esGratis = plan.id === "FREE";
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: indice * 0.08 }}
            >
              <Card
                className={cn(
                  "relative flex h-full flex-col",
                  plan.highlighted
                    ? "border-violet-500/50 shadow-2xl shadow-violet-950/30 lg:-mt-4 lg:mb-4"
                    : "border-border/70",
                  esActual && "border-emerald-500/50",
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="gradient" className="gap-1 shadow-lg">
                      <Sparkles className="size-3" />
                      Más elegido
                    </Badge>
                  </div>
                )}

                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {esActual && <Badge variant="success">Tu plan</Badge>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-100">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.price === 0 ? "$ siempre" : "$/mes"}</span>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="space-y-2.5 text-sm">
                    {plan.features.map((caracteristica) => (
                      <li key={caracteristica} className="flex items-start gap-2 text-muted-foreground">
                        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                        <span>{caracteristica}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? "default" : esGratis ? "outline" : "secondary"}
                    loading={procesando === plan.id}
                    disabled={esActual}
                    onClick={() => contratar(plan.id)}
                  >
                    {esActual
                      ? "Plan activo"
                      : esGratis
                        ? autenticado
                          ? "Incluido en tu cuenta"
                          : "Empezar gratis"
                        : autenticado
                          ? `Pasar a ${plan.name}`
                          : `Probar ${plan.name}`}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* --- Comparativa --- */}
      <div className="overflow-hidden rounded-2xl border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-surface/60">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Característica</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Free</th>
              <th className="bg-violet-500/5 px-4 py-3 text-center font-medium text-violet-300">Pro</th>
              <th className="px-4 py-3 text-center font-medium text-indigo-300">Business</th>
            </tr>
          </thead>
          <tbody>
            {COMPARATIVA.map((fila, indice) => (
              <tr key={fila.caracteristica} className={cn(indice % 2 === 1 && "bg-surface/30")}>
                <td className="px-4 py-3 text-muted-foreground">{fila.caracteristica}</td>
                <td className="px-4 py-3 text-center text-slate-200">{fila.free}</td>
                <td className="bg-violet-500/5 px-4 py-3 text-center font-medium text-slate-100">{fila.pro}</td>
                <td className="px-4 py-3 text-center text-slate-200">{fila.business}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- Garantías --- */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            titulo: "14 días de garantía",
            texto: "Si no encuentras productos ganadores en dos semanas, te devolvemos el importe.",
          },
          {
            titulo: "Cancela cuando quieras",
            texto: "Sin contratos ni permanencia: gestiona o cancela la suscripción desde tu panel.",
          },
          {
            titulo: "Datos reales, no promesas",
            texto: "Cada métrica sale de fuentes verificables: Google Trends, TikTok, Meta Ads y Shopify.",
          },
        ].map((garantia) => (
          <Card key={garantia.titulo} className="border-border/70">
            <CardContent className="space-y-1.5 p-5">
              <p className="flex items-center gap-2 font-medium text-slate-100">
                <Check className="size-4 text-emerald-400" />
                {garantia.titulo}
              </p>
              <p className="text-sm text-muted-foreground">{garantia.texto}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!autenticado && (
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Inicia sesión
          </Link>
        </p>
      )}
    </div>
  );
}
