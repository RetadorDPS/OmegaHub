import type { Vec2, Wall } from './types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x - q.x, y: p.y - q.y });
export const scale = (p: Vec2, k: number): Vec2 => ({ x: p.x * k, y: p.y * k });
export const dot = (p: Vec2, q: Vec2): number => p.x * q.x + p.y * q.y;
export const cross = (p: Vec2, q: Vec2): number => p.x * q.y - p.y * q.x;
export const len = (p: Vec2): number => Math.hypot(p.x, p.y);
export const dist = (p: Vec2, q: Vec2): number => Math.hypot(p.x - q.x, p.y - q.y);
export const lerp = (p: Vec2, q: Vec2, t: number): Vec2 => ({
  x: p.x + (q.x - p.x) * t,
  y: p.y + (q.y - p.y) * t,
});
export const normalize = (p: Vec2): Vec2 => {
  const l = len(p);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: p.x / l, y: p.y / l };
};
/** Normal a la izquierda del sentido de avance (en planta con y hacia abajo). */
export const leftNormal = (d: Vec2): Vec2 => ({ x: -d.y, y: d.x });

export const wallLength = (w: Wall): number => dist(w.a, w.b);
export const wallDir = (w: Wall): Vec2 => normalize(sub(w.b, w.a));
export const pointOnWall = (w: Wall, offset: number): Vec2 => add(w.a, scale(wallDir(w), offset));

/** Proyección de `p` sobre el segmento ab: parámetro acotado, punto y distancia. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const tRaw = l2 < 1e-12 ? 0 : dot(sub(p, a), ab) / l2;
  const t = Math.max(0, Math.min(1, tRaw));
  const point = add(a, scale(ab, t));
  return { t, tRaw, point, distance: dist(p, point), along: t * Math.sqrt(l2) };
}

/** Intersección propia de dos segmentos (se cruzan en un punto interior de ambos). */
export function segmentsCross(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2, eps = 1e-9): boolean {
  const d1 = cross(sub(p2, p1), sub(q1, p1));
  const d2 = cross(sub(p2, p1), sub(q2, p1));
  const d3 = cross(sub(q2, q1), sub(p1, q1));
  const d4 = cross(sub(q2, q1), sub(p2, q1));
  return (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  );
}

/** Punto de intersección de dos segmentos, o null si no se cortan. */
export function segmentIntersection(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): Vec2 | null {
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(q1, p1), s) / den;
  const u = cross(sub(q1, p1), r) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return add(p1, scale(r, t));
}

/** Área con signo (fórmula del cordón). */
export function signedArea(points: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (points: Vec2[]): number => Math.abs(signedArea(points));

/**
 * Un contorno es inválido si dos lados no adyacentes se cruzan, si dos vértices
 * coinciden o si un vértice cae sobre un lado ajeno.
 */
export function isSelfIntersecting(points: Vec2[]): boolean {
  const n = points.length;
  if (n < 4) {
    if (n < 3) return false;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dist(points[i], points[j]) < 1e-6) return true;
    }
  }
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsCross(a1, a2, b1, b2)) return true;
      // Vértice apoyado sobre un lado no adyacente (contacto en T).
      if (projectOnSegment(b1, a1, a2).distance < 1e-6) return true;
      if (projectOnSegment(a1, b1, b2).distance < 1e-6) return true;
    }
  }
  return false;
}

export function pointInPolygon(p: Vec2, points: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const hit =
      pi.y > p.y !== pj.y > p.y && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (hit) inside = !inside;
  }
  return inside;
}

