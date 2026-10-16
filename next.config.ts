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
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
