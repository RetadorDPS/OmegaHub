#!/usr/bin/env node
/**
 * Conmuta el proveedor de base de datos del esquema Prisma.
 *
 *   npm run db:provider sqlite       → desarrollo local (por defecto)
 *   npm run db:provider postgres     → producción (Railway / Neon / Supabase)
 *
 * Reescribe únicamente la línea `provider` del datasource y actualiza el
 * `DATABASE_URL` del .env si se pasa una cadena de conexión:
 *   npm run db:provider postgres -- "postgresql://usuario:clave@host:5432/db"
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const target = (process.argv[2] ?? "").toLowerCase();
const connectionString = process.argv[3];

if (!["sqlite", "postgres", "postgresql"].includes(target)) {
  console.error("Uso: node scripts/set-db-provider.mjs <sqlite|postgres> [DATABASE_URL]");
  process.exit(1);
}

const provider = target === "sqlite" ? "sqlite" : "postgresql";
const schemaPath = "prisma/schema.prisma";
const schema = readFileSync(schemaPath, "utf8");
const updated = schema.replace(/(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*)"[^"]+"/, `$1"${provider}"`);

if (updated === schema) {
  console.warn("[db:provider] No se encontró el bloque datasource; sin cambios.");
} else {
  writeFileSync(schemaPath, updated);
  console.log(`[db:provider] prisma/schema.prisma → provider = "${provider}"`);
}

// Actualiza .env (creándolo desde .env.example si no existe).
if (existsSync(".env.example") && !existsSync(".env")) {
  writeFileSync(".env", readFileSync(".env.example", "utf8"));
  console.log("[db:provider] .env creado a partir de .env.example");
}
if (existsSync(".env")) {
  let env = readFileSync(".env", "utf8");
  const setVar = (key, value) => {
    const line = `${key}="${value}"`;
    if (new RegExp(`^${key}=.*$`, "m").test(env)) {
      env = env.replace(new RegExp(`^${key}=.*$`, "m"), line);
    } else {
      env += `${env.endsWith("\n") ? "" : "\n"}${line}\n`;
    }
  };
  setVar("DATABASE_PROVIDER", provider === "sqlite" ? "sqlite" : "postgres");
  if (connectionString) setVar("DATABASE_URL", connectionString);
  else if (provider === "sqlite") setVar("DATABASE_URL", "file:./prisma/trendhunter.db");
  writeFileSync(".env", env);
  console.log("[db:provider] .env actualizado");
}

console.log(
  provider === "sqlite"
    ? '[db:provider] Listo. Ejecuta: npm run db:bootstrap && npm run db:seed'
    : '[db:provider] Listo. Ejecuta: npm run db:bootstrap (contra tu PostgreSQL) && npm run db:seed',
);
