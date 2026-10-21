import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { RegistrarServiceWorker } from "@/components/pwa/registrar-sw";
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
  // PWA: manifiesto + iconos. Al instalarla se abre como aplicación propia.
  manifest: "/manifest.webmanifest",
  applicationName: "TrendHunter Pro",
  appleWebApp: {
    capable: true,
    title: "TrendHunter",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/icons/favicon-64.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
    { media: "(prefers-color-scheme: light)", color: "#0b1020" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
          <RegistrarServiceWorker />
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
