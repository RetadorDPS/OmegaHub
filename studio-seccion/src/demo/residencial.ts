/**
 * Residencial Alameda — promoción de viviendas de EJEMPLO para mostrar el uso
 * inmobiliario: un edificio de 6 plantas con 2 pisos por planta (A y B).
 *
 * Cada piso es un `Project` normal (muros, huecos, losa y estancias) y la
 * fachada del edificio se genera a partir de esos mismos pisos repetidos por
 * planta, de modo que las ventanas que se ven desde fuera son las de dentro.
 * Precios, estados y superficies son ficticios.
 */
import { SCHEMA_VERSION, type Opening, type Project, type Wall } from '../model/types';
import { polygonArea } from '../model/geometry';
import { layoutWalls, pieceToBox } from '../generate/walls';
import { openingParts } from '../generate/openings';
import { rectCollider, type Collider } from '../generate/collision';
import { boxPart, cylPart, spherePart, type Layer, type Part } from '../generate/parts';

export const FLOOR_TO_FLOOR = 3.1;
export const FLOORS = 6;
export const FLAT_W = 12;
export const FLAT_D = 8.4;
export const CORE_W = 4;
export const BUILDING_W = FLAT_W * 2 + CORE_W;
const H = 2.7;
const EXT = 0.25;
const INT = 0.12;
export const BALCONY = { x0: 0.6, x1: 5.6, z0: FLAT_D + 0.125, z1: FLAT_D + 1.7 };

const wall = (id: string, ax: number, ay: number, bx: number, by: number, t: number): Wall => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness: t,
  height: H,
});
const op = (id: string, wallId: string, kind: Opening['kind'], offset: number, width: number, height: number, sill: number, leaf?: Opening['leaf']): Opening => ({
  id,
  wallId,
  kind,
  offset,
  width,
  height,
  sill,
  ...(leaf ? { leaf } : {}),
});

/** Piso tipo A (coordenadas locales: x 0–12, z 0–8,4; fachada norte z = 0, sur z = 8,4). */
function flatA(): Project {
  const walls: Wall[] = [
    wall('norte', 0, 0, FLAT_W, 0, EXT),
    wall('medianera', FLAT_W, 0, FLAT_W, FLAT_D, EXT),
    wall('sur', FLAT_W, FLAT_D, 0, FLAT_D, EXT),
    wall('hastial', 0, FLAT_D, 0, 0, EXT),
    wall('t-dorm', 6.2, 0, 6.2, 3.6, INT),
    wall('t-bano', 6.2, 4.8, 6.2, FLAT_D, INT),
    // De este a oeste: las puertas de los dormitorios abren hacia dentro.
    wall('pasillo-n', FLAT_W, 3.6, 6.2, 3.6, INT),
    wall('pasillo-s', 6.2, 4.8, FLAT_W, 4.8, INT),
    wall('t-dorm2', 8.8, 4.8, 8.8, FLAT_D, INT),
  ];
  const openings: Opening[] = [
    op('v-salon-n', 'norte', 'window', 3.0, 3.2, 1.5, 0.9),
    op('v-dorm-n', 'norte', 'window', 9.1, 2.4, 1.5, 0.9),
    op('p-entrada', 'medianera', 'door', 4.2, 1.0, 2.2, 0, 'swing'),
    op('v-dorm2-s', 'sur', 'window', 1.6, 1.6, 1.5, 0.9),
    op('v-bano-s', 'sur', 'window', 4.5, 0.8, 0.8, 1.5),
    op('p-balcon', 'sur', 'door', 9.0, 3.0, 2.4, 0, 'sliding-glass'),
    op('v-hastial', 'hastial', 'window', 4.2, 2.0, 1.5, 0.9),
    op('p-dorm', 'pasillo-n', 'door', 2.6, 0.9, 2.1, 0, 'swing'),
    op('p-bano', 'pasillo-s', 'door', 1.3, 0.8, 2.1, 0, 'swing'),
    op('p-dorm2', 'pasillo-s', 'door', 4.2, 0.9, 2.1, 0, 'swing'),
  ];
  const e = EXT / 2;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'flat-a',
    name: 'Piso tipo A',
    createdAt: 0,
    updatedAt: 0,
    units: 'm',
    plan: null,
    calibration: null,
    planOpacity: 1,
    walls,
    openings,
    slab: {
      closed: true,
      thickness: 0.3,
      points: [
        { x: -e, y: -e },
        { x: FLAT_W + e, y: -e },
        { x: FLAT_W + e, y: FLAT_D + e },
        { x: -e, y: FLAT_D + e },
      ],
    },
    rooms: [
      { id: 'salon', name: 'Salón', camera: { x: 3.0, y: 5.6 } },
      { id: 'cocina', name: 'Cocina', camera: { x: 3.0, y: 1.9 } },
      { id: 'dormitorio', name: 'Dormitorio principal', camera: { x: 9.2, y: 2.4 } },
      { id: 'bano', name: 'Baño', camera: { x: 7.5, y: 6.4 } },
      { id: 'dormitorio-2', name: 'Dormitorio', camera: { x: 10.4, y: 6.0 } },
    ],
    finishes: { interiorWall: 'blanco-roto', exteriorWall: 'revoco-marfil', floor: 'roble' },
    presentation: { furnish: true, roof: true, ambience: 'dusk' },
  };
}

