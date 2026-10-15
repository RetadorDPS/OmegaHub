"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Formulario de registro con validación en cliente y en servidor.
 *
 * Al crear la cuenta se inicia sesión automáticamente con las credenciales
 * recién elegidas y se redirige al panel (o a la página de precios si el
 * usuario llegó desde un plan concreto).
 */
export function RegisterForm() {
  const router = useRouter();
  const parametros = useSearchParams();
  const planPreseleccionado = parametros.get("plan");

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [verPassword, setVerPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fuerza de la contraseña (0-100) para la barra de progreso. */
  const fuerza = (() => {
    let puntos = 0;
    if (password.length >= 8) puntos += 30;
    if (password.length >= 12) puntos += 15;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) puntos += 25;
    if (/\d/.test(password)) puntos += 15;
    if (/[^a-zA-Z0-9]/.test(password)) puntos += 15;
    return Math.min(100, puntos);
  })();

  const etiquetaFuerza = fuerza >= 80 ? "Fuerte" : fuerza >= 55 ? "Aceptable" : fuerza >= 30 ? "Débil" : "Muy débil";

  /** Valida y envía el registro. */
  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (password !== repetir) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("La contraseña debe tener al menos 8 caracteres, una letra y un número");
      return;
    }
    if (!acepta) {
      setError("Debes aceptar los términos y la política de privacidad");
      return;
    }

    setCargando(true);
    try {
      const respuesta = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nombre, email, password, acceptTerms: true }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo crear la cuenta");

      // Alta correcta: se inicia sesión automáticamente.
      const acceso = await signIn("credentials", { email, password, redirect: false });
      if (acceso?.error) {
        router.push("/login?registro=ok");
        return;
      }
      router.push(planPreseleccionado ? "/pricing" : "/dashboard");
      router.refresh();
    } catch (fallo) {
      setError((fallo as Error).message);
      setCargando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gratis y sin tarjeta. Empieza con 10 productos ganadores al día.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={enviar} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre completo</Label>
          <Input
            id="nombre"
            autoComplete="name"
            required
            minLength={2}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            placeholder="Ana García"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-registro">Correo electrónico</Label>
          <Input
            id="email-registro"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            placeholder="tu@email.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password-registro">Contraseña</Label>
          <div className="relative">
            <Input
              id="password-registro"
              type={verPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setVerPassword((valor) => !valor)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {verPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          {password.length > 0 && (
            <div className="space-y-1.5">
              <Progress
                value={fuerza}
                className={cn(
                  "h-1.5",
                  fuerza >= 80 ? "[&>div]:bg-emerald-500" : fuerza >= 55 ? "[&>div]:bg-amber-500" : "[&>div]:bg-rose-500",
                )}
              />
              <p className="text-xs text-muted-foreground">
                Seguridad: <span className="font-medium text-slate-200">{etiquetaFuerza}</span> · incluye mayúsculas,
                números y símbolos para mejorarla
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="repetir">Repite la contraseña</Label>
          <Input
            id="repetir"
            type={verPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={repetir}
            onChange={(evento) => setRepetir(evento.target.value)}
            placeholder="Vuelve a escribirla"
          />
          {repetir.length > 0 && repetir === password && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Las contraseñas coinciden
            </p>
          )}
        </div>

        <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
          <Checkbox
            checked={acepta}
            onCheckedChange={(valor) => setAcepta(valor === true)}
            aria-label="Aceptar términos y privacidad"
            className="mt-0.5"
          />
          <span>
            Acepto los <span className="text-indigo-400">términos del servicio</span> y la{" "}
            <span className="text-indigo-400">política de privacidad</span>, y el tratamiento de mis datos para
            gestionar la cuenta.
          </span>
        </label>

        <Button type="submit" loading={cargando} className="w-full gap-2">
          {!cargando && <UserPlus className="size-4" />}
          Crear cuenta gratis
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
          Inicia sesión
        </Link>
      </p>

      <div className="flex items-center gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/5 p-3 text-xs text-indigo-200">
        <Sparkles className="size-3.5 shrink-0" />
        Sin límite de tiempo y sin permanencia: puedes cancelar tu plan cuando quieras.
      </div>
    </div>
  );
}
