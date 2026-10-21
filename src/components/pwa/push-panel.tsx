"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Check,
  Download,
  Loader2,
  MonitorSmartphone,
  Send,
  ShieldAlert,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RelativeTime } from "@/components/domain/relative-time";

/** Dispositivo suscrito tal y como lo entrega el servidor. */
export interface DispositivoPush {
  id: string;
  navegador: string;
  endpoint: string;
  activa: boolean;
  ultimoUso: string | null;
  creado: string;
}

interface PushPanelProps {
  /** ¿Hay claves VAPID en el servidor? */
  configurado: boolean;
  /** Clave pública VAPID (segura de exponer). */
  clavePublica: string | null;
  dispositivos: DispositivoPush[];
}

/** Clave pública VAPID (base64url) → bytes que espera `subscribe`. */
function claveABytes(base64: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(normalizada);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Permiso real de notificaciones.
 *
 * `Notification.permission` puede quedarse en "denied" en navegadores
 * embebidos o sin servicio de notificaciones, mientras la Permissions API sí
 * refleja la concesión. Se consulta la API y se cae al valor clásico.
 */
async function permisoNotificaciones(): Promise<NotificationPermission> {
  try {
    const estado = await navigator.permissions.query({ name: "notifications" as PermissionName });
    if (estado.state === "granted") return "granted";
    if (estado.state === "denied") return "denied";
    return "default";
  } catch {
    return typeof Notification !== "undefined" ? Notification.permission : "default";
  }
}

/** Suscripción actual del navegador (null si no hay). */
async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return null;
  return registro.pushManager.getSubscription();
}

