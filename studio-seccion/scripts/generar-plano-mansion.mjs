// Genera el plano de prueba de una mansión de una planta (PDF y PNG) en
// public/ejemplos/. Dibujo original de este proyecto.
//   node scripts/generar-plano-mansion.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launch } from './lib/browser.mjs';
import { ESTANCIAS, HUECOS, MUROS } from './lib/plano-mansion.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ejemplos');
const S = 42; // píxeles por metro
const OX = 170;
const OY = 190;
const W = Math.round(OX + 28 * S + 230);
const H = Math.round(OY + 18 * S + 260);
const X = (m) => OX + m * S;
const Y = (m) => OY + m * S;

const muro = Object.fromEntries(MUROS.map(([id, ax, ay, bx, by, t]) => [id, { ax, ay, bx, by, t }]));
const dir = (w) => {
  const L = Math.hypot(w.bx - w.ax, w.by - w.ay);
  return { dx: (w.bx - w.ax) / L, dy: (w.by - w.ay) / L, L };
};
const fmt = (n) => n.toFixed(2).replace('.', ',');

let svg = '';
// Patio y piscina (informativo, no se traza).
svg += `<rect x="${X(10.15)}" y="${Y(10.15)}" width="${7.7 * S}" height="${7.85 * S}" fill="#eef3ee"/>`;
svg += `<rect x="${X(11.5)}" y="${Y(12.2)}" width="${5 * S}" height="${4.6 * S}" fill="#d6ecf4" stroke="#5b8ea3" stroke-width="2"/>`;
svg += `<text x="${X(14)}" y="${Y(11.3)}" class="room">PATIO</text><text x="${X(14)}" y="${Y(14.7)}" class="small">piscina</text>`;
// Muros.
for (const [, ax, ay, bx, by, t] of MUROS) {
  svg += `<line x1="${X(ax)}" y1="${Y(ay)}" x2="${X(bx)}" y2="${Y(by)}" stroke="#111" stroke-width="${t * S}" stroke-linecap="square"/>`;
}
// Huecos: se abre el muro y se dibuja la carpintería.
for (const [id, tipo, off, ancho] of HUECOS) {
  const w = muro[id];
  const { dx, dy } = dir(w);
  const nx = -dy;
  const ny = dx;
  const t = w.t * S + 2;
  const c = { x: w.ax + dx * off, y: w.ay + dy * off };
  const p0 = { x: c.x - (dx * ancho) / 2, y: c.y - (dy * ancho) / 2 };
  const p1 = { x: c.x + (dx * ancho) / 2, y: c.y + (dy * ancho) / 2 };
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  svg += `<g transform="translate(${X(c.x)} ${Y(c.y)}) rotate(${ang})"><rect x="${(-ancho * S) / 2}" y="${-t / 2}" width="${ancho * S}" height="${t}" fill="#fff"/></g>`;
  if (tipo === 'ventana') {
    svg += `<g transform="translate(${X(c.x)} ${Y(c.y)}) rotate(${ang})"><rect x="${(-ancho * S) / 2}" y="${-t / 2 + 1}" width="${ancho * S}" height="${t - 2}" fill="none" stroke="#111" stroke-width="1.3"/><line x1="${(-ancho * S) / 2}" y1="0" x2="${(ancho * S) / 2}" y2="0" stroke="#111" stroke-width="1.3"/></g>`;
  } else if (ancho <= 1.6) {
    // Puerta batiente: hoja y arco hacia el lado izquierdo del muro.
    const r = ancho * S;
    const hx = X(p0.x);
    const hy = Y(p0.y);
    const ex = hx + nx * r;
    const ey = hy + ny * r;
    svg += `<line x1="${hx}" y1="${hy}" x2="${ex}" y2="${ey}" stroke="#111" stroke-width="1.5"/>`;
    const sweep = dx * ny - dy * nx > 0 ? 1 : 0;
    svg += `<path d="M ${X(p1.x)} ${Y(p1.y)} A ${r} ${r} 0 0 ${sweep} ${ex} ${ey}" fill="none" stroke="#111" stroke-width="1" stroke-dasharray="4 3"/>`;
  } else {
    // Paso amplio o corredera: dos líneas finas.
    svg += `<line x1="${X(p0.x)}" y1="${Y(p0.y)}" x2="${X(p1.x)}" y2="${Y(p1.y)}" stroke="#111" stroke-width="1" stroke-dasharray="6 4"/>`;
  }
}
// Rótulos con superficie aproximada.
const AREAS = { Vestíbulo: 32, Aseo: 7.5, Cocina: 50, 'Sala familiar': 50, Comedor: 40, Salón: 100, 'Dormitorio principal': 56, 'Baño principal': 24, 'Dormitorio 2': 40, 'Dormitorio 3': 40 };
for (const [name, x, y] of ESTANCIAS) {
  // En estancias estrechas el nombre se parte en dos líneas.
  const lines = name === 'Baño principal' ? ['BAÑO', 'PRINCIPAL'] : [name.toUpperCase()];
  lines.forEach((l, i) => (svg += `<text x="${X(x)}" y="${Y(y) + i * 18}" class="room">${l}</text>`));
  svg += `<text x="${X(x)}" y="${Y(y) + 20 + (lines.length - 1) * 18}" class="small">${fmt(AREAS[name])} m²</text>`;
}
// Cotas.
const tick = (x, y) => `<line x1="${x - 7}" y1="${y + 7}" x2="${x + 7}" y2="${y - 7}" stroke="#b4472f" stroke-width="2"/>`;
const dimH = (x0, x1, y, text) =>
  `<line x1="${X(x0)}" y1="${y}" x2="${X(x1)}" y2="${y}" stroke="#b4472f" stroke-width="1.2"/>${tick(X(x0), y)}${tick(X(x1), y)}<text x="${(X(x0) + X(x1)) / 2}" y="${y - 9}" class="dim">${text}</text>`;