/** El piso B es el A en espejo respecto al núcleo de escaleras. */
function mirror(p: Project): Project {
  const m = (v: { x: number; y: number }) => ({ x: FLAT_W - v.x, y: v.y });
  return {
    ...p,
    id: 'flat-b',
    name: 'Piso tipo B',
    walls: p.walls.map((w) => ({ ...w, a: m(w.a), b: m(w.b) })),
    slab: p.slab ? { ...p.slab, points: p.slab.points.map(m).reverse() } : null,
    rooms: p.rooms.map((r) => ({ ...r, camera: m(r.camera) })),
  };
}

export const FLAT_TYPES = { A: flatA(), B: mirror(flatA()) };
/** Balcón en coordenadas locales del piso (en el B queda en espejo). */
export const balconyRect = (letter: 'A' | 'B') =>
  letter === 'A' ? BALCONY : { ...BALCONY, x0: FLAT_W - BALCONY.x1, x1: FLAT_W - BALCONY.x0 };

export type FlatStatus = 'disponible' | 'reservado' | 'vendido';

export interface FlatUnit {
  id: string;
  floor: number;
  letter: 'A' | 'B';
  label: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  orientation: string;
  price: number;
  status: FlatStatus;
  /** Origen del piso en el sistema del edificio (x) y nivel de suelo (y). */
  originX: number;
  level: number;
}

const ORDINAL = ['', '1º', '2º', '3º', '4º', '5º', '6º'];
const SOLD: Record<string, FlatStatus> = { '1A': 'vendido', '2B': 'vendido', '4A': 'reservado', '6B': 'reservado' };

export const FLATS: FlatUnit[] = Array.from({ length: FLOORS }, (_, i) => i + 1).flatMap((floor) =>
  (['A', 'B'] as const).map((letter) => {
    const project = FLAT_TYPES[letter];
    const area = Math.round(polygonArea(project.slab!.points));
    return {
      id: `${floor}${letter}`,
      floor,
      letter,
      label: `${ORDINAL[floor]} ${letter}`,
      area,
      bedrooms: 2,
      bathrooms: 1,
      orientation: letter === 'A' ? 'Sur y oeste' : 'Sur y este',
      price: 238000 + floor * 9500 + (letter === 'B' ? 6000 : 0),
      status: SOLD[`${floor}${letter}`] ?? 'disponible',
      originX: letter === 'A' ? 0 : FLAT_W + CORE_W,
      level: floor * FLOOR_TO_FLOOR,
    };
  }),
);

