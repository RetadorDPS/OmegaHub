/**
 * Descripción completa de una presentación: el proyecto, las piezas añadidas,
 * la visita, las etapas y los datos de navegación. La demo y un proyecto del
 * usuario producen la misma estructura; el visor no distingue entre ambos.
 */
import type { Project, Vec2 } from '../model/types';
import { DEFAULT_PRESENTATION, DEFAULTS } from '../model/types';
import { boundsOf, pointInPolygon } from '../model/geometry';
import { validateProject } from '../model/validate';
import { buildCollisionWorld, type Collider, type CollisionWorld } from '../generate/collision';
import { furnishProject, type Furnishing } from '../generate/furnish';
import { findPath, pathLength } from '../generate/pathfind';
import { layoutWalls, type WallLayout } from '../generate/walls';
import { openingParts } from '../generate/openings';
import { planLineParts } from '../generate/planLines';
import { roofJoists, wallFraming } from '../generate/framing';
import type { Layer, Part } from '../generate/parts';
import type { Pose, Tour, TourLeg, TourStop, V3 } from './tour';
import {
  villaMirador,
  DEMO_BOUNDS,
  DEMO_COLLIDERS,
  DEMO_ENTRY_POINTS,
  DEMO_FLOORS,
  DEMO_LIGHTS,
  DEMO_PARTS,
  GROUND_Y,
  H,
  ROOF,
} from '../demo/villaMirador';
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
  lights: { p: V3; intensity: number; distance: number; main?: boolean; color?: string }[];
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
  /** Cubierta generada sobre un contorno (planos propios). */
  roof?: { points: Vec2[]; y: number; thickness: number };
  /** Resumen del amueblado ilustrativo, si lo hay. */
  furnishing?: Furnishing['placed'];
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
  const project = villaMirador;
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
    title: 'Villa Mirador',
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
        note: 'Replanteo sobre el terreno, losa de cimentación, base de la terraza y vaso de la piscina.',
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
    center: [10.5, 1.4, 7.5],
    radius: 14,
    homePose: demoTour.stops[1].pose,
    maquetaPose: { pos: [10.5, 30, 21], look: [10.5, 0, 6.5] },
    presentLighting: 'dusk',
    hasRoof: true,
    groundColor: '#4a5a44',
    sheet: { x0: -6, x1: 27, z0: -6, z1: 20 },
  };
}

/**
 * Presentación de un proyecto trazado por el usuario. Solo se muestra lo que
 * existe en su modelo: losa, muros, huecos y los acabados que haya elegido.
 * No se añaden cubierta, cimentación, estructura ni mobiliario.
 */
export interface ProjectSceneOptions {
  /** Altura del suelo del proyecto sobre la calle (pisos en altura). */
  elevation?: number;
  /** Piezas de alrededor (resto del edificio, calle…), en coordenadas del proyecto. */
  context?: Part[];
  contextColliders?: Collider[];
  /** Suelos transitables fuera de la losa (balcones). */
  floors?: SceneDef['floors'];
  exteriorPose?: Pose;
}

