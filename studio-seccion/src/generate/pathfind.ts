/**
 * Búsqueda de caminos a pie sobre el mundo de colisiones (A* en rejilla) y
 * simplificación por visibilidad. Sirve para encadenar las estancias de un
 * plano propio en una visita guiada continua que pasa por las puertas.
 */
import type { Vec2 } from '../model/types';
import { firstBlockedPoint, isFree, type CollisionWorld } from './collision';

export interface PathOptions {
  radius: number;
  step?: number;
  /** Rectángulo de búsqueda (metros). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  maxCells?: number;
}

export function findPath(world: CollisionWorld, from: Vec2, to: Vec2, opts: PathOptions): Vec2[] | null {
  const step = opts.step ?? 0.1;
  const { minX, minY, maxX, maxY } = opts.bounds;
  const cols = Math.ceil((maxX - minX) / step) + 1;
  const rows = Math.ceil((maxY - minY) / step) + 1;
  if (cols * rows > (opts.maxCells ?? 400_000)) return null;
  const idx = (c: number, r: number) => r * cols + c;
  const cellOf = (p: Vec2) => ({ c: Math.round((p.x - minX) / step), r: Math.round((p.y - minY) / step) });
  const center = (c: number, r: number): Vec2 => ({ x: minX + c * step, y: minY + r * step });
  const free = new Int8Array(cols * rows); // 0 = sin evaluar, 1 = libre, 2 = ocupado
  const isOpen = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    const i = idx(c, r);
    if (free[i] === 0) free[i] = isFree(center(c, r), world, opts.radius) ? 1 : 2;
    return free[i] === 1;
  };
  const s = cellOf(from);
  const t = cellOf(to);
  if (!isOpen(s.c, s.r) || !isOpen(t.c, t.r)) return null;

  const g = new Float32Array(cols * rows).fill(Infinity);
  const parent = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  // Montículo binario sencillo de (f, índice).
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (c: number, r: number) => Math.hypot(c - t.c, r - t.r);
  const start = idx(s.c, s.r);
  const goal = idx(t.c, t.r);
  g[start] = 0;
  push(h(s.c, s.r), start);
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    if (i === goal) break;
    closed[i] = 1;
    const c = i % cols;
    const r = (i - c) / cols;
    for (const [dc, dr, cost] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isOpen(nc, nr)) continue;
      // Sin cortar esquinas en diagonal.
      if (dc && dr && (!isOpen(c + dc, r) || !isOpen(c, r + dr))) continue;
      const j = idx(nc, nr);
      const ng = g[i] + cost;
      if (ng < g[j]) {
        g[j] = ng;
        parent[j] = i;
        push(ng + h(nc, nr), j);
      }
    }
  }
  if (parent[goal] === -1 && goal !== start) return null;
  const cells: Vec2[] = [];
  for (let i = goal; i !== -1; i = parent[i]) {
    const c = i % cols;
    cells.push(center(c, (i - c) / cols));
  }
  cells.reverse();
  cells[0] = { ...from };
  cells[cells.length - 1] = { ...to };
  return simplify(cells, world, opts.radius);
}

/** Deja solo los puntos necesarios: desde cada punto se salta al más lejano visible. */
export function simplify(path: Vec2[], world: CollisionWorld, radius: number): Vec2[] {
  if (path.length <= 2) return path;
  const out: Vec2[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && firstBlockedPoint([path[i], path[j]], world, radius, 0.05)) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

export const pathLength = (path: Vec2[]): number =>
  path.reduce((s, p, i) => (i ? s + Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) : 0), 0);
