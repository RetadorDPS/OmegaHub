/**
 * Villa Mirador — vivienda de muestra original de Studio Sección.
 *
 * Planta en L de 20 × 11 m (187 m² construidos) con salón-cocina abierto a una
 * terraza con piscina desbordante, dormitorio principal con baño, segundo
 * dormitorio y estudio. Muros, huecos, losa y estancias usan el MISMO modelo que
 * un plano subido por el usuario; cubierta, terraza, piscina, mobiliario y
 * jardín se declaran aparte como piezas ligadas a las mismas cotas.
 */
import { SCHEMA_VERSION, type Opening, type Project, type Vec2, type Wall } from '../model/types';
import { rectCollider, type Collider } from '../generate/collision';
import { boxPart, cylPart, spherePart, type Layer, type MatKey, type Part } from '../generate/parts';

export const H = 2.9; // altura libre
const EXT = 0.25;
const INT = 0.12;
export const SLAB_THICKNESS = 0.3;
export const GROUND_Y = -SLAB_THICKNESS;
export const DECK = { x0: 9, x1: 22, z0: 8.125, z1: 17.2, y: -0.03 };
export const POOL = { x0: 11.5, x1: 19.5, z0: 11.0, z1: 14.6, water: -0.13, depth: 1.45 };
const COPING = 0.3;
export const STOOP = { x0: 9.6, x1: 11.2, z0: -1.3, z1: -0.125, y: -0.1 };
/** Envolvente de la cubierta (incluye el voladizo sobre la terraza). */
export const ROOF = { x0: -0.5, x1: 20.6, z0: -0.5, z1: 11.5, y0: H, y1: H + 0.36 };
export const PLOT = { x0: -16, x1: 36, z0: -16, z1: 32 };

const wall = (id: string, ax: number, ay: number, bx: number, by: number, thickness: number): Wall => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness,
  height: H,
});

const walls: Wall[] = [
  wall('norte', 0, 0, 20, 0, EXT),
  wall('este', 20, 0, 20, 8, EXT),
  wall('sur-dia', 20, 8, 9, 8, EXT),
  wall('este-noche', 9, 8, 9, 11, EXT),
  wall('sur-noche', 9, 11, 0, 11, EXT),
  wall('oeste', 0, 11, 0, 0, EXT),
  wall('medianera', 9, 0, 9, 8, 0.15),
  // Trazado de este a oeste: la hoja de la puerta abre hacia el dormitorio, no al pasillo.
  wall('pasillo-n', 9, 4.6, 0, 4.6, INT),
  wall('pasillo-s', 0, 6, 9, 6, INT),
  wall('tabique-bano', 5.6, 0, 5.6, 4.6, INT),
  wall('tabique-estudio', 4.4, 6, 4.4, 11, INT),
];

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

const openings: Opening[] = [
  op('v-dorm-norte', 'norte', 'window', 2.8, 2.4, 1.9, 0.5),
  op('v-bano', 'norte', 'window', 7.3, 1.2, 0.8, 1.5),
  op('p-entrada', 'norte', 'door', 10.4, 1.2, 2.5, 0, 'swing'),
  op('v-cocina', 'norte', 'window', 16.2, 4.4, 0.8, 1.15),
  op('v-este', 'este', 'window', 2.2, 2.0, 1.4, 1.0),
  op('v-sur-1', 'sur-dia', 'window', 2.0, 3.2, 2.6, 0),
  op('p-terraza', 'sur-dia', 'door', 5.3, 2.8, 2.6, 0, 'sliding-glass'),
  op('v-sur-3', 'sur-dia', 'window', 8.4, 2.8, 2.6, 0),
  op('v-estudio-este', 'este-noche', 'window', 1.6, 1.4, 1.5, 0.8),
  op('v-estudio', 'sur-noche', 'window', 2.3, 2.2, 1.6, 0.8),
  op('v-dorm2', 'sur-noche', 'window', 6.8, 1.8, 1.6, 0.8),
  op('v-dorm2-oeste', 'oeste', 'window', 2.5, 1.4, 1.4, 0.9),
  op('v-pasillo', 'oeste', 'window', 5.7, 0.7, 1.2, 1.0),
  op('p-pasillo', 'medianera', 'door', 5.3, 1.2, 2.4, 0, 'none'),
  op('p-dorm', 'pasillo-n', 'door', 4.5, 0.9, 2.2, 0, 'swing'),
  op('p-dorm2', 'pasillo-s', 'door', 2.4, 0.9, 2.2, 0, 'swing'),
  op('p-estudio', 'pasillo-s', 'door', 6.6, 0.9, 2.2, 0, 'swing'),
  op('p-bano', 'tabique-bano', 'door', 3.6, 0.8, 2.1, 0, 'none'),
];

const e = EXT / 2;

