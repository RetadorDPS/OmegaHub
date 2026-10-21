"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, ExternalLink, Store, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

interface TiendaSeguida {
  id: string;
  nombre: string;
  dominio: string;
  activo: boolean;
}

interface ProductoSeguido {
  id: string;
  titulo: string;
  activo: boolean;
  objetivo: number;
  score: number;
}

interface AvisoItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

interface NotificationPreferencesProps {
  tiendas: TiendaSeguida[];
  productos: ProductoSeguido[];
  notificaciones: AvisoItem[];
}

/** Colores por tipo de notificación. */
const COLORES: Record<NotificationType, string> = {
  NEW_PRODUCT: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  TREND_ALERT: "text-indigo-300 border-indigo-500/30 bg-indigo-500/10",
  STORE_CHANGE: "text-violet-300 border-violet-500/30 bg-violet-500/10",
  PRICE_CHANGE: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  SYSTEM: "text-slate-300 border-slate-500/30 bg-slate-500/10",
  SUBSCRIPTION: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  SCORE_THRESHOLD: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  SATURATION_ALERT: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  TREND_REVERSAL: "text-amber-300 border-amber-500/30 bg-amber-500/10",
};

/**
 * Preferencias de notificación por seguimiento + historial de avisos.
 * Los interruptores escriben en base de datos mediante los endpoints de
 * trackers, de modo que el estado persiste entre sesiones.
 */
