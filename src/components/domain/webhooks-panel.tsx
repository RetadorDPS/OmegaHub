"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Pause,
  Play,
  Plus,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface WebhookItem {
  id: string;
  nombre: string;
  url: string;
  provider: "SLACK" | "DISCORD" | "GENERIC";
  eventos: string[];
  activo: boolean;
  tieneSecreto: boolean;
  ultimoEstado: number | null;
  ultimoError: string | null;
  ultimoEnvio: string | null;
  envios: number;
  fallos: number;
}

interface EventoDefinicion {
  id: string;
  nombre: string;
  detalle: string;
}

const PROVEEDORES = [
  { id: "SLACK", nombre: "Slack", ayuda: "Slack → Apps → Incoming Webhooks → copia la URL." },
  { id: "DISCORD", nombre: "Discord", ayuda: "Canal → Editar canal → Integraciones → Webhooks." },
  { id: "GENERIC", nombre: "Genérico (n8n, Make, Zapier)", ayuda: "Cualquier URL https que acepte un POST JSON." },
] as const;

/**
 * Panel de webhooks salientes. Se muestra en Notificaciones para no añadir una
 * pantalla más: aquí es donde uno viene a configurar los avisos.
 */
export function WebhooksPanel({
  webhooks,
  eventos,
  planPermite,
}: {
  webhooks: WebhookItem[];
  eventos: EventoDefinicion[];
  planPermite: boolean;
}) {
  const router = useRouter();
  const [, iniciarTransicion] = useTransition();
  const [abierto, setAbierto] = useState(webhooks.length === 0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState<"SLACK" | "DISCORD" | "GENERIC">("SLACK");
  const [seleccion, setSeleccion] = useState<string[]>(["alerta"]);
  const [secretoNuevo, setSecretoNuevo] = useState<string | null>(null);

  const refrescar = () => iniciarTransicion(() => router.refresh());

  /** Crea el webhook. */
  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nombre.trim() || !url.trim()) {
      toast.error("Pon un nombre y la URL del webhook.");
      return;
    }
    if (seleccion.length === 0) {
      toast.error("Marca al menos un evento.");
      return;
    }
    setOcupado("crear");
    try {
      const respuesta = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre, url, provider, eventos: seleccion }),
      });
      const datos = (await respuesta.json()) as { error?: string; secreto?: string | null };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo crear el webhook.");
      setSecretoNuevo(datos.secreto ?? null);
      setNombre("");
      setUrl("");
      setSeleccion(["alerta"]);
      setAbierto(false);
      toast.success("Webhook creado. Envíale una prueba para comprobar que llega.");
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Envía un aviso de prueba real. */
  async function probar(id: string) {
    setOcupado(`probar-${id}`);
    try {
      const respuesta = await fetch(`/api/webhooks/${id}/probar`, { method: "POST" });
      const datos = (await respuesta.json()) as { ok?: boolean; error?: string; estado?: number };
      if (!respuesta.ok || !datos.ok) throw new Error(datos.error ?? `El destino respondió ${datos.estado ?? "sin respuesta"}`);
      toast.success("Prueba entregada. Revisa tu canal.");
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Activa o pausa. */
  async function alternar(webhook: WebhookItem) {
    setOcupado(`estado-${webhook.id}`);
    try {
      const respuesta = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activo: !webhook.activo }),
      });
      if (!respuesta.ok) {
        const datos = (await respuesta.json()) as { error?: string };
        throw new Error(datos.error ?? "No se pudo cambiar el estado.");
      }
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Borra el webhook. */
  async function borrar(webhook: WebhookItem) {
    if (!window.confirm(`¿Borrar «${webhook.nombre}»? Dejarás de recibir sus avisos.`)) return;
    setOcupado(`borrar-${webhook.id}`);
    try {
      const respuesta = await fetch(`/api/webhooks/${webhook.id}`, { method: "DELETE" });
      if (!respuesta.ok) {
        const datos = (await respuesta.json()) as { error?: string };
        throw new Error(datos.error ?? "No se pudo borrar.");
      }
      toast.success("Webhook borrado");
      refrescar();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Alterna un evento en la suscripción. */
  function alternarEvento(id: string) {
    setSeleccion((actual) => (actual.includes(id) ? actual.filter((evento) => evento !== id) : [...actual, id]));
  }

  const ayudaProvider = PROVEEDORES.find((entrada) => entrada.id === provider)?.ayuda ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <WebhookIcon className="size-4 text-indigo-400" />
          Webhooks
          {webhooks.length > 0 && (
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
              {webhooks.filter((webhook) => webhook.activo).length} activo(s)
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Recibe los avisos en Slack, Discord o tu automatización (n8n, Make, Zapier). Además de la campana, sin
          sustituirla.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!planPermite ? (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm">
            <p className="font-medium text-indigo-200">Los webhooks están en Business y Agency.</p>
            <p className="mt-1 text-muted-foreground">
              Con tu plan actual sigues recibiendo los avisos en la campana y por correo.
            </p>
            <Button asChild size="sm" className="mt-3">
              <a href="/pricing">Ver planes</a>
            </Button>
          </div>
        ) : (
          <>
            {/* Lista */}
            {webhooks.length > 0 && (
              <ul className="divide-y divide-border/60">
                {webhooks.map((webhook) => (
                  <li key={webhook.id} className="flex flex-wrap items-center gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {webhook.nombre}
                        <Badge variant="outline" className="text-[10px]">
                          {PROVEEDORES.find((entrada) => entrada.id === webhook.provider)?.nombre.split(" ")[0]}
                        </Badge>
                        {!webhook.activo && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            Pausado
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{webhook.url}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {webhook.ultimoEnvio && <span>Último envío {formatRelativeTime(webhook.ultimoEnvio)}</span>}
                        <span>{webhook.envios} entregados</span>
                        {webhook.fallos > 0 && <span className="text-amber-300">{webhook.fallos} fallos</span>}
                        {webhook.ultimoError && (
                          <span className="flex items-center gap-1 text-amber-300">
                            <AlertTriangle className="size-3" />
                            {webhook.ultimoError.slice(0, 60)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => void probar(webhook.id)}
                        disabled={ocupado !== null}
                      >
                        {ocupado === `probar-${webhook.id}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        Probar
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void alternar(webhook)}
                        disabled={ocupado !== null}
                        aria-label={webhook.activo ? `Pausar ${webhook.nombre}` : `Activar ${webhook.nombre}`}
                        title={webhook.activo ? "Pausar" : "Activar"}
                      >
                        {webhook.activo ? <Pause /> : <Play />}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void borrar(webhook)}
                        disabled={ocupado !== null}
                        aria-label={`Borrar ${webhook.nombre}`}
                        title="Borrar"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Secreto recién creado */}
            {secretoNuevo && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <CheckCircle2 className="size-3.5" />
                  Secreto de firma (se muestra solo esta vez)
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Cada envío lleva la cabecera <code>X-TrendHunter-Signature: sha256=…</code> con este secreto. Guárdalo
                  en tu automatización para comprobar que el aviso es nuestro.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-[11px]">{secretoNuevo}</code>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Copiar secreto"
                    onClick={() => {
                      void navigator.clipboard.writeText(secretoNuevo);
                      toast.success("Secreto copiado");
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              </div>
            )}

            {/* Alta */}
            {abierto ? (
              <form onSubmit={crear} className="space-y-3 rounded-lg border border-border/60 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="webhook-nombre">Nombre</Label>
                    <Input
                      id="webhook-nombre"
                      placeholder="Alertas del equipo"
                      value={nombre}
                      onChange={(evento) => setNombre(evento.target.value)}
                      maxLength={60}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="webhook-proveedor">Destino</Label>
                    <Select value={provider} onValueChange={(valor) => setProvider(valor as typeof provider)}>
                      <SelectTrigger id="webhook-proveedor">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVEEDORES.map((entrada) => (
                          <SelectItem key={entrada.id} value={entrada.id}>
                            {entrada.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="webhook-url">URL del webhook</Label>
                  <Input
                    id="webhook-url"
                    type="url"
                    placeholder="https://hooks.slack.com/services/…"
                    value={url}
                    onChange={(evento) => setUrl(evento.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">{ayudaProvider}</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Eventos</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {eventos.map((evento) => {
                      const activo = seleccion.includes(evento.id);
                      return (
                        <button
                          key={evento.id}
                          type="button"
                          onClick={() => alternarEvento(evento.id)}
                          title={evento.detalle}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            activo
                              ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-200"
                              : "border-border text-muted-foreground hover:border-indigo-500/30",
                          )}
                          aria-pressed={activo}
                        >
                          {evento.nombre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={ocupado !== null} className="gap-2">
                    {ocupado === "crear" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Crear webhook
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" className="gap-2" onClick={() => setAbierto(true)}>
                <Plus className="size-4" />
                Añadir webhook
              </Button>
            )}

            <p className="text-[11px] text-muted-foreground">
              Por seguridad solo se admiten URLs https públicas (nada de localhost ni direcciones internas) y cada
              envío se corta a los 8 segundos para no bloquear las alertas.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
