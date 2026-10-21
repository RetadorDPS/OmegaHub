import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { redisConfigured } from "@/lib/queue";
import { modoCostes } from "@/lib/modoCostes";

/** Marca de tiempo del arranque del proceso (para el uptime). */
const ARRANQUE = Date.now();

/**
 * Comprobación de salud de la plataforma.
 *
 * Se usa desde Docker (`HEALTHCHECK`), Railway y los monitores externos:
 * verifica la conexión real a la base de datos y devuelve el estado de las
 * integraciones opcionales (Redis, IA, Stripe, SMTP, scrapers).
 */
export async function GET() {
  const inicio = Date.now();

  let baseDeDatos = "ok";
  let productos = 0;
  try {
    productos = await prisma.product.count();
  } catch (error) {
    baseDeDatos = `error: ${(error as Error).message}`;
  }

  const saludable = baseDeDatos === "ok";

  return NextResponse.json(
    {
      estado: saludable ? "ok" : "degradado",
      modoCostes: modoCostes(),
      version: process.env.npm_package_version ?? "1.0.0",
      entorno: process.env.NODE_ENV ?? "development",
      uptimeSegundos: Math.round((Date.now() - ARRANQUE) / 1000),
      latenciaMs: Date.now() - inicio,
      baseDeDatos: { estado: baseDeDatos, productos },
      integraciones: {
        redis: redisConfigured(),
        ia: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY),
        smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
        google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        scrapingReal: Boolean(
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.CHROMIUM_PATH || process.env.SCRAPING_REAL === "true",
        ),
      },
    },
    { status: saludable ? 200 : 503 },
  );
}
