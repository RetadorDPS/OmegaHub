import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/register-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta gratis en TrendHunter Pro y empieza a encontrar productos ganadores hoy mismo.",
};

/** Página de registro (módulo 1). */
export default function RegisterPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-2xl" />}>
      <RegisterForm />
    </Suspense>
  );
}
