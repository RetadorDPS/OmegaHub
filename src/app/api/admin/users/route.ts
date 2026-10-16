import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

/** Listado de usuarios con búsqueda y filtros (solo administradores). */
export async function GET(request: Request) {
  const { respuesta } = await requireAdmin();
  if (respuesta) return respuesta;

  const params = new URL(request.url).searchParams;
  const busqueda = params.get("search")?.trim();
  const plan = params.get("plan") ?? undefined;
  const rol = params.get("role") ?? undefined;

  const usuarios = await prisma.user.findMany({
    where: {
      ...(busqueda
        ? {
            OR: [
              { email: { contains: busqueda } },
              { name: { contains: busqueda } },
            ],
          }
        : {}),
      ...(plan && plan !== "TODOS" ? { planType: plan as never } : {}),
      ...(rol && rol !== "TODOS" ? { role: rol as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      planType: true,
      emailVerified: true,
      planRenewsAt: true,
      planCancelAtPeriodEnd: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { savedProducts: true, aiGenerations: true, scanJobs: true, trackedStores: true } },
    },
  });

  return NextResponse.json({
    items: usuarios.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.name ?? "Sin nombre",
      email: usuario.email,
      imagen: usuario.image,
      rol: usuario.role,
      plan: usuario.planType,
      emailVerificado: Boolean(usuario.emailVerified),
      renuevaEn: usuario.planRenewsAt?.toISOString() ?? null,
      cancelacionProgramada: usuario.planCancelAtPeriodEnd,
      ultimoAcceso: usuario.lastLoginAt?.toISOString() ?? null,
      alta: usuario.createdAt.toISOString(),
      guardados: usuario._count.savedProducts,
      generacionesIa: usuario._count.aiGenerations,
      analisis: usuario._count.scanJobs,
      tiendasSeguidas: usuario._count.trackedStores,
    })),
    total: usuarios.length,
  });
}

const esquema = z.object({
  userId: z.string().min(1),
  role: z.enum(["USER", "ADMIN"]).optional(),
  planType: z.enum(["FREE", "PRO", "BUSINESS"]).optional(),
  revocarAcceso: z.boolean().optional(),
});

/**
 * Modifica un usuario: cambia rol o plan, o revoca el acceso (baja a FREE y
 * desactiva su suscripción de Stripe en la base de datos local).
 */
export async function PATCH(request: Request) {
  const { sesion, respuesta } = await requireAdmin();
  if (respuesta) return respuesta;

  const validacion = esquema.safeParse(await request.json().catch(() => null));
  if (!validacion.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });

  const { userId, role, planType, revocarAcceso } = validacion.data;
  if (userId === sesion?.user.id && (role === "USER" || revocarAcceso)) {
    return NextResponse.json({ error: "No puedes revocar tu propio acceso de administrador" }, { status: 400 });
  }

  const usuario = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(role ? { role } : {}),
      ...(planType ? { planType } : {}),
      ...(revocarAcceso
        ? { planType: "FREE", planRenewsAt: null, planCancelAtPeriodEnd: false, stripeSubscriptionId: null }
        : {}),
    },
    select: { id: true, email: true, role: true, planType: true },
  });

  if (revocarAcceso) {
    await prisma.subscription.updateMany({
      where: { userId },
      data: { status: "CANCELED" },
    });
  }

  await prisma.alertNotification.create({
    data: {
      userId,
      type: "SYSTEM",
      title: revocarAcceso ? "Acceso revocado por el administrador" : "Tu cuenta se ha actualizado",
      message: revocarAcceso
        ? "Un administrador ha revocado tu acceso de pago. Tu cuenta ha vuelto al plan Free."
        : `Un administrador ha actualizado tu cuenta: rol ${usuario.role}, plan ${usuario.planType}.`,
      actionUrl: "/pricing",
    },
  });

  return NextResponse.json({ ok: true, usuario });
}
