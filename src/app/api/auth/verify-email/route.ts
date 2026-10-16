import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";

/**
 * Verifica el correo electrónico a partir del token del enlace.
 * Redirige al panel con un parámetro de estado para mostrar el aviso.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) redirect("/dashboard/settings?verificacion=invalida");

  const registro = await prisma.verificationToken.findUnique({ where: { token } });
  if (!registro || registro.expires < new Date()) {
    redirect("/dashboard/settings?verificacion=caducada");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { email: registro.identifier },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.deleteMany({ where: { identifier: registro.identifier } }),
  ]);

  redirect("/dashboard/settings?verificacion=ok");
}
