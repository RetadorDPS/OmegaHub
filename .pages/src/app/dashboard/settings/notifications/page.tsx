import { auth } from "@/auth";
import { countUnreadNotifications, listNotifications, listTrackedProducts, listTrackedStores } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { NotificationPreferences } from "@/components/domain/notification-preferences";
import { StatCard } from "@/components/domain/stat-card";
import { Bell, BellRing, Store, Target } from "lucide-react";

export const metadata = {
  title: "Notificaciones",
  description: "Configura las alertas de tiendas y productos y revisa el historial de avisos.",
};

/** Módulo 8 · Preferencias y historial de notificaciones. */
export default async function NotificationsSettingsPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [tiendas, productos, notificaciones, sinLeer] = await Promise.all([
    listTrackedStores(sesion.user.id),
    listTrackedProducts(sesion.user.id),
    listNotifications(sesion.user.id, 40),
    countUnreadNotifications(sesion.user.id),
  ]);

  return (
    <>
      <PageHeading
        title="Notificaciones"
        description="Decide qué seguimientos generan avisos y revisa todo lo que ha detectado la plataforma."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Avisos sin leer" value={sinLeer} icon={BellRing} accent="amber" hint="en la campana" />
        <StatCard label="Avisos totales" value={notificaciones.length} icon={Bell} hint="últimos 40" />
        <StatCard label="Tiendas con alertas" value={tiendas.filter((t) => t.notificationEnabled).length} icon={Store} accent="violet" hint={`de ${tiendas.length} seguidas`} />
        <StatCard
          label="Productos con alertas"
          value={productos.filter((p) => p.notificationEnabled).length}
          icon={Target}
          accent="emerald"
          hint={`de ${productos.length} seguidos`}
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