export function distanceToPolygonEdge(p: Vec2, points: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    best = Math.min(best, projectOnSegment(p, points[i], points[(i + 1) % points.length]).distance);
  }
  return best;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: Vec2[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Propone un contorno cerrado a partir de los muros: une extremos coincidentes,
 * descarta ramas sueltas y recorre la cara exterior del grafo. Devuelve null si
 * los muros no cierran ningún perímetro. El resultado es solo una PROPUESTA que
 * el usuario debe validar.
 */
export function proposeOutlineFromWalls(walls: Wall[], tolerance = 0.03): Vec2[] | null {
  const nodes: Vec2[] = [];
  const nodeOf = (p: Vec2): number => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= tolerance) return i;
    nodes.push({ ...p });
    return nodes.length - 1;
  };
  // Los encuentros en T también parten el muro receptor para que el grafo conecte.
  const raw = walls.filter((w) => wallLength(w) > tolerance);
  const ends = raw.flatMap((w) => [w.a, w.b]);
  const edges = new Set<string>();
  const adj = new Map<number, Set<number>>();
  const link = (i: number, j: number) => {
    if (i === j) return;
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (edges.has(key)) return;
    edges.add(key);
    if (!adj.has(i)) adj.set(i, new Set());
    if (!adj.has(j)) adj.set(j, new Set());
    adj.get(i)!.add(j);
    adj.get(j)!.add(i);
  };
  for (const w of raw) {
    const cuts = ends
      .map((p) => projectOnSegment(p, w.a, w.b))
      .filter((pr) => pr.distance <= tolerance)
      .sort((p, q) => p.t - q.t);
    let prev = nodeOf(w.a);
    for (const c of cuts) {
      const idx = nodeOf(c.point);
      link(prev, idx);
      prev = idx;
    }
    link(prev, nodeOf(w.b));
  }
  // Poda de ramas que no forman ciclo.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [i, set] of adj) {
      if (set.size === 1) {
        const [j] = set;
        adj.get(j)!.delete(i);
        adj.delete(i);
        pruned = true;
      } else if (set.size === 0) {
        adj.delete(i);
        pruned = true;
      }
    }
  }
  if (adj.size < 3) return null;
  // Arranque en el nodo más a la izquierda (y más arriba): pertenece a la cara exterior.
  let start = -1;
  for (const i of adj.keys()) {
    if (
      start < 0 ||
      nodes[i].x < nodes[start].x - 1e-9 ||
      (Math.abs(nodes[i].x - nodes[start].x) < 1e-9 && nodes[i].y < nodes[start].y)
    ) {
      start = i;
    }
  }
  const angle = (from: number, to: number) =>
    Math.atan2(nodes[to].y - nodes[from].y, nodes[to].x - nodes[from].x);
  // Primer paso: desde una dirección ficticia «hacia arriba», giro más cerrado.
  const pickNext = (prev: number | null, cur: number): number | null => {
    const inAngle = prev === null ? -Math.PI / 2 : angle(prev, cur);
    let best: number | null = null;
    let bestTurn = Infinity;
    for (const n of adj.get(cur)!) {
      if (n === prev && adj.get(cur)!.size > 1) continue;
      let turn = angle(cur, n) - inAngle;
      while (turn <= -Math.PI) turn += 2 * Math.PI;
      while (turn > Math.PI) turn -= 2 * Math.PI;
      // Se elige siempre el giro más a la izquierda (más negativo con y hacia abajo).
      if (turn < bestTurn) {
        bestTurn = turn;
        best = n;
      }
    }
    return best;
  };
  const loop: number[] = [start];
  let prev: number | null = null;
  let cur = start;
  for (let guard = 0; guard < adj.size * 4 + 8; guard++) {
    const next = pickNext(prev, cur);
    if (next === null) return null;
    if (next === start) break;
    if (loop.includes(next)) return null;
    loop.push(next);
    prev = cur;
    cur = next;
  }
  if (loop.length < 3) return null;
  const outline = simplifyCollinear(loop.map((i) => ({ ...nodes[i] })));
  if (outline.length < 3 || isSelfIntersecting(outline)) return null;
  return outline;
}

/** Elimina vértices alineados con sus vecinos. */
export function simplifyCollinear(points: Vec2[], eps = 1e-4): Vec2[] {
  if (points.length <= 3) return points;
  const out: Vec2[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[(i + n - 1) % n];
    const c = points[i];
    const q = points[(i + 1) % n];
    const area = Math.abs(cross(sub(c, p), sub(q, c)));
    if (area > eps) out.push(c);
  }
  return out.length >= 3 ? out : points;
}

export const round = (value: number, decimals = 3): number => {
  const k = 10 ** decimals;
  return Math.round(value * k) / k;
};

/** Formato de cota en español: 4,00 m. */
export const formatMeters = (m: number, decimals = 2): string =>
  `${m.toFixed(decimals).replace('.', ',')} m`;
