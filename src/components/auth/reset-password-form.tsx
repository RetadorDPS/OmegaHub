"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Formulario para definir una contraseña nueva con un token válido. */
export function ResetPasswordForm() {
  const router = useRouter();
  const parametros = useSearchParams();
  const token = parametros.get("token");

  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Enlace incompleto</p>
            <p className="text-amber-300/80">
              Falta el token de restablecimiento. Solicita un enlace nuevo desde «¿Olvidaste tu contraseña?».
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full gap-2">
          <Link href="/forgot-password">
            <ArrowLeft className="size-4" />
            Solicitar un enlace nuevo
          </Link>
        </Button>
      </div>
    );
  }

  /** Envía la nueva contraseña junto con el token. */
  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (password !== repetir) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("La contraseña debe tener 8 caracteres, una letra y un número");
      return;
    }

    setCargando(true);
    try {
      const respuesta = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo restablecer la contraseña");
      router.push("/login?restablecida=ok");
    } catch (fallo) {
      setError((fallo as Error).message);
      setCargando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva contraseña</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige una contraseña segura de al menos 8 caracteres con letras y números.
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
          <Label htmlFor="nueva-password">Contraseña nueva</Label>
          <Input
            id="nueva-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nueva-repetir">Repite la contraseña</Label>
          <Input
            id="nueva-repetir"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={repetir}
            onChange={(evento) => setRepetir(evento.target.value)}
          />
        </div>
        <Button type="submit" loading={cargando} className="w-full gap-2">
          {!cargando && <KeyRound className="size-4" />}
          Guardar nueva contraseña
        </Button>
      </form>
    </div>
  );
}
