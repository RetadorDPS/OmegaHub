import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/mail";
import { claveDeIp, permitido } from "@/lib/limite";

const esquema = z.object({ email: z.string().email() });

/** Solicita el restablecimiento de contraseña (envía un enlace por correo). */
export async function POST(request: Request) {
  // 5 solicitudes por hora y IP: evita usar la app para inundar correos.
  if (!permitido(claveDeIp(request, "recuperar"), 5, 3_600_000)) {
    return NextResponse.json(
      { ok: true, message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." },
      { status: 429 },
    );
  }

  const validacion = esquema.safeParse(await request.json().catch(() => null));
  if (!validacion.success) {
    return NextResponse.json({ error: "Introduce un correo válido" }, { status: 400 });
  }

  const email = validacion.data.email.toLowerCase();
  const usuario = await prisma.user.findUnique({ where: { email } });

  // Respuesta idéntica exista o no el usuario (evita filtrar cuentas).
  if (usuario) {
    const token = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: { userId: usuario.id, token, expires: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await sendPasswordResetEmail({ email, token }).catch(() => false);
  }

  return NextResponse.json({
    ok: true,
    message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
  });
}
