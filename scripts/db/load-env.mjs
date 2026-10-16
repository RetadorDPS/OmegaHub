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
  return process.env.DATABASE_URL ?? "file:./prisma/trendhunter.db";
}

/** Detecta el proveedor a partir de la URL, admitiendo override explícito. */
export function detectProvider(url = resolveDatabaseUrl()) {
  const explicit = process.env.DATABASE_PROVIDER?.toLowerCase();
  if (explicit === "postgres" || explicit === "postgresql") return "postgresql";
  if (explicit === "sqlite") return "sqlite";
  return url.startsWith("postgres://") || url.startsWith("postgresql://") ? "postgresql" : "sqlite";
}

/** Convierte `file:./algo.db` en ruta absoluta. */
export function resolveSqlitePath(url = resolveDatabaseUrl()) {
  const raw = url.replace(/^file:/, "");
  if (path.isAbsolute(raw)) return raw;
  return path.join(process.cwd(), raw.replace(/^\.\//, ""));
}
