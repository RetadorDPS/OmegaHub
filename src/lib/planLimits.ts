import prisma from "@/lib/prisma";
import { toJsonInput } from "@/lib/json";
import { PLAN_LIMITS } from "@/lib/constants";
import { getDayKey } from "@/lib/utils";
import type { PlanType, PlanUsageSummary, UsageAction } from "@/types";

/**
 * ============================================================================
 *  LÍMITES Y CUOTAS POR PLAN (FREE / PRO / BUSINESS)
 * ============================================================================
 *  Cada acción medible (ver producto, generar con IA, analizar una tienda,
 *  exportar) consume cuota diaria. `assertQuota` lanza un error tipado que las
 *  API Routes convierten en una respuesta 402 con la información de upgrade.
 * ============================================================================
 */

/** Acción de cuota ↔ límite del plan. */
const MAPA_LIMITES: Record<UsageAction, keyof typeof PLAN_LIMITS.FREE> = {
  PRODUCT_VIEW: "productViews",
  AI_GENERATION: "aiGenerations",
  STORE_SCAN: "storeScans",
  EXPORT: "exports",
};

/** Error lanzado al agotar la cuota del plan. */
export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED";
  constructor(
    readonly action: UsageAction,
    readonly used: number,
    readonly limit: number,
    readonly plan: PlanType,
  ) {
    super(`Has alcanzado el límite de ${limit} ${descripcionAccion(action)} al día de tu plan ${plan}.`);
    this.name = "QuotaExceededError";
  }
}

/** Texto legible de la acción para los mensajes de error. */
function descripcionAccion(action: UsageAction): string {
  switch (action) {
    case "PRODUCT_VIEW":
      return "productos";
    case "AI_GENERATION":
      return "generaciones de IA";
    case "STORE_SCAN":
      return "análisis de tiendas";
    case "EXPORT":
      return "exportaciones";
    default:
      return "acciones";
  }
}

/**
 * Consumo actual del usuario en el día.
 * Se apoya en `UsageEvent` (histórico auditable) para no depender de un contador
 * en memoria. Para incluir el día en el filtro se usa `dayKey` (YYYY-MM-DD).
 */
export async function getUsage(userId: string, action: UsageAction): Promise<number> {
  const resultado = await prisma.usageEvent.aggregate({
    where: { userId, action, dayKey: getDayKey() },
    _sum: { quantity: true },
  });
  return resultado._sum.quantity ?? 0;
}

/** Resumen de uso de las tres cuotas principales (para Ajustes). */
export async function getPlanUsageSummary(userId: string, plan: PlanType): Promise<PlanUsageSummary> {
  const [productViews, aiGenerations, storeScans] = await Promise.all([
    getUsage(userId, "PRODUCT_VIEW"),
    getUsage(userId, "AI_GENERATION"),
    getUsage(userId, "STORE_SCAN"),
  ]);
  const limites = PLAN_LIMITS[plan];
  return {
    plan,
    productViews: { used: productViews, limit: limites.productViews },
    aiGenerations: { used: aiGenerations, limit: limites.aiGenerations },
    storeScans: { used: storeScans, limit: limites.storeScans },
  };
}

/** ¿Le queda cuota al usuario para esta acción? */
export async function hasQuota(userId: string, plan: PlanType, action: UsageAction): Promise<boolean> {
  const limite = PLAN_LIMITS[plan][MAPA_LIMITES[action]];
  if (limite === null) return true;
  const usado = await getUsage(userId, action);
  return usado < limite;
}

/**
 * Verifica la cuota y lanza `QuotaExceededError` si se ha agotado.
 * @param cantidad Unidades que consumirá la acción (por defecto 1).
 */
export async function assertQuota(
  userId: string,
  plan: PlanType,
  action: UsageAction,
  cantidad = 1,
): Promise<void> {
  const limite = PLAN_LIMITS[plan][MAPA_LIMITES[action]];
  if (limite === null) return;
  const usado = await getUsage(userId, action);
  if (usado + cantidad > limite) {
    throw new QuotaExceededError(action, usado, limite, plan);
  }
}

/** Registra el consumo de cuota de una acción. */
export async function consumeQuota(
  userId: string,
  action: UsageAction,
  metadata?: Record<string, unknown>,
  cantidad = 1,
): Promise<void> {
  await prisma.usageEvent.create({
    data: {
      userId,
      action,
      quantity: cantidad,
      dayKey: getDayKey(),
      metadata: toJsonInput(metadata),
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { quotaDayKey: getDayKey(), quotaUsedToday: await getUsage(userId, action) },
  });
}

/** Verifica y consume en una sola llamada (patrón habitual en las API). */
export async function checkAndConsume(
  userId: string,
  plan: PlanType,
  action: UsageAction,
  metadata?: Record<string, unknown>,
  cantidad = 1,
): Promise<void> {
  await assertQuota(userId, plan, action, cantidad);
  await consumeQuota(userId, action, metadata, cantidad);
}

/** Límite numérico de una métrica del plan (null = ilimitado). */
export function getPlanLimit(plan: PlanType, limite: keyof typeof PLAN_LIMITS.FREE): number | null {
  return PLAN_LIMITS[plan][limite];
}

/** Comprueba si el plan actual es superior o igual al requerido. */
export function planAtLeast(actual: PlanType, requerido: PlanType): boolean {
  const orden: PlanType[] = ["FREE", "PRO", "BUSINESS", "AGENCY"];
  return orden.indexOf(actual) >= orden.indexOf(requerido);
}

/** ¿El plan permite el acceso a una función premium concreta? */
export function canAccessFeature(plan: PlanType, feature: "exports" | "api" | "alerts"): boolean {
  switch (feature) {
    case "exports":
      return plan !== "FREE";
    case "alerts":
      return plan !== "FREE";
    case "api":
      return plan === "BUSINESS";
    default:
      return false;
  }
}
