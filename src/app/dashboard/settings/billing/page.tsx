import { CheckCircle2, CreditCard, Receipt } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { stripeConfigured } from "@/lib/stripe";
import { PageHeading } from "@/components/domain/page-heading";
import { BillingActions } from "@/components/domain/billing-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PLAN_LABELS, type PlanType, type SubscriptionStatus } from "@/types";
import { formatCurrencyPrecise } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ESTADO_ETIQUETAS: Record<SubscriptionStatus, string> = {
  ACTIVE: "Activa",
  TRIALING: "En prueba",
  PAST_DUE: "Pago pendiente",
  CANCELED: "Cancelada",
  INCOMPLETE: "Incompleta",
};

export const metadata = {
  title: "Suscripción y facturación",
  description: "Cambia de plan, gestiona tu suscripción y consulta el historial de facturación.",
};

/** Módulo 10 · Facturación: plan, suscripción de Stripe y recibos. */
export default async function BillingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [usuario, suscripciones] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sesion.user.id },
      select: {
        email: true,
        planType: true,
        planRenewsAt: true,
        planCancelAtPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.subscription.findMany({
      where: { userId: sesion.user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const exito = params.exito === "true";

  return (
    <>
      <PageHeading
        title="Suscripción y facturación"
        description="Gestiona tu plan, revisa el consumo y consulta el historial de suscripciones."
      />

      {exito && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="size-4" />
          ¡Pago completado! Tu nuevo plan ya está activo.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan actual</p>
            <p className="text-2xl font-bold text-slate-100">{PLAN_LABELS[usuario.planType as PlanType]}</p>
            <p className="text-xs text-muted-foreground">{usuario.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado</p>
            <div className="flex items-center gap-2">
              <Badge variant={usuario.planType === "FREE" ? "muted" : "success"}>
                {usuario.planType === "FREE" ? "Sin suscripción" : "Activa"}
              </Badge>
              {usuario.planCancelAtPeriodEnd && <Badge variant="warning">Cancelación programada</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {usuario.planRenewsAt
                ? `Renovación: ${usuario.planRenewsAt.toLocaleDateString("es-ES")}`
                : "Sin fecha de renovación"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pasarela de pago</p>
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
              <CreditCard className="size-4 text-indigo-400" />
              {stripeConfigured() ? "Stripe configurado" : "Stripe en modo demostración"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {usuario.stripeCustomerId ? `Cliente ${usuario.stripeCustomerId}` : "Sin cliente de Stripe asociado"}
            </p>
          </CardContent>
        </Card>
      </div>

      <BillingActions
        planActual={usuario.planType as PlanType}
        cancelacionProgramada={usuario.planCancelAtPeriodEnd}
        modoDemo={!stripeConfigured()}
        renovacion={usuario.planRenewsAt?.toLocaleDateString("es-ES") ?? null}
      />

      {/* Historial de suscripciones */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4 text-violet-400" />
            Historial de suscripciones
          </CardTitle>
          <CardDescription>
            Registro de los cambios de plan, sincronizados con los webhooks de Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suscripciones.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              Todavía no hay suscripciones registradas. Activa un plan para ver aquí el historial completo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Fin del periodo</TableHead>
                    <TableHead className="text-right">Importe mensual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suscripciones.map((suscripcion) => (
                    <TableRow key={suscripcion.id}>
                      <TableCell className="font-medium text-slate-100">
                        {PLAN_LABELS[suscripcion.planType as PlanType]}
                      </TableCell>
                      <TableCell>
                        <Badge variant={suscripcion.status === "ACTIVE" ? "success" : "muted"}>
                          {ESTADO_ETIQUETAS[suscripcion.status as SubscriptionStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {suscripcion.stripeSubscriptionId}
                      </TableCell>
                      <TableCell className="text-sm">
                        {suscripcion.currentPeriodEnd?.toLocaleDateString("es-ES") ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyPrecise(suscripcion.planType === "BUSINESS" ? 149 : suscripcion.planType === "PRO" ? 49 : 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