const dimV = (x, y0, y1, text, bold = false) => {
  const cy = (Y(y0) + Y(y1)) / 2;
  return `<line x1="${x}" y1="${Y(y0)}" x2="${x}" y2="${Y(y1)}" stroke="#b4472f" stroke-width="${bold ? 2.4 : 1.2}"/>${tick(x, Y(y0))}${tick(x, Y(y1))}<text x="${x - 14}" y="${cy}" class="dim${bold ? ' ref' : ''}" transform="rotate(-90 ${x - 14} ${cy})">${text}</text>`;
};
svg += dimH(0, 28, OY - 70, '28,00');
svg += dimH(0, 10, OY - 38, '10,00');
svg += dimH(10, 18, OY - 38, '8,00');
svg += dimH(18, 28, OY - 38, '10,00');
svg += dimV(OX - 80, 0, 10, 'REFERENCIA DE ESCALA · 10,00 m', true);
svg += dimV(OX - 40, 0, 18, '18,00');
svg += dimV(X(28) + 60, 0, 10, '10,00');
svg += dimV(X(28) + 60, 10, 18, '8,00');
svg += dimH(10, 18, Y(18) + 50, 'patio 8,00');
// Norte.
svg += `<g transform="translate(${W - 90} ${OY - 40})"><path d="M0 -26 L10 10 L0 2 L-10 10 Z" fill="#111"/><text x="0" y="32" class="small">N</text></g>`;

const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font-family: Helvetica, Arial, sans-serif; fill: #111; text-anchor: middle; }
  .dim { font-size: 16px; fill: #b4472f; }
  .ref { font-weight: 700; font-size: 17px; }
  .room { font-size: 15px; letter-spacing: 1.5px; }
  .small { font-size: 12px; fill: #555; }
  .title { font-size: 24px; font-weight: 700; text-anchor: start; }
  .note { font-size: 13px; fill: #555; text-anchor: start; }
</style>
<rect width="${W}" height="${H}" fill="#fff"/>
<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#111" stroke-width="1.5"/>
${svg}
<text x="40" y="${H - 84}" class="title">Mansión en U con patio · planta única · 440 m²</text>
<text x="40" y="${H - 60}" class="note">Plano de prueba de Studio Sección. Cotas en metros a ejes de muro. Muros exteriores 0,30 m · tabiques 0,15 m · altura libre 2,90 m.</text>
<text x="40" y="${H - 40}" class="note">Para probar: calibra con la cota «REFERENCIA DE ESCALA · 10,00 m» (muro oeste, de la esquina superior al tabique de los dormitorios).</text>
</svg>`;

const browser = await launch();
const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await pg.setContent(`<!doctype html><html><body style="margin:0">${page}</body></html>`);
await pg.screenshot({ path: join(out, 'mansion-en-U.png'), clip: { x: 0, y: 0, width: W, height: H } });
await pg.pdf({ path: join(out, 'mansion-en-U.pdf'), width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: '1' });
await browser.close();
console.log(`Plano de la mansión generado (${W} × ${H} px) en ${out}`);
