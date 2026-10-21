import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Sin conexión",
  description: "TrendHunter Pro sin conexión: los datos se actualizan al recuperar la red.",
  robots: { index: false, follow: false },
};

/**
 * Pantalla de respaldo que guarda el service worker.
 *
 * Nunca se sirve una página desde caché habiendo red: si aparece esta
 * pantalla es porque el dispositivo está desconectado. Los datos del panel
 * no se cachean a propósito (una cifra vieja sería peor que un aviso).
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/60 p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-300">
          <WifiOff className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Sin conexión</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          TrendHunter Pro necesita red para leer las cifras actualizadas: scores, precios y cambios de tienda se
          calculan en el servidor. Recupera la conexión y vuelve a intentarlo — la sesión sigue abierta.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard">Reintentar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Ir al inicio</Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Si estás instalando la app en el móvil, puedes cerrarla y abrirla de nuevo cuando tengas cobertura.
        </p>
      </div>
    </main>
  );
}
