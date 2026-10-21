#!/usr/bin/env node
/**
 * Crea (o actualiza) el esquema de base de datos a partir de
 * `scripts/db/table-spec.mjs`, sin depender del motor nativo de Prisma.
 *
 *   npm run db:bootstrap              # usa DATABASE_URL del .env
 *   npm run db:bootstrap -- --force   # recrea las tablas desde cero
 *
 * Es idempotente: todas las sentencias usan CREATE ... IF NOT EXISTS.
 */
import { mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { TABLES, ENUMS } from "./db/table-spec.mjs";
import { fullDdl } from "./db/emit-ddl.mjs";
import { detectProvider, pgSslOptions, resolveDatabaseUrl, resolveSqlitePath } from "./db/load-env.mjs";

const force = process.argv.includes("--force");
const provider = detectProvider();
const databaseUrl = resolveDatabaseUrl();

if (force) {
  if (provider !== "sqlite") {
    console.error("[db:bootstrap] --force sólo está soportado en SQLite. Abortando.");
    process.exit(1);
  }
  const dbPath = resolveSqlitePath(databaseUrl);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }
  console.log(`[db:bootstrap] Base de datos SQLite eliminada: ${dbPath}`);
}

const statements = fullDdl(TABLES, ENUMS, provider);

if (provider === "sqlite") {
  const dbPath = resolveSqlitePath(databaseUrl);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const apply = db.transaction((list) => {
    for (const statement of list) db.exec(statement);
  });
  apply(statements);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  const columns = tables.reduce(
    (total, table) => total + db.prepare(`PRAGMA table_info("${table.name}")`).all().length,
    0,
  );
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all();
  db.close();
  console.log(`[db:bootstrap] Proveedor: SQLite → ${dbPath}`);
  console.log(`[db:bootstrap] Tablas: ${tables.length} · Columnas: ${columns} · Índices: ${indexes.length}`);
  console.log(`[db:bootstrap] ${tables.map((t) => t.name).join(", ")}`);
} else {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: pgSslOptions(databaseUrl) });
  await client.connect();
  try {
    for (const statement of statements) await client.query(statement);
    const { rows: tables } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    const { rows: columns } = await client.query(
      "SELECT count(*)::int AS total FROM information_schema.columns WHERE table_schema = 'public'",
    );
    console.log(`[db:bootstrap] Proveedor: PostgreSQL → ${databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
    console.log(`[db:bootstrap] Tablas: ${tables.length} · Columnas: ${columns[0].total}`);
    console.log(`[db:bootstrap] ${tables.map((t) => t.table_name).join(", ")}`);
  } finally {
    await client.end();
  }
}
