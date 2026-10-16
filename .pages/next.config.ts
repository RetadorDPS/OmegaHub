import type { NextConfig } from "next";

/**
 * Configuración del sitio estático publicado en GitHub Pages.
 * Se genera automáticamente con `npm run build:pages`.
 */
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/OmegaHub",
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  images: {
    // GitHub Pages no ejecuta el optimizador de imágenes de Next.js.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.unsplash.com" },
      { protocol: "https", hostname: "**.alicdn.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
