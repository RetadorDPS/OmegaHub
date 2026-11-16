/**
 * Colisiones para caminar por un modelo generado.
 *
 * Los obstáculos salen de los mismos intervalos que la geometría: todo el muro
 * bloquea salvo los huecos de PUERTA. Las ventanas (cristal y antepecho)
 * bloquean. El cuerpo de la cámara es un círculo en planta.
 */
import type { Project, Vec2 } from '../model/types';
import { add, dot, leftNormal, pointInPolygon, scale, sub } from '../model/geometry';
import { openingSpan } from '../model/project';
import { layoutWalls, type WallLayout } from './walls';

/** Rectángulo orientado en planta. */
export interface Collider {
  center: Vec2;
  dir: Vec2;
  halfLength: number;
  halfThickness: number;
  /** Solo informativo (depuración y pruebas). */
  source?: string;
}

export interface CollisionWorld {
  colliders: Collider[];
  /** Si existe, la cámara debe permanecer dentro de la unión de estos polígonos. */
  bounds?: Vec2[][];
}

export function collidersFromLayouts(layouts: WallLayout[]): Collider[] {
  const out: Collider[] = [];
  for (const layout of layouts) {
    const { wall, dir, length, extA, extB } = layout;
    const doors = layout.openings.filter((o) => o.kind === 'door').map(openingSpan);
    let cursor = -extA;
    const push = (u0: number, u1: number) => {
      if (u1 - u0 < 1e-4) return;
      out.push({
        center: add(wall.a, scale(dir, (u0 + u1) / 2)),
        dir,
        halfLength: (u1 - u0) / 2,
        halfThickness: wall.thickness / 2,
        source: wall.id,
      });
    };
    for (const [u0, u1] of doors) {
      push(cursor, u0);
      cursor = u1;
    }
    push(cursor, length + extB);
  }
  return out;
}

export const buildCollisionWorld = (
  project: Pick<Project, 'walls' | 'openings' | 'slab'>,
  extra: Collider[] = [],
  bounds?: Vec2[][],
): CollisionWorld => ({
  colliders: [...collidersFromLayouts(layoutWalls(project)), ...extra],
  bounds,
});

/** Rectángulo alineado a ejes como obstáculo (mobiliario de la demo). */
export const rectCollider = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  source?: string,
): Collider => ({
  center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  dir: { x: 1, y: 0 },
  halfLength: (maxX - minX) / 2,
  halfThickness: (maxY - minY) / 2,
  source,
});

/** Vector desde el punto más cercano del rectángulo hasta `p`, y su distancia. */
function closest(c: Collider, p: Vec2) {
  const n = leftNormal(c.dir);
  const rel = sub(p, c.center);
  const lu = dot(rel, c.dir);
  const lv = dot(rel, n);
  const cu = Math.max(-c.halfLength, Math.min(c.halfLength, lu));
  const cv = Math.max(-c.halfThickness, Math.min(c.halfThickness, lv));
  const inside = cu === lu && cv === lv;
  return { n, lu, lv, cu, cv, inside, distance: Math.hypot(lu - cu, lv - cv) };
}

export function distanceToColliders(p: Vec2, colliders: Collider[]): number {
  let best = Infinity;
  for (const c of colliders) {
    const r = closest(c, p);
    best = Math.min(best, r.inside ? 0 : r.distance);
  }
  return best;
}

const insideBounds = (p: Vec2, bounds?: Vec2[][]): boolean =>
  !bounds || bounds.length === 0 || bounds.some((poly) => pointInPolygon(p, poly));

/** ¿Puede estar el cuerpo de radio `radius` en `p`? */
export function isFree(p: Vec2, world: CollisionWorld, radius: number): boolean {
  if (!insideBounds(p, world.bounds)) return false;
  return distanceToColliders(p, world.colliders) >= radius - 1e-6;
}

function pushOut(p: Vec2, world: CollisionWorld, radius: number): Vec2 {
  let cur = p;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const c of world.colliders) {
      const r = closest(c, cur);
      if (r.inside) {
        // Dentro del macizo: se sale por la cara más próxima.
        const du = c.halfLength - Math.abs(r.lu);
        const dv = c.halfThickness - Math.abs(r.lv);
        const out =
          dv <= du
            ? scale(r.n, (Math.sign(r.lv) || 1) * (dv + radius))
            : scale(c.dir, (Math.sign(r.lu) || 1) * (du + radius));
        cur = add(cur, out);
        moved = true;
      } else if (r.distance < radius) {
        const away = add(scale(c.dir, r.lu - r.cu), scale(r.n, r.lv - r.cv));
        const k = (radius - r.distance) / (r.distance || 1);
        cur = add(cur, scale(away, k));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return cur;
}

/**
 * Desplaza el cuerpo de `from` hacia `from + delta` deslizándose por los
 * obstáculos. Avanza en subpasos cortos para no atravesar muros delgados.
 */
export function moveWithCollisions(
  from: Vec2,
  delta: Vec2,
  world: CollisionWorld,
  radius: number,
): Vec2 {
  const distance = Math.hypot(delta.x, delta.y);
  if (distance < 1e-9) return from;
  const maxStep = Math.max(0.02, radius * 0.4);
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const step = scale(delta, 1 / steps);
  let cur = from;
  for (let i = 0; i < steps; i++) {
    const candidate = pushOut(add(cur, step), world, radius);
    if (!insideBounds(candidate, world.bounds)) {
      // Se intenta deslizar por cada eje antes de detenerse.
      const sx = pushOut({ x: cur.x + step.x, y: cur.y }, world, radius);
      const sy = pushOut({ x: cur.x, y: cur.y + step.y }, world, radius);
      if (insideBounds(sx, world.bounds) && isFree(sx, world, radius * 0.98)) cur = sx;
      else if (insideBounds(sy, world.bounds) && isFree(sy, world, radius * 0.98)) cur = sy;
      else break;
      continue;
    }
    // El empuje nunca debe dejar el cuerpo dentro de otro obstáculo.
    if (distanceToColliders(candidate, world.colliders) < radius * 0.9) break;
    cur = candidate;
  }
  return cur;
}

/**
 * Recorre una polilínea comprobando que el cuerpo cabe en todos los puntos.
 * Devuelve el primer punto bloqueado o null si el recorrido es limpio.
 */
export function firstBlockedPoint(
  path: Vec2[],
  world: CollisionWorld,
  radius: number,
  spacing = 0.03,
): Vec2 | null {
  for (let i = 0; i < path.length; i++) {
    if (!isFree(path[i], world, radius)) return path[i];
    if (i === path.length - 1) break;
    const a = path[i];
    const b = path[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
    for (let k = 1; k < n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      if (!isFree(p, world, radius)) return p;
    }
  }
  return null;
}

/** Busca un punto libre cerca de `p` (espiral corta). */
export function nearestFreePoint(p: Vec2, world: CollisionWorld, radius: number): Vec2 | null {
  if (isFree(p, world, radius)) return p;
  for (let r = 0.1; r <= 2.5; r += 0.1) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (isFree(q, world, radius)) return q;
    }
  }
  return null;
}
