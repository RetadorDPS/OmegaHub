/**
 * Test del parser de comandos de la cabina.
 *
 * Particularidad importante: NO reimplementa la lógica. Extrae la función
 * `parse` del propio panel/app.js y la ejecuta. Si alguien cambia el parser,
 * este test prueba lo que de verdad se sirve en el navegador, no una copia que
 * se quedó atrás. Es lo que permite cazar el tipo de fallo que se cuela al
 * tocar expresiones regulares.
 *
 * Uso:  node phone-agent-web/tests/parser.test.mjs
 * Sale con código 1 si algo falla, así que CI puede usarlo directamente.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', 'panel', 'app.js'), 'utf8');

const bloque = src.match(/function parse\(text\) \{[\s\S]*?\n {2}\}/);
if (!bloque) {
  console.error('❌ No encuentro parse() en panel/app.js — ¿se renombró?');
  process.exit(1);
}
// eslint-disable-next-line no-eval
const parse = eval('(' + bloque[0].replace('function parse', 'function') + ')');

const casos = [
  // ── Buscar en Google ────────────────────────────────────────────────
  ['busca recetas de pan', 'search_google', { query: 'recetas de pan' }],
  ['busca en google el tiempo', 'search_google', { query: 'el tiempo' }],
  ['buscar hoteles baratos', 'search_google', { query: 'hoteles baratos' }],
  ['google noticias de hoy', 'search_google', { query: 'noticias de hoy' }],
  ['búscame la letra de Yesterday', 'search_google', { query: 'la letra de Yesterday' }],

  // ── Preguntar a los asistentes ──────────────────────────────────────
  // El caso de las mayúsculas es el que motiva este test: antes el parser
  // pasaba por .toLowerCase() y Claude recibía "qué es el rna".
  ['pregunta a claude qué es el RNA', 'ask_claude', { text: 'qué es el RNA' }],
  ['dile a claude Resume este texto', 'ask_claude', { text: 'Resume este texto' }],
  ['pregunta a chatgpt una broma', 'ask_chatgpt', { text: 'una broma' }],
  ['pregúntale a Claude quién eres', 'ask_claude', { text: 'quién eres' }],

  // ── Traducir ────────────────────────────────────────────────────────
  ['traduce good morning al español', 'translate', { text: 'good morning', target: 'español' }],
  ['traduce hola mundo al inglés', 'translate', { text: 'hola mundo', target: 'inglés' }],
  ['traduce Bonjour', 'translate', { text: 'Bonjour', target: 'español' }],

  // ── Leer la página ──────────────────────────────────────────────────
  ['lee la página', 'read_page', {}],
  ['leer la página', 'read_page', {}],
  ['¿qué pone aquí?', 'read_page', {}],

  // ── Abrir pestañas ──────────────────────────────────────────────────
  ['abre claude', 'open_tab', { url: 'https://claude.ai' }],
  ['abre chatgpt', 'open_tab', { url: 'https://chatgpt.com' }],
  ['abre google', 'open_tab', { url: 'https://www.google.com' }],
  ['abre https://example.com', 'open_tab', { url: 'https://example.com' }],
  // Una web que no conoce no debe fallar: se busca en Google.
  ['abre wikipedia', 'search_google', { query: 'wikipedia' }],

  // ── Comprobación ────────────────────────────────────────────────────
  // "estás ahí" llevaba \b al final del patrón y no casaba: en JavaScript \w
  // no incluye vocales acentuadas, así que tras la "í" no hay frontera.
  ['estás ahí', 'ping', {}],
  ['estas ahi', 'ping', {}],
  ['sigues ahí', 'ping', {}],
  ['hola', 'ping', {}],

  // ── Sin patrón: por defecto a Claude ────────────────────────────────
  ['explícame la fotosíntesis', 'ask_claude', { text: 'explícame la fotosíntesis' }],
  ['Hazme un plan de semana', 'ask_claude', { text: 'Hazme un plan de semana' }],
];

let fallos = 0;
for (const [frase, accion, params] of casos) {
  const r = parse(frase);
  const okAccion = r.action === accion;
  const okParams = Object.entries(params).every(([k, v]) => r.params[k] === v);
  const ok = okAccion && okParams;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✅' : '❌'} "${frase}" → ${r.action} ${JSON.stringify(r.params)}`);
  if (!ok) console.log(`       esperado: ${accion} ${JSON.stringify(params)}`);
}

console.log(fallos === 0
  ? `\n${casos.length}/${casos.length} casos correctos ✅`
  : `\n${fallos} de ${casos.length} casos fallan ❌`);
process.exit(fallos === 0 ? 0 : 1);
