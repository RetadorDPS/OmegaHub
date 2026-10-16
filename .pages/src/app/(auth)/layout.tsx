import Link from "next/link";
import { BarChart3, Radar, Sparkles, Zap } from "lucide-react";

/**
 * Layout de las páginas de autenticación.
 * Panel dividido: formulario a la izquierda, argumentario de producto a la
 * derecha (oculto en móvil).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Formulario */}
      <div className="relative flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50">
              <Zap className="size-5 text-white" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">TrendHunter</span>
              <span className="text-[11px] font-medium text-indigo-400">PRO</span>
            </span>
          </Link>
          {children}
        </div>
      </div>

      {/* Argumentario */}
      <div className="relative hidden overflow-hidden border-l border-border/70 bg-slate-950 lg:block">
        <div className="hero-glow absolute inset-0" />
        <div className="relative flex h-full flex-col justify-center px-12 xl:px-16">
          <p className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            <Sparkles className="size-3.5" />
            Inteligencia de productos con IA
          </p>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Encuentra el <span className="text-gradient">producto ganador</span> antes que tu competencia
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Cruzamos datos de TikTok Creative Center, Meta Ad Library, Google Trends y el radar de tiendas
            Shopify para darte un único TrendScore de 0 a 100. Sin hojas de cálculo, sin intuición.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              { icono: BarChart3, titulo: "TrendScore en tiempo real", texto: "Demanda, velocidad y saturación en una sola cifra." },
              { icono: Radar, titulo: "Espía anuncios activos", texto: "Más de 30 creatividades con métricas reales de engagement." },
              { icono: Sparkles, titulo: "AI Studio integrado", texto: "Copys, guiones de 15/30/60 s y buyer personas en segundos." },
            ].map((item) => (
              <li key={item.titulo} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface/60 text-indigo-300">
                  <item.icono className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{item.titulo}</p>
                  <p className="text-xs text-muted-foreground">{item.texto}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-border/60 pt-6">
            {[
              { valor: "20", etiqueta: "productos ganadores" },
              { valor: "30", etiqueta: "anuncios analizados" },
              { valor: "10", etiqueta: "tiendas Shopify" },
            ].map((dato) => (
              <div key={dato.etiqueta}>
                <p className="text-2xl font-bold text-indigo-300">{dato.valor}</p>
                <p className="text-[11px] text-muted-foreground">{dato.etiqueta}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