export function PushPanel({ configurado, clavePublica, dispositivos }: PushPanelProps) {
  const router = useRouter();
  const [soportado, setSoportado] = useState<boolean | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission>("default");
  const [suscrito, setSuscrito] = useState(false);
  const [trabajando, setTrabajando] = useState<"alta" | "baja" | "prueba" | null>(null);
  const [esIos, setEsIos] = useState(false);
  const [instalada, setInstalada] = useState(true);
  const [instalacion, setInstalacion] = useState<{ prompt: () => Promise<void> } | null>(null);

  const activos = dispositivos.filter((dispositivo) => dispositivo.activa).length;

  // Estado real del navegador (permiso, suscripción, instalación).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const haySoporte =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
    setSoportado(haySoporte);

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setEsIos(ios);
    setInstalada(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true,
    );
    if ("Notification" in window) void permisoNotificaciones().then(setPermiso);

    if (haySoporte) void suscripcionActual().then((suscripcion) => setSuscrito(Boolean(suscripcion)));

    // Android/Chrome: captura el aviso de instalación para mostrarlo a demanda.
    const alPoderInstalar = (evento: Event) => {
      evento.preventDefault();
      const diferido = evento as Event & { prompt: () => Promise<void> };
      setInstalacion({ prompt: () => diferido.prompt() });
    };
    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    window.addEventListener("appinstalled", () => setInstalada(true));
    return () => window.removeEventListener("beforeinstallprompt", alPoderInstalar);
  }, []);

  const activar = useCallback(async () => {
    if (!clavePublica) {
      toast.error("El servidor no tiene claves VAPID configuradas.");
      return;
    }
    setTrabajando("alta");
    try {
      const solicitado = await Notification.requestPermission();
      const permisoPedido = solicitado === "granted" ? solicitado : await permisoNotificaciones();
      setPermiso(permisoPedido);
      if (permisoPedido !== "granted") {
        toast.error("Permiso denegado", {
          description: "Actívalo en los ajustes del navegador para este sitio y vuelve a intentarlo.",
        });
        return;
      }

      const registro = await navigator.serviceWorker.register(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js`,
        { scope: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/` },
      );
      await navigator.serviceWorker.ready;

      const existente = await registro.pushManager.getSubscription();
      const suscripcion =
        existente ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: claveABytes(clavePublica) as BufferSource,
        }));

      const respuesta = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(suscripcion.toJSON()),
      });
      if (!respuesta.ok) {
        const datos = (await respuesta.json().catch(() => ({}))) as { error?: string };
        // Si el servidor no guarda la suscripción, no se deja activa en local.
        if (!existente) await suscripcion.unsubscribe();
        throw new Error(datos.error ?? "No se pudo guardar el dispositivo.");
      }

      setSuscrito(true);
      toast.success("Avisos activados", { description: "Este dispositivo recibirá las alertas." });
      router.refresh();
    } catch (error) {
      toast.error("No se pudieron activar los avisos", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTrabajando(null);
    }
  }, [clavePublica, router]);

  const desactivar = useCallback(async () => {
    setTrabajando("baja");
    try {
      const suscripcion = await suscripcionActual();
      if (suscripcion) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: suscripcion.endpoint }),
        }).catch(() => null);
        await suscripcion.unsubscribe();
      }
      setSuscrito(false);
      toast.success("Avisos desactivados en este dispositivo");
      router.refresh();
    } catch (error) {
      toast.error("No se pudo desactivar", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTrabajando(null);
    }
  }, [router]);

  const probar = useCallback(async () => {
    setTrabajando("prueba");
    try {
      const respuesta = await fetch("/api/push/test", { method: "POST" });
      const datos = (await respuesta.json().catch(() => ({}))) as { error?: string; enviados?: number };
      if (!respuesta.ok) throw new Error(datos.error ?? "El envío falló.");
      toast.success(`Notificación enviada a ${datos.enviados} dispositivo(s)`, {
        description: "Debería aparecer en la barra de notificaciones del móvil.",
      });
    } catch (error) {
      toast.error("No se pudo enviar la prueba", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTrabajando(null);
    }
  }, []);

  const instalar = useCallback(async () => {
    if (!instalacion) {
      toast.info(esIos ? "Añádela a la pantalla de inicio" : "Instálala desde el menú del navegador", {
        description: esIos
          ? "Safari → botón Compartir → «Añadir a pantalla de inicio». Así funcionan los avisos en iPhone."
          : "Menú del navegador (⋮) → «Instalar aplicación» o «Añadir a pantalla de inicio».",
      });
      return;
    }
    await instalacion.prompt();
    setInstalacion(null);
  }, [esIos, instalacion]);

  const estadoPermiso =
    permiso === "granted"
      ? { texto: "Permiso concedido", tono: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
      : permiso === "denied"
        ? { texto: "Permiso bloqueado", tono: "border-rose-500/30 bg-rose-500/10 text-rose-300" }
        : { texto: "Sin permiso todavía", tono: "border-amber-500/30 bg-amber-500/10 text-amber-300" };

  return (
    <Card className="mb-6">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-indigo-300" aria-hidden />
            Avisos al móvil (PWA)
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={estadoPermiso.tono}>
              {estadoPermiso.texto}
            </Badge>
            <Badge variant="outline" className={configurado ? "border-sky-500/30 bg-sky-500/10 text-sky-300" : "border-slate-500/30 bg-slate-500/10 text-slate-300"}>
              {configurado ? "Servidor listo" : "Sin claves VAPID"}
            </Badge>
          </div>
        </div>
        <CardDescription>
          Instala TrendHunter Pro en el teléfono y recibe las mismas alertas de la campana como notificación del sistema:
          score objetivo, cambios de precio, producto nuevo, saturación o reversión.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {soportado === false && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Este navegador no admite notificaciones push. En iPhone necesitas iOS 16.4 o superior y la app añadida a la
            pantalla de inicio. Mientras tanto, las alertas siguen llegando por correo, Telegram y webhook.
          </p>
        )}

        {esIos && !instalada && soportado !== false && (
          <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-200">
            En iPhone, los avisos push solo funcionan con la app instalada: toca <strong>Compartir</strong> en Safari y
            elige <strong>«Añadir a pantalla de inicio»</strong>. Después abre la app desde el icono y activa los avisos.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {suscrito ? (
            <Button variant="outline" onClick={desactivar} disabled={trabajando !== null}>
              {trabajando === "baja" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Desactivar en este dispositivo
            </Button>
          ) : (
            <Button onClick={activar} disabled={trabajando !== null || !configurado || soportado === false}>
              {trabajando === "alta" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="mr-2 h-4 w-4" />
              )}
              Activar avisos en este dispositivo
            </Button>
          )}

          <Button variant="outline" onClick={probar} disabled={trabajando !== null || activos === 0 || !configurado}>
            {trabajando === "prueba" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar prueba
          </Button>

          {!instalada && (
            <Button variant="ghost" onClick={instalar}>
              <Download className="mr-2 h-4 w-4" />
              Instalar app
            </Button>
          )}

          {suscrito && (
            <span className="flex items-center gap-1 text-xs text-emerald-300">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Este dispositivo está suscrito
            </span>
          )}
        </div>

        {!configurado && (
          <p className="rounded-lg border border-slate-500/20 bg-slate-500/5 p-3 text-xs text-muted-foreground">
            Para enviar push, define <code className="text-foreground">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,{" "}
            <code className="text-foreground">VAPID_PRIVATE_KEY</code> y <code className="text-foreground">VAPID_SUBJECT</code>{" "}
            en el servidor. Se generan con <code className="text-foreground">npx web-push generate-vapid-keys</code>. Sin
            ellas, la campana, el correo, Telegram y el webhook siguen funcionando.
          </p>
        )}

        <div className="rounded-lg border border-border/60">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden />
              Dispositivos suscritos
            </span>
            <span>
              {activos} activo{activos === 1 ? "" : "s"} de {dispositivos.length}
            </span>
          </div>
          {dispositivos.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Todavía no hay ningún dispositivo suscrito.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {dispositivos.map((dispositivo) => (
                <li key={dispositivo.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {dispositivo.navegador}
                      {dispositivo.activa ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          activo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-500/30 bg-slate-500/10 text-slate-300">
                          retirado
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{dispositivo.endpoint}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {dispositivo.ultimoUso ? (
                        <>
                          último envío <RelativeTime value={dispositivo.ultimoUso} />
                        </>
                      ) : (
                        <>alta <RelativeTime value={dispositivo.creado} /></>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
