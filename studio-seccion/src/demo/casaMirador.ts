/**
 * Casa Mirador — vivienda de muestra original de Studio Sección.
 *
 * Los muros, huecos, losa y estancias se describen con el MISMO modelo que usa
 * un plano subido por el usuario, de modo que el visor, las colisiones y las
 * etapas de obra recorren el mismo camino de código. Lo específico de la demo
 * (cubierta, terraza, mobiliario y entorno) se declara aparte como piezas
 * ligadas a las mismas cotas.
 */
import { SCHEMA_VERSION, type Opening, type Project, type Vec2, type Wall } from '../model/types';
import { rectCollider, type Collider } from '../generate/collision';
import { boxPart, cylPart, spherePart, type Layer, type Part } from '../generate/parts';

export const H = 2.7; // altura libre
const EXT = 0.24;
const INT = 0.12;
export const HOUSE = { x0: 0, x1: 12, z0: 0, z1: 6.4 };
/** Losa a cara exterior de los muros perimetrales. */
export const SLAB_THICKNESS = 0.3;
export const GROUND_Y = -SLAB_THICKNESS;
export const DECK = { x0: 4.3, x1: 12.6, z0: 6.52, z1: 10.0, y: -0.03 };
export const STOOP = { x0: 1.2, x1: 3.2, z0: 6.52, z1: 7.9, y: -0.1 };
export const ROOF = { x0: -0.6, x1: 12.6, z0: -0.6, z1: 8.3, y0: H, y1: H + 0.34 };
export const PLOT = { x0: -9, x1: 21, z0: -8, z1: 16 };

const wall = (id: string, ax: number, ay: number, bx: number, by: number, thickness: number): Wall => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness,
  height: H,
});

const walls: Wall[] = [
  wall('norte', 0, 0, 12, 0, EXT),
  wall('este', 12, 0, 12, 6.4, EXT),
  wall('sur', 0, 6.4, 12, 6.4, EXT),
  wall('oeste', 0, 0, 0, 6.4, EXT),
  wall('medianera', 4.4, 0, 4.4, 6.4, INT),
  wall('tabique', 0, 3.8, 4.4, 3.8, INT),
];

const openings: Opening[] = [
  { id: 'v-dormitorio-norte', wallId: 'norte', kind: 'window', offset: 1.8, width: 1.6, height: 1.3, sill: 0.9 },
  { id: 'v-cocina', wallId: 'norte', kind: 'window', offset: 8.6, width: 3.2, height: 0.75, sill: 1.15 },
  { id: 'v-este', wallId: 'este', kind: 'window', offset: 3.3, width: 2.2, height: 1.45, sill: 0.75 },
  { id: 'p-entrada', wallId: 'sur', kind: 'door', offset: 2.2, width: 1.0, height: 2.2, sill: 0, leaf: 'swing' },
  { id: 'p-terraza', wallId: 'sur', kind: 'door', offset: 6.7, width: 2.4, height: 2.4, sill: 0, leaf: 'sliding-glass' },
  { id: 'v-mirador', wallId: 'sur', kind: 'window', offset: 9.9, width: 3.4, height: 2.4, sill: 0 },
  { id: 'v-dormitorio-oeste', wallId: 'oeste', kind: 'window', offset: 1.9, width: 1.8, height: 1.7, sill: 0.5 },
  { id: 'v-entrada', wallId: 'oeste', kind: 'window', offset: 5.1, width: 0.7, height: 1.2, sill: 1.0 },
  { id: 'p-salon', wallId: 'medianera', kind: 'door', offset: 5.15, width: 0.95, height: 2.15, sill: 0, leaf: 'none' },
  { id: 'p-dormitorio', wallId: 'tabique', kind: 'door', offset: 3.45, width: 0.9, height: 2.1, sill: 0, leaf: 'swing' },
];

