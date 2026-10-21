import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Cliente Prisma único (patrón singleton) con driver adapters.
 *
 * Prisma 7 no incluye motores nativos: cada consulta viaja por el driver de
 * Node correspondiente, elegido según `DATABASE_URL`:
 *
 *   · SQLite      → `@prisma/adapter-better-sqlite3` (desarrollo local)
 *   · PostgreSQL  → `@prisma/adapter-pg`            (producción)
 *
 * En desarrollo se reutiliza la instancia guardada en `globalThis` para evitar
 * agotar conexiones con el hot-reload de Next.js.
 */

/** URL de conexión efectiva (con fallback local a SQLite). */
function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || "file:./prisma/trendhunter.db";
}

/** ¿La configuración actual apunta a PostgreSQL? */
export function isPostgres(): boolean {
  const url = getDatabaseUrl();
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Crea el cliente con el adapter adecuado.
 * El adapter de PostgreSQL se importa de forma dinámica para que los despliegues
 * con SQLite no incluyan `pg` en el bundle del servidor.
 */
async function createPrismaClient(): Promise<PrismaClient> {
  if (isPostgres()) {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
    return new PrismaClient({ adapter, log: ["warn", "error"] });
  }
  // El adapter resuelve las rutas relativas (`file:./prisma/…`) desde el
  // directorio de trabajo del proceso.
  const adapter = new PrismaBetterSqlite3({ url: getDatabaseUrl() });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}

const globalForPrisma = globalThis as unknown as { prismaPromise?: Promise<PrismaClient> };

/** Instancia compartida del cliente Prisma (inicialización perezosa y única). */
export const prisma: PrismaClient = await (async () => {
  if (!globalForPrisma.prismaPromise) {
    globalForPrisma.prismaPromise = createPrismaClient();
  }
  return globalForPrisma.prismaPromise;
})();

export default prisma;
