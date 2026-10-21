#!/usr/bin/env node
/**
 * Respaldo de la base de datos Supabase.
 *
 *   DIRECT_URL=postgresql://… npm run respaldo
 *
 * Usa pg_dump (nativo, fiable) y guarda el volcado
 * en respaldos/ con fecha. Retiene los últimos 14.
 * Requiere pg_dump en el PATH (PostgreSQL client).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
if (!url || !/^postgres(?:ql)?:\/\//i.test(url)) {
  console.error("[respaldo] Se necesita DIRECT_URL de Supabase (puerto 5432).");
  process.exit(1);
}

const carpeta = path.join(process.cwd(), "respaldos");
if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });

const marca = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const destino = path.join(carpeta, `trendhunter-${marca}.sql`);

try {
  execFileSync("pg_dump", [url, "--file", destino, "--no-owner", "--no-acl"], {
    stdio: "inherit",
  });
  console.log(`[respaldo] Guardado: ${destino}`);
} catch (error) {
  console.error("[respaldo] pg_dump falló:", error instanceof Error ? error.message : error);
  process.exit(1);
}

// Retención: solo los últimos 14 respaldos.
const archivos = readdirSync(carpeta)
  .filter((n) => n.startsWith("trendhunter-") && n.endsWith(".sql"))
  .sort()
  .reverse();
for (const antiguo of archivos.slice(14)) {
  rmSync(path.join(carpeta, antiguo));
  console.log(`[respaldo] Retenido eliminado: ${antiguo}`);
}
