"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Aceptación de una invitación al equipo.
 *
 * Vive en una ruta pública (fuera de /dashboard) para que funcione igual si la
 * persona ya tiene sesión o si acaba de registrarse. El servidor comprueba que
 * el correo de la sesión coincide con el invitado.
 */

interface Invitacion {
  email: string;
  rol: string;
  equipo: string;
  propietario: string;
  plan: string;
}

function Contenido() {
  const parametros = useSearchParams();
  const token = parametros.get("token") ?? "";

  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aceptando, setAceptando] = useState(false);
  const [aceptada, setAceptada] = useState(false);
  const [necesitaCuenta, setNecesitaCuenta] = useState(false);

  const rutaActual = `/equipos/aceptar?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!token) {
      setError("Falta el código de la invitación.");
      setCargando(false);
      return;
    }
    let activo = true;
    (async () => {
      try {
        const respuesta = await fetch(
          `/api/equipos/invitaciones?token=${encodeURIComponent(token)}`,
        );
        const datos = (await respuesta.json()) as {
          invitacion?: Invitacion;
          error?: string;
        };
        if (!activo) return;
        if (!respuesta.ok || !datos.invitacion)
          throw new Error(datos.error ?? "La invitación no es válida.");
        setInvitacion(datos.invitacion);
      } catch (excepcion) {
        if (activo) setError((excepcion as Error).message);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [token]);

  async function aceptar() {
    setAceptando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/equipos/invitaciones/aceptar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const datos = (await respuesta.json()) as {
        error?: string;
        plan?: string;
      };
      if (respuesta.status === 401) {
        setNecesitaCuenta(true);
        throw new Error("Inicia sesión con el correo invitado para aceptar.");
      }
      if (!respuesta.ok)
        throw new Error(datos.error ?? "No se pudo aceptar la invitación.");
      setAceptada(true);
    } catch (excepcion) {
      setError((excepcion as Error).message);
    } finally {
      setAceptando(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.16),transparent_60%)]"
      />
      <div className="relative w-full max-w-lg">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300">
            <Users className="size-4" />
          </span>
          TrendHunter <span className="text-indigo-400">PRO</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="size-5 text-indigo-400" />
              Invitación a un equipo
            </CardTitle>
            <CardDescription>
              {invitacion
                ? `${invitacion.propietario} te invita a «${invitacion.equipo}».`
                : "No hemos podido leer la invitación."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invitacion && (
              <div className="rounded-lg border border-border/60 bg-surface/50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Correo invitado</span>
                  <span className="font-medium">{invitacion.email}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Plan que compartiréis
                  </span>
                  <Badge
                    variant="outline"
                    className="border-indigo-500/30 text-indigo-300"
                  >
                    {invitacion.plan}
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Rol</span>
                  <span className="font-medium">
                    {invitacion.rol === "ADMIN" ? "Administrador" : "Miembro"}
                  </span>
                </div>
              </div>
            )}

            {aceptada ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  Ya formas parte del equipo
                </p>
                <p className="mt-1 text-muted-foreground">
                  Tu plan se actualiza en unos segundos. Si no lo ves, recarga
                  la página.
                </p>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {aceptada ? (
                <Button asChild className="gap-2">
                  <Link href="/dashboard">
                    Ir al panel
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : necesitaCuenta ? (
                <>
                  <Button asChild className="gap-2">
                    <Link
                      href={`/login?callbackUrl=${encodeURIComponent(rutaActual)}`}
                    >
                      Iniciar sesión
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link
                      href={`/register?callbackUrl=${encodeURIComponent(rutaActual)}`}
                    >
                      Crear cuenta
                    </Link>
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => void aceptar()}
                  disabled={aceptando || !invitacion}
                  className="gap-2"
                >
                  {aceptando ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Aceptar invitación
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              La plaza se asigna a la cuenta con el correo{" "}
              <strong>{invitacion?.email ?? "invitado"}</strong>. Si entras con
              otra cuenta, la invitación no se aplicará.
            </p>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Investigación de productos con datos reales ·{" "}
          <Link
            href="/pricing"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Ver planes
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Envoltorio con Suspense: `useSearchParams` lo exige en la exportación estática. */
export function AceptarInvitacion() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-indigo-400" />
        </div>
      }
    >
      <Contenido />
    </Suspense>
  );
}
