import { create } from 'zustand';
import {
  DEFAULTS,
  type Calibration,
  type GeometrySnapshot,
  type Opening,
  type OpeningKind,
  type Project,
  type Room,
  type Vec2,
  type Wall,
} from '../model/types';
import {
  dist,
  isSelfIntersecting,
  normalize,
  proposeOutlineFromWalls,
  round,
  sub,
  wallLength,
} from '../model/geometry';
import {
  coincidentEnds,
  fitOpeningOffset,
  makeOpening,
  makeWall,
  newId,
  rescalePlanGeometry,
  snapshotOf,
} from '../model/project';
import type { PlanRaster } from './planFile';

export type Tool = 'select' | 'pan' | 'calibrate' | 'wall' | 'door' | 'window' | 'slab' | 'room';

export type Selection =
  | { type: 'wall'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'room'; id: string }
  | { type: 'slab' }
  | null;

export interface Notice {
  kind: 'error' | 'info' | 'ok';
  text: string;
}

export interface EditorState {
  project: Project | null;
  past: GeometrySnapshot[];
  future: GeometrySnapshot[];
  /** Estado previo a un arrastre en curso (un arrastre = un solo paso de deshacer). */
  gesture: GeometrySnapshot | null;
  tool: Tool;
  selection: Selection;
  /** Puntos marcados para calibrar, en píxeles del ráster. */
  calibration: { a: Vec2 | null; b: Vec2 | null };
  /** Último punto de la cadena de muros en curso. */
  chain: { start: Vec2; last: Vec2 } | null;
  raster: PlanRaster | null;
  rasterBusy: boolean;
  notice: Notice | null;
  /** Cambia con cada modificación: dispara el guardado automático. */
  revision: number;
}

const HISTORY_LIMIT = 120;

export const useEditor = create<EditorState>(() => ({
  project: null,
  past: [],
  future: [],
  gesture: null,
  tool: 'select',
  selection: null,
  calibration: { a: null, b: null },
  chain: null,
  raster: null,
  rasterBusy: false,
  notice: null,
  revision: 0,
}));

const get = () => useEditor.getState();
const set = useEditor.setState;

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function notify(kind: Notice['kind'], text: string, ms = 5200) {
  clearTimeout(noticeTimer);
  set({ notice: { kind, text } });
  noticeTimer = setTimeout(() => set({ notice: null }), ms);
}

/** Metros por píxel para DIBUJAR el fondo. Sin calibrar es un valor provisional, no una escala. */
export function displayMetersPerPixel(p: Project): number {
  if (p.calibration) return p.calibration.metersPerPixel;
  if (p.plan) return 20 / Math.max(p.plan.width, p.plan.height);
  return 1;
}

/** ¿Se pueden mostrar cotas en metros y trazar? */
export const isScaled = (p: Project): boolean => !p.plan || !!p.calibration;

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

export function openProject(project: Project) {
  get().raster?.release();
  set({
    project,
    past: [],
    future: [],
    gesture: null,
    tool: project.plan && !project.calibration ? 'calibrate' : 'select',
    selection: null,
    calibration: { a: null, b: null },
    chain: null,
    raster: null,
    rasterBusy: false,
    notice: null,
  });
}

export function closeProject() {
  get().raster?.release();
  set({ project: null, past: [], future: [], raster: null, selection: null, chain: null, gesture: null });
}

function write(patch: Partial<GeometrySnapshot>, record: boolean) {
  const { project, past } = get();
  if (!project) return;
  const next: Project = { ...project, ...patch, updatedAt: Date.now() };
  set((s) => ({
    project: next,
    past: record ? [...past.slice(-HISTORY_LIMIT + 1), snapshotOf(project)] : past,
    future: record ? [] : s.future,
    revision: s.revision + 1,
  }));
}

/** Aplica un cambio de geometría como un paso de deshacer. */
export const commit = (patch: Partial<GeometrySnapshot>) => write(patch, !get().gesture);

export function beginGesture() {
  const { project, gesture } = get();
  if (project && !gesture) set({ gesture: snapshotOf(project) });
}

