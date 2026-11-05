/* Empaqueta todo el juego en UN SOLO ARCHIVO HTML (sin servidor, sin internet).
   Uso: node tools/build-single.mjs   ->  MazeRunner.html
*/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Orden de dependencias (cada módulo sólo puede depender de los anteriores)
const ORDER = [
  'rng.js', 'config.js', 'assets.js', 'storage.js', 'audio.js', 'textures.js',
  'world.js', 'entities.js', 'player.js', 'render.js', 'minimap.js', 'input.js',
  'ui.js', 'game.js',
];

const EXPORT_RE = /^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
// cualquier declaración SIN indentar (de verdad a nivel de módulo, no anidada
// en una función/clase) comparte el mismo ámbito global tras concatenar, esté
// o no exportada — hay que vigilarlas todas, no sólo las exportadas.
const TOPLEVEL_RE = /^(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
const NS_IMPORT_RE = /^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]\.\/([\w.-]+)\.js['"];?/gm;

function exportsOf(code) {
  const names = new Set();
  for (const m of code.matchAll(EXPORT_RE)) names.add(m[1]);
  return names;
}

function toplevelNamesOf(code) {
  const names = new Set();
  for (const m of code.matchAll(TOPLEVEL_RE)) names.add(m[1]);
  return names;
}

function nsImportsOf(code) {
  const out = [];
  for (const m of code.matchAll(NS_IMPORT_RE)) out.push({ alias: m[1], file: `${m[2]}.js` });
  return out;
}

const strip = (code) => code
  .split('\n')
  .filter((l) => !/^\s*import\s.*from\s+['"]\.\//.test(l))
  .map((l) => l.replace(/^(\s*)export\s+(default\s+)?/, '$1'))
  .join('\n');

// 1) lee todos los módulos y detecta exportaciones + imports de espacio de nombres (import * as X)
const raw = {};
const exportsByFile = {};
const toplevelByFile = {};
const nsAliases = new Map(); // alias -> file
for (const f of ORDER) {
  raw[f] = fs.readFileSync(path.join(root, 'src', f), 'utf8');
  exportsByFile[f] = exportsOf(raw[f]);
  toplevelByFile[f] = toplevelNamesOf(raw[f]);
  for (const { alias, file } of nsImportsOf(raw[f])) nsAliases.set(alias, file);
}

// 2) guarda de colisiones: dos módulos no pueden declarar el mismo nombre a nivel
// de módulo (esté exportado o no: al concatenar comparten el mismo ámbito global)
const ownerOf = new Map();
for (const f of ORDER) {
  for (const name of toplevelByFile[f]) {
    if (ownerOf.has(name)) {
      throw new Error(`Colisión de nombres al empaquetar: "${name}" se declara a nivel de módulo en ${ownerOf.get(name)} y también en ${f}. Renómbralo en uno de los dos archivos.`);
    }
    ownerOf.set(name, f);
  }
}
for (const alias of nsAliases.keys()) {
  if (ownerOf.has(alias)) {
    throw new Error(`Colisión de nombres al empaquetar: el alias de espacio de nombres "${alias}" coincide con una exportación de ${ownerOf.get(alias)}.`);
  }
}

// 3) concatena el cuerpo de cada módulo (sin imports/exports)
let js = '';
for (const f of ORDER) {
  js += `\n/* ==================== ${f} ==================== */\n${strip(raw[f])}\n`;
}

// 4) sintetiza los alias de espacio de nombres (const Store = { ...exports de storage.js... })
for (const [alias, file] of nsAliases) {
  const names = [...(exportsByFile[file] || [])];
  if (!names.length) throw new Error(`No se encontraron exportaciones en ${file} para el alias "${alias}".`);
  js += `\nconst ${alias} = { ${names.join(', ')} };\n`;
}

// 5) arranque (equivalente a src/main.js)
js += `
/* ==================== boot ==================== */
window.addEventListener('DOMContentLoaded', function () {
  var game = new Game();
  var ui = new UI(game);
  window.__maze = { game: game, ui: ui };
});
`;

// 6) inyecta CSS + JS en index.html; quita manifest/service worker (no aplican en file://)
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
html = html.replace(/<script>\s*if \('serviceWorker'[\s\S]*?<\/script>\n?/, '');
html = html.replace(/<link rel="stylesheet" href="styles\.css">/, `<style>\n${css}\n</style>`);
html = html.replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  `<script>\n(function () {\n'use strict';\n${js}\n})();\n</script>`,
);
html = html.replace('<title>', '<title>▶ ');

const out = path.join(root, 'MazeRunner.html');
fs.writeFileSync(out, html);
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`✅ ${out} (${kb} KB) — ábrelo con doble clic, no necesita servidor ni internet.`);
