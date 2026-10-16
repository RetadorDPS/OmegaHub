import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/**
 * Cancela la suscripción del usuario.
 * Con Stripe activo marca `cancel_at_period_end`; en modo demostración baja el
 * plan a FREE inmediatamente.
 */
export async function POST() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: sesion.user.id },
    select: { stripeSubscriptionId: true, planType: true },
  });

  if (stripeConfigured() && usuario.stripeSubscriptionId) {
    await getStripe().subscriptions.update(usuario.stripeSubscriptionId, { cancel_at_period_end: true });
    await prisma.user.update({
      where: { id: sesion.user.id },
      data: { planCancelAtPeriodEnd: true },
    });
    return NextResponse.json({
      ok: true,
      message: "Tu suscripción se cancelará al final del periodo actual. Mantienes el acceso hasta entonces.",
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: sesion.user.id },
      data: { planType: "FREE", planRenewsAt: null, planCancelAtPeriodEnd: false, stripeSubscriptionId: null },
    }),
    // En modo demostración la suscripción se cierra en la base de datos local.
    prisma.subscription.updateMany({
      where: { userId: sesion.user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      data: { status: "CANCELED" },
    }),
  ]);
  await prisma.alertNotification.create({
    data: {
      userId: sesion.user.id,
      type: "SUBSCRIPTION",
      title: "Plan cambiado a Free",
      message: "Has vuelto al plan gratuito. Puedes reactivar Pro cuando quieras desde esta página.",
      actionUrl: "/pricing",
    },
  });
  return NextResponse.json({ ok: true, message: "Has vuelto al plan Free." });
}