export function endGesture() {
  const { gesture, project, past } = get();
  if (!gesture || !project) return;
  const changed = JSON.stringify(gesture) !== JSON.stringify(snapshotOf(project));
  set({
    gesture: null,
    past: changed ? [...past.slice(-HISTORY_LIMIT + 1), gesture] : past,
    future: changed ? [] : get().future,
  });
}

function restore(snapshot: GeometrySnapshot) {
  const { project } = get();
  if (!project) return;
  set((s) => ({
    project: { ...project, ...snapshot, updatedAt: Date.now() },
    selection: null,
    chain: null,
    revision: s.revision + 1,
  }));
}

export function undo() {
  const { past, future, project } = get();
  if (!project || past.length === 0) return;
  const prev = past[past.length - 1];
  set({ past: past.slice(0, -1), future: [snapshotOf(project), ...future] });
  restore(prev);
}

export function redo() {
  const { past, future, project } = get();
  if (!project || future.length === 0) return;
  const next = future[0];
  set({ past: [...past, snapshotOf(project)], future: future.slice(1) });
  restore(next);
}

/** Cambios que no forman parte de la geometría (nombre, opacidad, acabados, plano). */
export function patchMeta(patch: Partial<Pick<Project, 'name' | 'planOpacity' | 'finishes' | 'plan'>>) {
  const { project } = get();
  if (!project) return;
  set((s) => ({ project: { ...project, ...patch, updatedAt: Date.now() }, revision: s.revision + 1 }));
}

export function setTool(tool: Tool) {
  set({ tool, chain: null, calibration: tool === 'calibrate' ? { a: null, b: null } : get().calibration });
}

export const select = (selection: Selection) => set({ selection });

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

export function addWall(a: Vec2, b: Vec2): Wall | null {
  const { project } = get();
  if (!project) return null;
  if (dist(a, b) < 0.1) return null;
  // Los muros nuevos heredan espesor y altura del último trazado.
  const lastWall = project.walls[project.walls.length - 1];
  const wall = makeWall(a, b, lastWall ? { thickness: lastWall.thickness, height: lastWall.height } : {});
  commit({ walls: [...project.walls, wall] });
  return wall;
}

export function updateWall(id: string, patch: Partial<Pick<Wall, 'thickness' | 'height'>>) {
  const { project } = get();
  if (!project) return;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const safe: Partial<Wall> = {};
  if (patch.thickness !== undefined && Number.isFinite(patch.thickness)) safe.thickness = clamp(patch.thickness, 0.05, 1);
  if (patch.height !== undefined && Number.isFinite(patch.height)) safe.height = clamp(patch.height, 0.5, 8);
  commit({ walls: project.walls.map((w) => (w.id === id ? { ...w, ...safe } : w)) });
}

/** Mueve un extremo y, con él, los extremos de otros muros que coincidían (la esquina sigue unida). */
export function moveWallEnd(id: string, end: 'a' | 'b', to: Vec2, original?: Vec2) {
  const { project } = get();
  if (!project) return;
  const wall = project.walls.find((w) => w.id === id);
  if (!wall) return;
  const from = original ?? wall[end];
  const joined = coincidentEnds(project.walls, from);
  const hits = new Set(joined.map((j) => `${j.wallId}:${j.end}`));
  hits.add(`${id}:${end}`);
  commit({
    walls: project.walls.map((w) => ({
      ...w,
      a: hits.has(`${w.id}:a`) ? { ...to } : w.a,
      b: hits.has(`${w.id}:b`) ? { ...to } : w.b,
    })),
  });
}

/** Ajusta la longitud desplazando el extremo B sobre la misma dirección. */
export function setWallLength(id: string, length: number) {
  const { project } = get();
  if (!project || !Number.isFinite(length)) return;
  const wall = project.walls.find((w) => w.id === id);
  if (!wall) return;
  const L = Math.min(200, Math.max(0.1, length));
  const d = normalize(sub(wall.b, wall.a));
  moveWallEnd(id, 'b', { x: round(wall.a.x + d.x * L, 4), y: round(wall.a.y + d.y * L, 4) });
}