export const villaMirador: Project = {
  schemaVersion: SCHEMA_VERSION,
  id: 'demo-villa-mirador',
  name: 'Villa Mirador',
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
    thickness: SLAB_THICKNESS,
    points: [
      { x: -e, y: -e },
      { x: 20 + e, y: -e },
      { x: 20 + e, y: 8 + e },
      { x: 9 + e, y: 8 + e },
      { x: 9 + e, y: 11 + e },
      { x: -e, y: 11 + e },
    ],
  },
  rooms: [
    { id: 'salon', name: 'Salón', camera: { x: 14.0, y: 6.3 } },
    { id: 'cocina', name: 'Cocina', camera: { x: 13.0, y: 4.3 } },
    { id: 'dormitorio', name: 'Dormitorio principal', camera: { x: 4.3, y: 3.7 } },
    { id: 'bano', name: 'Baño', camera: { x: 6.4, y: 2.4 } },
    { id: 'dormitorio-2', name: 'Dormitorio', camera: { x: 1.4, y: 8.4 } },
    { id: 'estudio', name: 'Estudio', camera: { x: 6.6, y: 8.4 } },
  ],
  finishes: { interiorWall: 'blanco-roto', exteriorWall: 'revoco-marfil', floor: 'roble' },
};

/** Puntos de entrada seguros para el modo libre (incluye la terraza). */
export const DEMO_ENTRY_POINTS: { id: string; name: string; point: Vec2; yaw: number }[] = [
  { id: 'terraza', name: 'Terraza', point: { x: 14.7, y: 10.15 }, yaw: Math.PI },
  { id: 'salon', name: 'Salón', point: { x: 14.0, y: 6.3 }, yaw: Math.PI / 2 },
  { id: 'cocina', name: 'Cocina', point: { x: 13.0, y: 4.3 }, yaw: 2.26 },
  { id: 'dormitorio', name: 'Dormitorio', point: { x: 4.3, y: 3.7 }, yaw: -Math.PI / 2 },
  { id: 'estudio', name: 'Estudio', point: { x: 6.6, y: 8.4 }, yaw: 0 },
];

/** Alturas del suelo transitable fuera de la losa (la losa está a cota 0). */
export const DEMO_FLOORS: { rect: { x0: number; x1: number; z0: number; z1: number }; y: number }[] = [
  { rect: { x0: DECK.x0, x1: DECK.x1, z0: DECK.z0 - 0.2, z1: DECK.z1 }, y: DECK.y },
  { rect: { x0: STOOP.x0, x1: STOOP.x1, z0: STOOP.z0, z1: STOOP.z1 + 0.2 }, y: STOOP.y },
];

export const DEMO_BOUNDS: Vec2[][] = [
  [
    { x: PLOT.x0, y: PLOT.z0 },
    { x: PLOT.x1, y: PLOT.z0 },
    { x: PLOT.x1, y: PLOT.z1 },
    { x: PLOT.x0, y: PLOT.z1 },
  ],
];

// ---------------------------------------------------------------------------
// Piezas específicas de la demo
// ---------------------------------------------------------------------------

