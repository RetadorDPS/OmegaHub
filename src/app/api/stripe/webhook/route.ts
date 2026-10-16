import type Stripe from "stripe";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { constructWebhookEvent, getPlanFromPriceId, stripeConfigured } from "@/lib/stripe";
import { toJsonInput } from "@/lib/json";
import type { PlanType, SubscriptionStatus } from "@/types";

/** Configuración del endpoint para recibir el cuerpo sin procesar (firma). */
export const runtime = "nodejs";

/**
 * Webhook de Stripe: mantiene el plan del usuario sincronizado.
 *
 * Eventos gestionados:
 *   · checkout.session.completed      → activa el plan comprado
 *   · customer.subscription.updated   → cambios de precio o estado
 *   · customer.subscription.deleted   → baja a FREE
 *   · invoice.payment_failed          → marca la suscripción como impagada
 *
 * La idempotencia se garantiza con la tabla `StripeEvent`: si el evento ya se
 * procesó, se responde 200 sin repetir la lógica.
 */
export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe no está configurado" }, { status: 503 });
  }

  const firma = request.headers.get("stripe-signature");
  if (!firma) return NextResponse.json({ error: "Falta la firma de Stripe" }, { status: 400 });

  const cuerpo = await request.text();
  let evento: Stripe.Event;
  try {
    evento = constructWebhookEvent(cuerpo, firma);
  } catch (error) {
    return NextResponse.json({ error: `Firma no válida: ${(error as Error).message}` }, { status: 400 });
  }

  // Idempotencia.
  const yaProcesado = await prisma.stripeEvent.findUnique({ where: { eventId: evento.id } });
  if (yaProcesado) return NextResponse.json({ ok: true, duplicado: true });

  try {
    switch (evento.type) {
      case "checkout.session.completed": {
        const sesion = evento.data.object as Stripe.Checkout.Session;
        const userId = (sesion.metadata?.userId ?? "") as string;
        const plan = (sesion.metadata?.plan ?? "PRO") as PlanType;
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              planType: plan,
              stripeCustomerId: typeof sesion.customer === "string" ? sesion.customer : sesion.customer?.id,
              stripeSubscriptionId:
                typeof sesion.subscription === "string" ? sesion.subscription : sesion.subscription?.id,
              planCancelAtPeriodEnd: false,
            },
          });
          await prisma.alertNotification.create({
            data: {
              userId,
              type: "SUBSCRIPTION",
              title: `Plan ${plan} activado`,
              message: "¡Gracias! Tu suscripción está activa y ya tienes acceso a todas las funciones del plan.",
              actionUrl: "/dashboard/settings/billing",
            },
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const suscripcion = evento.data.object as Stripe.Subscription;
        const customerId = typeof suscripcion.customer === "string" ? suscripcion.customer : suscripcion.customer.id;
        const priceId = suscripcion.items.data[0]?.price?.id ?? null;
        const plan = getPlanFromPriceId(priceId);
        const estado = mapearEstado(suscripcion.status);
        const finPeriodo = new Date(
          ((suscripcion.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 2_592_000) as number) * 1000,
        );

        const usuario = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (usuario) {
          const planEfectivo = estado === "ACTIVE" || estado === "TRIALING" ? plan : "FREE";
          await prisma.user.update({
            where: { id: usuario.id },
            data: {
              planType: planEfectivo,
              stripeSubscriptionId: suscripcion.id,
              stripePriceId: priceId,
              planRenewsAt: finPeriodo,
              planCancelAtPeriodEnd: suscripcion.cancel_at_period_end,
            },
          });
          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: suscripcion.id },
            update: { status: estado, currentPeriodEnd: finPeriodo, cancelAtPeriodEnd: suscripcion.cancel_at_period_end, planType: planEfectivo },
            create: {
              userId: usuario.id,
              stripeCustomerId: customerId,
              stripeSubscriptionId: suscripcion.id,
              stripePriceId: priceId,
              planType: planEfectivo,
              status: estado,
              currentPeriodEnd: finPeriodo,
              cancelAtPeriodEnd: suscripcion.cancel_at_period_end,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const suscripcion = evento.data.object as Stripe.Subscription;
        const customerId = typeof suscripcion.customer === "string" ? suscripcion.customer : suscripcion.customer.id;
        const usuario = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (usuario) {
          await prisma.user.update({
            where: { id: usuario.id },
            data: { planType: "FREE", planRenewsAt: null, planCancelAtPeriodEnd: false, stripeSubscriptionId: null },
          });
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: suscripcion.id },
            data: { status: "CANCELED" },
          });
          await prisma.alertNotification.create({
            data: {
              userId: usuario.id,
              type: "SUBSCRIPTION",
              title: "Suscripción cancelada",
              message: "Tu plan ha vuelto a Free. Puedes reactivar Pro cuando quieras desde la página de precios.",
              actionUrl: "/pricing",
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const factura = evento.data.object as Stripe.Invoice;
        const customerId = typeof factura.customer === "string" ? factura.customer : factura.customer?.id ?? "";
        const usuario = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (usuario) {
          await prisma.subscription.updateMany({
            where: { userId: usuario.id },
            data: { status: "PAST_DUE" },
          });
          await prisma.alertNotification.create({
            data: {
              userId: usuario.id,
              type: "SUBSCRIPTION",
              title: "Problema con el pago",
              message: "No hemos podido cobrar tu suscripción. Actualiza tu método de pago para no perder el acceso.",
              actionUrl: "/dashboard/settings/billing",
            },
          });
        }
        break;
      }

      default:
        // Eventos no gestionados: se registran igualmente para auditoría.
        break;
    }

    await prisma.stripeEvent.create({
      data: { eventId: evento.id, type: evento.type, payload: toJsonInput(evento.data.object) as never },
    });

    return NextResponse.json({ ok: true, tipo: evento.type });
  } catch (error) {
    await prisma.stripeEvent.create({
      data: {
        eventId: evento.id,
        type: evento.type,
        payload: toJsonInput(evento.data.object) as never,
        error: (error as Error).message,
      },
    });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Traduce los estados de Stripe a los del dominio. */
function mapearEstado(estado: Stripe.Subscription.Status): SubscriptionStatus {
  switch (estado) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "INCOMPLETE";
  }
}
