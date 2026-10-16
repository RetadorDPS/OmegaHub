"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/** Cuentas de demo listas para probar la plataforma. */
const CUENTAS_DEMO = [
  { email: "demo@trendhunter.pro", password: "demo1234", rol: "PRO" },
  { email: "admin@trendhunter.pro", password: "admin1234", rol: "ADMIN" },
  { email: "free@trendhunter.pro", password: "free1234", rol: "FREE" },
];

/** Formulario de inicio de sesión con credenciales y Google. */
export function LoginForm() {
  const router = useRouter();
  const parametros = useSearchParams();
  const callbackUrl = parametros.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Envía las credenciales a Auth.js. */
  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setCargando(true);
    setError(null);

    const resultado = await signIn("credentials", { email, password, redirect: false });

    if (resultado?.error) {
      setError("Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.");
      setCargando(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  /** Rellena el formulario con una cuenta de demostración. */
  function usarDemo(cuenta: (typeof CUENTAS_DEMO)[number]) {
    setEmail(cuenta.email);
    setPassword(cuenta.password);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={enviar} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            placeholder="tu@email.com"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300">
              ¿La has olvidado?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={verPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
              placeholder="••••••••"
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
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" loading={cargando}>
          {!cargando && <LogIn />}
          Iniciar sesión
        </Button>
      </form>

      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
          o continúa con
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => signIn("google", { callbackUrl })}
      >
        <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z" />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
          />
        </svg>
        Continuar con Google
      </Button>

      {/* Accesos de demostración */}
      <div className="rounded-xl border border-border/70 bg-surface/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Cuentas de demostración</p>
        <div className="flex flex-wrap gap-1.5">
          {CUENTAS_DEMO.map((cuenta) => (
            <Button
              key={cuenta.email}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => usarDemo(cuenta)}
              className="gap-1.5"
            >
              <Badge
                variant={cuenta.rol === "ADMIN" ? "warning" : cuenta.rol === "PRO" ? "gradient" : "muted"}
                className="px-1.5 py-0 text-[9px]"
              >
                {cuenta.rol}
              </Badge>
              {cuenta.email.split("@")[0]}
            </Button>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <Loader2 className="size-3" />
          Pulsa una cuenta para rellenar el formulario automáticamente.
        </p>
      </div>
    </div>
  );
}
