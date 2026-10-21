import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  countUnreadNotifications,
  listNotifications,
  listTrackedProducts,
  listTrackedStores,
} from "@/lib/dal";
import { PushPanel } from "@/components/pwa/push-panel";
import { pushConfigurado } from "@/lib/push";
import { endpointCorto } from "@/lib/pwa";
import { PageHeading } from "@/components/domain/page-heading";
import { NotificationPreferences } from "@/components/domain/notification-preferences";
import {
  WebhooksPanel,
  type WebhookItem,
} from "@/components/domain/webhooks-panel";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks";
import { parseJsonArray } from "@/lib/utils";
import { StatCard } from "@/components/domain/stat-card";
import { Bell, BellRing, Store, Target } from "lucide-react";

export const metadata = {
  title: "Notificaciones",
  description:
    "Configura las alertas de tiendas y productos y revisa el historial de avisos.",
};

/** Módulo 8 · Preferencias y historial de notificaciones. */
export default async function NotificationsSettingsPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [tiendas, productos, notificaciones, sinLeer, dispositivos, webhooks] =
    await Promise.all([
      listTrackedStores(sesion.user.id),
      listTrackedProducts(sesion.user.id),
      listNotifications(sesion.user.id, 40),
      countUnreadNotifications(sesion.user.id),
      prisma.pushSubscription.findMany({
        where: { userId: sesion.user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          navegador: true,
          endpoint: true,
          activa: true,
          ultimoUso: true,
          createdAt: true,
        },
      }),
      prisma.webhook.findMany({
        where: { userId: sesion.user.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const listaWebhooks: WebhookItem[] = webhooks.map((webhook) => ({
    id: webhook.id,
    nombre: webhook.nombre,
    url: ocultarWebhook(webhook.url),
    provider: webhook.provider as WebhookItem["provider"],
    eventos: parseJsonArray(webhook.eventos as string | null),
    activo: webhook.activo,
    tieneSecreto: Boolean(webhook.secreto),
    ultimoEstado: webhook.ultimoEstado,
    ultimoError: webhook.ultimoError,
    ultimoEnvio: webhook.ultimoEnvio?.toISOString() ?? null,
    envios: webhook.envios,
    fallos: webhook.fallos,
  }));

  return (
    <>
      <PageHeading
        title="Notificaciones"
        description="Decide qué seguimientos generan avisos y revisa todo lo que ha detectado la plataforma."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Avisos sin leer"
          value={sinLeer}
          icon={BellRing}
          accent="amber"
          hint="en la campana"
        />
        <StatCard
          label="Avisos totales"
          value={notificaciones.length}
          icon={Bell}
          hint="últimos 40"
        />
        <StatCard
          label="Tiendas con alertas"
          value={tiendas.filter((t) => t.notificationEnabled).length}
          icon={Store}
          accent="violet"
          hint={`de ${tiendas.length} seguidas`}
        />
        <StatCard
          label="Productos con alertas"
          value={productos.filter((p) => p.notificationEnabled).length}
          icon={Target}
          accent="emerald"
          hint={`de ${productos.length} seguidos`}
        />
      </div>

      <PushPanel
        configurado={pushConfigurado()}
        clavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        dispositivos={dispositivos.map((dispositivo) => ({
          id: dispositivo.id,
          navegador: dispositivo.navegador,
          endpoint: endpointCorto(dispositivo.endpoint),
          activa: dispositivo.activa,
          ultimoUso: dispositivo.ultimoUso?.toISOString() ?? null,
          creado: dispositivo.createdAt.toISOString(),
        }))}
      />

      <div className="mb-6">
        <WebhooksPanel
          webhooks={listaWebhooks}
          eventos={EVENTOS_WEBHOOK.map((evento) => ({
            id: evento.id,
            nombre: evento.nombre,
            detalle: evento.detalle,
          }))}
          planPermite={
            sesion.user.planType === "BUSINESS" ||
            sesion.user.planType === "AGENCY"
          }
        />
      </div>

      <NotificationPreferences
        tiendas={tiendas.map((tienda) => ({
          id: tienda.id,
          nombre: tienda.name,
          dominio: tienda.domain,
          activo: tienda.notificationEnabled,
        }))}
        productos={productos.map((item) => ({
          id: item.product.id,
          titulo: item.product.title,
          activo: item.notificationEnabled,
          objetivo: item.targetTrendScore,
          score: item.product.trendScore,
        }))}
        notificaciones={notificaciones.map((notificacion) => ({
          id: notificacion.id,
          type: notificacion.type,
          title: notificacion.title,
          message: notificacion.message,
          read: notificacion.read,
          actionUrl: notificacion.actionUrl,
          createdAt: notificacion.createdAt,
        }))}
      />
    </>
  );
}

/** Oculta el token de la URL del webhook en la pantalla (no se muestra entero). */
function ocultarWebhook(url: string): string {
  try {
    const destino = new URL(url);
    const partes = destino.pathname.split("/").filter(Boolean);
    const ultima = partes[partes.length - 1] ?? "";
    const visible =
      ultima.length > 8 ? `${ultima.slice(0, 6)}…${ultima.slice(-4)}` : "…";
    return `${destino.origin}/${partes.slice(0, -1).join("/")}${partes.length > 1 ? "/" : ""}${visible}`;
  } catch {
    return "URL no válida";
  }
}
