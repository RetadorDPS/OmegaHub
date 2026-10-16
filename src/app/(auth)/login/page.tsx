import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu panel de TrendHunter Pro para ver productos ganadores y tendencias.",
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Inicia sesión</h1>
        <p className="text-sm text-muted-foreground">
          ¿Aún no tienes cuenta?{" "}
          <Link href="/register" className="font-medium text-indigo-400 hover:text-indigo-300">
            Crea una gratis
          </Link>
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
