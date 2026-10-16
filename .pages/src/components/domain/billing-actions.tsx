"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowUpRight, CreditCard, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS } from "@/lib/constants";
import { PLAN_LABELS, type PlanType } from "@/types";
import { cn } from "@/lib/utils";

interface BillingActionsProps {
  planActual: PlanType;
  cancelacionProgramada: boolean;
  modoDemo: boolean;
  renovacion: string | null;
}

/**
 * Acciones de facturación: cambio de plan (checkout de Stripe o activación en
 * modo demostración), portal de cliente y cancelación de suscripción.
 */
export function BillingActions({ planActual, cancelacionProgramada, modoDemo, renovacion }: BillingActionsProps) {
  const router = useRouter();
  const { update: actualizarSesion } = useSession();
  const [procesando, setProcesando] = useState<string | null>(null);

  /** Inicia el checkout del plan indicado. */
  async function cambiarPlan(plan: PlanType) {
    setProcesando(plan);
    try {
      const respuesta = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const datos = (await respuesta.json()) as { url?: string; error?: string; message?: string; modo?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo iniciar el pago");

      if (datos.modo === "stripe" && datos.url) {
        window.location.href = datos.url;
        return;
      }
      toast.success(datos.message ?? `Plan ${plan} activado`);
      // Fuerza el refresco del token para que el plan nuevo aparezca al instante.
      await actualizarSesion({ planType: plan }).catch(() => null);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  /** Abre el portal de facturación de Stripe (o avisa si no está configurado). */
  async function abrirPortal() {
    setProcesando("portal");
    try {
      const respuesta = await fetch("/api/stripe/portal", { method: "POST" });
      const datos = (await respuesta.json()) as { url?: string; message?: string; error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo abrir el portal");
      if (datos.message) toast.info(datos.message);
      if (datos.url) window.location.href = datos.url;
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  /** Cancela la suscripción actual. */
  async function cancelar() {
    setProcesando("cancelar");
    try {
      const respuesta = await fetch("/api/stripe/cancel", { method: "POST" });
      const datos = (await respuesta.json()) as { message?: string; error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo cancelar la suscripción");
      toast.success(datos.message ?? "Suscripción cancelada");
      await actualizarSesion({ planType: "FREE" }).catch(() => null);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="space-y-6">
      {modoDemo && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <Loader2 className="size-3.5 shrink-0" />
          Modo demostración: los cambios de plan se aplican al instante. Añade <code>STRIPE_SECRET_KEY</code> para
          cobrar con Stripe real.
        </div>
      )}

      {/* Planes */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const esActual = plan.id === planActual;
          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col",
                esActual && "border-indigo-500/60 shadow-lg shadow-indigo-950/30",
                plan.highlighted && !esActual && "border-violet-500/40",
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {esActual ? (
                    <Badge variant="success">Plan actual</Badge>
                  ) : (
                    plan.highlighted && <Badge variant="gradient">Recomendado</Badge>
                  )}
                </div>
                <CardDescription>
                  <span className="text-2xl font-bold text-slate-100">{plan.priceLabel}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {plan.features.slice(0, 4).map((caracteristica) => (
                    <li key={caracteristica}>· {caracteristica}</li>
                  ))}
                </ul>

                {esActual ? (
                  plan.id === "FREE" ? (
                    <Badge variant="muted" className="mt-auto w-fit">
                      Plan gratuito activo
                    </Badge>
                  ) : (
                    <div className="mt-auto space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        {cancelacionProgramada
                          ? `Cancelado · acceso hasta ${renovacion ?? "el final del periodo"}`
                          : `Se renueva el ${renovacion ?? "final del periodo"}`}
                      </p>
                      {!cancelacionProgramada && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5"
                          loading={procesando === "cancelar"}
                          onClick={cancelar}
                        >
                          <XCircle className="size-3.5" />
                          Cancelar suscripción
                        </Button>
                      )}
                    </div>
                  )
                ) : (
                  <Button
                    className="mt-auto w-full gap-1.5"
                    variant={plan.highlighted ? "default" : "outline"}
                    loading={procesando === plan.id}
                    onClick={() => cambiarPlan(plan.id)}
                  >
                    <ArrowUpRight className="size-3.5" />
                    {plan.id === "FREE"
                      ? "Volver a Free"
                      : planActual === "FREE"
                        ? `Activar ${PLAN_LABELS[plan.id]}`
                        : `Cambiar a ${PLAN_LABELS[plan.id]}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button variant="outline" className="gap-2" loading={procesando === "portal"} onClick={abrirPortal}>
        <CreditCard className="size-4" />
        Abrir portal de facturación
      </Button>
    </div>
  );
}
