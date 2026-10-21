import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Configuración de Prisma CLI (Prisma 7).
 * La URL de conexión ya no vive en `schema.prisma`; se resuelve aquí y se
 * comparte con los driver adapters de `src/lib/prisma.ts`.
 *
 * Proveedores soportados:
 *  · sqlite     → file:./prisma/trendhunter.db  (desarrollo local inmediato)
 *  · postgresql → postgres://...                (producción: Railway / Neon / Supabase)
 */
const databaseUrl = process.env.DATABASE_URL || "file:./prisma/trendhunter.db";
/** URL directa (Supabase: puerto 5432) para migraciones y respaldos. */
const directUrl = process.env.DIRECT_URL || databaseUrl;

/** Resuelve rutas relativas de SQLite a absolutas (evita ambigüedad de CWD). */
function resolveSqliteUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const rawPath = url.replace(/^file:/, "");
  if (rawPath.startsWith("/")) return `file:${rawPath}`;
  return `file:${path.join(process.cwd(), rawPath.replace(/^\.\//, ""))}`;
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveSqliteUrl(databaseUrl),
    // Prisma 7: la URL directa (Supabase: 5432) vive aquí,
    // no en el schema. Solo la usan migraciones y respaldos.
    ...(process.env.DIRECT_URL
      ? { directUrl: resolveSqliteUrl(process.env.DIRECT_URL) }
      : {}),
  } as never,
  // Nota: `migrate`/`db push` resuelven la conexión con `datasource.url`.
  // La aplicación crea su cliente con driver adapters en src/lib/prisma.ts.
});