function build() {
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  const add = (...p: Part[]) => parts.push(...p);
  const block = (x0: number, z0: number, x1: number, z1: number, name: string) =>
    colliders.push(rectCollider(x0, z0, x1, z1, name));
  const M: Layer = 'mobiliario';
  const E: Layer = 'entorno';

  // Ayudantes de mobiliario ----------------------------------------------------
  const plant = (layer: Layer, x: number, z: number, y0: number, s: number, pot: MatKey = 'pot') => {
    add(
      cylPart(layer, pot, x, z, y0, y0 + 0.45 * s, 0.42 * s),
      cylPart(layer, 'trunk', x, z, y0 + 0.4 * s, y0 + 1.1 * s, 0.03 * s),
      spherePart(layer, 'leaf', x, y0 + 1.35 * s, z, 0.7 * s, 0.75 * s, 0.7 * s),
      spherePart(layer, 'leaf-dark', x - 0.12 * s, y0 + 1.62 * s, z + 0.05 * s, 0.46 * s),
      spherePart(layer, 'leaf', x + 0.14 * s, y0 + 1.15 * s, z - 0.1 * s, 0.4 * s),
    );
  };
  /** Silla de comedor mirando hacia +z (dir = 1) o −z (dir = −1). */
  const chair = (cx: number, cz: number, dir: 1 | -1) => {
    add(
      boxPart(M, 'leather', cx - 0.23, cx + 0.23, cz - 0.22, cz + 0.22, 0.43, 0.49, { r: 0.025 }),
      boxPart(M, 'walnut', cx - 0.23, cx + 0.23, cz - dir * 0.2, cz - dir * 0.24, 0.49, 0.86, { r: 0.015 }),
      boxPart(M, 'black', cx - 0.21, cx - 0.18, cz - 0.2, cz + 0.2, 0, 0.43),
      boxPart(M, 'black', cx + 0.18, cx + 0.21, cz - 0.2, cz + 0.2, 0, 0.43),
    );
  };
  const stool = (cx: number, cz: number) => {
    add(
      cylPart(M, 'leather', cx, cz, 0.68, 0.74, 0.38),
      cylPart(M, 'black', cx, cz, 0, 0.68, 0.035),
      cylPart(M, 'black', cx, cz, 0.24, 0.26, 0.3),
      cylPart(M, 'black', cx, cz, 0, 0.012, 0.36),
    );
  };
  const lamp = (x: number, z: number, y0: number) => {
    add(
      cylPart(M, 'brass', x, z, y0, y0 + 0.18, 0.05),
      cylPart(M, 'glow', x, z, y0 + 0.18, y0 + 0.42, 0.24, { noShadow: true }),
    );
  };
  const lounger = (x0: number, z0: number) => {
    const y = DECK.y;
    add(
      boxPart(M, 'walnut', x0, x0 + 0.74, z0, z0 + 1.9, y + 0.24, y + 0.3),
      boxPart(M, 'linen', x0 + 0.03, x0 + 0.71, z0 + 0.5, z0 + 1.88, y + 0.3, y + 0.38, { r: 0.03 }),
      boxPart(M, 'linen', x0 + 0.03, x0 + 0.71, z0 + 0.02, z0 + 0.6, y + 0.32, y + 0.72, { r: 0.03 }),
      boxPart(M, 'black', x0 + 0.06, x0 + 0.1, z0 + 0.15, z0 + 1.75, y, y + 0.24),
      boxPart(M, 'black', x0 + 0.64, x0 + 0.68, z0 + 0.15, z0 + 1.75, y, y + 0.24),
    );
    block(x0 - 0.04, z0 - 0.04, x0 + 0.78, z0 + 1.94, 'tumbona');
  };

  // --- Terraza, piscina y acceso ------------------------------------------------
  const D = DECK;
  const P = POOL;
  const cx0 = P.x0 - COPING;
  const cx1 = P.x1 + COPING;
  const cz0 = P.z0 - COPING;
  const cz1 = P.z1 + COPING;
  add(
    // Base de hormigón de la terraza (con el hueco de la piscina).
    boxPart('base', 'concrete-dark', D.x0, D.x1, D.z0, cz0, GROUND_Y, D.y - 0.03),
    boxPart('base', 'concrete-dark', D.x0, D.x1, cz1, D.z1, GROUND_Y, D.y - 0.03),
    boxPart('base', 'concrete-dark', D.x0, cx0, cz0, cz1, GROUND_Y, D.y - 0.03),
    boxPart('base', 'concrete-dark', cx1, D.x1, cz0, cz1, GROUND_Y, D.y - 0.03),
    // Vaso de la piscina.
    boxPart('base', 'pool-tile', P.x0, P.x1, P.z0, P.z1, -P.depth - 0.05, -P.depth),
    boxPart('base', 'pool-tile', P.x0 - 0.05, P.x0, P.z0, P.z1, -P.depth, -0.02),
    boxPart('base', 'pool-tile', P.x1, P.x1 + 0.05, P.z0, P.z1, -P.depth, -0.02),
    boxPart('base', 'pool-tile', P.x0, P.x1, P.z0 - 0.05, P.z0, -P.depth, -0.02),
    boxPart('base', 'pool-tile', P.x0, P.x1, P.z1, P.z1 + 0.05, -P.depth, -0.02),
    // Tarima.
    boxPart('acabados', 'deck', D.x0, D.x1, D.z0, cz0, D.y - 0.03, D.y),
    boxPart('acabados', 'deck', D.x0, D.x1, cz1, D.z1, D.y - 0.03, D.y),
    boxPart('acabados', 'deck', D.x0, cx0, cz0, cz1, D.y - 0.03, D.y),
    boxPart('acabados', 'deck', cx1, D.x1, cz0, cz1, D.y - 0.03, D.y),
    // Albardilla de piedra y lámina de agua.
    boxPart('acabados', 'paver', cx0, cx1, cz0, P.z0, D.y - 0.03, 0.01),
    boxPart('acabados', 'paver', cx0, cx1, P.z1, cz1, D.y - 0.03, 0.01),
    boxPart('acabados', 'paver', cx0, P.x0, P.z0, P.z1, D.y - 0.03, 0.01),
    boxPart('acabados', 'paver', P.x1, cx1, P.z0, P.z1, D.y - 0.03, 0.01),
    boxPart('acabados', 'water', P.x0, P.x1, P.z0, P.z1, P.water - 0.02, P.water, { noShadow: true }),
    // Escalón de la terraza al jardín y peldaño de la entrada.
    boxPart('base', 'concrete', D.x0 + 1.5, D.x1 - 1.5, D.z1, D.z1 + 0.4, GROUND_Y, D.y - 0.15),
    boxPart('base', 'concrete', STOOP.x0, STOOP.x1, STOOP.z0, STOOP.z1, GROUND_Y, STOOP.y),
  );
  block(cx0, cz0, cx1, cz1, 'piscina');
  for (const x of [13.2, 14.5, 15.8]) lounger(x, 15.25);
  add(cylPart(M, 'concrete', 17.0, 16.0, D.y, D.y + 0.42, 0.42), cylPart(M, 'glow-soft', 17.0, 16.0, D.y + 0.42, D.y + 0.56, 0.14, { noShadow: true }));
  block(16.7, 15.7, 17.3, 16.3, 'mesa auxiliar');
  // Comedor exterior bajo el voladizo.
  add(
    boxPart(M, 'oak', 18.0, 20.2, 8.95, 9.85, D.y + 0.72, D.y + 0.76, { r: 0.01 }),
    boxPart(M, 'black', 18.1, 18.16, 9.0, 9.8, D.y, D.y + 0.72),
    boxPart(M, 'black', 20.04, 20.1, 9.0, 9.8, D.y, D.y + 0.72),
  );
  for (const x of [18.5, 19.2, 19.9]) {
    add(
      boxPart(M, 'fabric-dark', x - 0.22, x + 0.22, 8.38, 8.78, D.y + 0.42, D.y + 0.48, { r: 0.02 }),
      boxPart(M, 'fabric-dark', x - 0.22, x + 0.22, 10.02, 10.42, D.y + 0.42, D.y + 0.48, { r: 0.02 }),
      boxPart(M, 'black', x - 0.2, x + 0.2, 8.36, 8.4, D.y, D.y + 0.82),
      boxPart(M, 'black', x - 0.2, x + 0.2, 10.4, 10.44, D.y, D.y + 0.82),
    );
  }
  block(17.6, 8.3, 20.6, 10.5, 'comedor exterior');
  plant(M, 21.4, 8.8, D.y, 1.3, 'concrete-dark');
  plant(M, 9.55, 9.0, D.y, 1.1, 'concrete-dark');
  block(21.05, 8.45, 21.75, 9.15, 'macetón');
  block(9.25, 8.7, 9.85, 9.3, 'macetón');

  // --- Cubierta -------------------------------------------------------------------
  const R = ROOF;
  const roofRects = [
    { x0: R.x0, x1: R.x1, z0: R.z0, z1: 8.6 },
    { x0: R.x0, x1: 9.5, z0: 8.6, z1: R.z1 },
    { x0: 9.5, x1: R.x1, z0: 8.6, z1: 10.4 },
  ];
  for (const r of roofRects) {
    add(
      boxPart('cubierta', 'soffit', r.x0, r.x1, r.z0, r.z1, R.y0, R.y0 + 0.03),
      boxPart('cubierta', 'roof', r.x0, r.x1, r.z0, r.z1, R.y0 + 0.03, R.y1),
    );
  }
  // Cantos metálicos del perímetro de cubierta.
  const edge = (x0: number, x1: number, z0: number, z1: number) =>
    add(boxPart('cubierta', 'black', x0, x1, z0, z1, R.y0 - 0.01, R.y1 + 0.04));
  edge(R.x0 - 0.02, R.x1 + 0.02, R.z0 - 0.02, R.z0 + 0.01);
  edge(R.x1 - 0.01, R.x1 + 0.02, R.z0, 10.4);
  edge(9.5, R.x1 + 0.02, 10.39, 10.42);
  edge(9.49, 9.52, 10.4, R.z1);
  edge(R.x0 - 0.02, 9.52, R.z1 - 0.01, R.z1 + 0.02);
  edge(R.x0 - 0.02, R.x0 + 0.01, R.z0, R.z1);
  // Lucernario sobre la cocina y chimenea.
  add(
    boxPart('cubierta', 'wall-ext', 13.8, 18.2, 1.4, 3.6, R.y1, R.y1 + 0.5),
    boxPart('cubierta', 'glass', 13.95, 18.05, 1.55, 3.45, R.y1 + 0.5, R.y1 + 0.52, { noShadow: true }),
    boxPart('cubierta', 'concrete-dark', 19.3, 20.2, 5.0, 6.4, R.y1, R.y1 + 1.2),
    boxPart('cubierta', 'black', 19.25, 20.25, 4.95, 6.45, R.y1 + 1.2, R.y1 + 1.26),
  );
  // Techos interiores.
  add(
    boxPart('cubierta', 'ceiling', 0.12, 8.92, 0.12, 10.88, H - 0.015, H + 0.001),
    boxPart('cubierta', 'ceiling', 9.07, 19.88, 0.12, 7.88, H - 0.015, H + 0.001),
  );
  // Foseado de luz en el salón.
  add(boxPart('cubierta', 'glow-soft', 9.3, 19.6, 7.72, 7.8, H - 0.08, H - 0.06, { noShadow: true }));

  // --- Salón, comedor y cocina --------------------------------------------------
  // Bancada a lo largo del muro norte con columna de hornos.
  add(
    boxPart(M, 'white', 13.2, 18.55, 0.13, 0.75, 0.1, 0.88),
    boxPart(M, 'black', 13.22, 18.53, 0.16, 0.72, 0, 0.1),
    boxPart(M, 'stone', 13.18, 18.6, 0.12, 0.78, 0.88, 0.92),
    boxPart(M, 'stone', 13.18, 18.6, 0.12, 0.15, 0.92, 1.15),
    boxPart(M, 'walnut', 18.6, 19.86, 0.13, 0.76, 0, 2.5),
    boxPart(M, 'black', 18.9, 19.6, 0.765, 0.775, 0.95, 1.55),
    boxPart(M, 'black', 18.9, 19.6, 0.765, 0.775, 1.65, 2.15),
    boxPart(M, 'black', 15.5, 16.3, 0.3, 0.6, 0.92, 0.925),
    cylPart(M, 'steel', 17.4, 0.3, 0.92, 1.25, 0.035),
    boxPart(M, 'steel', 17.38, 17.42, 0.3, 0.52, 1.23, 1.26),
    boxPart(M, 'glow-soft', 13.3, 18.5, 0.14, 0.17, 1.95, 1.97, { noShadow: true }),
  );
  for (let i = 0; i < 8; i++) add(boxPart(M, 'black', 13.3 + i * 0.66, 13.32 + i * 0.66, 0.75, 0.755, 0.15, 0.82));
  block(13.1, 0, 19.9, 0.85, 'cocina');
  add(
    cylPart(M, 'terracotta', 14.0, 0.45, 0.92, 1.1, 0.18),
    cylPart(M, 'pot', 14.3, 0.4, 0.92, 1.02, 0.12),
    boxPart(M, 'oak', 16.8, 17.1, 0.3, 0.62, 0.92, 0.95),
    cylPart(M, 'brass', 18.2, 0.45, 0.92, 1.18, 0.09),
  );
  // Isla con taburetes.
  add(
    boxPart(M, 'walnut', 14.45, 17.55, 2.25, 3.15, 0, 0.88),
    boxPart(M, 'stone', 14.35, 17.65, 2.15, 3.25, 0.88, 0.93),
    boxPart(M, 'black', 15.3, 16.1, 2.4, 2.9, 0.93, 0.935),
    cylPart(M, 'terracotta', 17.1, 2.6, 0.93, 1.13, 0.22),
    spherePart(M, 'leaf-dark', 17.1, 1.25, 2.6, 0.32),
  );
  for (const x of [14.95, 15.7, 16.45, 17.2]) stool(x, 3.5);
  block(14.35, 2.15, 17.65, 3.25, 'isla');
  block(14.7, 3.25, 17.45, 3.75, 'taburetes');
  for (const x of [15.1, 16.0, 16.9]) {
    add(
      cylPart(M, 'black', x, 2.7, 2.15, H, 0.01, { noShadow: true }),
      spherePart(M, 'glow', x, 2.05, 2.7, 0.26, 0.26, 0.26, { noShadow: true }),
    );
  }
  // Comedor.
  add(
    boxPart(M, 'oak', 10.0, 12.6, 2.0, 3.0, 0.72, 0.76, { r: 0.012 }),
    boxPart(M, 'black', 10.2, 10.27, 2.15, 2.85, 0, 0.72),
    boxPart(M, 'black', 12.33, 12.4, 2.15, 2.85, 0, 0.72),
    boxPart(M, 'black', 10.2, 12.4, 2.47, 2.53, 0.62, 0.68),
    cylPart(M, 'pot', 11.3, 2.5, 0.76, 0.92, 0.22),
    spherePart(M, 'leaf', 11.3, 1.08, 2.5, 0.42, 0.36, 0.42),
    cylPart(M, 'black', 10.7, 2.5, 2.0, H, 0.01, { noShadow: true }),
    cylPart(M, 'black', 11.9, 2.5, 2.0, H, 0.01, { noShadow: true }),
    boxPart(M, 'black', 10.3, 12.3, 2.44, 2.56, 1.94, 2.0, { noShadow: true }),
    boxPart(M, 'glow', 10.33, 12.27, 2.46, 2.54, 1.925, 1.94, { noShadow: true }),
  );
  for (const x of [10.6, 11.3, 12.0]) {
    chair(x, 1.55, 1);
    chair(x, 3.45, -1);
  }
  block(9.95, 1.25, 12.65, 3.75, 'comedor');
  // Zona de estar frente a la chimenea.
  add(boxPart(M, 'rug', 15.2, 19.4, 4.2, 7.4, 0, 0.014));
  add(
    boxPart(M, 'fabric', 15.4, 16.4, 4.4, 7.2, 0.12, 0.44, { r: 0.06 }),
    boxPart(M, 'fabric', 15.4, 15.64, 4.4, 7.2, 0.42, 0.86, { r: 0.06 }),
    boxPart(M, 'fabric', 15.4, 16.4, 4.4, 4.62, 0.42, 0.66, { r: 0.06 }),
    boxPart(M, 'fabric', 16.4, 17.25, 6.3, 7.2, 0.12, 0.44, { r: 0.06 }),
    boxPart(M, 'fabric', 15.64, 17.25, 6.98, 7.2, 0.42, 0.8, { r: 0.06 }),
    boxPart(M, 'black', 15.45, 17.2, 4.45, 7.15, 0.02, 0.12),
    boxPart(M, 'linen', 15.66, 15.82, 4.8, 5.3, 0.44, 0.86, { r: 0.07, rotY: 0.1 }),
    boxPart(M, 'terracotta', 15.66, 15.82, 5.4, 5.86, 0.44, 0.82, { r: 0.07, rotY: -0.08 }),
    boxPart(M, 'sage', 15.66, 15.82, 6.0, 6.5, 0.44, 0.84, { r: 0.07 }),
    boxPart(M, 'linen', 16.5, 17.0, 6.78, 6.94, 0.44, 0.8, { r: 0.07 }),
    boxPart(M, 'sage', 16.45, 17.15, 6.4, 6.95, 0.44, 0.48, { r: 0.02 }),
  );
  block(15.35, 4.35, 16.45, 7.25, 'sofá');
  block(16.45, 6.25, 17.3, 7.25, 'chaise');
  add(
    cylPart(M, 'walnut', 17.6, 5.4, 0.32, 0.36, 1.0),
    cylPart(M, 'black', 17.6, 5.4, 0, 0.32, 0.55),
    boxPart(M, 'book-a', 17.35, 17.65, 5.2, 5.42, 0.36, 0.39, { rotY: 0.2 }),
    boxPart(M, 'book-c', 17.38, 17.62, 5.22, 5.4, 0.39, 0.415, { rotY: 0.35 }),
    cylPart(M, 'brass', 17.85, 5.55, 0.36, 0.46, 0.1),
  );
  block(17.05, 4.85, 18.15, 5.95, 'mesa baja');
  // Butaca junto al ventanal.
  add(
    boxPart(M, 'leather', 18.55, 19.35, 6.75, 7.45, 0.18, 0.42, { r: 0.05 }),
    boxPart(M, 'leather', 18.55, 19.35, 7.27, 7.45, 0.42, 0.8, { r: 0.05 }),
    boxPart(M, 'black', 18.6, 19.3, 6.8, 7.4, 0, 0.18),
  );
  block(18.5, 6.7, 19.4, 7.5, 'butaca');
  // Chimenea en el muro este.
  add(
    boxPart(M, 'concrete', 19.42, 19.875, 4.4, 7.0, 0, H),
    boxPart(M, 'black', 19.4, 19.43, 5.05, 6.35, 0.32, 0.98),
    boxPart(M, 'glow', 19.43, 19.6, 5.15, 6.25, 0.38, 0.5, { noShadow: true }),
    boxPart(M, 'stone', 19.1, 19.875, 4.4, 7.0, 0, 0.32),
    boxPart(M, 'art-a', 19.4, 19.42, 5.1, 6.3, 1.45, 2.3),
  );
  block(19.05, 4.35, 20, 7.05, 'chimenea');
  // Lámpara de pie y planta grande.
  add(
    cylPart(M, 'black', 15.7, 4.0, 0, 0.02, 0.3),
    cylPart(M, 'black', 15.7, 4.0, 0.02, 1.45, 0.02, { noShadow: true }),
    cylPart(M, 'glow', 15.7, 4.0, 1.45, 1.75, 0.34, { noShadow: true }),
  );
  block(15.5, 3.8, 15.9, 4.2, 'lámpara');
  plant(M, 12.7, 7.35, 0, 1.25);
  block(12.4, 7.05, 13.0, 7.65, 'planta');
  plant(M, 9.6, 7.3, 0, 1.0);
  block(9.3, 7.0, 9.9, 7.6, 'planta');
  // Recibidor: consola y cuadro.
  add(
    boxPart(M, 'walnut', 9.08, 9.5, 0.5, 1.15, 0.72, 0.78),
    boxPart(M, 'black', 9.1, 9.48, 0.54, 0.58, 0, 0.72),
    boxPart(M, 'black', 9.1, 9.48, 1.07, 1.11, 0, 0.72),
    lampPart(9.3, 0.8),
    boxPart(M, 'art-b', 9.075, 9.1, 6.3, 7.0, 1.2, 2.1),
  );
  block(9.05, 0.45, 9.55, 1.2, 'consola');

  // --- Dormitorio principal ------------------------------------------------------
  add(
    boxPart(M, 'rug', 0.6, 3.5, 0.9, 3.7, 0, 0.014),
    boxPart(M, 'walnut', 0.13, 0.24, 0.85, 3.75, 0, 1.15),
    boxPart(M, 'walnut', 0.24, 2.34, 1.4, 3.2, 0.1, 0.3),
    boxPart(M, 'black', 0.4, 2.2, 1.5, 3.1, 0, 0.1),
    boxPart(M, 'linen', 0.26, 2.32, 1.42, 3.18, 0.3, 0.54, { r: 0.07 }),
    boxPart(M, 'sage', 1.3, 2.34, 1.4, 3.2, 0.33, 0.57, { r: 0.07 }),
    boxPart(M, 'linen', 0.3, 0.75, 1.55, 2.25, 0.52, 0.68, { r: 0.08 }),
    boxPart(M, 'linen', 0.3, 0.75, 2.35, 3.05, 0.52, 0.68, { r: 0.08 }),
    boxPart(M, 'terracotta', 0.68, 0.98, 1.9, 2.7, 0.54, 0.66, { r: 0.06 }),
    boxPart(M, 'oak', 2.42, 2.82, 1.6, 3.0, 0.4, 0.45, { r: 0.012 }),
    boxPart(M, 'black', 2.46, 2.78, 1.66, 1.7, 0, 0.4),
    boxPart(M, 'black', 2.46, 2.78, 2.9, 2.94, 0, 0.4),
  );
  for (const z0 of [0.8, 3.25]) {
    add(boxPart(M, 'walnut', 0.24, 0.72, z0, z0 + 0.55, 0.22, 0.52), boxPart(M, 'black', 0.28, 0.68, z0 + 0.04, z0 + 0.51, 0, 0.22));
    lamp(0.48, z0 + 0.27, 0.52);
  }
  block(0.12, 0.75, 2.85, 3.85, 'cama');
  add(
    boxPart(M, 'white', 4.95, 5.54, 0.13, 2.9, 0.06, 2.6),
    boxPart(M, 'black', 4.97, 5.54, 0.15, 2.88, 0, 0.06),
    boxPart(M, 'black', 4.945, 4.95, 1.0, 1.005, 0.1, 2.55),
    boxPart(M, 'black', 4.945, 4.95, 1.95, 1.955, 0.1, 2.55),
  );
  block(4.9, 0.12, 5.55, 2.95, 'armario');
  add(
    boxPart(M, 'leather', 3.6, 4.4, 0.4, 1.15, 0.18, 0.42, { r: 0.05 }),
    boxPart(M, 'leather', 3.6, 4.4, 0.4, 0.58, 0.42, 0.82, { r: 0.05 }),
    boxPart(M, 'black', 3.65, 4.35, 0.45, 1.1, 0, 0.18),
    boxPart(M, 'art-b', 0.125, 0.14, 0.95, 1.55, 1.4, 2.2),
  );
  block(3.55, 0.35, 4.45, 1.2, 'butaca');

  // --- Baño ----------------------------------------------------------------------
  add(
    boxPart(M, 'tile', 5.66, 8.925, 0.125, 4.54, 0, 0.006),
    boxPart(M, 'walnut', 6.5, 8.3, 0.13, 0.65, 0.35, 0.85),
    boxPart(M, 'stone', 6.45, 8.35, 0.12, 0.68, 0.85, 0.9),
    cylPart(M, 'white', 6.95, 0.38, 0.9, 0.98, 0.42),
    cylPart(M, 'white', 7.85, 0.38, 0.9, 0.98, 0.42),
    boxPart(M, 'mirror', 9.065, 9.075, 1.0, 2.6, 1.05, 2.1),
    boxPart(M, 'white', 7.0, 8.82, 3.55, 4.38, 0, 0.55, { r: 0.12 }),
    boxPart(M, 'water', 7.12, 8.7, 3.67, 4.26, 0.42, 0.44, { noShadow: true }),
    boxPart(M, 'glass', 7.95, 7.97, 1.3, 2.7, 0, 2.0, { noShadow: true }),
    boxPart(M, 'stone', 7.97, 8.92, 1.3, 2.7, 0, 0.04),
    cylPart(M, 'steel', 8.5, 2.0, 1.9, 2.2, 0.03),
    plantPart(),
  );
  block(6.45, 0.12, 8.35, 0.7, 'lavabo');
  block(6.95, 3.5, 8.9, 4.45, 'bañera');
  block(7.9, 1.25, 8.95, 2.75, 'ducha');

  // --- Dormitorio 2 y estudio ----------------------------------------------------
  add(
    boxPart(M, 'oak', 4.22, 4.34, 7.5, 9.3, 0, 1.0),
    boxPart(M, 'oak', 2.3, 4.22, 7.7, 9.1, 0.1, 0.3),
    boxPart(M, 'linen', 2.32, 4.2, 7.72, 9.08, 0.3, 0.52, { r: 0.07 }),
    boxPart(M, 'terracotta', 2.3, 3.2, 7.7, 9.1, 0.33, 0.55, { r: 0.07 }),
    boxPart(M, 'linen', 3.6, 4.15, 7.85, 8.35, 0.5, 0.64, { r: 0.08 }),
    boxPart(M, 'linen', 3.6, 4.15, 8.45, 8.95, 0.5, 0.64, { r: 0.08 }),
    boxPart(M, 'oak', 0.13, 0.65, 8.0, 9.2, 0.72, 0.76),
    boxPart(M, 'black', 0.15, 0.6, 8.05, 8.09, 0, 0.72),
    boxPart(M, 'black', 0.15, 0.6, 9.11, 9.15, 0, 0.72),
    boxPart(M, 'book-b', 0.2, 0.5, 8.2, 8.45, 0.76, 0.82),
    boxPart(M, 'rug', 1.0, 3.9, 7.4, 9.8, 0, 0.012),
  );
  block(2.25, 7.45, 4.35, 9.35, 'cama');
  block(0.12, 7.95, 0.7, 9.25, 'escritorio');
  add(
    boxPart(M, 'oak', 6.0, 7.6, 10.2, 10.85, 0.72, 0.76),
    boxPart(M, 'black', 6.05, 6.1, 10.25, 10.8, 0, 0.72),
    boxPart(M, 'black', 7.5, 7.55, 10.25, 10.8, 0, 0.72),
    boxPart(M, 'black', 6.6, 7.1, 10.55, 10.6, 0.76, 1.1),
    boxPart(M, 'glow-soft', 6.62, 7.08, 10.54, 10.55, 0.8, 1.08, { noShadow: true }),
    boxPart(M, 'walnut', 4.46, 4.86, 7.0, 10.6, 0, 2.2),
    boxPart(M, 'book-a', 4.6, 4.84, 7.3, 8.2, 1.2, 1.5),
    boxPart(M, 'book-b', 4.6, 4.84, 8.5, 9.6, 0.6, 0.92),
    boxPart(M, 'book-c', 4.6, 4.84, 7.6, 8.8, 1.7, 2.0),
    boxPart(M, 'leather', 7.7, 8.5, 6.6, 7.4, 0.18, 0.42, { r: 0.05 }),
    boxPart(M, 'leather', 7.7, 8.5, 6.6, 6.78, 0.42, 0.8, { r: 0.05 }),
  );
  chair(6.8, 9.75, 1);
  block(5.95, 9.45, 7.65, 10.9, 'escritorio');
  block(4.45, 6.95, 4.9, 10.65, 'librería');
  block(7.65, 6.55, 8.55, 7.45, 'butaca');

  // --- Jardín y entorno -----------------------------------------------------------
  add(
    boxPart(E, 'gravel', -1.2, 21.2, -1.4, -0.125, GROUND_Y, GROUND_Y + 0.02),
    boxPart(E, 'gravel', -1.2, 9.0, 11.125, 12.2, GROUND_Y, GROUND_Y + 0.02),
    boxPart(E, 'gravel', 20.125, 22.0, -1.4, 8.125, GROUND_Y, GROUND_Y + 0.02),
  );
  for (let i = 0; i < 7; i++) add(boxPart(E, 'paver', 9.8, 11.0, -2.4 - i * 1.15, -1.6 - i * 1.15, GROUND_Y, GROUND_Y + 0.05));
  // Muros bajos y setos del límite de parcela.
  add(
    boxPart(E, 'concrete', -6.4, -6.15, -10, 22, GROUND_Y, GROUND_Y + 0.9),
    boxPart(E, 'concrete', 28.6, 28.85, -10, 22, GROUND_Y, GROUND_Y + 0.9),
  );
  block(-6.45, -10.05, -6.1, 22.05, 'muro de jardín');
  block(28.55, -10.05, 28.9, 22.05, 'muro de jardín');
  for (let i = 0; i < 9; i++) {
    add(spherePart(E, i % 2 ? 'leaf-dark' : 'leaf', -5.4, GROUND_Y + 0.55, -6 + i * 3.1, 1.6, 1.25, 2.6));
    add(spherePart(E, i % 2 ? 'leaf' : 'leaf-dark', 27.8, GROUND_Y + 0.55, -6 + i * 3.1, 1.6, 1.25, 2.6));
  }
  const tree = (x: number, z: number, h: number, w: number) => {
    const y = GROUND_Y + h * 0.42;
    add(
      cylPart(E, 'trunk', x, z, GROUND_Y, y + w * 0.2, 0.16 + h * 0.012),
      spherePart(E, 'leaf-dark', x, y + w * 0.42, z, w, w * 0.78, w),
      spherePart(E, 'leaf-dark', x + w * 0.34, y + w * 0.34, z + w * 0.12, w * 0.7, w * 0.6, w * 0.74),
      spherePart(E, 'leaf', x - w * 0.3, y + w * 0.5, z - w * 0.2, w * 0.66, w * 0.56, w * 0.7),
      spherePart(E, 'leaf', x + w * 0.08, y + w * 0.74, z - w * 0.06, w * 0.62, w * 0.5, w * 0.62),
      spherePart(E, 'leaf-dark', x - w * 0.12, y + w * 0.3, z + w * 0.34, w * 0.6, w * 0.5, w * 0.58),
    );
    block(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 'árbol');
  };
  tree(-3.2, -4.0, 7.2, 4.2);
  tree(6.0, -6.5, 8.0, 4.6);
  tree(17.5, -6.0, 6.6, 3.9);
  tree(25.2, 2.0, 6.0, 3.6);
  tree(25.6, 13.5, 7.0, 4.0);
  tree(-3.0, 15.5, 6.4, 3.8);
  tree(3.4, 20.0, 5.2, 3.2);
  for (const [x, z, s] of [
    [-1.9, 2.2, 0.9],
    [-1.8, 7.5, 0.8],
    [22.8, 5.0, 1.0],
    [23.2, 11.5, 0.9],
    [7.5, 13.2, 0.8],
    [2.0, 13.0, 1.0],
    [23.0, 16.5, 0.85],
    [12.4, -2.4, 0.7],
    [8.6, -2.6, 0.75],
  ] as const) {
    add(spherePart(E, s > 0.85 ? 'leaf-dark' : 'leaf', x, GROUND_Y + s * 0.38, z, s * 1.3, s, s * 1.3));
  }
  for (const [x, z] of [
    [9.5, -2.2],
    [11.3, -4.8],
    [9.5, -7.2],
    [21.6, 12.0],
    [21.6, 15.5],
  ] as const) {
    add(cylPart(E, 'black', x, z, GROUND_Y, GROUND_Y + 0.45, 0.06), cylPart(E, 'glow-soft', x, z, GROUND_Y + 0.45, GROUND_Y + 0.53, 0.08, { noShadow: true }));
  }
  return { parts, colliders };

  function lampPart(x: number, z: number): Part {
    return cylPart(M, 'glow-soft', x, z, 0.78, 0.98, 0.16, { noShadow: true });
  }
  function plantPart(): Part {
    return spherePart(M, 'leaf', 6.0, 0.6, 4.1, 0.5, 0.6, 0.5);
  }
}

