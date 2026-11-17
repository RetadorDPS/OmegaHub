// Genera el plano de prueba (vivienda en L, distinta de Casa Mirador) como
// PDF y PNG en public/ejemplos/. Es un dibujo original de este proyecto.
//   node scripts/generar-plano-ejemplo.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launch } from './lib/browser.mjs';
import { PLANO } from './lib/plano-ejemplo.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ejemplos');
const { W, H, S, OX, OY } = PLANO;
const X = (m) => OX + m * S;
const Y = (m) => OY + m * S;
const T = 0.2 * S;

const wall = (ax, ay, bx, by, t = T) =>
  `<line x1="${X(ax)}" y1="${Y(ay)}" x2="${X(bx)}" y2="${Y(by)}" stroke="#111" stroke-width="${t}" stroke-linecap="square"/>`;
const gapH = (x0, x1, y, t = T) => `<rect x="${X(x0)}" y="${Y(y) - t / 2 - 1}" width="${(x1 - x0) * S}" height="${t + 2}" fill="#fff"/>`;
const gapV = (x, y0, y1, t = T) => `<rect x="${X(x) - t / 2 - 1}" y="${Y(y0)}" width="${t + 2}" height="${(y1 - y0) * S}" fill="#fff"/>`;
const winH = (x0, x1, y) =>
  gapH(x0, x1, y) +
  `<rect x="${X(x0)}" y="${Y(y) - T / 2}" width="${(x1 - x0) * S}" height="${T}" fill="none" stroke="#111" stroke-width="1.5"/><line x1="${X(x0)}" y1="${Y(y)}" x2="${X(x1)}" y2="${Y(y)}" stroke="#111" stroke-width="1.5"/>`;
const winV = (x, y0, y1) =>
  gapV(x, y0, y1) +
  `<rect x="${X(x) - T / 2}" y="${Y(y0)}" width="${T}" height="${(y1 - y0) * S}" fill="none" stroke="#111" stroke-width="1.5"/><line x1="${X(x)}" y1="${Y(y0)}" x2="${X(x)}" y2="${Y(y1)}" stroke="#111" stroke-width="1.5"/>`;
const tick = (x, y) => `<line x1="${x - 7}" y1="${y + 7}" x2="${x + 7}" y2="${y - 7}" stroke="#b4472f" stroke-width="2"/>`;
const dimH = (x0, x1, y, text) =>
  `<line x1="${X(x0)}" y1="${y}" x2="${X(x1)}" y2="${y}" stroke="#b4472f" stroke-width="1.2"/>${tick(X(x0), y)}${tick(X(x1), y)}<text x="${(X(x0) + X(x1)) / 2}" y="${y - 9}" text-anchor="middle" class="dim">${text}</text>`;
const dimV = (x, y0, y1, text, bold = false) =>
  `<line x1="${x}" y1="${Y(y0)}" x2="${x}" y2="${Y(y1)}" stroke="#b4472f" stroke-width="${bold ? 2.2 : 1.2}"/>${tick(x, Y(y0))}${tick(x, Y(y1))}<text x="${x + 14}" y="${(Y(y0) + Y(y1)) / 2}" class="dim${bold ? ' ref' : ''}" transform="rotate(90 ${x + 14} ${(Y(y0) + Y(y1)) / 2})" text-anchor="middle">${text}</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font-family: Helvetica, Arial, sans-serif; fill: #111; }
  .dim { font-size: 17px; fill: #b4472f; }
  .ref { font-weight: 700; font-size: 18px; }
  .room { font-size: 19px; letter-spacing: 2px; }
  .title { font-size: 22px; font-weight: 700; }
  .note { font-size: 14px; fill: #555; }
</style>
<rect width="${W}" height="${H}" fill="#fff"/>
<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#111" stroke-width="1.5"/>
<!-- Perímetro en L: 8 × 7 m con el ala inferior de 4 m de ancho -->
${wall(0, 0, 8, 0)}${wall(8, 0, 8, 4)}${wall(8, 4, 4, 4)}${wall(4, 4, 4, 7)}${wall(4, 7, 0, 7)}${wall(0, 7, 0, 0)}
<!-- Tabique interior de 4 m con puerta centrada -->
${wall(4, 0, 4, 4, 0.1 * S)}
${gapV(4, 1.55, 2.45, 0.1 * S)}
<line x1="${X(4)}" y1="${Y(1.55)}" x2="${X(4.9)}" y2="${Y(1.55)}" stroke="#111" stroke-width="1.5"/>
<path d="M ${X(4)} ${Y(2.45)} A ${0.9 * S} ${0.9 * S} 0 0 0 ${X(4.9)} ${Y(1.55)}" fill="none" stroke="#111" stroke-width="1" stroke-dasharray="4 3"/>
<!-- Puerta de entrada y ventanas -->
${gapH(1.5, 2.5, 7)}
<line x1="${X(1.5)}" y1="${Y(7)}" x2="${X(1.5)}" y2="${Y(6)}" stroke="#111" stroke-width="1.5"/>
<path d="M ${X(2.5)} ${Y(7)} A ${S} ${S} 0 0 0 ${X(1.5)} ${Y(6)}" fill="none" stroke="#111" stroke-width="1" stroke-dasharray="4 3"/>
${winH(1.2, 2.8, 0)}${winH(5.2, 6.8, 0)}${winV(0, 4.6, 6.0)}${winV(8, 1.2, 2.8)}
<text x="${X(2)}" y="${Y(2.1)}" text-anchor="middle" class="room">SALÓN</text>
<text x="${X(6)}" y="${Y(3.1)}" text-anchor="middle" class="room">COCINA</text>
<text x="${X(2)}" y="${Y(5.4)}" text-anchor="middle" class="room">DORMITORIO</text>
${dimH(0, 8, OY - 46, '8,00')}
${dimV(X(8) + 52, 0, 4, 'REFERENCIA DE ESCALA · 4,00 m', true)}
${dimV(OX - 60, 0, 7, '7,00')}
${dimH(0, 4, Y(7) + 52, '4,00')}
<text x="40" y="${H - 62}" class="title">Vivienda en L · planta única</text>
<text x="40" y="${H - 40}" class="note">Plano de prueba de Studio Sección. Cotas en metros a ejes de muro. Muros exteriores 0,20 m · tabique 0,10 m.</text>
</svg>`;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: join(out, 'plano-en-L.png'), clip: { x: 0, y: 0, width: W, height: H } });
await page.pdf({ path: join(out, 'plano-en-L.pdf'), width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: '1' });
await browser.close();
console.log('Plano de ejemplo generado en', out);
