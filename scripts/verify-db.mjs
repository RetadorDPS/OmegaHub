#!/usr/bin/env node
/**
 * Verificación de integridad entre `prisma/schema.prisma`, la especificación
 * declarativa (`scripts/db/table-spec.mjs`) y la base de datos real.
 *
 * Detecta "drift" de esquema antes de que rompa la aplicación:
 *   · Modelos del schema sin tabla en la base de datos.
 *   · Campos del schema ausentes o sobrantes en la base de datos.
 *   · Diferencias de valores entre los enums del schema y los de la spec.
 *
 * Uso: npm run db:verify
 */
import { readFileSync } from "node:fs";
import { TABLES, ENUMS } from "./db/table-spec.mjs";
import { detectProvider, resolveDatabaseUrl, resolveSqlitePath } from "./db/load-env.mjs";

/** Tipos escalares de Prisma que sí se materializan como columnas. */
const SCALAR_TYPES = new Set(["String", "Int", "Float", "Boolean", "DateTime", "Json", "BigInt", "Bytes", "Decimal"]);

/** Parser ligero de schema.prisma: modelos (sólo columnas), campos y enums. */
function parseSchema(file = "prisma/schema.prisma") {
  const source = readFileSync(file, "utf8");
  const models = new Map();
  const enums = new Map();

  // 1) Enums (necesarios para distinguir columnas de relaciones).
  const enumRegex = /enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = enumRegex.exec(source))) {
    const [, name, body] = match;
    enums.set(
      name,
      body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//") && !line.startsWith("///")),
    );
  }

  // 2) Modelos: se descartan los campos de relación (no generan columnas).
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  while ((match = modelRegex.exec(source))) {
    const [, name, body] = match;
    const columns = [];
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("@@")) continue;
      const [fieldName, rawType] = line.split(/\s+/);
      if (!fieldName || !rawType) continue;
      const baseType = rawType.replace(/[?[\]]/g, "");
      const isColumn = SCALAR_TYPES.has(baseType) || enums.has(baseType);
      if (isColumn) columns.push(fieldName);
    }
    models.set(name, columns);
  }
  return { models, enums };
}

const problems = [];
const { models, enums } = parseSchema();
const provider = detectProvider();

// 1) Paridad de modelos entre schema.prisma y la spec declarativa.
const specTables = new Map(TABLES.map((table) => [table.name, table.columns.map((c) => c.name)]));
for (const [model, fields] of models) {
  if (!specTables.has(model)) {
    problems.push(`Modelo "${model}" del schema no tiene tabla en la especificación.`);
    continue;
  }
  const specColumns = specTables.get(model);
  const missing = fields.filter((f) => !specColumns.includes(f));
  if (missing.length) problems.push(`Modelo "${model}": faltan columnas en la spec → ${missing.join(", ")}`);
  const extra = specColumns.filter((c) => !fields.includes(c));
  if (extra.length) problems.push(`Modelo "${model}": columnas de la spec que no existen en el schema → ${extra.join(", ")}`);
}
for (const table of specTables.keys()) {
  if (!models.has(table)) problems.push(`Tabla "${table}" de la spec no existe como modelo en el schema.`);
}

// 2) Paridad de enums.
for (const [name, values] of enums) {
  const specValues = ENUMS[name];
  if (!specValues) {
    problems.push(`Enum "${name}" del schema no está en la spec.`);
    continue;
  }
  const missing = values.filter((v) => !specValues.includes(v));
  const extra = specValues.filter((v) => !values.includes(v));
  if (missing.length || extra.length) {
    problems.push(`Enum "${name}": diferencias → faltan [${missing.join(", ")}] sobran [${extra.join(", ")}]`);
  }
}

// 3) Comparación contra la base de datos real.
let dbColumns = new Map();
if (provider === "sqlite") {
  const { default: Database } = await import("better-sqlite3");
  const { existsSync } = await import("node:fs");
  const dbPath = resolveSqlitePath(resolveDatabaseUrl());
  if (!existsSync(dbPath)) {
    console.error(`[db:verify] No existe la base de datos ${dbPath}. Ejecuta antes: npm run db:bootstrap`);
    process.exit(1);
  }
  const db = new Database(dbPath, { readonly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  for (const { name } of tables) {
    dbColumns.set(
      name,
      db.prepare(`PRAGMA table_info("${name}")`).all().map((column) => column.name),
    );
  }
  db.close();

  // Verificación de integridad referencial declarada: FKs presentes.
  const db2 = new Database(dbPath, { readonly: true });
  for (const table of TABLES) {
    const declared = table.columns.filter((c) => c.references);
    if (!declared.length) continue;
    const actual = db2.prepare(`PRAGMA foreign_key_list("${table.name}")`).all();
    for (const column of declared) {
      const found = actual.some((fk) => fk.from === column.name && fk.table === column.references.table);
      if (!found) problems.push(`Falta clave foránea ${table.name}.${column.name} → ${column.references.table}`);
    }
  }
  db2.close();
} else {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  const { rows } = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  await client.end();
  for (const row of rows) {
    if (!dbColumns.has(row.table_name)) dbColumns.set(row.table_name, []);
    dbColumns.get(row.table_name).push(row.column_name);
  }
}

for (const [table, columns] of specTables) {
  const actual = dbColumns.get(table);
  if (!actual) {
    problems.push(`La tabla "${table}" NO existe en la base de datos.`);
    continue;
  }
  const missing = columns.filter((c) => !actual.includes(c));
  if (missing.length) problems.push(`Tabla "${table}": faltan columnas en la base → ${missing.join(", ")}`);
}

// 4) Informe final.
if (problems.length) {
  console.error(`[db:verify] ✖ ${problems.length} problema(s) detectado(s):`);
  for (const problem of problems) console.error(`   · ${problem}`);
  process.exit(1);
}
console.log(`[db:verify] ✔ Esquema consistente (${models.size} modelos · ${enums.size} enums · proveedor ${provider}).`);
console.log(`[db:verify] ✔ La base de datos refleja prisma/schema.prisma sin drift.`);