const built = build();
export const DEMO_PARTS: Part[] = built.parts;
export const DEMO_COLLIDERS: Collider[] = built.colliders;

export interface DemoLight {
  p: [number, number, number];
  intensity: number;
  distance: number;
  main?: boolean;
  color?: string;
}

/** Luces interiores y de exterior, por orden de importancia (los niveles bajos usan las primeras). */
export const DEMO_LIGHTS: DemoLight[] = [
  { p: [16.0, 2.0, 2.7], intensity: 9, distance: 9, main: true },
  { p: [11.3, 1.85, 2.5], intensity: 7, distance: 8 },
  { p: [15.7, 1.55, 4.0], intensity: 5, distance: 7 },
  { p: [15.5, -0.7, 12.8], intensity: 7, distance: 10, color: '#7fe3ff' },
  { p: [19.2, 0.7, 5.7], intensity: 3.5, distance: 6, color: '#ff9c55' },
  { p: [1.0, 0.9, 2.3], intensity: 4.5, distance: 6 },
  { p: [5.0, 2.6, 5.3], intensity: 3, distance: 6 },
  { p: [14.5, 2.6, 9.3], intensity: 3, distance: 6 },
  { p: [7.3, 2.4, 2.3], intensity: 3, distance: 5 },
  { p: [6.8, 2.3, 8.6], intensity: 3, distance: 6 },
  { p: [2.6, 2.3, 8.4], intensity: 2.6, distance: 6 },
  { p: [19.1, 2.6, 9.3], intensity: 2.4, distance: 5 },
];