export function buildProjectScene(project: Project, opts: ProjectSceneOptions = {}): SceneDef {
  const layouts = layoutWalls(project);
  const validation = validateProject(project);
  const presentation = { ...DEFAULT_PRESENTATION, ...(project.presentation ?? {}) };
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
  const groundY = opts.elevation ? -opts.elevation - 0.02 : -slabT;
  const center: V3 = [cx, maxH * 0.4, cz];
  const d = span * 1.15 + 5;
  const exterior: Pose = opts.exteriorPose ?? { pos: [cx + d * 0.72, maxH + span * 0.42, cz + d * 0.86], look: center };
  const maqueta: Pose = { pos: [cx, span * 1.35 + 6, cz + span * 0.42], look: [cx, 0, cz] };
  const bounds: Vec2[][] = [
    [
      { x: b.minX - 25, y: b.minY - 25 },
      { x: b.maxX + 25, y: b.minY - 25 },
      { x: b.maxX + 25, y: b.maxY + 25 },
      { x: b.minX - 25, y: b.maxY + 25 },
    ],
  ];

  // Amueblado ilustrativo: se coloca contra los muros y añade sus colisiones.
  const wallsOnly = buildCollisionWorld(project);
  const furnishing = presentation.furnish && validation.canGenerate ? furnishProject(project, wallsOnly) : null;
  const world = buildCollisionWorld(project, [...(furnishing?.colliders ?? []), ...(opts.contextColliders ?? [])], bounds);

  const rooms = project.rooms.filter((r) => validation.walkableRooms.includes(r.id));
  const entryPoints: EntryPoint[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    point: r.camera,
    // Mira hacia el centro de la planta para no arrancar de cara a un muro.
    yaw: Math.atan2(cx - r.camera.x, cz - r.camera.y),
  }));

  const eye = DEFAULTS.eyeHeight;
  const roomStops = entryPoints.map<TourStop>((e) => ({
    id: `estancia-${e.id}`,
    chapter: e.name,
    label: e.name,
    pose: {
      pos: [e.point.x, eye, e.point.y],
      look: [e.point.x + Math.sin(e.yaw) * 3, eye - 0.15, e.point.y + Math.cos(e.yaw) * 3],
    },
    onFoot: true,
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
    ...roomStops,
  ];
  // Entre estancias se busca un camino a pie por las puertas; si no existe, fundido.
  const searchBox = { minX: b.minX - 0.5, minY: b.minY - 0.5, maxX: b.maxX + 0.5, maxY: b.maxY + 0.5 };
  const legs: TourLeg[] = stops.slice(1).map((_, i): TourLeg => {
    if (i === 0) {
      return {
        kind: 'path',
        seconds: 4.5,
        via: [[cx + d * 0.4, (exterior.pos[1] + maqueta.pos[1]) / 2 + 2, cz + d * 0.7]],
        lookVia: [[cx, maxH * 0.2, cz]],
      };
    }
    if (i === 1) return { kind: 'cut' };
    const from = entryPoints[i - 2].point;
    const to = entryPoints[i - 1].point;
    const path = findPath(world, from, to, { radius: DEFAULTS.bodyRadius + 0.05, bounds: searchBox });
    if (!path) return { kind: 'cut' };
    const via = path.slice(1, -1);
    const target = stops[i + 1].pose.look;
    return {
      kind: 'path',
      seconds: Math.min(16, Math.max(3, pathLength(path) / 1.0)),
      via: via.map((p) => [p.x, eye, p.y] as V3),
      lookVia: via.map((p, k) => {
        const next = via[k + 1] ?? { x: target[0], y: target[2] };
        const dx = next.x - p.x;
        const dz = next.y - p.y;
        const l = Math.hypot(dx, dz) || 1;
        return [p.x + (dx / l) * 2.5, eye - 0.1, p.y + (dz / l) * 2.5] as V3;
      }),
    };
  });
  const tour: Tour = { stops, legs };

  const margin = Math.max(3, span * 0.35);
  const stagePose: Pose = exterior;
  const finalLayersList: Layer[] = ['base', 'cerramientos', 'carpinterias', 'acabados', 'entorno'];
  if (opts.context?.length) finalLayersList.push('contexto');
  if (presentation.roof) finalLayersList.push('cubierta');
  if (furnishing) finalLayersList.push('mobiliario');
  const stages: StageDef[] = [
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
      title: furnishing ? 'Acabados y amueblado' : 'Acabados',
      note: furnishing
        ? 'Acabados predefinidos y mobiliario de ejemplo colocado según el nombre de cada estancia. No es un proyecto de interiorismo.'
        : 'Acabados predefinidos elegidos en el visor. No son una especificación de materiales.',
      layers: finalLayersList,
      lighting: presentation.ambience === 'dusk' ? 'dusk' : 'day',
      illustrative: true,
      pose: stagePose,
    },
  ];
  return {
    id: project.id,
    kind: 'proyecto',
    title: project.name,
    project,
    layouts,
    parts: [...openingParts(layouts), ...planLineParts(layouts), ...(furnishing?.parts ?? []), ...(opts.context ?? [])],
    lights: furnishing?.lights ?? [],
    tour,
    stages,
    world,
    floors: opts.floors ?? [],
    groundY,
    entryPoints,
    center,
    radius: span * 0.75,
    homePose: exterior,
    maquetaPose: maqueta,
    presentLighting: presentation.ambience === 'dusk' ? 'dusk' : 'day',
    hasRoof: presentation.roof,
    groundColor: '#4a5a44',
    sheet: { x0: b.minX - margin, x1: b.maxX + margin, z0: b.minY - margin, z1: b.maxY + margin },
    roof:
      presentation.roof && project.slab?.closed
        ? { points: project.slab.points, y: maxH, thickness: 0.3 }
        : undefined,
    furnishing: furnishing?.placed,
  };
}

/** Capas visibles fuera del modo obra: el estado final del proyecto. */
export const finalLayers = (def: SceneDef): Layer[] => def.stages[def.stages.length - 1].layers;