export function NotificationPreferences({ tiendas, productos, notificaciones }: NotificationPreferencesProps) {
  const router = useRouter();
  const [estadoTiendas, setEstadoTiendas] = useState(() =>
    Object.fromEntries(tiendas.map((tienda) => [tienda.id, tienda.activo])),
  );
  const [estadoProductos, setEstadoProductos] = useState(() =>
    Object.fromEntries(productos.map((producto) => [producto.id, producto.activo])),
  );
  const [avisos, setAvisos] = useState(notificaciones);
  const [procesando, setProcesando] = useState<string | null>(null);

  /** Activa o desactiva las alertas de una tienda. */
  async function alternarTienda(id: string, valor: boolean) {
    setEstadoTiendas((actual) => ({ ...actual, [id]: valor }));
    setProcesando(`tienda-${id}`);
    try {
      const respuesta = await fetch("/api/trackers/stores", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId: id, notificationEnabled: valor }),
      });
      if (!respuesta.ok) throw new Error();
      toast.success(valor ? "Alertas de tienda activadas" : "Alertas de tienda desactivadas");
      router.refresh();
    } catch {
      setEstadoTiendas((actual) => ({ ...actual, [id]: !valor }));
      toast.error("No se pudieron actualizar las alertas");
    } finally {
      setProcesando(null);
    }
  }

  /** Activa o desactiva las alertas de un producto. */
  async function alternarProducto(id: string, valor: boolean) {
    setEstadoProductos((actual) => ({ ...actual, [id]: valor }));
    setProcesando(`producto-${id}`);
    try {
      const respuesta = await fetch("/api/trackers/products", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: id, notificationEnabled: valor }),
      });
      if (!respuesta.ok) throw new Error();
      toast.success(valor ? "Alertas de producto activadas" : "Alertas de producto desactivadas");
      router.refresh();
    } catch {
      setEstadoProductos((actual) => ({ ...actual, [id]: !valor }));
      toast.error("No se pudieron actualizar las alertas");
    } finally {
      setProcesando(null);
    }
  }

  /** Marca todas las notificaciones como leídas. */
  async function marcarTodas() {
    setProcesando("todas");
    try {
      const respuesta = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!respuesta.ok) throw new Error();
      setAvisos((actual) => actual.map((aviso) => ({ ...aviso, read: true })));
      toast.success("Todas las notificaciones marcadas como leídas");
      router.refresh();
    } catch {
      toast.error("No se pudieron marcar las notificaciones");
    } finally {
      setProcesando(null);
    }
  }

  /** Marca un aviso concreto como leído. */
  async function marcarUna(id: string) {
    setAvisos((actual) => actual.map((aviso) => (aviso.id === id ? { ...aviso, read: true } : aviso)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    router.refresh();
  }

  /** Elimina un aviso del historial. */
  async function eliminar(id: string) {
    setAvisos((actual) => actual.filter((aviso) => aviso.id !== id));
    const respuesta = await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (!respuesta?.ok) {
      toast.error("No se pudo eliminar la notificación");
      router.refresh();
      return;
    }
    toast.success("Notificación eliminada");
  }

  const sinLeer = avisos.filter((aviso) => !aviso.read).length;

  return (
    <Tabs defaultValue="historial">
      <TabsList>
        <TabsTrigger value="historial" className="gap-1.5">
          <Bell className="size-3.5" />
          Historial ({sinLeer} sin leer)
        </TabsTrigger>
        <TabsTrigger value="tiendas" className="gap-1.5">
          <Store className="size-3.5" />
          Tiendas ({tiendas.length})
        </TabsTrigger>
        <TabsTrigger value="productos" className="gap-1.5">
          <Target className="size-3.5" />
          Productos ({productos.length})
        </TabsTrigger>
      </TabsList>

      {/* --- Historial --- */}
      <TabsContent value="historial">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Historial de avisos</CardTitle>
              <CardDescription>Todos los cambios detectados y avisos del sistema</CardDescription>
            </div>
            {sinLeer > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                loading={procesando === "todas"}
                onClick={marcarTodas}
              >
                <CheckCheck className="size-3.5" />
                Marcar todo como leído
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {avisos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                Sin notificaciones todavía.
              </p>
            ) : (
              avisos.map((aviso) => (
                <div
                  key={aviso.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3",
                    aviso.read ? "border-border/60 bg-surface/30" : "border-indigo-500/30 bg-indigo-500/5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("border", COLORES[aviso.type])}>
                        {NOTIFICATION_TYPE_LABELS[aviso.type]}
                      </Badge>
                      {!aviso.read && <span className="size-2 rounded-full bg-indigo-400" aria-label="Sin leer" />}
                      <span className="text-[11px] text-muted-foreground"><RelativeTime value={aviso.createdAt} /></span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-slate-100">{aviso.title}</p>
                    <p className="text-xs text-muted-foreground">{aviso.message}</p>
                  </div>
                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    {!aviso.read && (
                      <Button variant="ghost" size="sm" onClick={() => marcarUna(aviso.id)} className="gap-1.5">
                        <CheckCheck className="size-3.5" />
                        Leído
                      </Button>
                    )}
                    {aviso.actionUrl && (
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <Link href={aviso.actionUrl}>
                          Abrir
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Eliminar notificación"
                      onClick={() => eliminar(aviso.id)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-rose-400" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Tiendas --- */}
      <TabsContent value="tiendas">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertas por tienda</CardTitle>
            <CardDescription>
              Activa los avisos de las tiendas que te interesen: productos nuevos, cambios de precio y picos de tráfico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tiendas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No sigues ninguna tienda todavía.{" "}
                <Link href="/dashboard/store-tracker" className="text-indigo-400 hover:underline">
                  Ir al Store Tracker
                </Link>
              </p>
            ) : (
              tiendas.map((tienda) => (
                <div
                  key={tienda.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{tienda.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">{tienda.dominio}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    {estadoTiendas[tienda.id] ? (
                      <Bell className="size-3.5 text-amber-400" />
                    ) : (
                      <BellOff className="size-3.5" />
                    )}
                    <Switch
                      checked={Boolean(estadoTiendas[tienda.id])}
                      disabled={procesando === `tienda-${tienda.id}`}
                      aria-label={`Alertas de ${tienda.nombre}`}
                      onCheckedChange={(valor) => alternarTienda(tienda.id, valor)}
                    />
                  </label>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Productos --- */}
      <TabsContent value="productos">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertas por producto</CardTitle>
            <CardDescription>
              Los avisos se disparan cuando el TrendScore supera el umbral que definas en cada producto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {productos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No sigues ningún producto todavía.{" "}
                <Link href="/dashboard/winning-products" className="text-indigo-400 hover:underline">
                  Explorar productos
                </Link>
              </p>
            ) : (
              productos.map((producto) => (
                <div
                  key={producto.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{producto.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      Score actual {producto.score} / umbral {producto.objetivo}
                      {producto.score >= producto.objetivo && (
                        <span className="ml-1 text-emerald-400">· objetivo alcanzado</span>
                      )}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    {estadoProductos[producto.id] ? (
                      <Bell className="size-3.5 text-amber-400" />
                    ) : (
                      <BellOff className="size-3.5" />
                    )}
                    <Switch
                      checked={Boolean(estadoProductos[producto.id])}
                      disabled={procesando === `producto-${producto.id}`}
                      aria-label={`Alertas de ${producto.titulo}`}
                      onCheckedChange={(valor) => alternarProducto(producto.id, valor)}
                    />
                  </label>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
