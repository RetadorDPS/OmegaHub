"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCALES } from "@/lib/constants";

interface ProfileFormProps {
  usuario: { name: string | null; email: string; image: string | null; locale: string; emailVerificado: boolean };
}

/**
 * Formulario de perfil: nombre, avatar (URL) e idioma.
 * Guarda contra `PATCH /api/user/profile` y refresca la sesión para que la
 * cabecera muestre los datos nuevos.
 */
export function ProfileForm({ usuario }: ProfileFormProps) {
  const router = useRouter();
  const [nombre, setNombre] = useState(usuario.name ?? "");
  const [imagen, setImagen] = useState(usuario.image ?? "");
  const [idioma, setIdioma] = useState(usuario.locale);
  const [guardando, setGuardando] = useState(false);

  /** Envía los cambios del perfil. */
  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nombre, image: imagen, locale: idioma }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo guardar el perfil");
      toast.success("Perfil actualizado");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="size-4 text-indigo-400" />
          Perfil
        </CardTitle>
        <CardDescription>
          {usuario.email}
          {usuario.emailVerificado ? " · correo verificado" : " · correo pendiente de verificar"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={guardar}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="perfil-nombre">Nombre</Label>
              <Input
                id="perfil-nombre"
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                placeholder="Tu nombre"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perfil-idioma">Idioma de la interfaz</Label>
              <Select value={idioma} onValueChange={setIdioma}>
                <SelectTrigger id="perfil-idioma">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((locale) => (
                    <SelectItem key={locale.code} value={locale.code}>
                      {locale.flag} {locale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="perfil-imagen">URL del avatar</Label>
            <Input
              id="perfil-imagen"
              value={imagen}
              onChange={(evento) => setImagen(evento.target.value)}
              placeholder="https://…/avatar.jpg"
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Se usa en la cabecera y en los comentarios del equipo. Déjalo vacío para usar las iniciales.
            </p>
          </div>

          <Button type="submit" loading={guardando} className="gap-2">
            {!guardando && <Save className="size-4" />}
            Guardar cambios
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Formulario de cambio de contraseña. */
export function PasswordForm({ tienePassword }: { tienePassword: boolean }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);

  /** Valida en cliente y envía el cambio de contraseña. */
  async function cambiar(evento: React.FormEvent) {
    evento.preventDefault();
    if (nueva !== repetir) {
      toast.error("Las contraseñas nuevas no coinciden");
      return;
    }
    if (nueva.length < 8 || !/[a-zA-Z]/.test(nueva) || !/\d/.test(nueva)) {
      toast.error("La contraseña debe tener 8 caracteres, una letra y un número");
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: actual, newPassword: nueva }),
      });
      const datos = (await respuesta.json()) as { error?: string; message?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo cambiar la contraseña");
      toast.success(datos.message ?? "Contraseña actualizada");
      setActual("");
      setNueva("");
      setRepetir("");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-violet-400" />
          Contraseña
        </CardTitle>
        <CardDescription>
          {tienePassword
            ? "Cambia tu contraseña periódicamente para mantener la cuenta segura."
            : "Tu cuenta se creó con Google y aún no tiene contraseña: define una para poder acceder también con correo."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={cambiar}>
          {tienePassword && (
            <div className="space-y-2">
              <Label htmlFor="pass-actual">Contraseña actual</Label>
              <Input
                id="pass-actual"
                type="password"
                value={actual}
                onChange={(evento) => setActual(evento.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pass-nueva">Nueva contraseña</Label>
              <Input
                id="pass-nueva"
                type="password"
                value={nueva}
                onChange={(evento) => setNueva(evento.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass-repetir">Repite la nueva contraseña</Label>
              <Input
                id="pass-repetir"
                type="password"
                value={repetir}
                onChange={(evento) => setRepetir(evento.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            <p>
              Mínimo 8 caracteres con al menos una letra y un número. La contraseña se almacena con hash bcrypt y
              nunca en texto plano.
            </p>
          </div>
          <Button type="submit" loading={guardando} className="gap-2">
            {!guardando && <KeyRound className="size-4" />}
            Cambiar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
