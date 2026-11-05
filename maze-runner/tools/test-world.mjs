/* Prueba de humo de la generación procedural (sin DOM).
   Uso: node tools/test-world.mjs  */
import { World, T, FL } from '../src/world.js';

function bfsReach(w, f, sx, sy) {
  const W = w.W, H = w.H;
  const seen = new Uint8Array(W * H);
  const q = [(sy | 0) * W + (sx | 0)];
  seen[q[0]] = 1;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const x = cur % W, y = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (seen[ni] || w.isBlocked(f, nx, ny)) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return seen;
}

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('  ✗ ' + msg); } };

for (const seed of [1, 42, 20261105, 777777, 999999, 123456789]) {
  const w = new World(seed);
  console.log(`\nSemilla ${seed}: ${w.W}x${w.H} · puertas=${w.doors.length} · escotillas=${w.hatches.length} · salida=(${w.exit.x},${w.exit.y}) sector ${w.exit.region}`);

  check(w.doors.length === 12, 'debería haber 12 puertas');
  check(w.hatches.length === 3, 'debería haber 3 escotillas');
  check(!w.isBlocked(FL.SURFACE, Math.floor(w.spawn.x), Math.floor(w.spawn.y)), 'spawn bloqueado');

  const reach = bfsReach(w, FL.SURFACE, w.spawn.x, w.spawn.y);
  check(!!reach[w.exit.y * w.W + w.exit.x], 'la salida no es alcanzable desde el spawn');

  let hOK = 0;
  for (const h of w.hatches) if (reach[h.y * w.W + h.x]) hOK++;
  check(hOK >= 1, 'ninguna escotilla alcanzable en superficie');

  if (w.hatches.length > 1) {
    const r2 = bfsReach(w, FL.UNDER, w.hatches[0].x, w.hatches[0].y);
    let ok = 0;
    for (const h of w.hatches) if (r2[h.y * w.W + h.x]) ok++;
    check(ok === w.hatches.length, `subsuelo: ${ok}/${w.hatches.length} escotillas conectadas entre sí`);
  }

  for (let s = 1; s <= 8; s++) {
    const cells = w.cellsByRegion[FL.SURFACE][s] || [];
    const inside = cells.filter((i) => reach[i]).length;
    check(cells.length > 0, `sector ${s}: sin celdas de suelo`);
    check(inside > cells.length * 0.5, `sector ${s}: sólo ${inside}/${cells.length} celdas alcanzables desde el spawn`);
  }

  for (const d of w.doors) {
    const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !w.isBlocked(FL.SURFACE, d.x + dx, d.y + dy)).length;
    check(free >= 2, `puerta ${d.id} (${d.x},${d.y}) sin conexión en ambos lados (libres: ${free})`);
  }

  // campo de flujo: comprueba que guía correctamente hacia el jugador
  // (radio grande para que el camino por el laberinto quepa, no sólo la línea recta)
  const flowRadius = w.W + w.H;
  w.computeFlow(FL.SURFACE, w.spawn.x, w.spawn.y, flowRadius);
  const exitCell = { x: w.exit.x + 0.5, y: w.exit.y + 0.5 };
  let steps = 0, x = exitCell.x, y = exitCell.y;
  while (Math.hypot(x - w.spawn.x, y - w.spawn.y) > 1 && steps < flowRadius + 10) {
    const step = w.nextFlowStep(FL.SURFACE, x, y);
    if (!step) break;
    x = step.x; y = step.y; steps++;
  }
  check(steps > 0 && Math.hypot(x - w.spawn.x, y - w.spawn.y) <= 1, 'el campo de flujo no guía desde la salida hasta el jugador');
}

console.log(fails === 0 ? '\n✅ Todas las comprobaciones OK' : `\n❌ ${fails} fallos`);
process.exit(fails ? 1 : 0);
