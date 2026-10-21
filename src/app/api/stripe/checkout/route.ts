import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { urlApp } from "@/lib/app-url";
import { createCheckoutSession, ensureStripeCustomer, stripeConfigured } from "@/lib/stripe";
import type { PlanType } from "@/types";

/**
 * Crea la sesión de pago de Stripe para cambiar de plan.
 *
 * POST /api/stripe/checkout  { plan: "PRO" | "BUSINESS" | "AGENCY" }
 *
 * Si Stripe no está configurado, activa el plan en modo demostración para que
 * todo el flujo de suscripción sea verificable sin claves.
 */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { plan } = (await request.json()) as { plan?: PlanType };
  if (plan !== "PRO" && plan !== "BUSINESS" && plan !== "AGENCY") {
    return NextResponse.json({ error: "Plan no válido" }, { status: 400 });
  }

  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: sesion.user.id },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  });

  const appUrl = urlApp(request);

  // --- Modo demostración (sin claves de Stripe) ---
  if (!stripeConfigured()) {
    const clienteDemo = usuario.stripeCustomerId ?? `cus_demo_${usuario.id.slice(0, 8)}`;
    const suscripcionDemo = `sub_demo_${plan.toLowerCase()}_${usuario.id.slice(0, 8)}`;
    const finPeriodo = new Date(Date.now() + 30 * 86_400_000);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: usuario.id },
        data: {
          planType: plan,
          planRenewsAt: finPeriodo,
          planCancelAtPeriodEnd: false,
          stripeCustomerId: clienteDemo,
          stripeSubscriptionId: suscripcionDemo,
        },
      }),
      // Upsert idempotente: repetir la contratación no duplica suscripciones.
      prisma.subscription.upsert({
        where: { stripeSubscriptionId: suscripcionDemo },
        update: { planType: plan, status: "ACTIVE", currentPeriodEnd: finPeriodo, cancelAtPeriodEnd: false },
        create: {
          userId: usuario.id,
          stripeCustomerId: clienteDemo,
          stripeSubscriptionId: suscripcionDemo,
          planType: plan,
          status: "ACTIVE",
          currentPeriodEnd: finPeriodo,
        },
      }),
      prisma.alertNotification.create({
        data: {
          userId: usuario.id,
          type: "SUBSCRIPTION",
          title: `Plan ${plan} activado`,
          message:
            "Se ha activado tu plan en modo demostración. Configura las claves de Stripe para procesar pagos reales.",
          actionUrl: "/dashboard/settings/billing",
        },
      }),
    ]);

    return NextResponse.json({
      modo: "demo",
      ok: true,
      message: `Plan ${plan} activado (modo demostración: añade STRIPE_SECRET_KEY para cobrar de verdad).`,
      url: `${appUrl}/dashboard/settings/billing?upgrade=${plan.toLowerCase()}`,
    });
  }

  // --- Modo real con Stripe ---
  try {
    const customerId = await ensureStripeCustomer(usuario);
    if (customerId !== usuario.stripeCustomerId) {
      await prisma.user.update({ where: { id: usuario.id }, data: { stripeCustomerId: customerId } });
    }

    const url = await createCheckoutSession({
      plan,
      customerId,
      userId: usuario.id,
      successUrl: `${appUrl}/dashboard/settings/billing?exito=true`,
      cancelUrl: `${appUrl}/pricing?cancelado=true`,
    });

    return NextResponse.json({ modo: "stripe", url });
  } catch (error) {
    return NextResponse.json(
      { error: `No se pudo iniciar el pago: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
