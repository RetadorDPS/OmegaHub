/**
 * Regresión: una pausa mientras la IA genera NO debe tratarse como respuesta final.
 * Extrae el ayudante real del userscript; no mantiene una segunda implementación.
 * Uso: node phone-agent-web/tests/completion.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', 'userscript', 'phone-agent.user.js'), 'utf8');
const bloque = src.match(/function waitForAssistantCompletion\(readState, options, onProgress\) \{[\s\S]*?\n  \}\n\n  \/\*\* Detecta las señales visibles/);
assert.ok(bloque, 'Debe existir waitForAssistantCompletion() en el userscript');
const codigo = bloque[0].replace(/\n\n  \/\*\* Detecta las señales visibles[\s\S]*$/, '');
// eslint-disable-next-line no-eval
const esperar = eval('(' + codigo.replace('function waitForAssistantCompletion', 'function') + ')');

// La IA mantiene el indicador de generación durante una pausa y después añade
// la respuesta. La pausa no puede cerrar la tarea: se devuelve el texto final.
const inicio = Date.now();
const progreso = [];
const respuesta = await esperar(() => {
  const ms = Date.now() - inicio;
  if (ms < 25) return { text: 'Estoy preparando la respuesta…', generating: true };
  if (ms < 70) return { text: 'Respuesta final completa.', generating: true };
  return { text: 'Respuesta final completa.', generating: false };
}, { intervalMs: 2, stableMs: 8, noSignalStableMs: 30, timeoutMs: 200 }, m => progreso.push(m));
assert.equal(respuesta, 'Respuesta final completa.');
assert.ok(progreso.some(m => m.includes('generando')), 'Debe comunicar que sigue generando');

// Si nunca aparece una señal de final, se agota el plazo y se rechaza: jamás se
// presenta silenciosamente un fragmento como si fuese la respuesta completa.
await assert.rejects(
  esperar(() => ({ text: 'Todavía está escribiendo…', generating: true }),
    { intervalMs: 2, stableMs: 5, noSignalStableMs: 10, timeoutMs: 25 }),
  /No pude confirmar que la respuesta terminó/
);

console.log('✅ La pausa de generación no corta la respuesta; si no se confirma el final, la tarea falla de forma explícita.');
