"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Formulario para crear un cliente (modo agencia). */
export function ClientesForm() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, iniciarTransicion] = useTransition();

  async function crear(datos: FormData) {
    setOcupado(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: datos.get("nombre"),
          dominio: datos.get("dominio"),
          notas: datos.get("notas"),
        }),
      });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json()) as { error?: string };
        throw new Error(cuerpo.error ?? `HTTP ${respuesta.status}`);
      }
      setAbierto(false);
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cliente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Nuevo cliente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Un cliente de tu agencia. Podrás asignarle productos y tiendas
            seguidas desde sus trackers.
          </DialogDescription>
        </DialogHeader>
        <form id="formulario-cliente" action={crear} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input id="nombre" name="nombre" required placeholder="Mi cliente SL" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dominio">Dominio web</Label>
            <Input id="dominio" name="dominio" placeholder="micliente.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={2} placeholder="Contacto, objetivos…" />
          </div>
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button size="sm" form="formulario-cliente" disabled={ocupado}>
            {ocupado ? "Creando…" : "Crear cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
