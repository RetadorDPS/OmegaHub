import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CreditCard, ShieldCheck, Users } from "lucide-react";
import { auth } from "@/auth";
import { equipoPropio, equiposDelUsuario, asientosDelPlan, planEfectivo } from "@/lib/equipos";
import { PageHeading } from "@/components/domain/page-heading";
import { EquipoPanel } from "@/components/domain/equipo-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Equipo",
  description: "Invita a tu equipo, gestiona roles y comparte el plan sin pagar dos veces.",
};

/** Módulo 10 · Equipos y asientos (Business y Agency). */
export default async function EquipoPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/login");

  const [propio, membresias, plan] = await Promise.all([
    equipoPropio(sesion.user.id),
    equiposDelUsuario(sesion.user.id, sesion.user.email),
    planEfectivo(sesion.user.id, sesion.user.planType),
  ]);

  const asientos = asientosDelPlan(plan);
  const puedeCrear = asientos > 1;

  return (
    <>
      <PageHeading
        title="Equipo"
        description="Una suscripción, varias personas. Tú decides quién entra, con qué rol y hasta cuándo."
        actions={
          <Badge variant="outline" className="gap-1.5 border-indigo-500/40 text-indigo-300">
            <Users className="size-3.5" />
            Plan {plan} · {asientos} {asientos === 1 ? "plaza" : "plazas"}
          </Badge>
        }
      />

      <div className="mb-6">
        <EquipoPanel equipo={propio} planEfectivo={plan} puedeCrear={puedeCrear} miPlan={sesion.user.planType} />
      </div>

      {/* Equipos a los que pertenece (invitado por otro) */}
      {membresias.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Equipos en los que participas</CardTitle>
            <CardDescription>
              Mientras tu plaza esté activa usas el plan del equipo. Si te sacan, vuelves a tu plan propio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {membresias.map((equipo) => (
                <li key={equipo.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{equipo.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Propietario: {equipo.propietario} · plan {equipo.plan}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                    Heredas {equipo.plan}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Cómo funciona + planes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-emerald-400" />
              Cómo funcionan las plazas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              · La plaza se ocupa cuando la persona <strong>acepta</strong>, no al invitarla: una invitación olvidada
              no bloquea al equipo.
            </p>
            <p>· El enlace caduca a los 14 días y solo funciona con el correo invitado.</p>
            <p>· El propietario no se puede quitar: es quien paga.</p>
            <p>· Un administrador puede invitar, pero no puede nombrar a otro administrador (evita escaladas).</p>
            <p>· Si te quitan del equipo, vuelves automáticamente a tu plan propio.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4 text-indigo-400" />
              Ampliar plazas
            </CardTitle>
            <CardDescription>
              Business incluye 5 plazas y Agency, 15. Las plazas van siempre con el plan del propietario.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="gap-2">
              <Link href="/pricing">
                Ver planes
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/settings/billing">Facturación</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