export function translateWall(id: string, original: Wall, delta: Vec2) {
  const { project } = get();
  if (!project) return;
  commit({
    walls: project.walls.map((w) =>
      w.id === id
        ? { ...w, a: { x: original.a.x + delta.x, y: original.a.y + delta.y }, b: { x: original.b.x + delta.x, y: original.b.y + delta.y } }
        : w,
    ),
  });
}

export function addOpening(wallId: string, kind: OpeningKind, along: number): Opening | null {
  const { project } = get();
  if (!project) return null;
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const base = kind === 'door' ? DEFAULTS.door : DEFAULTS.window;
  const height = Math.min(base.height, wall.height - base.sill);
  const offset = fitOpeningOffset(wall, project.openings, along, base.width);
  if (offset === null || height < 0.3) {
    notify(
      'error',
      kind === 'door'
        ? `No cabe una puerta de ${String(base.width).replace('.', ',')} m en ese tramo de muro. Elige un tramo más largo o reduce los huecos vecinos.`
        : `No cabe una ventana de ${String(base.width).replace('.', ',')} m en ese tramo de muro.`,
    );
    return null;
  }
  const opening = makeOpening(wallId, kind, round(offset, 3), { height });
  commit({ openings: [...project.openings, opening] });
  set({ selection: { type: 'opening', id: opening.id } });
  return opening;
}

/**
 * Cambia un hueco. Si el resultado se sale del muro o pisa otro hueco no se
 * aplica: se avisa y se conserva el estado válido.
 */
export function updateOpening(id: string, patch: Partial<Pick<Opening, 'offset' | 'width' | 'height' | 'sill'>>, quiet = false): boolean {
  const { project } = get();
  if (!project) return false;
  const current = project.openings.find((o) => o.id === id);
  const wall = current && project.walls.find((w) => w.id === current.wallId);
  if (!current || !wall) return false;
  const next = { ...current, ...patch };
  if (![next.offset, next.width, next.height, next.sill].every(Number.isFinite)) return false;
  next.width = Math.max(0.3, next.width);
  next.sill = Math.max(0, next.sill);
  next.height = Math.max(0.3, next.height);
  const label = current.kind === 'door' ? 'La puerta' : 'La ventana';
  if (next.sill + next.height > wall.height + 1e-6) {
    if (!quiet) notify('error', `${label} no puede superar la altura del muro (${String(wall.height).replace('.', ',')} m).`);
    return false;
  }
  const fitted = fitOpeningOffset(wall, project.openings, next.offset, next.width, id);
  if (fitted === null) {
    if (!quiet) notify('error', `${label} no cabe en el muro con ese ancho: se saldría o pisaría otro hueco.`);
    return false;
  }
  const moved = Math.abs(fitted - next.offset) > 1e-4;
  if (moved && patch.offset !== undefined && patch.width === undefined && !quiet) {
    notify('info', `${label} se ha ajustado para quedar dentro del muro y no pisar otro hueco.`);
  }
  next.offset = round(fitted, 3);
  commit({ openings: project.openings.map((o) => (o.id === id ? next : o)) });
  return true;
}

export function deleteSelection() {
  const { project, selection } = get();
  if (!project || !selection) return;
  if (selection.type === 'wall') {
    commit({
      walls: project.walls.filter((w) => w.id !== selection.id),
      // Los huecos no existen sin su muro.
      openings: project.openings.filter((o) => o.wallId !== selection.id),
    });
  } else if (selection.type === 'opening') {
    commit({ openings: project.openings.filter((o) => o.id !== selection.id) });
  } else if (selection.type === 'room') {
    commit({ rooms: project.rooms.filter((r) => r.id !== selection.id) });
  } else if (selection.type === 'slab') {
    commit({ slab: null });
  }
  set({ selection: null });
}

// --- Losa -------------------------------------------------------------------

export function addSlabPoint(p: Vec2) {
  const { project } = get();
  if (!project) return;
  const slab = project.slab && !project.slab.closed ? project.slab : null;
  const points = slab ? [...slab.points, p] : [p];
  commit({ slab: { points, closed: false, thickness: project.slab?.thickness ?? DEFAULTS.slabThickness } });
}

