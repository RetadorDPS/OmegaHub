/**
 * Descripción completa de una presentación: el proyecto, las piezas añadidas,
 * la visita, las etapas y los datos de navegación. La demo y un proyecto del
 * usuario producen la misma estructura; el visor no distingue entre ambos.
 */
import type { Project, Vec2 } from '../model/types';
import { DEFAULTS } from '../model/types';
import { boundsOf, pointInPolygon } from '../model/geometry';
import { validateProject } from '../model/validate';
import { buildCollisionWorld, type CollisionWorld } from '../generate/collision';
import { layoutWalls, type WallLayout } from '../generate/walls';
import { openingParts } from '../generate/openings';
import { planLineParts } from '../generate/planLines';
import { roofJoists, wallFraming } from '../generate/framing';
import type { Layer, Part } from '../generate/parts';
import type { Pose, Tour, TourStop, V3 } from './tour';
import {
  casaMirador,
  DEMO_BOUNDS,
  DEMO_COLLIDERS,
  DEMO_ENTRY_POINTS,
  DEMO_FLOORS,
  DEMO_LIGHTS,
  DEMO_PARTS,
  GROUND_Y,
  H,
  ROOF,
} from '../demo/casaMirador';
import { demoStagePoses, demoTour } from '../demo/tour';

export type LightingPreset = 'blueprint' | 'day' | 'dusk';

export interface StageDef {
  id: string;
  title: string;
  note: string;
  layers: Layer[];
  lighting: LightingPreset;
  /** Los muros se muestran en bruto, sin acabado. */
  rawWalls?: boolean;
  /** Fase conceptual: no representa una decisión real del proyecto. */
  illustrative?: boolean;
  pose: Pose;
}

export interface EntryPoint {
  id: string;
  name: string;
  point: Vec2;
  yaw: number;
}

export interface SceneDef {
  id: string;
  kind: 'demo' | 'proyecto';
  title: string;
  project: Project;
  layouts: WallLayout[];
  /** Carpinterías, trazado, entramado, mobiliario… todo lo que no es muro o losa. */
  parts: Part[];
  lights: { p: V3; intensity: number; distance: number; main?: boolean }[];
  tour: Tour;
  stages: StageDef[];
  world: CollisionWorld;
  floors: { rect: { x0: number; x1: number; z0: number; z1: number }; y: number }[];
  groundY: number;
  entryPoints: EntryPoint[];
  center: V3;
  radius: number;
  homePose: Pose;
  maquetaPose: Pose;
  presentLighting: LightingPreset;
  hasRoof: boolean;
  groundColor: string;
  /** Extensión del plano azul de la etapa de trazado. */
  sheet: { x0: number; x1: number; z0: number; z1: number };
}

/** Altura del suelo bajo un punto de la planta. */
export function floorHeightAt(def: SceneDef, p: Vec2): number {
  const slab = def.project.slab;
  if (slab && slab.points.length >= 3 && pointInPolygon(p, slab.points)) return 0;
  for (const f of def.floors) {
    if (p.x >= f.rect.x0 && p.x <= f.rect.x1 && p.y >= f.rect.z0 && p.y <= f.rect.z1) return f.y;
  }
  return def.groundY;
}

const FINAL_DEMO_LAYERS: Layer[] = ['base', 'cerramientos', 'carpinterias', 'cubierta', 'acabados', 'mobiliario', 'entorno'];

export function buildDemoScene(): SceneDef {
  const project = casaMirador;
  const layouts = layoutWalls(project);
  const framing = [
    ...wallFraming(layouts),
    ...roofJoists({ x0: ROOF.x0, x1: ROOF.x1, z0: ROOF.z0, z1: ROOF.z1 }, H, 0.22),
  ];
  const parts = [...DEMO_PARTS, ...openingParts(layouts), ...planLineParts(layouts), ...framing];
  const [p0, p1, p2, p3, p4] = demoStagePoses;
  return {
    id: 'demo',
    kind: 'demo',
    title: 'Casa Mirador',
    project,
    layouts,
    parts,
    lights: DEMO_LIGHTS,
    tour: demoTour,
    stages: [
      {
        id: 'plano',
        title: 'Plano',
        note: 'El proyecto en planta: muros, huecos y estancias a escala.',
        layers: ['plano', 'trazado'],
        lighting: 'blueprint',
        pose: p0,
      },
      {
        id: 'base',
        title: 'Trazado y base',
        note: 'Replanteo sobre el terreno y losa de cimentación con la base de la terraza.',
        layers: ['trazado', 'base', 'entorno'],
        lighting: 'day',
        pose: p1,
      },
      {
        id: 'estructura',
        title: 'Estructura',
        note: 'Entramado de muros con cargaderos sobre cada hueco y viguetas de cubierta.',
        layers: ['trazado', 'base', 'estructura', 'entorno'],
        lighting: 'day',
        pose: p2,
      },
      {
        id: 'envolvente',
        title: 'Cerramientos y cubierta',
        note: 'La envolvente cierra el volumen: muros, carpinterías y cubierta, aún sin acabados.',
        layers: ['base', 'cerramientos', 'carpinterias', 'cubierta', 'entorno'],
        lighting: 'day',
        rawWalls: true,
        pose: p3,
      },
      {
        id: 'acabados',
        title: 'Acabados',
        note: 'Revestimientos, pavimento, mobiliario e iluminación interior.',
        layers: FINAL_DEMO_LAYERS,
        lighting: 'dusk',
        pose: p4,
      },
    ],
    world: buildCollisionWorld(project, DEMO_COLLIDERS, DEMO_BOUNDS),
    floors: DEMO_FLOORS,
    groundY: GROUND_Y,
    entryPoints: DEMO_ENTRY_POINTS,
    center: [6.4, 1.2, 4.4],
    radius: 9,
    homePose: demoTour.stops[1].pose,
    maquetaPose: { pos: [6.2, 19.5, 12.5], look: [6.2, 0, 4.6] },
    presentLighting: 'dusk',
    hasRoof: true,
    groundColor: '#4a5a44',
    sheet: { x0: -5, x1: 17, z0: -4, z1: 13.5 },
  };
}

