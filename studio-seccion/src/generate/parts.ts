/**
 * Primitivas de geometría declarativas. La demo y los generadores (carpinterías,
 * entramado) describen qué hay en la escena como datos; el visor solo las dibuja.
 */

/** Capas que el visor muestra u oculta según el modo y la etapa de obra. */
export type Layer =
  | 'plano'
  | 'trazado'
  | 'base'
  | 'estructura'
  | 'cerramientos'
  | 'carpinterias'
  | 'cubierta'
  | 'acabados'
  | 'mobiliario'
  | 'entorno'
  /** Resto del edificio alrededor de un piso (se oculta en la maqueta). */
  | 'contexto';

export type MatKey =
  | 'wall-int'
  | 'wall-ext'
  | 'wall-raw'
  | 'wall-cap'
  | 'floor'
  | 'concrete'
  | 'concrete-dark'
  | 'frame'
  | 'glass'
  | 'door'
  | 'stud'
  | 'roof'
  | 'roof-raw'
  | 'soffit'
  | 'ceiling'
  | 'deck'
  | 'ground'
  | 'gravel'
  | 'paver'
  | 'oak'
  | 'walnut'
  | 'white'
  | 'stone'
  | 'black'
  | 'brass'
  | 'fabric'
  | 'fabric-dark'
  | 'linen'
  | 'sage'
  | 'terracotta'
  | 'rug'
  | 'leaf'
  | 'leaf-dark'
  | 'trunk'
  | 'pot'
  | 'glow'
  | 'glow-soft'
  | 'art-a'
  | 'art-b'
  | 'book-a'
  | 'book-b'
  | 'book-c'
  | 'steel'
  | 'chalk'
  | 'blueprint'
  | 'water'
  | 'pool-tile'
  | 'tile'
  | 'mirror'
  | 'leather';

export type Shape = 'box' | 'rbox' | 'cyl' | 'sphere';

export interface Part {
  shape: Shape;
  mat: MatKey;
  layer: Layer;
  /** Centro (x, altura, z). */
  p: [number, number, number];
  /** Tamaño (x, altura, z). En cilindros y esferas son diámetros. */
  s: [number, number, number];
  rotY?: number;
  /** Radio del canto en `rbox`. */
  r?: number;
  /** No proyecta sombra (luminarias, vidrio). */
  noShadow?: boolean;
}

export interface PartOptions {
  rotY?: number;
  r?: number;
  noShadow?: boolean;
}

/** Caja por extensiones: x0..x1 en planta, z0..z1 en planta (eje y del plano), y0..y1 en altura. */
export function boxPart(
  layer: Layer,
  mat: MatKey,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  opts: PartOptions = {},
): Part {
  return {
    shape: opts.r ? 'rbox' : 'box',
    mat,
    layer,
    p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    s: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
    ...opts,
  };
}

export function cylPart(
  layer: Layer,
  mat: MatKey,
  x: number,
  z: number,
  y0: number,
  y1: number,
  diameter: number,
  opts: PartOptions = {},
): Part {
  return {
    shape: 'cyl',
    mat,
    layer,
    p: [x, (y0 + y1) / 2, z],
    s: [diameter, Math.abs(y1 - y0), diameter],
    ...opts,
  };
}

export function spherePart(
  layer: Layer,
  mat: MatKey,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy = sx,
  sz = sx,
  opts: PartOptions = {},
): Part {
  return { shape: 'sphere', mat, layer, p: [x, y, z], s: [sx, sy, sz], ...opts };
}

/** Pieza en coordenadas locales de un muro: u a lo largo, y altura, v a través (+v = normal izquierda). */
export interface LocalPart {
  mat: MatKey;
  layer: Layer;
  u: number;
  y: number;
  v: number;
  su: number;
  sy: number;
  sv: number;
  /** Giro adicional alrededor del eje vertical que pasa por (pivotU, pivotV). */
  swing?: { pivotU: number; pivotV: number; angle: number };
  noShadow?: boolean;
}

/** Convierte una pieza local de muro a coordenadas de mundo. */
export function localToWorld(
  origin: { x: number; y: number },
  dir: { x: number; y: number },
  lp: LocalPart,
): Part {
  let u = lp.u;
  let vv = lp.v;
  let extra = 0;
  if (lp.swing) {
    const { pivotU, pivotV, angle } = lp.swing;
    const du = u - pivotU;
    const dv = vv - pivotV;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    u = pivotU + du * c - dv * s;
    vv = pivotV + du * s + dv * c;
    extra = angle;
  }
  const nx = -dir.y;
  const ny = dir.x;
  const x = origin.x + dir.x * u + nx * vv;
  const z = origin.y + dir.y * u + ny * vv;
  // Un giro +angle en el plano (u, v) equivale a −angle alrededor de Y.
  const rotY = -Math.atan2(dir.y, dir.x) - extra;
  return {
    shape: 'box',
    mat: lp.mat,
    layer: lp.layer,
    p: [x, lp.y, z],
    s: [lp.su, lp.sy, lp.sv],
    rotY,
    noShadow: lp.noShadow,
  };
}