export const casaMirador: Project = {
  schemaVersion: SCHEMA_VERSION,
  id: 'demo-casa-mirador',
  name: 'Casa Mirador',
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
      { x: -EXT / 2, y: -EXT / 2 },
      { x: 12 + EXT / 2, y: -EXT / 2 },
      { x: 12 + EXT / 2, y: 6.4 + EXT / 2 },
      { x: -EXT / 2, y: 6.4 + EXT / 2 },
    ],
  },
  rooms: [
    { id: 'salon', name: 'Salón', camera: { x: 6.5, y: 4.6 } },
    { id: 'dormitorio', name: 'Dormitorio', camera: { x: 3.3, y: 2.95 } },
    { id: 'entrada', name: 'Entrada', camera: { x: 2.9, y: 5.1 } },
  ],
  finishes: { interiorWall: 'blanco-roto', exteriorWall: 'revoco-marfil', floor: 'roble' },
};

/** Puntos de entrada seguros para el modo libre (incluye la terraza, que no es estancia interior). */
export const DEMO_ENTRY_POINTS: { id: string; name: string; point: Vec2; yaw: number }[] = [
  { id: 'terraza', name: 'Terraza', point: { x: 6.9, y: 9.0 }, yaw: Math.PI },
  { id: 'salon', name: 'Salón', point: { x: 6.5, y: 4.6 }, yaw: Math.PI * 0.72 },
  { id: 'entrada', name: 'Entrada', point: { x: 2.9, y: 5.1 }, yaw: Math.PI * 0.5 },
  { id: 'dormitorio', name: 'Dormitorio', point: { x: 3.3, y: 2.95 }, yaw: Math.PI * 1.3 },
];