export const findFlat = (id: string) => FLATS.find((f) => f.id === id) ?? null;

/** Proyecto de un piso concreto, con nombre de la promoción. */
export function flatProject(unit: FlatUnit): Project {
  const base = FLAT_TYPES[unit.letter];
  return { ...base, id: `residencial-${unit.id}`, name: `Residencial Alameda · ${unit.label}` };
}

// ---------------------------------------------------------------------------
// Geometría del edificio
// ---------------------------------------------------------------------------

const shift = (p: Part, dx: number, dy: number, dz: number, layer: Layer): Part => ({
  ...p,
  layer,
  p: [p.p[0] + dx, p.p[1] + dy, p.p[2] + dz],
});

/** Muros y carpinterías de un piso, desplazados a su sitio en el edificio. */
function flatShell(unit: FlatUnit, layer: Layer): Part[] {
  const project = FLAT_TYPES[unit.letter];
  const layouts = layoutWalls(project).filter((l) => l.sidePlus === 'exterior' || l.sideMinus === 'exterior');
  const out: Part[] = [];
  for (const l of layouts) {
    for (const piece of l.pieces) {
      const b = pieceToBox(l, piece);
      out.push({ shape: 'box', mat: 'wall-ext', layer, p: [b.cx + unit.originX, b.cy + unit.level, b.cz], s: [b.sx, b.sy, b.sz], rotY: b.rotY });
    }
  }
  for (const part of openingParts(layouts)) out.push(shift(part, unit.originX, unit.level, 0, layer));
  return out;
}

export interface BuildingGeometry {
  parts: Part[];
  colliders: Collider[];
}

/**
 * Edificio completo. Con `exclude` se omite un piso (el que se recorre por
 * dentro) y todo queda expresado en coordenadas de ese piso.
 */
