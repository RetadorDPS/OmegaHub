import {
  DEFAULT_PRESENTATION,
  DEFAULTS,
  SCHEMA_VERSION,
  type GeometrySnapshot,
  type Opening,
  type OpeningKind,
  type Project,
  type Vec2,
  type Wall,
} from './types';
import { dist, wallLength } from './geometry';

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export const DEFAULT_FINISHES = {
  interiorWall: 'blanco-roto',
  exteriorWall: 'revoco-marfil',
  floor: 'roble',
} as const;

export function createProject(name: string): Project {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('proj'),
    name: name.trim() || 'Proyecto sin título',
    createdAt: now,
    updatedAt: now,
    units: 'm',
    plan: null,
    calibration: null,
    planOpacity: 0.7,
    walls: [],
    openings: [],
    slab: null,
    rooms: [],
    finishes: { ...DEFAULT_FINISHES },
    presentation: { ...DEFAULT_PRESENTATION },
  };
}

export function makeWall(a: Vec2, b: Vec2, partial: Partial<Wall> = {}): Wall {
  return {
    id: newId('w'),
    a: { ...a },
    b: { ...b },
    thickness: DEFAULTS.wallThickness,
    height: DEFAULTS.wallHeight,
    ...partial,
  };
}

export function makeOpening(
  wallId: string,
  kind: OpeningKind,
  offset: number,
  partial: Partial<Opening> = {},
): Opening {
  const base = kind === 'door' ? DEFAULTS.door : DEFAULTS.window;
  return {
    id: newId(kind === 'door' ? 'd' : 'v'),
    wallId,
    kind,
    offset,
    width: base.width,
    height: base.height,
    sill: base.sill,
    ...(kind === 'door' ? { leaf: 'swing' as const } : {}),
    ...partial,
  };
}

export const snapshotOf = (p: Project): GeometrySnapshot => ({
  calibration: p.calibration,
  walls: p.walls,
  openings: p.openings,
  slab: p.slab,
  rooms: p.rooms,
});

/** Intervalo [u0, u1] del hueco sobre el eje del muro. */
export const openingSpan = (o: Opening): [number, number] => [
  o.offset - o.width / 2,
  o.offset + o.width / 2,
];

/**
 * Busca un centro válido para un hueco de ancho `width` cerca de `desired`,
 * sin salirse del muro ni pisar otros huecos. Devuelve null si no cabe.
 */
export function fitOpeningOffset(
  wall: Wall,
  openings: Opening[],
  desired: number,
  width: number,
  ignoreId?: string,
): number | null {
  const L = wallLength(wall);
  const m = DEFAULTS.openingMargin;
  if (width + 2 * m > L) return null;
  const blocked = openings
    .filter((o) => o.wallId === wall.id && o.id !== ignoreId)
    .map(openingSpan)
    .sort((p, q) => p[0] - q[0]);
  // Tramos libres para el CENTRO del hueco.
  const free: [number, number][] = [];
  let cursor: number = m;
  for (const [u0, u1] of blocked) {
    const hi = u0 - m - width / 2;
    const lo = cursor + width / 2;
    if (hi >= lo - 1e-9) free.push([lo, hi]);
    cursor = Math.max(cursor, u1 + m);
  }
  const lo = cursor + width / 2;
  const hi = L - m - width / 2;
  if (hi >= lo - 1e-9) free.push([lo, hi]);
  if (free.length === 0) return null;
  let best: number | null = null;
  for (const [a, b] of free) {
    const c = Math.max(a, Math.min(b, desired));
    if (best === null || Math.abs(c - desired) < Math.abs(best - desired)) best = c;
  }
  return best;
}

/**
 * Recalibrar cambia la relación píxel→metro. La geometría ya trazada se
 * reescala en planta para que siga encima del mismo dibujo; espesores y
 * alturas, que el usuario introdujo en metros, no se tocan.
 */
export function rescalePlanGeometry(g: GeometrySnapshot, factor: number): GeometrySnapshot {
  const s = (p: Vec2): Vec2 => ({ x: p.x * factor, y: p.y * factor });
  return {
    calibration: g.calibration,
    walls: g.walls.map((w) => ({ ...w, a: s(w.a), b: s(w.b) })),
    openings: g.openings.map((o) => ({ ...o, offset: o.offset * factor })),
    slab: g.slab ? { ...g.slab, points: g.slab.points.map(s) } : null,
    rooms: g.rooms.map((r) => ({ ...r, camera: s(r.camera) })),
  };
}

/** Extremos de otros muros que coinciden con `p` (para mover esquinas unidas). */
export function coincidentEnds(
  walls: Wall[],
  p: Vec2,
  tolerance = 0.02,
): { wallId: string; end: 'a' | 'b' }[] {
  const out: { wallId: string; end: 'a' | 'b' }[] = [];
  for (const w of walls) {
    if (dist(w.a, p) <= tolerance) out.push({ wallId: w.id, end: 'a' });
    if (dist(w.b, p) <= tolerance) out.push({ wallId: w.id, end: 'b' });
  }
  return out;
}

/**
 * Lee un proyecto guardado y lo lleva al esquema actual. Lanza un error con
 * mensaje legible si el dato no es un proyecto o viene de una versión futura.
 */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new Error('El proyecto guardado está dañado.');
  const p = raw as Partial<Project> & { schemaVersion?: number };
  if (typeof p.schemaVersion !== 'number' || typeof p.id !== 'string') {
    throw new Error('El proyecto guardado no tiene un formato reconocible.');
  }
  if (p.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      'Este proyecto se guardó con una versión más reciente de Studio Sección y no puede abrirse aquí.',
    );
  }
  // v1 es la primera versión: solo se completan campos opcionales ausentes.
  return {
    schemaVersion: SCHEMA_VERSION,
    id: p.id,
    name: typeof p.name === 'string' ? p.name : 'Proyecto sin título',
    createdAt: p.createdAt ?? Date.now(),
    updatedAt: p.updatedAt ?? Date.now(),
    units: 'm',
    plan: p.plan ?? null,
    calibration: p.calibration ?? null,
    planOpacity: typeof p.planOpacity === 'number' ? p.planOpacity : 0.7,
    walls: Array.isArray(p.walls) ? p.walls : [],
    openings: Array.isArray(p.openings) ? p.openings : [],
    slab: p.slab ?? null,
    rooms: Array.isArray(p.rooms) ? p.rooms : [],
    finishes: { ...DEFAULT_FINISHES, ...(p.finishes ?? {}) },
    presentation: { ...DEFAULT_PRESENTATION, ...(p.presentation ?? {}) },
  };
}
