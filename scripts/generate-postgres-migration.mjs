#!/usr/bin/env node
/**
 * ============================================================================
 *  SQL de PostgreSQL para Supabase (o cualquier PostgreSQL)
 * ============================================================================
 *  Genera `prisma/postgres-inicial.sql` a partir de la especificación
 *  declarativa (`scripts/db/table-spec.mjs`), que es la misma fuente que usa
 *  `db-bootstrap.mjs`. El SQL es idempotente: se puede pegar tal cual en el
 *  editor SQL de Supabase las veces que haga falta.
 *
 *   npm run db:migration:postgres             # solo genera el fichero
 *   npm run db:migration:postgres -- --aplicar # además lo ejecuta contra
 *                                              # DATABASE_URL/DIRECT_URL
 *
 *  El arranque del contenedor ya crea el esquema automáticamente; este script
 *  existe para quien prefiera revisar el SQL o aplicarlo a mano desde el panel
 *  de Supabase (sin dar acceso de escritura a la app).
 * ============================================================================
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { TABLES, ENUMS } from "./db/table-spec.mjs";
import { fullDdl } from "./db/emit-ddl.mjs";
import { detectProvider, pgSslOptions, resolveDatabaseUrl } from "./db/load-env.mjs";

const DESTINO = path.join(process.cwd(), "prisma", "postgres-inicial.sql");
const sentencias = fullDdl(TABLES, ENUMS, "postgresql");

const cabecera = `-- ============================================================================
--  TrendHunter Pro · esquema inicial para PostgreSQL / Supabase
-- ============================================================================
--  Generado por scripts/generate-postgres-migration.mjs
--  Idempotente: usa CREATE ... IF NOT EXISTS y tipos ENUM protegidos.
--
--  Cómo aplicarlo:
--    1. Supabase → SQL Editor → New query.
--    2. Pega este fichero completo y pulsa "Run".
--    3. Copia DATABASE_URL (pooler, puerto 6543) y DIRECT_URL (5432) al .env.
--    4. Carga los datos de demostración:  npm run db:seed
--
--  Tablas: ${TABLES.length} · Enums: ${Object.keys(ENUMS).length}
-- ============================================================================

`;

// Las sentencias ya pueden traer su propio `;` (los bloques DO de los ENUM):
// se normaliza para que el fichero no tenga `;;`.
const sql = sentencias.map((sentencia) => sentencia.trim().replace(/;+$/, "")).join(";\n\n") + ";\n";
writeFileSync(DESTINO, cabecera + sql, "utf8");
console.log(`[postgres] SQL generado: ${path.relative(process.cwd(), DESTINO)} (${sentencias.length} sentencias).`);

const aplicar = process.argv.includes("--aplicar");
if (!aplicar) {
  console.log("[postgres] Pégalo en Supabase → SQL Editor, o ejecuta con --aplicar para hacerlo desde aquí.");
  process.exit(0);
}

// `||` (no `??`): una variable definida pero vacía en el .env no debe
// convertir la cadena de conexión en "".
const url = process.env.DIRECT_URL || resolveDatabaseUrl();
if (detectProvider(url) !== "postgresql") {
  console.error("[postgres] --aplicar necesita una URL de PostgreSQL en DATABASE_URL o DIRECT_URL.");
  process.exit(1);
}

console.log("[postgres] Aplicando el esquema…");
const { default: pg } = await import("pg");
const cliente = new pg.Client({ connectionString: url, ssl: pgSslOptions(url) });
await cliente.connect();
try {
  await cliente.query("BEGIN");
  for (const sentencia of sentencias) await cliente.query(sentencia);
  await cliente.query("COMMIT");
  const { rows } = await cliente.query(
    "SELECT COUNT(*)::int AS tablas FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  console.log(`[postgres] ✔ Esquema aplicado · ${rows[0]?.tablas ?? 0} tablas en public.`);
} catch (error) {
  await cliente.query("ROLLBACK").catch(() => {});
  console.error(`[postgres] ✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
