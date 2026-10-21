"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Crown,
  Link2,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { TeamRole } from "@/types";

interface MiembroEquipo {
  id: string;
  email: string;
  nombre: string | null;
  role: TeamRole;
  status: "INVITED" | "ACTIVE" | "REVOKED";
  desde: string;
  ultimaActividad: string | null;
}

interface EquipoPanelProps {
  equipo: {
    id: string;
    nombre: string;
    asientos: number;
    ocupados: number;
    libres: number;
    plan: string;
    esPropietario: boolean;
    miembros: MiembroEquipo[];
  } | null;
  planEfectivo: string;
  puedeCrear: boolean;
  miPlan: string;
}

/** Estados legibles de una plaza. */
const ESTADOS: Record<
  MiembroEquipo["status"],
  { texto: string; clase: string }
> = {
  ACTIVE: {
    texto: "Activo",
    clase: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  INVITED: {
    texto: "Invitación pendiente",
    clase: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  REVOKED: {
    texto: "Revocado",
    clase: "border-border bg-surface text-muted-foreground",
  },
};

const ROLES: Record<TeamRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  MEMBER: "Miembro",
};

/**
 * Panel de equipo: crear el equipo, invitar por correo, cambiar roles, revocar
 * plazas y copiar el enlace de invitación cuando el correo aún no ha salido.
 */
export function EquipoPanel({
  equipo,
  planEfectivo,
  puedeCrear,
  miPlan,
}: EquipoPanelProps) {
  const router = useRouter();
  const [, iniciarTransicion] = useTransition();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nombreEquipo, setNombreEquipo] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [enlaceReciente, setEnlaceReciente] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const refrescar = () => iniciarTransicion(() => router.refresh());

  /** Crea el equipo del usuario. */
  async function crear() {
    setOcupado("crear");
    try {
      const respuesta = await fetch("/api/equipos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: nombreEquipo }),
      });
      const datos = (await respuesta.json()) as {
        error?: string;
        plan?: boolean;
      };
      if (!respuesta.ok)
        throw new Error(datos.error ?? "No se pudo crear el equipo.");
      toast.success("Equipo creado");
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Invita a un correo. */
  async function invitar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!email.trim()) {
      toast.error("Escribe el correo de la persona a invitar.");
      return;
    }
    setOcupado("invitar");
    try {
      const respuesta = await fetch("/api/equipos/invitaciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role: rol }),
      });
      const datos = (await respuesta.json()) as {
        error?: string;
        enlace?: string;
        yaTieneCuenta?: boolean;
      };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo invitar.");
      setEnlaceReciente(datos.enlace ?? null);
      setEmail("");
      toast.success(
        datos.yaTieneCuenta
          ? "Invitación creada. También le aparece en la campana."
          : "Invitación creada. Copia el enlace y mándaselo.",
      );
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Copia el enlace de invitación al portapapeles. */
  async function copiarEnlace(enlace: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${enlace}`);
      setCopiado(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopiado(false), 2_000);
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto a mano.");
    }
  }

  /** Cambia el rol de una plaza. */
  async function cambiarRol(miembro: MiembroEquipo, nuevo: string) {
    setOcupado(miembro.id);
    try {
      const respuesta = await fetch(`/api/equipos/miembros/${miembro.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nuevo }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok)
        throw new Error(datos.error ?? "No se pudo cambiar el rol.");
      toast.success("Rol actualizado");
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Revoca una plaza. */
  async function revocar(miembro: MiembroEquipo) {
    if (
      !window.confirm(
        `¿Quitar el acceso a ${miembro.email}? Dejará de usar el plan del equipo.`,
      )
    )
      return;
    setOcupado(miembro.id);
    try {
      const respuesta = await fetch(`/api/equipos/miembros/${miembro.id}`, {
        method: "DELETE",
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok)
        throw new Error(datos.error ?? "No se pudo quitar la plaza.");
      toast.success("Plaza liberada");
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  // ---------------------------------------------------------------- sin equipo
  if (!equipo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-indigo-400" />
            {puedeCrear ? "Crea tu equipo" : "Tu plan es individual"}
          </CardTitle>
          <CardDescription>
            {puedeCrear
              ? "Invita a tu equipo y todos usarán el mismo plan sin pagar otra suscripción. Tú controlas quién entra y con qué rol."
              : `El plan ${miPlan} es para una persona. Business incluye 5 plazas y Agency, 15, con roles y webhooks.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {puedeCrear ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Nombre del equipo (ej. Agencia Norte)"
                value={nombreEquipo}
                onChange={(evento) => setNombreEquipo(evento.target.value)}
                maxLength={60}
              />
              <Button
                onClick={() => void crear()}
                disabled={ocupado !== null}
                className="gap-2"
              >
                {ocupado === "crear" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Crear equipo
              </Button>
            </div>
          ) : (
            <Button asChild className="gap-2">
              <a href="/pricing">Ver planes con equipo</a>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const uso = Math.round(
    (equipo.ocupados / Math.max(equipo.asientos, 1)) * 100,
  );
  const puedeGestionar = equipo.esPropietario;

  return (
    <div className="space-y-4">
      {/* Resumen de asientos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Users className="size-4 text-indigo-400" />
            {equipo.nombre}
            <Badge
              variant="outline"
              className="border-indigo-500/30 text-indigo-300"
            >
              Plan {equipo.plan}
            </Badge>
            {planEfectivo !== miPlan && (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-300"
              >
                Heredas {planEfectivo}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {equipo.ocupados} de {equipo.asientos} plazas ocupadas ·{" "}
            {equipo.libres} libre
            {equipo.libres === 1 ? "" : "s"}. Cada persona que entra usa el plan
            del equipo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={uso} className="h-2" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Miembros */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personas</CardTitle>
            <CardDescription>
              Quien aparece como activo puede usar la plataforma con el plan del
              equipo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {equipo.miembros.map((miembro) => (
                <li
                  key={miembro.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold uppercase">
                    {(miembro.nombre ?? miembro.email).slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {miembro.nombre ?? miembro.email}
                      {miembro.role === "OWNER" && (
                        <Crown className="size-3.5 shrink-0 text-amber-400" />
                      )}
                    </p>
                    {(miembro.nombre ||
                      (miembro.status === "ACTIVE" &&
                        miembro.ultimaActividad)) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {miembro.nombre ? miembro.email : ""}
                        {miembro.nombre &&
                        miembro.status === "ACTIVE" &&
                        miembro.ultimaActividad
                          ? " · "
                          : ""}
                        {miembro.status === "ACTIVE" && miembro.ultimaActividad
                          ? `activo ${formatRelativeTime(miembro.ultimaActividad)}`
                          : ""}
                      </p>
                    )}
                  </div>

                  {/* En móvil los controles bajan a su propia línea: así el correo no se corta. */}
                  <div className="flex w-full flex-wrap items-center gap-2 pl-12 sm:w-auto sm:pl-0">
                    <Badge
                      variant="outline"
                      className={cn("shrink-0", ESTADOS[miembro.status].clase)}
                    >
                      {ESTADOS[miembro.status].texto}
                    </Badge>

                    {miembro.role === "OWNER" ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ROLES.OWNER}
                      </span>
                    ) : puedeGestionar ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Select
                          value={miembro.role}
                          onValueChange={(valor) =>
                            void cambiarRol(miembro, valor)
                          }
                          disabled={ocupado === miembro.id}
                        >
                          <SelectTrigger
                            className="h-8 w-[140px] text-xs"
                            aria-label={`Rol de ${miembro.email}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">{ROLES.ADMIN}</SelectItem>
                            <SelectItem value="MEMBER">
                              {ROLES.MEMBER}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void revocar(miembro)}
                          disabled={ocupado === miembro.id}
                          aria-label={`Quitar a ${miembro.email}`}
                          title="Quitar del equipo"
                        >
                          {ocupado === miembro.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ROLES[miembro.role]}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Invitar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4 text-emerald-400" />
              Invitar a alguien
            </CardTitle>
            <CardDescription>
              Se crea un enlace de un solo uso, válido 14 días. La plaza se
              ocupa cuando la persona acepta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {puedeGestionar ? (
              <form onSubmit={invitar} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invitar-email">Correo</Label>
                  <Input
                    id="invitar-email"
                    type="email"
                    placeholder="companero@agencia.com"
                    value={email}
                    onChange={(evento) => setEmail(evento.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invitar-rol">Rol</Label>
                  <Select
                    value={rol}
                    onValueChange={(valor) =>
                      setRol(valor as "ADMIN" | "MEMBER")
                    }
                  >
                    <SelectTrigger id="invitar-rol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">
                        Miembro · usa la plataforma
                      </SelectItem>
                      <SelectItem value="ADMIN">
                        Administrador · además invita
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={ocupado !== null || equipo.libres === 0}
                >
                  {ocupado === "invitar" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  {equipo.libres === 0
                    ? "Sin plazas libres"
                    : "Crear invitación"}
                </Button>
                {equipo.libres === 0 && (
                  <p className="text-xs text-amber-300">
                    Todas las plazas están ocupadas. Quita a alguien o amplía el
                    plan.
                  </p>
                )}
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Solo el propietario del equipo puede invitar o quitar personas.
              </p>
            )}

            {enlaceReciente && (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <ShieldCheck className="size-3.5" />
                  Enlace de invitación listo
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-[11px]">
                    {enlaceReciente}
                  </code>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => void copiarEnlace(enlaceReciente)}
                    aria-label="Copiar enlace"
                  >
                    {copiado ? (
                      <Check className="text-emerald-400" />
                    ) : (
                      <Copy />
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Mándalo por donde quieras (WhatsApp, correo…). Si esa persona
                  ya tiene cuenta, también lo verá en su campana.
                </p>
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
              <Link2 className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Las invitaciones se aceptan en <code>/equipos/aceptar</code> y
                solo funcionan con el correo invitado.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
