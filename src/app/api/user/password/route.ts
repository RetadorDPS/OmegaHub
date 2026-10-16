import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { sendPasswordChangedEmail } from "@/lib/mail";

const esquema = z.object({
  currentPassword: z.string().min(1, "Introduce tu contraseña actual"),
  newPassword: z
    .string()
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres")
    .regex(/[a-zA-Z]/, "Debe incluir al menos una letra")
    .regex(/\d/, "Debe incluir al menos un número"),
});

/** Cambia la contraseña del usuario autenticado. */
export async function PATCH(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const validacion = esquema.safeParse(await request.json().catch(() => null));
  if (!validacion.success) {
    return NextResponse.json({ error: validacion.error.issues[0]?.message ?? "Datos no válidos" }, { status: 400 });
  }

  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: sesion.user.id },
    select: { id: true, email: true, passwordHash: true },
  });

  // Las cuentas creadas sólo con Google no tienen contraseña previa.
  if (usuario.passwordHash) {
    const correcta = await compare(validacion.data.currentPassword, usuario.passwordHash);
    if (!correcta) {
      return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
    }
  }

  const nuevoHash = await hash(validacion.data.newPassword, 10);
  await prisma.user.update({ where: { id: usuario.id }, data: { passwordHash: nuevoHash } });

  await prisma.alertNotification.create({
    data: {
      userId: usuario.id,
      type: "SYSTEM",
      title: "Contraseña actualizada",
      message: "Tu contraseña se ha cambiado correctamente. Si no has sido tú, contacta con soporte.",
      actionUrl: "/dashboard/settings",
    },
  });
  await sendPasswordChangedEmail({ email: usuario.email }).catch(() => false);

  return NextResponse.json({ ok: true, message: "Contraseña actualizada correctamente" });
}
