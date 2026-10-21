"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, KeyRound, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Clave tal y como la devuelve el servidor (sin hash). */
export interface ClaveApi {
  id: string;
  nombre: string;
  prefijo: string;
  peticiones: number;
  peticionesHoy: number;
  ultimoUso: string | null;
  revocadaEn: string | null;
  creadaEn: string;
}

interface ApiKeysPanelProps {
  claves: ClaveApi[];
  maximo: number;
}

/** Fecha corta en español (o «nunca»). */
function fecha(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Gestión de claves: crear (se muestra una vez), copiar y revocar. */
export function ApiKeysPanel({ claves, maximo }: ApiKeysPanelProps) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claveNueva, setClaveNueva] = useState<string | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);

  const activas = claves.filter((clave) => !clave.revocadaEn).length;

  async function crear(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const cuerpo = (await respuesta.json()) as { clave?: string; error?: string };
      if (!respuesta.ok || !cuerpo.clave) {
        throw new Error(cuerpo.error ?? `No se pudo crear la clave (HTTP ${respuesta.status}).`);
      }
      setClaveNueva(cuerpo.clave);
      setNombre("");
      setAbierto(false);
      toast.success("Clave creada. Cópiala ahora: no se volverá a mostrar.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la clave.");
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Clave copiada al portapapeles.");
    } catch {
      toast.error("Tu navegador no permitió copiar. Selecciona el texto manualmente.");
    }
  }

  async function revocar(clave: ClaveApi) {
    if (!window.confirm(`¿Revocar la clave «${clave.nombre}»? Las integraciones que la usen dejarán de funcionar.`)) {
      return;
    }
    setRevocando(clave.id);
    try {
      const respuesta = await fetch(`/api/api-keys/${clave.id}`, { method: "DELETE" });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
        throw new Error(cuerpo.error ?? "No se pudo revocar la clave.");
      }
      toast.success("Clave revocada.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revocar la clave.");
    } finally {
      setRevocando(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Clave recién creada: única vez que se muestra */}
      {claveNueva && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <ShieldCheck className="size-4" />
            Guarda esta clave ahora
          </div>
          <p className="mb-3 text-xs text-emerald-100/80">
            Por seguridad solo se muestra una vez. Si la pierdes, revócala y crea otra.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 overflow-x-auto rounded-lg border border-emerald-500/30 bg-slate-950/70 px-3 py-2 font-mono text-xs text-emerald-200">
              {claveNueva}
            </code>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => copiar(claveNueva)}>
                <Copy className="size-4" />
                Copiar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setClaveNueva(null)}>
                Ya la guardé
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {activas} de {maximo} claves activas · {claves.reduce((total, clave) => total + clave.peticiones, 0)}{" "}
          peticiones históricas
        </p>
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={activas >= maximo}>
              <Plus className="size-4" />
              Crear clave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva clave de API</DialogTitle>
              <DialogDescription>
                Ponle un nombre reconocible (por ejemplo, «Integración n8n»). La clave se mostrará una sola vez.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={crear} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nombre-clave">Nombre *</Label>
                <Input
                  id="nombre-clave"
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                  placeholder="Integración n8n"
                  maxLength={60}
                  required
                  autoFocus
                />
              </div>
              {error && (
                <p className="flex items-start gap-2 text-xs text-rose-300">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" loading={ocupado} disabled={!nombre.trim()}>
                  Crear clave
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {claves.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 py-10 text-center">
          <KeyRound className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Aún no tienes claves. Crea la primera para consumir la API.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Clave</TableHead>
                <TableHead className="text-right">Peticiones</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claves.map((clave) => (
                <TableRow key={clave.id}>
                  <TableCell className="font-medium">{clave.nombre}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-indigo-300">{clave.prefijo}••••</code>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {clave.peticiones.toLocaleString("es-ES")}
                    <span className="ml-1 text-xs text-muted-foreground">({clave.peticionesHoy} hoy)</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fecha(clave.ultimoUso)}
                  </TableCell>
                  <TableCell>
                    {clave.revocadaEn ? (
                      <Badge variant="danger">Revocada</Badge>
                    ) : (
                      <Badge variant="success">Activa</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!clave.revocadaEn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revocar(clave)}
                        loading={revocando === clave.id}
                        aria-label={`Revocar ${clave.nombre}`}
                      >
                        <Trash2 className="size-4" />
                        Revocar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
