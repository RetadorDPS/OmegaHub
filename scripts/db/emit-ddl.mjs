/**
 * Emisor de DDL a partir de `scripts/db/table-spec.mjs`.
 * Soporta SQLite (desarrollo local) y PostgreSQL (producción).
 */

const SQLITE_TYPES = { text: "TEXT", int: "INTEGER", float: "REAL", bool: "BOOLEAN", datetime: "DATETIME", json: "JSON" };
const PG_TYPES = { text: "TEXT", int: "INTEGER", float: "DOUBLE PRECISION", bool: "BOOLEAN", datetime: "TIMESTAMP(3)", json: "JSONB" };

function logicalBase(type) {
  return type.startsWith("enum:") ? "enum" : type;
}

/** Devuelve la cláusula DEFAULT para una columna (o cadena vacía). */
function defaultClause(column, provider) {
  if (!column.default) return "";
  const { sql, value } = column.default;
  if (sql === "now") {
    return provider === "postgresql" ? "DEFAULT CURRENT_TIMESTAMP" : "DEFAULT CURRENT_TIMESTAMP";
  }
  if (sql === "emptyJsonArray") {
    return provider === "postgresql" ? `DEFAULT '[]'::jsonb` : `DEFAULT '[]'`;
  }
  if (typeof value === "boolean") {
    if (provider === "postgresql") return `DEFAULT ${value ? "true" : "false"}`;
    return `DEFAULT ${value ? 1 : 0}`;
  }
  if (typeof value === "number") return `DEFAULT ${value}`;
  return `DEFAULT '${value}'`;
}

function columnType(column, provider) {
  const base = logicalBase(column.type);
  if (base === "enum") {
    const enumName = column.type.slice("enum:".length);
    return provider === "postgresql" ? `"${enumName}"` : "TEXT";
  }
  const map = provider === "postgresql" ? PG_TYPES : SQLITE_TYPES;
  return map[base];
}

/** DDL completo de una tabla (CREATE TABLE + índices). */
export function tableDdl(table, provider) {
  const statements = [];
  const lines = table.columns.map((column) => {
    let line = `  "${column.name}" ${columnType(column, provider)}`;
    if (column.pk) line += " NOT NULL PRIMARY KEY";
    else if (!column.nullable) line += " NOT NULL";
    const def = defaultClause(column, provider);
    if (def) line += ` ${def}`;
    if (column.references) {
      const target = column.references.table;
      const targetColumn = column.references.column ?? "id";
      const onDelete = column.references.onDelete ? ` ON DELETE ${column.references.onDelete.toUpperCase().replace("SETNULL", "SET NULL")}` : "";
      const onUpdate = provider === "postgresql" ? " ON UPDATE CASCADE" : "";
      line += ` REFERENCES "${target}"("${targetColumn}")${onDelete}${onUpdate}`;
    }
    return line;
  });
  statements.push(`CREATE TABLE IF NOT EXISTS "${table.name}" (\n${lines.join(",\n")}\n)`);

  // Columnas con @unique
  for (const column of table.columns.filter((c) => c.unique)) {
    statements.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${table.name}_${column.name}_key" ON "${table.name}"("${column.name}")`,
    );
  }
  // @@unique compuestos
  for (const group of table.uniques ?? []) {
    statements.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${table.name}_${group.join("_")}_key" ON "${table.name}"(${group.map((c) => `"${c}"`).join(", ")})`,
    );
  }
  // @@index
  for (const group of table.indexes ?? []) {
    statements.push(
      `CREATE INDEX IF NOT EXISTS "${table.name}_${group.join("_")}_idx" ON "${table.name}"(${group.map((c) => `"${c}"`).join(", ")})`,
    );
  }
  return statements;
}

/** Tipos ENUM nativos de PostgreSQL (antes de crear tablas). */
export function enumDdl(enums) {
  return Object.entries(enums).map(
    ([name, values]) =>
      `DO $$ BEGIN\n  CREATE TYPE "${name}" AS ENUM (${values.map((v) => `'${v}'`).join(", ")});\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`,
  );
}

/** DDL completo de la base de datos para el proveedor indicado. */
export function fullDdl(tables, enums, provider) {
  const statements = [];
  if (provider === "postgresql") statements.push(...enumDdl(enums));
  for (const table of tables) statements.push(...tableDdl(table, provider));
  return statements;
}
