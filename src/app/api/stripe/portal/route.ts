import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createBillingPortalSession, stripeConfigured } from "@/lib/stripe";
import { urlApp } from "@/lib/app-url";

/** Abre el portal de facturación de Stripe para gestionar la suscripción. */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: sesion.user.id },
    select: { stripeCustomerId: true, planType: true },
  });

  const appUrl = urlApp(request);

  if (!stripeConfigured() || !usuario.stripeCustomerId) {
    return NextResponse.json({
      modo: "demo",
      url: `${appUrl}/dashboard/settings/billing`,
      message: "El portal de facturación requiere claves de Stripe configuradas.",
    });
  }

  const url = await createBillingPortalSession(usuario.stripeCustomerId, `${appUrl}/dashboard/settings/billing`);
  return NextResponse.json({ modo: "stripe", url });
}
