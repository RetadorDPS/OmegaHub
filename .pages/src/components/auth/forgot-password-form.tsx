"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Formulario de solicitud de restablecimiento de contraseña. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Envía la solicitud al endpoint de restablecimiento. */
  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo enviar la solicitud");
      setEnviado(true);
    } catch (fallo) {
      setError((fallo as Error).message);
    } finally {
      setCargando(false);
    }
  }

  if (enviado) {
    return (
      <div className="space-y-5">
        <div className="flex size-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 className="size-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revisa tu correo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Si <span className="text-slate-200">{email}</span> está registrado, recibirás un enlace para crear una
            contraseña nueva. El enlace caduca en 1 hora.
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-surface/40 p-3 text-xs text-muted-foreground">
          ¿No lo ves? Revisa la carpeta de spam. En entornos sin SMTP configurado el enlace se registra en el log del
          servidor.
        </div>
        <Button asChild variant="outline" className="w-full gap-2">
          <Link href="/login">
            <ArrowLeft className="size-4" />
            Volver al inicio de sesión
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">¿Olvidaste tu contraseña?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Introduce tu correo y te enviaremos un enlace para restablecerla.
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
          <Label htmlFor="email-recuperar">Correo electrónico</Label>
          <Input
            id="email-recuperar"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            placeholder="tu@email.com"
          />
        </div>
        <Button type="submit" loading={cargando} className="w-full gap-2">
          {!cargando && <Mail className="size-4" />}
          Enviar enlace de recuperación
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
          Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}
