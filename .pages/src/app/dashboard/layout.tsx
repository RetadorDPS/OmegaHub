import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { countUnreadNotifications, listNotifications } from "@/lib/dal";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/**
 * Layout del dashboard.
 *
 * Aquí se hace la validación REAL de la sesión (el middleware sólo comprueba la
 * cookie): si no hay usuario válido en base de datos, se redirige a /login.
 * También se cargan el rol, el plan y las notificaciones para la cabecera.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth();

  if (!sesion?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }

  // Se relee el usuario para tener rol/plan actualizados (Stripe puede haber
  // cambiado el plan desde la última sesión almacenada).
  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { id: true, name: true, email: true, image: true, role: true, planType: true },
  });

  if (!usuario) {
    redirect("/login");
  }

  const [notificaciones, sinLeer] = await Promise.all([
    listNotifications(usuario.id, 15),
    countUnreadNotifications(usuario.id),
  ]);

  return (
    <DashboardShell
      user={{
        name: usuario.name,
        email: usuario.email,
        image: usuario.image,
        role: usuario.role,
        planType: usuario.planType,
      }}
      notifications={notificaciones}
      unreadCount={sinLeer}
    >
      {children}
    </DashboardShell>
  );
}
