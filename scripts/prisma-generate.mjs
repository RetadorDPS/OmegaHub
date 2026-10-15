/**
 * Genera el cliente de Prisma de forma segura en entornos SIN acceso a
 * binaries.prisma.sh (CI, sandboxes, redes restringidas).
 *
 * Estrategia:
 *  1. Intenta la generación normal (`prisma generate`).
 *  2. Si falla porque no puede descargar el schema-engine nativo, reintenta
 *     apuntando PRISMA_SCHEMA_ENGINE_BINARY a un binario inerte: la CLI usa
 *     entonces el motor WASM (suficiente para validar + generar el cliente).
 *
 * La generación del cliente NO necesita el motor nativo; sólo lo necesita
 * `prisma migrate`/`prisma db push` para calcular DDL.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const prismaCli = path.join("node_modules", "prisma", "build", "index.js");

function runGenerate(extraEnv = {}) {
  return spawnSync(process.execPath, [prismaCli, "generate"], {
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

/** ¿Los motores nativos están ya presentes en disco? */
function enginesInstalled() {
  const enginesDir = path.join("node_modules", "@prisma", "engines");
  if (!existsSync(enginesDir)) return false;
  // @prisma/engines descarga los binarios en dist/ tras el postinstall.
  const candidates = ["schema-engine", "query-engine", "libquery_engine"];
  return candidates.some((name) => {
    for (const ext of ["", ".exe", ".node", ".so.node"]) {
      const file = path.join(enginesDir, `${name}${ext}`);
      if (existsSync(file)) return true;
    }
    return false;
  });
}

let result = runGenerate();
if (result.status !== 0) {
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const isDownloadFailure =
    /binaries\.prisma\.sh|ENOTFOUND|ECONNRESET|socket disconnected|failed to download/i.test(output);

  if (isDownloadFailure || !enginesInstalled()) {
    console.warn(
      "[prisma-generate] Motores nativos no disponibles: generando con el motor WASM (offline).",
    );
    result = runGenerate({ PRISMA_SCHEMA_ENGINE_BINARY: "/bin/true" });
  }
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
