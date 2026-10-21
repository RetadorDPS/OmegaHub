import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA (se sirve en /manifest.webmanifest).
 *
 * Permite instalar TrendHunter Pro en Android, iPhone/iPad y escritorio con
 * icono propio, pantalla completa y atajos. La app sigue siendo una web: si se
 * abre sin instalarla, funciona igual.
 *
 * `NEXT_PUBLIC_BASE_PATH` solo se define al compilar el sitio estático para
 * GitHub Pages; en el servidor real vale "".
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** El manifiesto es estático: también debe generarse en la exportación a Pages. */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrendHunter Pro · Inteligencia de productos",
    short_name: "TrendHunter",
    description:
      "Productos ganadores, tiendas monitorizadas y alertas en tiempo real. Investigación de mercado para e-commerce.",
    id: `${BASE}/dashboard`,
    start_url: `${BASE}/dashboard`,
    scope: `${BASE}/`,
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    lang: "es",
    dir: "ltr",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Productos ganadores",
        short_name: "Ganadores",
        url: `${BASE}/dashboard/winning-products`,
        icons: [{ src: `${BASE}/icons/icon-192.png`, sizes: "192x192" }],
      },
      {
        name: "Tiendas monitorizadas",
        short_name: "Tiendas",
        url: `${BASE}/dashboard/store-tracker`,
        icons: [{ src: `${BASE}/icons/icon-192.png`, sizes: "192x192" }],
      },
      {
        name: "Notificaciones",
        short_name: "Avisos",
        url: `${BASE}/dashboard/settings/notifications`,
        icons: [{ src: `${BASE}/icons/icon-192.png`, sizes: "192x192" }],
      },
    ],
  };
}
