import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { SESION_ESTATICA } from "@/auth";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Nota sobre tipografías: no se usa `next/font/google` para que el build
 * funcione en entornos sin salida a Internet (CI, sandboxes, despliegues
 * aislados). El tema define una pila de fuentes del sistema con la misma
 * métrica visual (ver `--font-sans` en globals.css).
 */

/** Intercepto de peticiones: sustituye a la API en la versión estática. */
const CODIGO_INTERCEPTOR = "(function () {\n  var sesion = { user: { name: \"Ariadna Ferrer\", email: \"admin@trendhunter.pro\", role: \"ADMIN\", planType: \"BUSINESS\" }, expires: \"2099-12-31T23:59:59.999Z\" };\n  var aviso = \"Estás viendo la versión estática publicada en GitHub Pages: esta acción necesita el servidor de TrendHunter Pro.\";\n  var original = window.fetch.bind(window);\n  function respuesta(datos, estado) {\n    return new Response(JSON.stringify(datos), { status: estado, headers: { \"Content-Type\": \"application/json\" } });\n  }\n  window.fetch = function (recurso, opciones) {\n    var url = typeof recurso === \"string\" ? recurso : (recurso && recurso.url) || \"\";\n    if (url.indexOf(\"/api/\") !== -1) {\n      if (url.indexOf(\"/api/auth/session\") !== -1) return Promise.resolve(respuesta(sesion, 200));\n      if (url.indexOf(\"/api/auth/csrf\") !== -1) return Promise.resolve(respuesta({ csrfToken: \"estatico\" }, 200));\n      return Promise.resolve(respuesta({ error: \"Modo demostración estática\", detalle: aviso, estatico: true }, 501));\n    }\n    return original(recurso, opciones);\n  };\n})();";

export const metadata: Metadata = {
  title: {
    default: "TrendHunter Pro · Inteligencia de productos para e-commerce",
    template: "%s · TrendHunter Pro",
  },
  description:
    "Encuentra productos ganadores, espía anuncios, analiza tiendas Shopify y genera creatividades con IA. La plataforma de investigación de mercado para dropshippers y e-commerce.",
  keywords: [
    "dropshipping",
    "productos ganadores",
    "investigación de productos",
    "shopify",
    "ads spy",
    "tendencias ecommerce",
    "trend score",
  ],
  authors: [{ name: "TrendHunter Pro" }],
  openGraph: {
    type: "website",
    locale: "es_ES",
    title: "TrendHunter Pro · Inteligencia de productos y tendencias",
    description:
      "Descubre productos ganadores con datos de TikTok, Meta y Google. Analiza tiendas Shopify y genera tus creatividades con IA.",
    siteName: "TrendHunter Pro",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrendHunter Pro",
    description: "Inteligencia de mercado para dropshippers y e-commerce.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // `data-scroll-behavior="smooth"` evita el aviso de Next.js sobre el scroll
  // suave global declarado en globals.css.
  return (
    <html lang="es" className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* Aviso de que se trata de la versión estática publicada en GitHub Pages. */}
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          <span className="font-semibold">Versión estática en GitHub Pages.</span> Datos reales del entorno de
          demostración; la IA, los filtros del servidor, el guardado y los pagos necesitan el backend.{" "}
          <a className="underline underline-offset-2" href="https://github.com/RetadorDPS/OmegaHub">
            Abrir la aplicación completa
          </a>
        </div>
        <script dangerouslySetInnerHTML={{ __html: CODIGO_INTERCEPTOR }} />
        <SessionProvider session={SESION_ESTATICA as never}>
          {children}
          <Toaster
            theme="dark"
            position="top-right"
            richColors
            closeButton
            toastOptions={{ classNames: { toast: "border-border" } }}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
