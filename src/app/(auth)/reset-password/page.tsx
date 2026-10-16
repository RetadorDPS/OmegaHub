import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Nueva contraseña",
  description: "Define una contraseña nueva para tu cuenta de TrendHunter Pro.",
};

/** Página de restablecimiento con token. */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-2xl" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
