import prisma from "@/lib/prisma";
import { toJsonInput } from "@/lib/json";
import type { NotificationType } from "@/types";

/**
 * Sistema de notificaciones internas (campana del dashboard).
 * Centraliza la creación para mantener títulos y enlaces coherentes.
 */

interface CrearNotificacionParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

/** Crea una notificación para un usuario. */
export async function createNotification({
  userId,
  type,
  title,
  message,
  entityType,
  entityId,
  actionUrl,
  metadata,
}: CrearNotificacionParams) {
  return prisma.alertNotification.create({
    data: { userId, type, title, message, entityType, entityId, actionUrl, metadata: toJsonInput(metadata) },
  });
}

/** Marca una notificación como leída (sólo si pertenece al usuario). */
export async function markAsRead(userId: string, notificationId: string) {
  return prisma.alertNotification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
}

/** Marca todas las notificaciones del usuario como leídas. */
export async function markAllAsRead(userId: string) {
  return prisma.alertNotification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

/** Elimina una notificación del usuario. */
export async function deleteNotification(userId: string, notificationId: string) {
  return prisma.alertNotification.deleteMany({ where: { id: notificationId, userId } });
}

/**
 * Genera alertas para los productos en seguimiento cuando su score supera el
 * objetivo configurado. Se usa desde el job de seguimiento.
 */
export async function notifyTrackedProductThresholds(): Promise<number> {
  const seguimientos = await prisma.trackedProduct.findMany({
    where: { notificationEnabled: true },
    include: { product: { select: { id: true, title: true, trendScore: true, saturationLevel: true, isGoldenOpportunity: true } } },
  });

  let creadas = 0;
  for (const seguimiento of seguimientos) {
    const { product } = seguimiento;
    if (product.trendScore < seguimiento.targetTrendScore) continue;

    // Evita duplicados del mismo día para el mismo producto.
    const inicioDelDia = new Date();
    inicioDelDia.setHours(0, 0, 0, 0);
    const yaExiste = await prisma.alertNotification.findFirst({
      where: {
        userId: seguimiento.userId,
        type: "TREND_ALERT",
        entityId: product.id,
        createdAt: { gte: inicioDelDia },
      },
      select: { id: true },
    });
    if (yaExiste) continue;

    await createNotification({
      userId: seguimiento.userId,
      type: "TREND_ALERT",
      title: `${product.title} supera los ${seguimiento.targetTrendScore} puntos`,
      message: product.isGoldenOpportunity
        ? `Oportunidad dorada: score ${product.trendScore} con saturación baja. Buen momento para lanzar campaña.`
        : `El producto alcanzó un TrendScore de ${product.trendScore} (saturación ${product.saturationLevel.toLowerCase()}).`,
      entityType: "Product",
      entityId: product.id,
      actionUrl: `/dashboard/tracking/products`,
    });
    creadas += 1;
  }
  return creadas;
}

/**
 * Genera alertas de nuevos productos detectados hoy en las tiendas seguidas.
 */
export async function notifyTrackedStoreChanges(): Promise<number> {
  const cambios = await prisma.storeChange.findMany({
    where: {
      type: "NEW_PRODUCT",
      detectedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      store: { trackedBy: { some: { notificationEnabled: true } } },
    },
    include: { store: { include: { trackedBy: { where: { notificationEnabled: true } } } } },
  });

  let creadas = 0;
  for (const cambio of cambios) {
    for (const seguimiento of cambio.store.trackedBy) {
      await createNotification({
        userId: seguimiento.userId,
        type: "NEW_PRODUCT",
        title: `${cambio.store.name}: ${cambio.title}`,
        message: cambio.description,
        entityType: "Store",
        entityId: cambio.storeId,
        actionUrl: "/dashboard/store-tracker",
      });
      creadas += 1;
    }
  }
  return creadas;
}
