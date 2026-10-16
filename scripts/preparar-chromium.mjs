/**
 * Prepara un Chromium local para las herramientas de verificación y capturas.
 *
 * No descarga nada: aprovecha el binario ya instalado como dependencia de
 * desarrollo (`@sparticuz/chromium`), que distribuye Chromium comprimido con
 * brotli junto a las bibliotecas del sistema, y deja todo listo en `.chromium/`:
 *
 *     .chromium/chromium    · binario ejecutable
 *     .chromium/libs        · bibliotecas compartidas (.so) que necesita
 *
 * Después, los scripts de verificación y capturas lo usan automáticamente
 * (configuran `CHROMIUM_PATH` y `LD_LIBRARY_PATH` por su cuenta).
 *
 *     npm run chromium
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import path from "node:path";

const ORIGEN = path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");
const DESTINO = path.join(process.cwd(), ".chromium");
const BINARIO = path.join(DESTINO, "chromium");
const LIBRERIAS = path.join(DESTINO, "libs");

if (!existsSync(ORIGEN)) {
  console.error("[chromium] No se encontró @sparticuz/chromium. Ejecuta `npm install` primero.");
  process.exit(1);
}

mkdirSync(DESTINO, { recursive: true });

// --- 1 · Binario de Chromium -------------------------------------------------
if (existsSync(BINARIO)) {
  console.log("[chromium] El binario ya estaba preparado.");
} else {
  writeFileSync(BINARIO, brotliDecompressSync(readFileSync(path.join(ORIGEN, "chromium.br"))));
  chmodSync(BINARIO, 0o755);
  console.log(`[chromium] Binario listo (${Math.round(statSync(BINARIO).size / 1024 / 1024)} MB).`);
}

// --- 2 · Bibliotecas del sistema --------------------------------------------
if (existsSync(LIBRERIAS)) {
  console.log("[chromium] Las bibliotecas ya estaban preparadas.");
} else {
  const temporal = path.join(DESTINO, "_temporal");
  mkdirSync(temporal, { recursive: true });

  const tar = path.join(temporal, "al2023.tar");
  writeFileSync(tar, brotliDecompressSync(readFileSync(path.join(ORIGEN, "al2023.tar.br"))));
  execFileSync("tar", ["-xf", tar, "-C", temporal]);
  rmSync(tar, { force: true });

  // El tar trae la carpeta `lib` en su raíz o dentro de otro directorio.
  const encontrada = buscarDirectorio(temporal, ["lib", "libs"]);
  if (!encontrada) {
    console.error("[chromium] No se encontró la carpeta de bibliotecas en el paquete.");
    process.exit(1);
  }

  execFileSync("mv", [encontrada, LIBRERIAS]);
  rmSync(temporal, { recursive: true, force: true });
  console.log(`[chromium] Bibliotecas preparadas (${readdirSync(LIBRERIAS).length} ficheros).`);
}

console.log("[chromium] Todo listo.");

/** Busca en anchura un directorio con alguno de los nombres indicados. */
function buscarDirectorio(raiz, nombres) {
  const pendientes = [raiz];
  let visitados = 0;

  while (pendientes.length > 0 && visitados < 500) {
    const actual = pendientes.shift();
    visitados += 1;

    for (const entrada of readdirSync(actual, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const ruta = path.join(actual, entrada.name);
      if (nombres.includes(entrada.name)) return ruta;
      pendientes.push(ruta);
    }
  }

  return null;
}
