/**
 * Generación paramétrica de muros.
 *
 * Un muro con huecos NO se pinta: se parte en piezas macizas. Entre huecos
 * quedan tramos de altura completa; sobre cada hueco un dintel y, en ventanas,
 * un antepecho debajo. El visor dibuja estas piezas y el motor de colisiones
 * usa exactamente los mismos intervalos.
 */
import { DEFAULTS, type Opening, type Project, type Vec2, type Wall } from '../model/types';
import {
  add,
  dist,
  leftNormal,
  pointInPolygon,
  projectOnSegment,
  scale,
  wallDir,
  wallLength,
} from '../model/geometry';
import { openingSpan } from '../model/project';

export type PieceKind = 'solid' | 'lintel' | 'sill';

/** Pieza maciza en coordenadas locales del muro: u a lo largo del eje, y en altura. */
export interface WallPiece {
  wallId: string;
  kind: PieceKind;
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  openingId?: string;
}

export interface WallLayout {
  wall: Wall;
  length: number;
  dir: Vec2;
  /** Prolongación en cada extremo para macizar las esquinas. */
  extA: number;
  extB: number;
  /** Huecos válidos, ordenados. Los inválidos se ignoran (los señala la validación). */
  openings: Opening[];
  pieces: WallPiece[];
  /** Qué hay a cada lado del muro: +n es la normal izquierda. */
  sidePlus: 'interior' | 'exterior';
  sideMinus: 'interior' | 'exterior';
}

export function isOpeningValid(wall: Wall, o: Opening, others: Opening[]): boolean {
  const L = wallLength(wall);
  const [u0, u1] = openingSpan(o);
  const m = DEFAULTS.openingMargin - 1e-6;
  if (o.width <= 0.05 || o.height <= 0.05) return false;
  if (u0 < m || u1 > L - m) return false;
  if (o.sill < 0 || o.sill + o.height > wall.height + 1e-6) return false;
  for (const other of others) {
    if (other.id === o.id || other.wallId !== o.wallId) continue;
    const [v0, v1] = openingSpan(other);
    if (u0 < v1 - 1e-6 && v0 < u1 - 1e-6) return false;
  }
  return true;
}

/** Cuánto prolongar un extremo para rellenar la esquina con otro muro. */
function endExtension(wall: Wall, end: Vec2, walls: Wall[]): number {
  let ext = 0;
  const d = wallDir(wall);
  for (const other of walls) {
    if (other.id === wall.id) continue;
    const touches = dist(other.a, end) < 0.02 || dist(other.b, end) < 0.02;
    if (!touches) continue;
    const od = wallDir(other);
    // Muros en prolongación recta no necesitan relleno.
    const sin = Math.abs(d.x * od.y - d.y * od.x);
    if (sin < 0.2) continue;
    ext = Math.max(ext, other.thickness / 2);
  }
  return ext;
}

export function layoutWall(wall: Wall, project: Pick<Project, 'walls' | 'openings' | 'slab'>): WallLayout {
  const length = wallLength(wall);
  const dir = wallDir(wall);
  const extA = endExtension(wall, wall.a, project.walls);
  const extB = endExtension(wall, wall.b, project.walls);
  const mine = project.openings.filter((o) => o.wallId === wall.id);
  // Se aceptan por orden: un hueco que pisa a otro ya aceptado se descarta.
  const accepted: Opening[] = [];
  for (const o of [...mine].sort((p, q) => p.offset - q.offset)) {
    if (isOpeningValid(wall, o, accepted)) accepted.push(o);
  }
  const pieces: WallPiece[] = [];
  let cursor = -extA;
  for (const o of accepted) {
    const [u0, u1] = openingSpan(o);
    if (u0 - cursor > 1e-4) {
      pieces.push({ wallId: wall.id, kind: 'solid', u0: cursor, u1: u0, y0: 0, y1: wall.height });
    }
    if (o.sill > 1e-4) {
      pieces.push({ wallId: wall.id, kind: 'sill', u0, u1, y0: 0, y1: o.sill, openingId: o.id });
    }
    const top = o.sill + o.height;
    if (wall.height - top > 1e-4) {
      pieces.push({ wallId: wall.id, kind: 'lintel', u0, u1, y0: top, y1: wall.height, openingId: o.id });
    }
    cursor = u1;
  }
  if (length + extB - cursor > 1e-4) {
    pieces.push({ wallId: wall.id, kind: 'solid', u0: cursor, u1: length + extB, y0: 0, y1: wall.height });
  }
  const n = leftNormal(dir);
  const mid = add(wall.a, scale(dir, length / 2));
  const probe = wall.thickness / 2 + 0.15;
  const outline = project.slab && project.slab.points.length >= 3 ? project.slab.points : null;
  const inside = (p: Vec2) => (outline ? pointInPolygon(p, outline) : false);
  return {
    wall,
    length,
    dir,
    extA,
    extB,
    openings: accepted,
    pieces,
    sidePlus: inside(add(mid, scale(n, probe))) ? 'interior' : 'exterior',
    sideMinus: inside(add(mid, scale(n, -probe))) ? 'interior' : 'exterior',
  };
}

export const layoutWalls = (project: Pick<Project, 'walls' | 'openings' | 'slab'>): WallLayout[] =>
  project.walls.filter((w) => wallLength(w) > 0.05).map((w) => layoutWall(w, project));

/** Caja lista para dibujar: centro y tamaño en 3D (x, altura, z) y giro en Y. */
export interface Box3 {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
}

export const wallRotationY = (dir: Vec2): number => -Math.atan2(dir.y, dir.x);

export function pieceToBox(layout: WallLayout, piece: WallPiece): Box3 {
  const { wall, dir } = layout;
  const c = add(wall.a, scale(dir, (piece.u0 + piece.u1) / 2));
  return {
    cx: c.x,
    cy: (piece.y0 + piece.y1) / 2,
    cz: c.y,
    sx: piece.u1 - piece.u0,
    sy: piece.y1 - piece.y0,
    sz: wall.thickness,
    rotY: wallRotationY(dir),
  };
}

/** Longitud útil de cada muro tal y como se genera en 3D (para comparar cotas). */
export const generatedWallLength = (layout: WallLayout): number => layout.length;

/** Muro más cercano a un punto y posición sobre su eje. */
export function nearestWall(
  walls: Wall[],
  p: Vec2,
  maxDistance: number,
): { wall: Wall; along: number; distance: number } | null {
  let best: { wall: Wall; along: number; distance: number } | null = null;
  for (const wall of walls) {
    const pr = projectOnSegment(p, wall.a, wall.b);
    const d = Math.max(0, pr.distance - wall.thickness / 2);
    if (d <= maxDistance && (!best || d < best.distance)) {
      best = { wall, along: pr.along, distance: d };
    }
  }
  return best;
}
