import type { Metadata } from "next";
import { AceptarInvitacion } from "@/components/domain/aceptar-invitacion";

export const metadata: Metadata = {
  title: "Aceptar invitación",
  description: "Únete al equipo de TrendHunter Pro y comparte el plan sin pagar otra suscripción.",
};

/** Página pública de aceptación (funciona con o sin sesión). */
export default function AceptarInvitacionPage() {
  return <AceptarInvitacion />;
}
