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

/**
 * Extrae una función de un fichero y la devuelve ejecutable.
 *
 * Se hace así, y no reimplementándola, para que el test pruebe el código que de
 * verdad se sirve. Es lo que permitió cazar los cuatro fallos originales.
 */
function extraer(ruta, nombre) {
  const src = readFileSync(join(aqui, '..', ruta), 'utf8');
  const bloque = src.match(new RegExp('function ' + nombre + '\\(text\\) \\{[\\s\\S]*?\\n {2}\\}'));
  if (!bloque) {
    console.error(`❌ No encuentro ${nombre}() en ${ruta} — ¿se renombró?`);
    process.exit(1);
  }
  // eslint-disable-next-line no-eval
  return eval('(' + bloque[0].replace('function ' + nombre, 'function') + ')');
}

const parsePanel = extraer('panel/app.js', 'parse');
const parseUserscript = extraer('userscript/phone-agent.user.js', 'parse');

// Las dos copias existen porque un userscript tiene que ser un fichero único y
// autocontenido. Este array es lo que impide que se separen con el tiempo.
const parsers = [
  ['cabina (panel/app.js)', parsePanel],
  ['userscript (manos)', parseUserscript]
];

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
let total = 0;

for (const [nombre, parse] of parsers) {
  console.log(`\n── ${nombre} ──`);
  for (const [frase, accion, params] of casos) {
    total++;
    const r = parse(frase);
    const okAccion = r.action === accion;
    const okParams = Object.entries(params).every(([k, v]) => r.params[k] === v);
    const ok = okAccion && okParams;
    if (!ok) fallos++;
    console.log(`  ${ok ? '✅' : '❌'} "${frase}" → ${r.action} ${JSON.stringify(r.params)}`);
    if (!ok) console.log(`       esperado: ${accion} ${JSON.stringify(params)}`);
  }
}

// Comprobación explícita de que las dos copias no han divergido: mismo
// resultado en las mismas frases, caso por caso.
console.log('\n── coincidencia entre las dos copias ──');
let divergen = 0;
for (const [frase] of casos) {
  const a = JSON.stringify(parsePanel(frase));
  const b = JSON.stringify(parseUserscript(frase));
  if (a !== b) { divergen++; console.log(`  ❌ "${frase}"\n       cabina:     ${a}\n       userscript: ${b}`); }
}
if (divergen === 0) console.log('  ✅ las dos copias coinciden en los ' + casos.length + ' casos');

const ok = fallos === 0 && divergen === 0;
console.log(ok
  ? `\n${total}/${total} casos correctos y copias sincronizadas ✅`
  : `\n${fallos} casos fallan y ${divergen} divergencias ❌`);
process.exit(ok ? 0 : 1);
