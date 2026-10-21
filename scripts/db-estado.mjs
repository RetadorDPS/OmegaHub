#!/usr/bin/env node
/**
 * Estado de la base de datos (lo consulta `desplegar.sh` para decidir si hay
 * que cargar los datos de demostración).
 *
 *   node scripts/db-estado.mjs
 *
 * Imprime una línea JSON: { proveedor, usuarios, productos, tiendas }.
 *
 * Usa SQL directo (better-sqlite3 / pg) en lugar del cliente Prisma: así
 * funciona en el contenedor sin generar el cliente y sin depender de su salida
 * en TypeScript. Si la base aún no tiene tablas, devuelve ceros con `existe:
 * false` en lugar de fallar (el arranque sabrá que debe crearlas).
 */
import { existsSync } from "node:fs";
import { detectProvider, resolveDatabaseUrl, resolveSqlitePath } from "./db/load-env.mjs";

const proveedor = detectProvider();
const url = resolveDatabaseUrl();

/** Cuenta filas en las tres tablas principales. */
async function contar() {
  if (proveedor === "sqlite") {
    const ruta = resolveSqlitePath(url);
    if (!existsSync(ruta)) return { existe: false, usuarios: 0, productos: 0, tiendas: 0 };

    const { default: Database } = await import("better-sqlite3");
    const bd = new Database(ruta, { readonly: true });
    try {
      const tabla = (nombre) =>
        bd.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(nombre);
      if (!tabla("User")) return { existe: false, usuarios: 0, productos: 0, tiendas: 0 };
      const contarTabla = (nombre) => (tabla(nombre) ? bd.prepare(`SELECT COUNT(*) AS n FROM "${nombre}"`).get().n : 0);
      return {
        existe: true,
        usuarios: contarTabla("User"),
        productos: contarTabla("Product"),
        tiendas: contarTabla("Store"),
      };
    } finally {
      bd.close();
    }
  }

  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const { rows } = await cliente.query(
      `SELECT
         to_regclass('public."User"')    IS NOT NULL AS existe,
         (SELECT COUNT(*) FROM "User")    AS usuarios,
         (SELECT COUNT(*) FROM "Product") AS productos,
         (SELECT COUNT(*) FROM "Store")   AS tiendas`,
    );
    const fila = rows[0] ?? {};
    if (!fila.existe) return { existe: false, usuarios: 0, productos: 0, tiendas: 0 };
    return {
      existe: true,
      usuarios: Number(fila.usuarios ?? 0),
      productos: Number(fila.productos ?? 0),
      tiendas: Number(fila.tiendas ?? 0),
    };
  } finally {
    await cliente.end();
  }
}

try {
  const estado = await contar();
  console.log(JSON.stringify({ proveedor, ...estado }));
} catch (error) {
  console.error(
    JSON.stringify({
      proveedor,
      error: error instanceof Error ? error.message : String(error),
      usuarios: 0,
      productos: 0,
      tiendas: 0,
    }),
  );
  process.exit(1);
}
