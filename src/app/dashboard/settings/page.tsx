import Link from "next/link";
import { BadgeCheck, CreditCard, MailWarning, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getPlanUsageSummary } from "@/lib/planLimits";
import { PLAN_LIMITS, PLANS } from "@/lib/constants";
import { PageHeading } from "@/components/domain/page-heading";
import { PasswordForm, ProfileForm } from "@/components/domain/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PLAN_LABELS } from "@/types";
import { formatRelativeTime } from "@/lib/utils";

export const metadata = {
  title: "Configuración",
  description: "Gestiona tu perfil, contraseña, plan y consumo de la plataforma.",
};

/** Módulo 1 · Configuración de la cuenta. */
export default async function SettingsPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [usuario, uso] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sesion.user.id },
      select: {
        name: true,
        email: true,
        image: true,
        locale: true,
        role: true,
        planType: true,
        passwordHash: true,
        emailVerified: true,
        planRenewsAt: true,
        planCancelAtPeriodEnd: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    getPlanUsageSummary(sesion.user.id, sesion.user.planType),
  ]);

  const definicionPlan = PLANS.find((plan) => plan.id === usuario.planType)!;
  const limites = PLAN_LIMITS[usuario.planType];

  /** Convierte un consumo en porcentaje para la barra de progreso. */
  const porcentaje = (usado: number, limite: number | null) =>
    limite === null || limite === 0 ? (limite === 0 ? 100 : 4) : Math.min(100, (usado / limite) * 100);

  return (
    <>
      <PageHeading
        title="Configuración"
        description="Perfil, seguridad, plan contratado y consumo diario de tu cuenta."
        actions={
          <Badge variant={usuario.role === "ADMIN" ? "gradient" : "outline"} className="gap-1">
            {usuario.role === "ADMIN" ? "Administrador" : "Usuario"}
          </Badge>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ProfileForm
            usuario={{
              name: usuario.name,
              email: usuario.email,
              image: usuario.image,
              locale: usuario.locale,
              emailVerificado: Boolean(usuario.emailVerified),
            }}
          />
          <PasswordForm tienePassword={Boolean(usuario.passwordHash)} />
        </div>

        <div className="space-y-6">
          {/* --- Plan contratado --- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4 text-indigo-400" />
                Tu plan
              </CardTitle>
              <CardDescription>{definicionPlan.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-3xl font-bold text-transparent">
                  {PLAN_LABELS[usuario.planType]}
                </span>
                <span className="text-sm text-muted-foreground">{definicionPlan.priceLabel}</span>
              </div>

              {usuario.planType !== "FREE" && usuario.planRenewsAt && (
                <p className="text-xs text-muted-foreground">
                  {usuario.planCancelAtPeriodEnd
                    ? `Cancelado: mantienes el acceso hasta ${usuario.planRenewsAt.toLocaleDateString("es-ES")}`
                    : `Se renueva el ${usuario.planRenewsAt.toLocaleDateString("es-ES")}`}
                </p>
              )}

              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {definicionPlan.features.map((caracteristica) => (
                  <li key={caracteristica} className="flex gap-1.5">
                    <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                    {caracteristica}
                  </li>
                ))}
              </ul>

              <Button asChild className="w-full">
                <Link href={usuario.planType === "BUSINESS" ? "/dashboard/settings/billing" : "/pricing"}>
                  {usuario.planType === "FREE"
                    ? "Mejorar mi plan"
                    : usuario.planType === "PRO"
                      ? "Pasar a Business"
                      : "Gestionar suscripción"}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* --- Consumo de hoy --- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consumo de hoy</CardTitle>
              <CardDescription>Los límites se reinician cada día a las 00:00 UTC</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <UsoBarra
                etiqueta="Vistas de producto"
                usado={uso.productViews.used}
                limite={uso.productViews.limit ?? limites.productViews}
                porcentaje={porcentaje(uso.productViews.used, uso.productViews.limit)}
              />
              <UsoBarra
                etiqueta="Generaciones de IA"
                usado={uso.aiGenerations.used}
                limite={uso.aiGenerations.limit ?? limites.aiGenerations}
                porcentaje={porcentaje(uso.aiGenerations.used, uso.aiGenerations.limit)}
              />
              <UsoBarra
                etiqueta="Análisis de tiendas"
                usado={uso.storeScans.used}
                limite={uso.storeScans.limit ?? limites.storeScans}
                porcentaje={porcentaje(uso.storeScans.used, uso.storeScans.limit)}
              />
            </CardContent>
          </Card>

          {/* --- Estado de la cuenta --- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-emerald-400" />
                Estado de la cuenta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <p>Alta: {formatRelativeTime(usuario.createdAt.toISOString())}</p>
              <p>
                Último acceso:{" "}
                {usuario.lastLoginAt ? formatRelativeTime(usuario.lastLoginAt.toISOString()) : "primer acceso ahora"}
              </p>
              <p className="flex items-center gap-1.5">
                {usuario.emailVerified ? (
                  <>
                    <BadgeCheck className="size-3.5 text-emerald-400" />
                    Correo verificado
                  </>
                ) : (
                  <>
                    <MailWarning className="size-3.5 text-amber-400" />
                    Correo pendiente de verificación
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Barra de consumo de una cuota del plan. */
function UsoBarra({
  etiqueta,
  usado,
  limite,
  porcentaje,
}: {
  etiqueta: string;
  usado: number;
  limite: number | null;
  porcentaje: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-200">{etiqueta}</span>
        <span className="tabular-nums text-muted-foreground">
          {usado} / {limite === null ? "ilimitado" : limite}
        </span>
      </div>
      <Progress value={porcentaje} className="h-1.5" />
    </div>
  );
}