export function buildingParts(exclude?: FlatUnit): BuildingGeometry {
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  const L: Layer = exclude ? 'contexto' : 'cerramientos';
  const E: Layer = exclude ? 'contexto' : 'entorno';
  const dx = exclude ? -exclude.originX : 0;
  const dy = exclude ? -exclude.level : 0;
  const add = (p: Part) => parts.push(shift(p, dx, dy, 0, p.layer === 'entorno' ? E : L));
  const W = BUILDING_W;
  const top = (FLOORS + 1) * FLOOR_TO_FLOOR;

  // Pisos (fachadas reales de cada vivienda).
  for (const unit of FLATS) {
    if (exclude && unit.id === exclude.id) continue;
    for (const p of flatShell(unit, L)) parts.push(shift(p, dx, dy, 0, L));
  }
  // Forjados y cantos de cada planta.
  for (let f = 1; f <= FLOORS + 1; f++) {
    const y = f * FLOOR_TO_FLOOR;
    add(boxPart(L, 'wall-ext', -0.2, W + 0.2, -0.25, FLAT_D + 0.25, y - 0.32, y - 0.02));
    add(boxPart(L, 'black', -0.22, W + 0.22, FLAT_D + 0.23, FLAT_D + 0.27, y - 0.32, y - 0.02));
  }
  // Balcones con barandilla de vidrio.
  for (const unit of FLATS) {
    if (exclude && unit.id === exclude.id) continue;
    const br = balconyRect(unit.letter);
    const bx0 = unit.originX + br.x0;
    const bx1 = unit.originX + br.x1;
    const y = unit.level;
    add(boxPart(L, 'concrete', bx0, bx1, FLAT_D + 0.125, FLAT_D + 1.7, y - 0.25, y));
    add(boxPart(L, 'deck', bx0 + 0.05, bx1 - 0.05, FLAT_D + 0.13, FLAT_D + 1.62, y, y + 0.02));
    add(boxPart(L, 'glass', bx0, bx1, FLAT_D + 1.66, FLAT_D + 1.7, y, y + 1.05, { noShadow: true }));
    add(boxPart(L, 'black', bx0, bx1, FLAT_D + 1.64, FLAT_D + 1.72, y + 1.05, y + 1.09));
  }
  // Núcleo de escaleras acristalado y portal.
  const cx0 = FLAT_W;
  const cx1 = FLAT_W + CORE_W;
  add(boxPart(L, 'concrete', cx0 + 0.15, cx1 - 0.15, 0.2, FLAT_D - 0.2, 0, top));
  add(boxPart(L, 'glass', cx0 + 0.3, cx1 - 0.3, FLAT_D - 0.22, FLAT_D - 0.18, 0.1, top - 0.4, { noShadow: true }));
  add(boxPart(L, 'black', cx0 + 0.28, cx1 - 0.28, FLAT_D - 0.24, FLAT_D - 0.16, top - 0.4, top - 0.3));
  // Planta baja: portal y locales acristalados.
  add(boxPart(L, 'glass', 0.3, W - 0.3, 0.6, 0.64, 0, FLOOR_TO_FLOOR - 0.35, { noShadow: true }));
  add(boxPart(L, 'glass', 0.3, W - 0.3, FLAT_D - 0.6, FLAT_D - 0.56, 0, FLOOR_TO_FLOOR - 0.35, { noShadow: true }));
  add(boxPart(L, 'wall-int', 0.6, W - 0.6, 0.64, FLAT_D - 0.6, 0, 0.02));
  add(boxPart(L, 'glow-soft', 0.6, W - 0.6, 0.7, FLAT_D - 0.7, FLOOR_TO_FLOOR - 0.38, FLOOR_TO_FLOOR - 0.36, { noShadow: true }));
  for (let i = 0; i <= 7; i++) {
    const x = 0.3 + (i * (W - 0.6)) / 7;
    add(boxPart(L, 'black', x - 0.12, x + 0.12, 0.5, 0.74, 0, FLOOR_TO_FLOOR - 0.3));
    add(boxPart(L, 'black', x - 0.12, x + 0.12, FLAT_D - 0.7, FLAT_D - 0.46, 0, FLOOR_TO_FLOOR - 0.3));
  }
  add(boxPart(L, 'wall-ext', -0.2, W + 0.2, -0.25, FLAT_D + 0.25, FLOOR_TO_FLOOR - 0.32, FLOOR_TO_FLOOR - 0.02));
  // Cubierta: peto y casetón.
  add(boxPart(L, 'roof', -0.2, W + 0.2, -0.25, FLAT_D + 0.25, top - 0.02, top + 0.05));
  add(boxPart(L, 'wall-ext', -0.2, W + 0.2, -0.25, 0.0, top, top + 1.0));
  add(boxPart(L, 'wall-ext', -0.2, W + 0.2, FLAT_D, FLAT_D + 0.25, top, top + 1.0));
  add(boxPart(L, 'wall-ext', -0.2, 0.05, -0.25, FLAT_D + 0.25, top, top + 1.0));
  add(boxPart(L, 'wall-ext', W - 0.05, W + 0.2, -0.25, FLAT_D + 0.25, top, top + 1.0));
  add(boxPart(L, 'concrete', cx0, cx1, 0.5, 5.5, top, top + 2.6));

  // Calle, aceras, arbolado y edificios vecinos.
  const G = -0.02;
  add(boxPart('entorno', 'paver', -14, W + 14, FLAT_D + 1.8, FLAT_D + 6.5, G - 0.1, G + 0.12));
  add(boxPart('entorno', 'paver', -14, W + 14, -4.2, -0.25, G - 0.1, G + 0.12));
  add(boxPart('entorno', 'concrete-dark', -40, W + 40, FLAT_D + 6.5, FLAT_D + 15.5, G - 0.12, G - 0.02));
  add(boxPart('entorno', 'paver', -40, W + 40, FLAT_D + 15.5, FLAT_D + 19.5, G - 0.1, G + 0.12));
  for (let i = 0; i < 14; i++) {
    const x = -10 + i * 4.2;
    add(boxPart('entorno', 'white', x, x + 2.2, FLAT_D + 10.9, FLAT_D + 11.1, G - 0.02, G - 0.015));
  }
  for (let i = 0; i < 7; i++) {
    const x = -8 + i * 7.4;
    const z = FLAT_D + 5.4;
    add(cylPart('entorno', 'trunk', x, z, G, G + 3.2, 0.24));
    add(spherePart('entorno', 'leaf-dark', x, G + 4.6, z, 3.4, 2.8, 3.4));
    add(spherePart('entorno', 'leaf', x + 0.7, G + 5.4, z - 0.4, 2.2));
    colliders.push(rectCollider(x - 0.3 + dx, z - 0.3, x + 0.3 + dx, z + 0.3, 'árbol'));
  }
  const block = (x0: number, x1: number, z0: number, z1: number, h: number, mat: 'wall-ext' | 'concrete' | 'paver') => {
    add(boxPart('entorno', mat, x0, x1, z0, z1, G, h));
    // Bandas de ventanas iluminadas: dan escala urbana al atardecer.
    for (let y = 3.6; y < h - 1; y += 3.1) {
      add(boxPart('entorno', 'glass', x0 - 0.02, x1 + 0.02, z1 - 0.02, z1 + 0.04, y, y + 1.3, { noShadow: true }));
      for (let k = x0 + 1.2; k < x1 - 1.5; k += 3.4) {
        if ((Math.round(k * 7 + y * 3) % 3) === 0) add(boxPart('entorno', 'glow-soft', k, k + 1.6, z1 - 0.01, z1 + 0.01, y + 0.15, y + 1.15, { noShadow: true }));
      }
    }
  };
  block(-24, -4, -2, 9, 16, 'concrete');
  block(W + 4, W + 26, -2, 9, 22, 'paver');
  // Enfrente, un parque: césped, paseo, arbolado y bancos; la ciudad queda al fondo.
  const pz0 = FLAT_D + 19.5;
  add(boxPart('entorno', 'gravel', -40, W + 40, pz0 + 4, pz0 + 6, G - 0.1, G + 0.03));
  for (let i = 0; i < 12; i++) {
    const x = -30 + i * 7.8;
    for (const [z, h, w] of [
      [pz0 + 2.0, 7.5, 4.2],
      [pz0 + 9.5, 9.0, 5.0],
      [pz0 + 17, 8.0, 4.6],
    ] as const) {
      const ox = (i * 37 + z * 13) % 3;
      add(cylPart('entorno', 'trunk', x + ox, z, G, G + h * 0.45, 0.3));
      add(spherePart('entorno', i % 2 ? 'leaf' : 'leaf-dark', x + ox, G + h * 0.7, z, w, w * 0.85, w));
      add(spherePart('entorno', 'leaf-dark', x + ox + 0.8, G + h * 0.82, z - 0.5, w * 0.6));
    }
    if (i % 2 === 0) {
      add(boxPart('entorno', 'walnut', x + 2.5, x + 4.3, pz0 + 3.3, pz0 + 3.75, G + 0.42, G + 0.48));
      add(boxPart('entorno', 'black', x + 2.6, x + 4.2, pz0 + 3.7, pz0 + 3.76, G + 0.48, G + 0.85));
      add(cylPart('entorno', 'black', x + 5.5, pz0 + 3.6, G, G + 3.6, 0.08));
      add(cylPart('entorno', 'glow-soft', x + 5.5, pz0 + 3.6, G + 3.6, G + 3.95, 0.3, { noShadow: true }));
    }
  }
  // Silueta urbana lejana.
  for (let i = 0; i < 9; i++) {
    const x = -70 + i * 22;
    const h = 18 + ((i * 29) % 26);
    block(x, x + 16, pz0 + 46, pz0 + 60, h, i % 2 ? 'wall-ext' : 'concrete');
  }
  return { parts, colliders };
}
