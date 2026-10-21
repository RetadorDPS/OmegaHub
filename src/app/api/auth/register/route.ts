import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendVerificationEmail, sendWelcomeEmail } from "@/lib/mail";
import { claveDeIp, permitido, segundosParaReinicio } from "@/lib/limite";

/** Validación del alta de usuario. */
const esquema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(80),
  email: z.string().email("Introduce un correo válido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[a-zA-Z]/, "Debe incluir al menos una letra")
    .regex(/\d/, "Debe incluir al menos un número"),
  acceptTerms: z.literal(true, { message: "Debes aceptar los términos" }),
});

/** Registro con email y contraseña. */
export async function POST(request: Request) {
  // 5 altas por hora y IP: frena los registros masivos sin molestar a nadie.
  const clave = claveDeIp(request, "registro");
  if (!permitido(clave, 5, 3_600_000)) {
    return NextResponse.json(
      { error: `Demasiados intentos desde esta conexión. Prueba en ${Math.ceil(segundosParaReinicio(clave) / 60)} min.` },
      { status: 429 },
    );
  }

  const cuerpo = await request.json().catch(() => null);
  const validacion = esquema.safeParse(cuerpo);

  if (!validacion.success) {
    return NextResponse.json(
      { error: validacion.error.issues[0]?.message ?? "Datos no válidos" },
      { status: 400 },
    );
  }

  const { name, email, password } = validacion.data;
  const emailNormalizado = email.toLowerCase();

  const existente = await prisma.user.findUnique({ where: { email: emailNormalizado } });
  if (existente) {
    return NextResponse.json({ error: "Ya existe una cuenta con este correo" }, { status: 409 });
  }

  const passwordHash = await hash(password, 10);
  const usuario = await prisma.user.create({
    data: {
      name,
      email: emailNormalizado,
      passwordHash,
      planType: "FREE",
      role: "USER",
      quotaDayKey: new Date().toISOString().slice(0, 10),
    },
  });

  // Correos de bienvenida y verificación (si hay SMTP configurado).
  const token = crypto.randomUUID();
  await prisma.verificationToken
    .create({
      data: { identifier: emailNormalizado, token, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    })
    .catch(() => null);

  await Promise.all([
    sendWelcomeEmail({ email: emailNormalizado, name }).catch(() => false),
    sendVerificationEmail({ email: emailNormalizado, name, token }).catch(() => false),
  ]);

  // Notificación de bienvenida en la campana.
  await prisma.alertNotification.create({
    data: {
      userId: usuario.id,
      type: "SYSTEM",
      title: "¡Bienvenido a TrendHunter Pro!",
      message:
        "Tu cuenta está lista. Empieza por el catálogo de productos ganadores y activa el seguimiento de los que te interesen.",
      actionUrl: "/dashboard/winning-products",
    },
  });

  return NextResponse.json({ ok: true, userId: usuario.id }, { status: 201 });
}
