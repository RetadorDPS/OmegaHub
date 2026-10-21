import type { NextConfig } from "next";

/**
 * Configuración de Next.js para TrendHunter Pro.
 * - `serverExternalPackages`: mantiene fuera del bundle los paquetes nativos
 *   (SQLite, Postgres, Redis, scrapers) que deben ejecutarse en Node.
 * - `allowedDevOrigins`: permite el acceso desde el proxy de previsualización
 *   (hosts *.e2b.app) y desde túneles de desarrollo.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Se oculta el indicador flotante de desarrollo (aparece en las capturas).
  devIndicators: false,
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "@prisma/adapter-pg",
    "pg",
    "nodemailer",
    "bullmq",
    "ioredis",
    "bcryptjs",
    "playwright-core",
  ],
  allowedDevOrigins: [
    "*.e2b.app",
    "*.e2b.dev",
    "*.ngrok-free.app",
    "*.loca.lt",
    "localhost",
    "127.0.0.1",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.unsplash.com" },
      { protocol: "https", hostname: "**.alicdn.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
  /**
   * Cabeceras de seguridad comunes.
   *
   * No se envía `X-Frame-Options` ni `frame-ancestors`: la app se muestra
   * embebida en la previsualización del entorno de desarrollo y en paneles de
   * clientes; bloquear el iframe rompería esos usos legítimos.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      {
        // Las respuestas de datos nunca deben cachearse de forma compartida.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