export function closeSlab(): boolean {
  const { project } = get();
  const slab = project?.slab;
  if (!project || !slab) return false;
  if (slab.points.length < 3) {
    notify('error', 'El contorno necesita al menos tres puntos para poder cerrarse.');
    return false;
  }
  if (isSelfIntersecting(slab.points)) {
    notify('error', 'El contorno se cruza consigo mismo y no puede cerrarse así. Deshaz el último punto o mueve los vértices.');
    return false;
  }
  commit({ slab: { ...slab, closed: true } });
  set({ tool: 'select', selection: { type: 'slab' } });
  notify('ok', 'Contorno de losa cerrado.');
  return true;
}

export function proposeSlab(): boolean {
  const { project } = get();
  if (!project) return false;
  const outline = proposeOutlineFromWalls(project.walls);
  if (!outline) {
    notify('error', 'Los muros no cierran un perímetro. Une los extremos sueltos o traza el contorno a mano con la herramienta Losa.');
    return false;
  }
  commit({ slab: { points: outline, closed: true, thickness: project.slab?.thickness ?? DEFAULTS.slabThickness } });
  set({ selection: { type: 'slab' }, tool: 'select' });
  notify('ok', 'Contorno propuesto a partir de los muros. Revísalo: puedes mover sus vértices o borrarlo.');
  return true;
}

export function moveSlabPoint(index: number, to: Vec2) {
  const { project } = get();
  if (!project?.slab) return;
  commit({ slab: { ...project.slab, points: project.slab.points.map((p, i) => (i === index ? to : p)) } });
}

export function setSlabThickness(thickness: number) {
  const { project } = get();
  if (!project?.slab || !Number.isFinite(thickness)) return;
  commit({ slab: { ...project.slab, thickness: Math.min(1, Math.max(0.05, thickness)) } });
}

// --- Estancias --------------------------------------------------------------

export function addRoom(camera: Vec2): Room | null {
  const { project } = get();
  if (!project) return null;
  const room: Room = { id: newId('r'), name: `Estancia ${project.rooms.length + 1}`, camera };
  commit({ rooms: [...project.rooms, room] });
  set({ selection: { type: 'room', id: room.id }, tool: 'select' });
  return room;
}

export function updateRoom(id: string, patch: Partial<Pick<Room, 'name' | 'camera'>>) {
  const { project } = get();
  if (!project) return;
  commit({ rooms: project.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

// --- Escala -----------------------------------------------------------------

export function setCalibrationPoint(p: Vec2) {
  const { calibration } = get();
  if (!calibration.a || calibration.b) set({ calibration: { a: p, b: null } });
  else set({ calibration: { a: calibration.a, b: p } });
}

export function applyCalibration(meters: number): boolean {
  const { project, calibration } = get();
  if (!project || !project.plan) return false;
  const { a, b } = calibration;
  if (!a || !b) {
    notify('error', 'Marca primero dos puntos sobre el plano.');
    return false;
  }
  const px = dist(a, b);
  if (px < 8) {
    notify('error', 'Los dos puntos están demasiado juntos para medir con precisión. Elige un tramo más largo.');
    return false;
  }
  if (!Number.isFinite(meters) || meters <= 0 || meters > 2000) {
    notify('error', 'Indica la longitud real en metros (por ejemplo 4 o 3,65).');
    return false;
  }
  const metersPerPixel = meters / px;
  const next: Calibration = { a, b, meters, metersPerPixel };
  const previous = project.calibration?.metersPerPixel;
  const base = snapshotOf(project);
  const geometry = previous ? rescalePlanGeometry(base, metersPerPixel / previous) : base;
  commit({ ...geometry, calibration: next });
  set({ tool: 'select', calibration: { a: null, b: null } });
  notify('ok', `Escala aplicada: ${String(round(meters, 3)).replace('.', ',')} m entre los dos puntos. Vale para esta ${project.plan.kind === 'pdf' ? 'página' : 'imagen'}.`);
  return true;
}

export const selectedWall = (s: EditorState): Wall | null =>
  s.selection?.type === 'wall' ? s.project?.walls.find((w) => w.id === (s.selection as { id: string }).id) ?? null : null;

export const wallLengthOf = wallLength;
