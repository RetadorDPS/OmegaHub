/** Cargador minimalista de variables de entorno (.env) sin dependencias. */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/** Lee un archivo .env y vuelca los valores en process.env (sin sobrescribir). */
export function loadEnv(file = ".env") {
  const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!existsSync(filePath)) return {};
  const parsed = {};
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return parsed;
}

/** URL de conexión efectiva (con fallback local a SQLite). */
export function resolveDatabaseUrl() {
  loadEnv();
  return process.env.DATABASE_URL || "file:./prisma/trendhunter.db";
}

/** Detecta el proveedor a partir de la URL, admitiendo override explícito. */
export function detectProvider(url = resolveDatabaseUrl()) {
  const explicit = process.env.DATABASE_PROVIDER?.toLowerCase();
  if (explicit === "postgres" || explicit === "postgresql") return "postgresql";
  if (explicit === "sqlite") return "sqlite";
  return url.startsWith("postgres://") || url.startsWith("postgresql://") ? "postgresql" : "sqlite";
}

/**
 * Opciones TLS para PostgreSQL.
 *
 * · Si la URL ya trae `sslmode` (lo normal en Supabase), se respeta.
 * · Si el host es local (docker compose, socket unix) no se usa TLS.
 * · En cualquier otro host se activa TLS sin validar el certificado, que es lo
 *   que necesitan los poolers gestionados (Supabase, Neon, Railway).
 */
export function pgSslOptions(url) {
  const cadena = String(url ?? "");
  if (/[?&]sslmode=/i.test(cadena)) return undefined;
  if (/@(localhost|127\.0\.0\.1|postgres|db)(:\d+)?\//i.test(cadena) || /host=\//i.test(cadena)) return false;
  return { rejectUnauthorized: false };
}

/** Convierte `file:./algo.db` en ruta absoluta. */
export function resolveSqlitePath(url = resolveDatabaseUrl()) {
  const raw = url.replace(/^file:/, "");
  if (path.isAbsolute(raw)) return raw;
  return path.join(process.cwd(), raw.replace(/^\.\//, ""));
}