/** Alturas del suelo transitable fuera de la losa (la losa está a cota 0). */
export const DEMO_FLOORS: { rect: { x0: number; x1: number; z0: number; z1: number }; y: number }[] = [
  { rect: { x0: DECK.x0, x1: DECK.x1, z0: DECK.z0 - 0.2, z1: DECK.z1 }, y: DECK.y },
  { rect: { x0: STOOP.x0, x1: STOOP.x1, z0: STOOP.z0 - 0.2, z1: STOOP.z1 }, y: STOOP.y },
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

interface Built {
  parts: Part[];
  colliders: Collider[];
}

function build(): Built {
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  const add = (...p: Part[]) => parts.push(...p);
  const block = (x0: number, z0: number, x1: number, z1: number, name: string) =>
    colliders.push(rectCollider(x0, z0, x1, z1, name));
  const M: Layer = 'mobiliario';

  // --- Base: terraza, escalón y peldaño de entrada -------------------------
  add(
    boxPart('base', 'concrete-dark', DECK.x0, DECK.x1, DECK.z0, DECK.z1, GROUND_Y, DECK.y - 0.03),
    boxPart('acabados', 'deck', DECK.x0 - 0.04, DECK.x1 + 0.04, DECK.z0, DECK.z1 + 0.04, DECK.y - 0.03, DECK.y),
    boxPart('base', 'concrete-dark', DECK.x0 + 1, DECK.x1 - 1, DECK.z1, DECK.z1 + 0.38, GROUND_Y, DECK.y - 0.15),
    boxPart('base', 'concrete', STOOP.x0, STOOP.x1, STOOP.z0, STOOP.z1, GROUND_Y, STOOP.y),
  );

  // --- Cubierta: plano de techo, losa, canto y chimenea ---------------------
  const R = ROOF;
  add(
    boxPart('cubierta', 'soffit', R.x0 + 0.05, R.x1 - 0.05, R.z0 + 0.05, R.z1 - 0.05, R.y0, R.y0 + 0.03),
    boxPart('cubierta', 'roof', R.x0, R.x1, R.z0, R.z1, R.y0 + 0.03, R.y1),
    // Canto metálico perimetral.
    boxPart('cubierta', 'black', R.x0 - 0.02, R.x1 + 0.02, R.z1 - 0.01, R.z1 + 0.02, R.y0 + 0.01, R.y1 + 0.03),
    boxPart('cubierta', 'black', R.x0 - 0.02, R.x1 + 0.02, R.z0 - 0.02, R.z0 + 0.01, R.y0 + 0.01, R.y1 + 0.03),
    boxPart('cubierta', 'black', R.x0 - 0.02, R.x0 + 0.01, R.z0, R.z1, R.y0 + 0.01, R.y1 + 0.03),
    boxPart('cubierta', 'black', R.x1 - 0.01, R.x1 + 0.02, R.z0, R.z1, R.y0 + 0.01, R.y1 + 0.03),
    // Volumen de lucernario sobre el salón y chimenea.
    boxPart('cubierta', 'wall-ext', 6.4, 10.6, 1.2, 3.6, R.y1, R.y1 + 0.55),
    boxPart('cubierta', 'black', 6.34, 10.66, 1.14, 3.66, R.y1 + 0.55, R.y1 + 0.61),
    boxPart('cubierta', 'concrete-dark', 4.9, 5.6, 0.3, 1.1, R.y1, R.y1 + 1.15),
    boxPart('cubierta', 'black', 4.84, 5.66, 0.24, 1.16, R.y1 + 1.15, R.y1 + 1.21),
  );
  // Techo interior (más claro que el sofito exterior de madera).
  add(
    boxPart('cubierta', 'ceiling', 0.12, 4.34, 0.12, 3.74, H - 0.015, H + 0.001),
    boxPart('cubierta', 'ceiling', 0.12, 4.34, 3.86, 6.28, H - 0.015, H + 0.001),
    boxPart('cubierta', 'ceiling', 4.46, 11.88, 0.12, 6.28, H - 0.015, H + 0.001),
  );

  // --- Salón · cocina --------------------------------------------------------
  // Columna y bancada contra el muro norte.
  add(
    boxPart(M, 'walnut', 5.0, 6.3, 0.13, 0.76, 0, 2.25),
    boxPart(M, 'black', 5.62, 5.68, 0.76, 0.775, 0.3, 2.0),
    boxPart(M, 'white', 6.34, 11.1, 0.13, 0.74, 0.1, 0.86),
    boxPart(M, 'black', 6.36, 11.08, 0.16, 0.72, 0, 0.1),
    boxPart(M, 'stone', 6.32, 11.12, 0.12, 0.77, 0.86, 0.9),
    boxPart(M, 'stone', 6.32, 11.12, 0.12, 0.15, 0.9, 1.14),
    boxPart(M, 'black', 8.1, 8.9, 0.3, 0.62, 0.9, 0.905),
    cylPart(M, 'steel', 9.9, 0.3, 0.9, 1.22, 0.035),
    boxPart(M, 'steel', 9.88, 9.92, 0.3, 0.5, 1.2, 1.23),
    boxPart(M, 'glow-soft', 6.5, 11.0, 0.14, 0.17, 1.9, 1.92, { noShadow: true }),
    boxPart(M, 'walnut', 6.34, 6.9, 0.13, 0.5, 1.92, 2.6),
    boxPart(M, 'walnut', 10.3, 11.1, 0.13, 0.5, 1.92, 2.6),
  );
  block(4.9, 0, 11.2, 0.82, 'cocina');
  for (let i = 0; i < 7; i++) {
    add(boxPart(M, 'black', 6.42 + i * 0.68, 6.44 + i * 0.68, 0.74, 0.745, 0.14, 0.84));
  }
  // Menaje sobre la bancada.
  add(
    cylPart(M, 'terracotta', 7.2, 0.42, 0.9, 1.08, 0.16),
    cylPart(M, 'pot', 7.45, 0.36, 0.9, 1.0, 0.11),
    cylPart(M, 'brass', 10.6, 0.42, 0.9, 1.16, 0.09),
    boxPart(M, 'oak', 10.75, 11.0, 0.3, 0.6, 0.9, 0.93),
  );

  // Mesa de comedor con seis sillas y lámpara colgante.
  const tx0 = 7.5;
  const tx1 = 9.9;
  const tz0 = 1.75;
  const tz1 = 2.7;
  add(
    boxPart(M, 'oak', tx0, tx1, tz0, tz1, 0.71, 0.75, { r: 0.012 }),
    boxPart(M, 'black', tx0 + 0.18, tx0 + 0.24, tz0 + 0.12, tz1 - 0.12, 0, 0.71),
    boxPart(M, 'black', tx1 - 0.24, tx1 - 0.18, tz0 + 0.12, tz1 - 0.12, 0, 0.71),
    boxPart(M, 'black', tx0 + 0.18, tx1 - 0.18, 2.2, 2.25, 0.62, 0.68),
    cylPart(M, 'pot', 8.7, 2.22, 0.75, 0.93, 0.2),
    spherePart(M, 'leaf', 8.7, 1.1, 2.22, 0.42, 0.38, 0.42),
    spherePart(M, 'leaf-dark', 8.82, 1.22, 2.16, 0.26),
  );
  for (const cx of [7.95, 8.7, 9.45]) {
    for (const side of [-1, 1]) {
      const zc = side < 0 ? tz0 - 0.2 : tz1 + 0.2;
      add(
        boxPart(M, 'fabric-dark', cx - 0.22, cx + 0.22, zc - 0.21, zc + 0.21, 0.42, 0.47, { r: 0.02 }),
        boxPart(M, 'walnut', cx - 0.22, cx + 0.22, zc + side * 0.19, zc + side * 0.225, 0.47, 0.84, { r: 0.012 }),
        boxPart(M, 'walnut', cx - 0.2, cx - 0.17, zc - 0.19, zc + 0.19, 0, 0.42),
        boxPart(M, 'walnut', cx + 0.17, cx + 0.2, zc - 0.19, zc + 0.19, 0, 0.42),
      );
    }
  }
  block(tx0 - 0.05, tz0 - 0.45, tx1 + 0.05, tz1 + 0.45, 'comedor');
  add(
    cylPart(M, 'black', 8.1, 2.22, 2.05, H, 0.012, { noShadow: true }),
    cylPart(M, 'black', 9.3, 2.22, 2.05, H, 0.012, { noShadow: true }),
    boxPart(M, 'black', 7.75, 9.65, 2.17, 2.27, 1.99, 2.05, { noShadow: true }),
    boxPart(M, 'glow', 7.78, 9.62, 2.185, 2.255, 1.975, 1.99, { noShadow: true }),
  );

  // Zona de estar: alfombra, sofá en L, mesa baja y lámpara de pie.
  add(boxPart(M, 'rug', 8.2, 11.5, 3.95, 6.1, 0.0, 0.014));
  const sx0 = 8.4;
  const sx1 = 11.2;
  add(
    boxPart(M, 'fabric', sx0, sx1, 3.72, 4.62, 0.12, 0.42, { r: 0.05 }),
    boxPart(M, 'fabric', sx0, sx1, 3.72, 3.94, 0.4, 0.82, { r: 0.05 }),
    boxPart(M, 'fabric', sx0, sx0 + 0.2, 3.72, 4.62, 0.4, 0.64, { r: 0.05 }),
    boxPart(M, 'fabric', sx1 - 0.95, sx1, 4.62, 5.72, 0.12, 0.42, { r: 0.05 }),
    boxPart(M, 'fabric', sx1 - 0.2, sx1, 3.72, 5.72, 0.4, 0.78, { r: 0.05 }),
    boxPart(M, 'black', sx0 + 0.05, sx1 - 0.05, 3.78, 4.56, 0.02, 0.12),
    boxPart(M, 'linen', sx0 + 0.3, sx0 + 0.78, 3.92, 4.06, 0.44, 0.84, { r: 0.06, rotY: 0.12 }),
    boxPart(M, 'terracotta', sx0 + 0.9, sx0 + 1.36, 3.93, 4.07, 0.44, 0.8, { r: 0.06, rotY: -0.1 }),
    boxPart(M, 'sage', sx1 - 0.86, sx1 - 0.36, 3.93, 4.07, 0.44, 0.82, { r: 0.06, rotY: 0.08 }),
    boxPart(M, 'linen', sx1 - 0.36, sx1 - 0.22, 5.0, 5.48, 0.44, 0.8, { r: 0.06 }),
    boxPart(M, 'sage', sx1 - 0.92, sx1 - 0.3, 5.2, 5.7, 0.42, 0.46, { r: 0.02 }),
  );
  block(sx0 - 0.05, 3.66, sx1 + 0.05, 4.68, 'sofá');
  block(sx1 - 1.0, 4.6, sx1 + 0.05, 5.78, 'chaise');
  add(
    cylPart(M, 'walnut', 9.35, 5.3, 0.3, 0.34, 0.95),
    cylPart(M, 'black', 9.35, 5.3, 0, 0.3, 0.5),
    boxPart(M, 'book-a', 9.12, 9.42, 5.12, 5.34, 0.34, 0.37, { rotY: 0.2 }),
    boxPart(M, 'book-c', 9.16, 9.4, 5.14, 5.32, 0.37, 0.395, { rotY: 0.32 }),
    cylPart(M, 'brass', 9.58, 5.42, 0.34, 0.44, 0.1),
  );
  block(8.85, 4.82, 9.85, 5.78, 'mesa baja');
  add(
    cylPart(M, 'black', 11.55, 3.85, 0, 0.02, 0.3),
    cylPart(M, 'black', 11.55, 3.85, 0.02, 1.42, 0.02, { noShadow: true }),
    cylPart(M, 'glow', 11.55, 3.85, 1.42, 1.7, 0.32, { noShadow: true }),
  );
  // Aparador con libros y cuadro sobre la medianera.
  add(
    boxPart(M, 'walnut', 4.47, 4.9, 1.3, 3.3, 0.16, 0.72),
    boxPart(M, 'black', 4.5, 4.86, 1.4, 1.46, 0, 0.16),
    boxPart(M, 'black', 4.5, 4.86, 3.14, 3.2, 0, 0.16),
    boxPart(M, 'art-a', 4.465, 4.49, 1.55, 3.05, 1.12, 2.05),
    boxPart(M, 'black', 4.462, 4.475, 1.52, 3.08, 1.09, 2.08),
    boxPart(M, 'book-a', 4.55, 4.8, 1.5, 1.74, 0.72, 0.78),
    boxPart(M, 'book-b', 4.56, 4.78, 1.52, 1.72, 0.78, 0.83),
    cylPart(M, 'terracotta', 4.68, 2.9, 0.72, 1.02, 0.2),
    spherePart(M, 'leaf-dark', 4.68, 1.22, 2.9, 0.46, 0.5, 0.46),
    cylPart(M, 'glow-soft', 4.68, 2.3, 0.82, 1.0, 0.16, { noShadow: true }),
    cylPart(M, 'brass', 4.68, 2.3, 0.72, 0.82, 0.07),
  );
  block(4.46, 1.24, 4.95, 3.36, 'aparador');
  // Planta grande en la esquina sureste.
  add(
    cylPart(M, 'pot', 11.5, 5.95, 0, 0.42, 0.4),
    cylPart(M, 'trunk', 11.5, 5.95, 0.42, 1.2, 0.035),
    spherePart(M, 'leaf', 11.5, 1.45, 5.95, 0.7, 0.75, 0.7),
    spherePart(M, 'leaf-dark', 11.36, 1.72, 5.88, 0.45),
    spherePart(M, 'leaf', 11.6, 1.2, 5.8, 0.4),
  );
  block(11.25, 5.7, 11.8, 6.2, 'planta');

  // --- Entrada ---------------------------------------------------------------
  add(
    boxPart(M, 'oak', 0.55, 1.95, 3.87, 4.2, 0.76, 0.8, { r: 0.01 }),
    boxPart(M, 'black', 0.6, 0.64, 3.9, 4.17, 0, 0.76),
    boxPart(M, 'black', 1.86, 1.9, 3.9, 4.17, 0, 0.76),
    boxPart(M, 'brass', 0.88, 1.62, 3.862, 3.88, 1.18, 1.92),
    cylPart(M, 'glow-soft', 0.82, 4.03, 0.9, 1.12, 0.17, { noShadow: true }),
    cylPart(M, 'black', 0.82, 4.03, 0.8, 0.9, 0.06),
    boxPart(M, 'book-b', 1.45, 1.75, 3.92, 4.14, 0.8, 0.84),
    cylPart(M, 'pot', 1.62, 4.02, 0.84, 0.98, 0.14),
    boxPart(M, 'rug', 1.5, 3.9, 4.55, 5.7, 0, 0.012),
    boxPart(M, 'walnut', 0.14, 0.5, 5.5, 6.2, 0.38, 0.44, { r: 0.01 }),
    boxPart(M, 'black', 0.18, 0.46, 5.54, 5.58, 0, 0.38),
    boxPart(M, 'black', 0.18, 0.46, 6.12, 6.16, 0, 0.38),
  );
  block(0.5, 3.86, 2.0, 4.26, 'consola');
  block(0.12, 5.44, 0.56, 6.26, 'banco');
  // Espejo con marco de latón sobre la consola.
  add(boxPart(M, 'steel', 0.91, 1.59, 3.866, 3.888, 1.21, 1.89));

  // --- Dormitorio ------------------------------------------------------------
  const bx0 = 0.9;
  const bx1 = 2.7;
  add(
    boxPart(M, 'rug', 0.5, 3.2, 1.2, 3.1, 0, 0.014),
    boxPart(M, 'walnut', bx0 - 0.5, bx1 + 0.5, 0.13, 0.2, 0, 1.05),
    boxPart(M, 'walnut', bx0, bx1, 0.2, 2.3, 0.1, 0.3),
    boxPart(M, 'black', bx0 + 0.1, bx1 - 0.1, 0.3, 2.2, 0, 0.1),
    boxPart(M, 'linen', bx0 + 0.02, bx1 - 0.02, 0.22, 2.28, 0.3, 0.52, { r: 0.06 }),
    boxPart(M, 'sage', bx0, bx1, 1.25, 2.3, 0.33, 0.55, { r: 0.06 }),
    boxPart(M, 'linen', bx0 + 0.12, bx0 + 0.82, 0.28, 0.72, 0.5, 0.66, { r: 0.07 }),
    boxPart(M, 'linen', bx1 - 0.82, bx1 - 0.12, 0.28, 0.72, 0.5, 0.66, { r: 0.07 }),
    boxPart(M, 'terracotta', bx0 + 0.62, bx1 - 0.62, 0.62, 0.92, 0.52, 0.64, { r: 0.06 }),
  );
  block(bx0 - 0.05, 0.12, bx1 + 0.05, 2.36, 'cama');
  for (const nx of [bx0 - 0.5, bx1 + 0.06]) {
    add(
      boxPart(M, 'walnut', nx, nx + 0.44, 0.2, 0.6, 0.2, 0.5),
      boxPart(M, 'black', nx + 0.04, nx + 0.4, 0.24, 0.56, 0, 0.2),
      cylPart(M, 'brass', nx + 0.22, 0.4, 0.5, 0.66, 0.05),
      cylPart(M, 'glow', nx + 0.22, 0.4, 0.66, 0.86, 0.2, { noShadow: true }),
    );
  }
  block(bx0 - 0.56, 0.12, bx0, 0.66, 'mesilla');
  block(bx1, 0.12, bx1 + 0.56, 0.66, 'mesilla');
  // Armario contra la medianera y banco a los pies de la cama.
  add(
    boxPart(M, 'white', 3.74, 4.33, 0.14, 2.4, 0.06, 2.4),
    boxPart(M, 'black', 3.76, 4.33, 0.16, 2.38, 0, 0.06),
    boxPart(M, 'black', 3.735, 3.74, 0.9, 0.905, 0.1, 2.36),
    boxPart(M, 'black', 3.735, 3.74, 1.65, 1.655, 0.1, 2.36),
    boxPart(M, 'oak', 1.1, 2.5, 2.42, 2.8, 0.4, 0.45, { r: 0.012 }),
    boxPart(M, 'black', 1.16, 1.2, 2.46, 2.76, 0, 0.4),
    boxPart(M, 'black', 2.4, 2.44, 2.46, 2.76, 0, 0.4),
    boxPart(M, 'art-b', 0.125, 0.15, 2.95, 3.55, 1.2, 2.0),
  );
  block(3.68, 0.12, 4.34, 2.46, 'armario');
  block(1.04, 2.38, 2.56, 2.86, 'banco de cama');

  // --- Terraza ---------------------------------------------------------------
  const T: Layer = 'mobiliario';
  for (const lx of [9.3, 10.6]) {
    add(
      boxPart(T, 'walnut', lx, lx + 0.72, 7.5, 9.3, DECK.y + 0.22, DECK.y + 0.28),
      boxPart(T, 'linen', lx + 0.03, lx + 0.69, 7.95, 9.27, DECK.y + 0.28, DECK.y + 0.36, { r: 0.03 }),
      boxPart(T, 'linen', lx + 0.03, lx + 0.69, 7.42, 8.0, DECK.y + 0.3, DECK.y + 0.7, { r: 0.03 }),
      boxPart(T, 'black', lx + 0.06, lx + 0.1, 7.6, 9.2, DECK.y, DECK.y + 0.22),
      boxPart(T, 'black', lx + 0.62, lx + 0.66, 7.6, 9.2, DECK.y, DECK.y + 0.22),
    );
    block(lx - 0.04, 7.38, lx + 0.76, 9.34, 'tumbona');
  }
  add(
    cylPart(T, 'concrete', 10.31, 8.9, DECK.y, DECK.y + 0.4, 0.42),
    cylPart(T, 'glow-soft', 10.31, 8.9, DECK.y + 0.4, DECK.y + 0.56, 0.14, { noShadow: true }),
    // Jardinera corrida en el borde este.
    boxPart(T, 'concrete-dark', 12.12, 12.56, 6.9, 9.7, DECK.y, DECK.y + 0.5),
    cylPart(T, 'pot', 4.8, 7.0, DECK.y, DECK.y + 0.46, 0.46),
    spherePart(T, 'leaf', 4.8, DECK.y + 0.8, 7.0, 0.62, 0.66, 0.62),
    spherePart(T, 'leaf-dark', 4.9, DECK.y + 1.08, 6.96, 0.4),
  );
  for (let i = 0; i < 6; i++) {
    add(
      spherePart(T, i % 2 ? 'leaf' : 'leaf-dark', 12.34, DECK.y + 0.68 + (i % 3) * 0.05, 7.15 + i * 0.47, 0.48, 0.5, 0.52),
    );
  }
  block(12.08, 6.86, 12.6, 9.74, 'jardinera');
  block(4.54, 6.74, 5.06, 7.26, 'macetón');
  block(10.06, 8.66, 10.56, 9.14, 'mesa auxiliar');

  // --- Entorno ---------------------------------------------------------------
  const E: Layer = 'entorno';
  // Franja de grava perimetral y camino de losas hasta la entrada.
  add(
    boxPart(E, 'gravel', -1.1, 13.3, -1.1, 6.6, GROUND_Y, GROUND_Y + 0.02),
    boxPart(E, 'gravel', -1.1, 4.3, 6.6, 8.6, GROUND_Y, GROUND_Y + 0.02),
  );
  for (let i = 0; i < 6; i++) {
    add(boxPart(E, 'paver', 1.55, 2.85, 8.15 + i * 1.05, 8.95 + i * 1.05, GROUND_Y, GROUND_Y + 0.05));
  }
  // Muro bajo de jardín al oeste.
  add(boxPart(E, 'concrete', -3.4, -3.15, -2, 11, GROUND_Y, GROUND_Y + 0.75));
  block(-3.45, -2.05, -3.1, 11.05, 'muro de jardín');
  const tree = (x: number, z: number, h: number, w: number) => {
    const y = GROUND_Y + h * 0.42;
    add(
      cylPart(E, 'trunk', x, z, GROUND_Y, y + w * 0.2, 0.14 + h * 0.012),
      spherePart(E, 'leaf-dark', x, y + w * 0.42, z, w, w * 0.78, w),
      spherePart(E, 'leaf-dark', x + w * 0.34, y + w * 0.34, z + w * 0.12, w * 0.7, w * 0.6, w * 0.74),
      spherePart(E, 'leaf', x - w * 0.3, y + w * 0.5, z - w * 0.2, w * 0.66, w * 0.56, w * 0.7),
      spherePart(E, 'leaf', x + w * 0.08, y + w * 0.74, z - w * 0.06, w * 0.62, w * 0.5, w * 0.62),
      spherePart(E, 'leaf-dark', x - w * 0.12, y + w * 0.3, z + w * 0.34, w * 0.6, w * 0.5, w * 0.58),
    );
    block(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 'árbol');
  };
  tree(-5.6, -3.2, 6.2, 3.6);
  tree(3.6, -5.6, 7.4, 4.2);
  tree(15.8, -4.2, 5.6, 3.3);
  tree(17.6, 4.6, 4.8, 2.9);
  tree(-6.4, 6.4, 5.2, 3.1);
  tree(-1.6, 12.4, 4.2, 2.5);
  for (const [x, z, s] of [
    [-1.9, 1.2, 0.9],
    [-1.7, 2.6, 0.7],
    [13.9, 1.6, 1.0],
    [14.1, 3.2, 0.75],
    [0.2, 8.4, 0.8],
    [13.6, 10.6, 0.9],
    [14.4, 9.4, 0.65],
    [3.4, 10.6, 0.7],
  ] as const) {
    add(spherePart(E, s > 0.8 ? 'leaf-dark' : 'leaf', x, GROUND_Y + s * 0.38, z, s * 1.25, s, s * 1.25));
  }
  // Balizas de jardín que marcan el camino.
  for (const [x, z] of [
    [1.25, 8.6],
    [3.15, 10.7],
    [1.25, 12.8],
  ] as const) {
    add(
      cylPart(E, 'black', x, z, GROUND_Y, GROUND_Y + 0.42, 0.06),
      cylPart(E, 'glow-soft', x, z, GROUND_Y + 0.42, GROUND_Y + 0.5, 0.08, { noShadow: true }),
    );
  }
  return { parts, colliders };
}

const built = build();
export const DEMO_PARTS: Part[] = built.parts;
export const DEMO_COLLIDERS: Collider[] = built.colliders;

/** Luces cálidas interiores (x, altura, z, intensidad en candelas, alcance). */
export const DEMO_LIGHTS: { p: [number, number, number]; intensity: number; distance: number; main?: boolean }[] = [
  { p: [8.7, 1.85, 2.22], intensity: 11, distance: 11, main: true },
  { p: [10.9, 1.5, 4.5], intensity: 6, distance: 8 },
  { p: [6.0, 2.2, 4.9], intensity: 5, distance: 8 },
  { p: [2.2, 2.1, 5.05], intensity: 5.5, distance: 6 },
  { p: [2.2, 1.9, 1.9], intensity: 6.5, distance: 7 },
  { p: [8.6, 2.2, 7.5], intensity: 3.5, distance: 7 },
  { p: [8.7, 2.1, 0.75], intensity: 3, distance: 5 },
];
