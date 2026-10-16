import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Nota sobre tipografías: no se usa `next/font/google` para que el build
 * funcione en entornos sin salida a Internet (CI, sandboxes, despliegues
 * aislados). El tema define una pila de fuentes del sistema con la misma
 * métrica visual (ver `--font-sans` en globals.css).
 */

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
        <SessionProvider>
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
