import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/** Datos de perfil editables. */
const esquema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(80),
  locale: z.enum(["es", "en", "fr", "de", "pt"]).optional(),
  image: z.string().url("La URL de la imagen no es válida").or(z.literal("")).optional(),
});

/** Actualiza el perfil del usuario autenticado. */
export async function PATCH(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const validacion = esquema.safeParse(await request.json().catch(() => null));
  if (!validacion.success) {
    return NextResponse.json({ error: validacion.error.issues[0]?.message ?? "Datos no válidos" }, { status: 400 });
  }

  const { name, locale, image } = validacion.data;
  const usuario = await prisma.user.update({
    where: { id: sesion.user.id },
    data: { name, ...(locale ? { locale } : {}), ...(image !== undefined ? { image: image || null } : {}) },
    select: { id: true, name: true, email: true, image: true, locale: true },
  });

  return NextResponse.json({ ok: true, usuario });
}
