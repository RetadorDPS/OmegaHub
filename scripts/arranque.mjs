#!/usr/bin/env node
/**
 * ============================================================================
 *  Punto de entrada del contenedor (Docker / Oracle / Railway)
 * ============================================================================
 *  1. Carga el `.env` si existe (en Docker llegan por variables de entorno).
 *  2. Prepara el esquema:
 *       · Si hay migraciones de Prisma (`prisma/migrations`) → `migrate deploy`.
 *       · Si no → `scripts/db-bootstrap.mjs`, que aplica DDL idempotente
 *         (CREATE TABLE IF NOT EXISTS) tanto en SQLite como en PostgreSQL.
 *  3. Si la base está vacía, carga los datos reales de demostración.
 *  4. Arranca la aplicación.
 *
 *  Todo es idempotente: reiniciar el contenedor no duplica ni borra datos.
 *  Variables:
 *    AUTO_SEED=false   → nunca cargar datos de demostración.
 * ============================================================================
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "./db/load-env.mjs";

loadEnv();

/** Ejecuta un proceso hijo y devuelve su código de salida. */
function ejecutar(comando, argumentos, opciones = {}) {
  return new Promise((resolver) => {
    const proceso = spawn(comando, argumentos, { stdio: "inherit", env: process.env, ...opciones });
    proceso.on("close", (codigo) => resolver(codigo ?? 0));
    proceso.on("error", (error) => {
      console.error(`[arranque] No se pudo ejecutar ${comando}: ${error.message}`);
      resolver(1);
    });
  });
}

const esPostgres = /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");
const ejecutableNode = process.execPath;
const raiz = process.cwd();

// ---------------------------------------------------------------------------
//  1 · Esquema
// ---------------------------------------------------------------------------
const hayMigraciones = existsSync(path.join(raiz, "prisma", "migrations"));
const comandoPrisma = path.join(raiz, "node_modules", "prisma", "build", "index.js");

if (hayMigraciones) {
  console.log("[arranque] Aplicando migraciones de Prisma…");
  const codigo = await ejecutar(ejecutableNode, [comandoPrisma, "migrate", "deploy"]);
  if (codigo !== 0) {
    console.error("[arranque] Las migraciones fallaron. Revisa DATABASE_URL/DIRECT_URL.");
    process.exit(codigo);
  }
} else {
  console.log(
    `[arranque] Creando/verificando el esquema (${esPostgres ? "PostgreSQL" : "SQLite"}) con DDL idempotente…`,
  );

  // Una base recién creada (Supabase en frío o el PostgreSQL del compose) puede
  // tardar unos segundos en aceptar conexiones: se reintenta con espera.
  const intentos = esPostgres ? 12 : 1;
  let codigo = 1;
  for (let intento = 1; intento <= intentos; intento += 1) {
    codigo = await ejecutar(ejecutableNode, [path.join(raiz, "scripts", "db-bootstrap.mjs")]);
    if (codigo === 0) break;
    if (intento < intentos) {
      console.warn(`[arranque] La base aún no responde (intento ${intento}/${intentos}); reintento en 5 s…`);
      await new Promise((resolver) => setTimeout(resolver, 5000));
    }
  }
  if (codigo !== 0) {
    console.error("[arranque] No se pudo preparar el esquema. Revisa DATABASE_URL/DIRECT_URL.");
    process.exit(codigo);
  }
}

// ---------------------------------------------------------------------------
//  2 · Datos de demostración (solo si la base está vacía)
// ---------------------------------------------------------------------------
if (process.env.AUTO_SEED === "false") {
  console.log("[arranque] AUTO_SEED=false: no se cargan datos de demostración.");
} else {
  let estado = null;
  try {
    const salida = await new Promise((resolver) => {
      const partes = [];
      const proceso = spawn(ejecutableNode, [path.join(raiz, "scripts", "db-estado.mjs")], {
        env: process.env,
      });
      proceso.stdout.on("data", (trozo) => partes.push(trozo));
      proceso.on("close", () => resolver(Buffer.concat(partes).toString()));
    });
    estado = JSON.parse(salida.trim().split("\n").at(-1) ?? "{}");
  } catch {
    estado = null;
  }

  if (estado && estado.usuarios === 0) {
    console.log("[arranque] Base vacía: cargando datos reales de demostración…");
    const tsx = path.join(raiz, "node_modules", ".bin", "tsx");
    const codigo = await ejecutar(tsx, ["prisma/seed.ts"]);
    if (codigo !== 0) {
      console.warn("[arranque] La semilla falló; la aplicación arrancará con la base creada.");
    }
  } else if (estado) {
    console.log(
      `[arranque] Datos existentes: ${estado.usuarios} usuarios · ${estado.productos} productos · ${estado.tiendas} tiendas.`,
    );
  }
}

// ---------------------------------------------------------------------------
//  3 · Aplicación
// ---------------------------------------------------------------------------
console.log("[arranque] Iniciando la aplicación…");
const app = spawn("npm", ["run", "start"], { stdio: "inherit", env: process.env });
app.on("close", (codigo) => process.exit(codigo ?? 0));
for (const senal of ["SIGTERM", "SIGINT"]) {
  process.on(senal, () => app.kill(senal));
}
