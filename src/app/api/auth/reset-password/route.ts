import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { claveDeIp, permitido } from "@/lib/limite";

const esquema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).regex(/[a-zA-Z]/).regex(/\d/),
});

/** Restablece la contraseña usando un token válido de un solo uso. */
export async function POST(request: Request) {
  // 10 intentos por hora y IP: el token es largo, pero no se deja probar en bucle.
  if (!permitido(claveDeIp(request, "nueva-clave"), 10, 3_600_000)) {
    return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });
  }

  const validacion = esquema.safeParse(await request.json().catch(() => null));
  if (!validacion.success) {
    return NextResponse.json({ error: "La contraseña debe tener 8 caracteres, una letra y un número" }, { status: 400 });
  }

  const { token, password } = validacion.data;
  const registro = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!registro || registro.usedAt || registro.expires < new Date()) {
    return NextResponse.json({ error: "El enlace no es válido o ha caducado" }, { status: 400 });
  }

  const passwordHash = await hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: registro.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { token }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true, message: "Contraseña actualizada. Ya puedes iniciar sesión." });
}
