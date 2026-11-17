/**
 * Modelo del proyecto de Studio Sección.
 *
 * Todas las longitudes están en METROS. El plano se trabaja en planta con
 * ejes (x → derecha, y → abajo); al pasar a 3D se convierte en (x, altura, z=y).
 * El editor 2D, la generación paramétrica, las colisiones y el visor derivan
 * de este mismo estado: no existe una segunda copia de la geometría.
 */

export const SCHEMA_VERSION = 1;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  /** Espesor en metros. */
  thickness: number;
  /** Altura en metros. */
  height: number;
}

export type OpeningKind = 'door' | 'window';

/** Cómo se dibuja la hoja de una puerta. No afecta a la geometría del hueco. */
export type DoorLeaf = 'swing' | 'sliding-glass' | 'none';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distancia en metros desde `wall.a` hasta el CENTRO del hueco, medida sobre el eje. */
  offset: number;
  width: number;
  height: number;
  /** Altura del antepecho (0 en puertas y cristaleras de suelo a techo). */
  sill: number;
  leaf?: DoorLeaf;
}

export interface Slab {
  /** Contorno poligonal en metros, sin repetir el primer punto al final. */
  points: Vec2[];
  /** El usuario lo ha cerrado/validado de forma explícita. */
  closed: boolean;
  thickness: number;
}

export interface Room {
  id: string;
  name: string;
  /** Punto de cámara dentro de la estancia (planta, metros). */
  camera: Vec2;
}

/** Metadatos del archivo de fondo. El binario vive aparte, en IndexedDB. */
export interface PlanSource {
  kind: 'pdf' | 'image';
  fileName: string;
  mime: string;
  bytes: number;
  /** Página elegida (1-based). Siempre 1 en imágenes. */
  page: number;
  pageCount: number;
  /** Tamaño en píxeles del ráster que usa el editor como fondo. */
  width: number;
  height: number;
}

export interface Calibration {
  /** Dos puntos en píxeles del ráster de fondo. */
  a: Vec2;
  b: Vec2;
  /** Longitud real conocida entre ambos, en metros. */
  meters: number;
  /** Metros por píxel resultantes. */
  metersPerPixel: number;
}

export interface Finishes {
  interiorWall: string;
  exteriorWall: string;
  floor: string;
}

/** Opciones de presentación del modelo 3D (no cambian la geometría del proyecto). */
export interface Presentation {
  /** Amueblado automático ilustrativo según el nombre de cada estancia. */
  furnish: boolean;
  /** Cubierta plana ilustrativa sobre el contorno de la losa. */
  roof: boolean;
  ambience: 'day' | 'dusk';
}

export const DEFAULT_PRESENTATION: Presentation = { furnish: true, roof: true, ambience: 'dusk' };

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  units: 'm';
  /** null = lienzo sin plano de fondo. */
  plan: PlanSource | null;
  /** null = sin calibrar: no se muestran cotas en metros ni se puede trazar. */
  calibration: Calibration | null;
  planOpacity: number;
  walls: Wall[];
  openings: Opening[];
  slab: Slab | null;
  rooms: Room[];
  finishes: Finishes;
  presentation?: Presentation;
}

/** Parte del proyecto que entra en deshacer/rehacer. */
export interface GeometrySnapshot {
  calibration: Calibration | null;
  walls: Wall[];
  openings: Opening[];
  slab: Slab | null;
  rooms: Room[];
}

export const DEFAULTS = {
  wallThickness: 0.2,
  wallHeight: 2.6,
  slabThickness: 0.25,
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
  /** Macizo mínimo entre el borde de un hueco y el extremo del muro. */
  openingMargin: 0.05,
  eyeHeight: 1.6,
  /** Radio del «cuerpo» de la cámara al caminar. */
  bodyRadius: 0.22,
} as const;