/**
 * Presentación de un proyecto trazado por el usuario. Solo se muestra lo que
 * existe en su modelo: losa, muros, huecos y los acabados que haya elegido.
 * No se añaden cubierta, cimentación, estructura ni mobiliario.
 */
export function buildProjectScene(project: Project): SceneDef {
  const layouts = layoutWalls(project);
  const validation = validateProject(project);
  const pts = [
    ...(project.slab?.points ?? []),
    ...project.walls.flatMap((w) => [w.a, w.b]),
  ];
  const b = boundsOf(pts) ?? { minX: -2, minY: -2, maxX: 2, maxY: 2 };
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 4);
  const maxH = Math.max(DEFAULTS.wallHeight, ...project.walls.map((w) => w.height));
  const slabT = project.slab?.thickness ?? DEFAULTS.slabThickness;
  const groundY = -slabT;
  const center: V3 = [cx, maxH * 0.4, cz];
  const d = span * 1.15 + 5;
  const exterior: Pose = { pos: [cx + d * 0.72, maxH + span * 0.42, cz + d * 0.86], look: center };
  const maqueta: Pose = { pos: [cx, span * 1.35 + 6, cz + span * 0.42], look: [cx, 0, cz] };

  const rooms = project.rooms.filter((r) => validation.walkableRooms.includes(r.id));
  const entryPoints: EntryPoint[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    point: r.camera,
    // Mira hacia el centro de la planta para no arrancar de cara a un muro.
    yaw: Math.atan2(cx - r.camera.x, cz - r.camera.y),
  }));

  const stops: TourStop[] = [
    {
      id: 'exterior',
      chapter: 'Exterior',
      label: project.name,
      note: 'Volumen generado a partir de tu trazado.',
      pose: exterior,
      onFoot: false,
    },
    {
      id: 'maqueta',
      chapter: 'Maqueta',
      label: 'Distribución en planta',
      note: 'Vista superior sin cubierta.',
      pose: maqueta,
      onFoot: false,
      cutaway: true,
    },
    ...entryPoints.map<TourStop>((e) => ({
      id: `estancia-${e.id}`,
      chapter: e.name,
      label: e.name,
      pose: {
        pos: [e.point.x, DEFAULTS.eyeHeight, e.point.y],
        look: [
          e.point.x + Math.sin(e.yaw) * 3,
          DEFAULTS.eyeHeight - 0.15,
          e.point.y + Math.cos(e.yaw) * 3,
        ],
      },
      onFoot: true,
    })),
  ];
  const tour: Tour = {
    stops,
    legs: stops.slice(1).map((_, i) =>
      i === 0
        ? {
            kind: 'path' as const,
            seconds: 4.5,
            via: [[cx + d * 0.4, (exterior.pos[1] + maqueta.pos[1]) / 2 + 2, cz + d * 0.7]] as V3[],
            lookVia: [[cx, maxH * 0.2, cz]] as V3[],
          }
        : { kind: 'cut' as const },
    ),
  };

  const margin = Math.max(3, span * 0.35);
  const stagePose: Pose = exterior;
  return {
    id: project.id,
    kind: 'proyecto',
    title: project.name,
    project,
    layouts,
    parts: [...openingParts(layouts), ...planLineParts(layouts)],
    lights: [],
    tour,
    stages: [
      {
        id: 'trazado',
        title: 'Trazado',
        note: 'Los muros y huecos que has dibujado, a escala sobre el plano.',
        layers: ['plano', 'trazado'],
        lighting: 'blueprint',
        pose: maqueta,
      },
      {
        id: 'losa',
        title: 'Losa',
        note: 'El contorno que has validado, con el espesor indicado.',
        layers: ['trazado', 'base', 'entorno'],
        lighting: 'day',
        pose: stagePose,
      },
      {
        id: 'muros',
        title: 'Muros y huecos',
        note: 'Muros con su espesor y altura; puertas y ventanas abiertas en el macizo.',
        layers: ['base', 'cerramientos', 'carpinterias', 'entorno'],
        lighting: 'day',
        rawWalls: true,
        pose: stagePose,
      },
      {
        id: 'acabados',
        title: 'Acabados',
        note: 'Acabados predefinidos elegidos en el visor. No son una especificación de materiales.',
        layers: ['base', 'cerramientos', 'carpinterias', 'acabados', 'entorno'],
        lighting: 'day',
        illustrative: true,
        pose: stagePose,
      },
    ],
    world: buildCollisionWorld(project, [], [
      [
        { x: b.minX - 25, y: b.minY - 25 },
        { x: b.maxX + 25, y: b.minY - 25 },
        { x: b.maxX + 25, y: b.maxY + 25 },
        { x: b.minX - 25, y: b.maxY + 25 },
      ],
    ]),
    floors: [],
    groundY,
    entryPoints,
    center,
    radius: span * 0.75,
    homePose: exterior,
    maquetaPose: maqueta,
    presentLighting: 'day',
    hasRoof: false,
    groundColor: '#b9b6ad',
    sheet: { x0: b.minX - margin, x1: b.maxX + margin, z0: b.minY - margin, z1: b.maxY + margin },
  };
}

/** Capas visibles fuera del modo obra: el estado final del proyecto. */
export const finalLayers = (def: SceneDef): Layer[] => def.stages[def.stages.length - 1].layers;
