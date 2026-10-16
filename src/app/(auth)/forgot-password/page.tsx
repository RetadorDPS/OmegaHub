import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Recuperar contraseña",
  description: "Recupera el acceso a tu cuenta de TrendHunter Pro.",
};

/** Página de solicitud de restablecimiento. */
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[360px] w-full rounded-2xl" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
