import type { Vec2, Wall } from '../model/types';
import { dist, projectOnSegment, round, segmentIntersection } from '../model/geometry';

export type SnapKind = 'extremo' | 'muro' | 'ortogonal' | 'libre';

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
}

export interface SnapContext {
  walls: Wall[];
  /** Otros puntos imantados (vértices de la losa, inicio de la cadena…). */
  points?: Vec2[];
  /** Punto anterior: activa el bloqueo ortogonal respecto a él. */
  anchor?: Vec2 | null;
  /** Radio de imán en metros (depende del zoom). */
  tolerance: number;
  ignoreWallIds?: string[];
  /** Ángulo máximo, en grados, para enderezar a horizontal o vertical. */
  orthoDegrees?: number;
}

const clean = (p: Vec2): Vec2 => ({ x: round(p.x, 3), y: round(p.y, 3) });

export function snapPoint(raw: Vec2, ctx: SnapContext): SnapResult {
  const walls = ctx.walls.filter((w) => !ctx.ignoreWallIds?.includes(w.id));
  // 1. Extremos de muro y puntos imantados.
  let best: Vec2 | null = null;
  let bestD = ctx.tolerance;
  for (const p of [...walls.flatMap((w) => [w.a, w.b]), ...(ctx.points ?? [])]) {
    const d = dist(p, raw);
    if (d <= bestD) {
      best = p;
      bestD = d;
    }
  }
  if (best) return { point: { ...best }, kind: 'extremo' };

  // 2. Bloqueo ortogonal respecto al punto anterior.
  let ortho: Vec2 | null = null;
  if (ctx.anchor) {
    const dx = raw.x - ctx.anchor.x;
    const dy = raw.y - ctx.anchor.y;
    const tan = Math.tan(((ctx.orthoDegrees ?? 7) * Math.PI) / 180);
    if (Math.abs(dy) <= Math.abs(dx) * tan) ortho = { x: raw.x, y: ctx.anchor.y };
    else if (Math.abs(dx) <= Math.abs(dy) * tan) ortho = { x: ctx.anchor.x, y: raw.y };
  }

  // 3. Cuerpo de un muro (encuentros en T).
  const probe = ortho ?? raw;
  let wallHit: Vec2 | null = null;
  let wallD = ctx.tolerance;
  for (const w of walls) {
    const pr = projectOnSegment(probe, w.a, w.b);
    if (pr.distance > wallD) continue;
    let hit = pr.point;
    if (ortho && ctx.anchor) {
      // Se prolonga la línea ortogonal hasta cortar el muro: el encuentro queda exacto.
      const dir = { x: ortho.x - ctx.anchor.x, y: ortho.y - ctx.anchor.y };
      const far = { x: ctx.anchor.x + dir.x * 4, y: ctx.anchor.y + dir.y * 4 };
      const cut = segmentIntersection(ctx.anchor, far, w.a, w.b);
      if (cut && dist(cut, probe) <= ctx.tolerance * 1.5) hit = cut;
    }
    wallHit = hit;
    wallD = pr.distance;
  }
  if (wallHit) return { point: clean(wallHit), kind: 'muro' };
  if (ortho) return { point: clean(ortho), kind: 'ortogonal' };
  return { point: clean(raw), kind: 'libre' };
}
