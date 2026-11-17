/**
 * Amueblado ILUSTRATIVO de un plano propio a partir del nombre de cada
 * estancia. No forma parte del proyecto: es una ayuda de presentación que el
 * usuario puede desactivar. Cada pieza se coloca solo si cabe sin tocar muros,
 * sin tapar puertas y sin ocupar el punto de cámara de la estancia.
 */
import { DEFAULTS, type Project, type Room, type Vec2 } from '../model/types';
import { pointInPolygon, pointOnWall, wallDir } from '../model/geometry';
import { distanceToColliders, rectCollider, type Collider, type CollisionWorld } from './collision';
import { boxPart, cylPart, spherePart, type Layer, type MatKey, type Part } from './parts';

export type RoomKind = 'dormitorio' | 'salon' | 'cocina' | 'comedor' | 'bano' | 'estudio' | 'otra';

export function roomKind(name: string): RoomKind {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (/dorm|habitac|cuarto|suite|alcoba|bedroom/.test(n)) return 'dormitorio';
  if (/salon|estar|living|sala/.test(n)) return 'salon';
  if (/cocina|kitchen|office/.test(n)) return 'cocina';
  if (/comedor|dining/.test(n)) return 'comedor';
  if (/bano|aseo|wc|lavabo|ducha|bath/.test(n)) return 'bano';
  if (/estudio|despacho|oficina|escritorio|study/.test(n)) return 'estudio';
  return 'otra';
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Furnishing {
  parts: Part[];
  colliders: Collider[];
  lights: { p: [number, number, number]; intensity: number; distance: number }[];
  /** Qué se ha amueblado, para explicarlo en la interfaz. */
  placed: { room: string; kind: RoomKind; items: number }[];
}

const M: Layer = 'mobiliario';

/** Distancia libre desde `p` en una dirección hasta el primer muro o el borde de la losa. */
function freeRun(p: Vec2, dir: Vec2, walls: CollisionWorld, outline: Vec2[], max = 15): number {
  const step = 0.05;
  for (let d = step; d <= max; d += step) {
    const q = { x: p.x + dir.x * d, y: p.y + dir.y * d };
    if (!pointInPolygon(q, outline) || distanceToColliders(q, walls.colliders) < 0.005) return d - step;
  }
  return max;
}

/** Rectángulo libre aproximado de la estancia alrededor de su punto de cámara. */
function roomRect(room: Room, walls: CollisionWorld, outline: Vec2[]): Rect {
  const p = room.camera;
  const run = (dx: number, dy: number) => {
    // Se promedian tres rayos paralelos para no quedarse cortos por una esquina.
    const off = [-0.4, 0, 0.4].map((o) => freeRun({ x: p.x + dy * o, y: p.y + dx * o }, { x: dx, y: dy }, walls, outline));
    return Math.max(...off.sort((a, b) => a - b).slice(0, 2));
  };
  return { x0: p.x - run(-1, 0), x1: p.x + run(1, 0), y0: p.y - run(0, -1), y1: p.y + run(0, 1) };
}

export function furnishProject(project: Project, walls: CollisionWorld): Furnishing {
  const outline = project.slab?.points ?? [];
  const out: Furnishing = { parts: [], colliders: [], lights: [], placed: [] };
  if (outline.length < 3) return out;
  const height = Math.max(DEFAULTS.wallHeight, ...project.walls.map((w) => w.height));
  const wallsById = new Map(project.walls.map((w) => [w.id, w]));
  const doors: Vec2[] = project.openings
    .filter((o) => o.kind === 'door' && wallsById.has(o.wallId))
    .map((o) => pointOnWall(wallsById.get(o.wallId)!, o.offset));
  const occupied: Rect[] = [];
  // Para medir cada estancia, las puertas cuentan como cerradas: así una
  // estancia no «se derrama» en la de al lado a través del hueco.
  const closedDoors: CollisionWorld = {
    colliders: [
      ...walls.colliders,
      ...project.openings
        .filter((o) => o.kind === 'door' && wallsById.has(o.wallId))
        .map((o) => {
          const w = wallsById.get(o.wallId)!;
          return { center: pointOnWall(w, o.offset), dir: wallDir(w), halfLength: o.width / 2 + 0.02, halfThickness: w.thickness / 2 };
        }),
    ],
  };

  for (const room of project.rooms) {
    if (!pointInPolygon(room.camera, outline)) continue;
    const kind = roomKind(room.name);
    const rect = roomRect(room, closedDoors, outline);
    const before = out.parts.length;

    /** ¿Cabe un rectángulo (con holgura) en la estancia? */
    const fits = (r: Rect, clearance = 0.03) => {
      // Rejilla de muestras cada 20 cm, bordes incluidos: un tabique fino no se cuela entre ellas.
      const nx = Math.max(2, Math.ceil((r.x1 - r.x0) / 0.2));
      const ny = Math.max(2, Math.ceil((r.y1 - r.y0) / 0.2));
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= ny; j++) {
          const q = { x: r.x0 + ((r.x1 - r.x0) * i) / nx, y: r.y0 + ((r.y1 - r.y0) * j) / ny };
          if (!pointInPolygon(q, outline) || distanceToColliders(q, closedDoors.colliders) < clearance) return false;
        }
      }
      // No tapa puertas ni el punto de cámara, ni pisa otra pieza.
      const near = (q: Vec2, d: number) => q.x > r.x0 - d && q.x < r.x1 + d && q.y > r.y0 - d && q.y < r.y1 + d;
      if (doors.some((d) => near(d, 0.75))) return false;
      // Ningún punto de cámara (de esta u otra estancia abierta a ella) queda ocupado.
      if (project.rooms.some((q) => near(q.camera, DEFAULTS.bodyRadius + 0.25))) return false;
      return !occupied.some((o) => r.x0 < o.x1 && o.x0 < r.x1 && r.y0 < o.y1 && o.y0 < r.y1);
    };
    const claim = (r: Rect, name: string) => {
      occupied.push(r);
      out.colliders.push(rectCollider(r.x0, r.y0, r.x1, r.y1, name));
    };
    const add = (...p: Part[]) => out.parts.push(...p);

    /**
     * Prueba a apoyar una pieza de ancho `w` y fondo `d` contra cada lado de la
     * estancia (empezando por el más largo) y devuelve la primera que cabe.
     */
    const againstWall = (w: number, d: number, gap = 0.04): { r: Rect; side: 'n' | 's' | 'e' | 'o' } | null => {
      const cx = (rect.x0 + rect.x1) / 2;
      const cy = (rect.y0 + rect.y1) / 2;
      const horizontal = rect.x1 - rect.x0 >= rect.y1 - rect.y0;
      const sides: ('n' | 's' | 'e' | 'o')[] = horizontal ? ['n', 's', 'o', 'e'] : ['o', 'e', 'n', 's'];
      for (const side of sides) {
        const along = side === 'n' || side === 's' ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
        // Varias posiciones a lo largo del lado: centro y desplazadas.
        for (const shift of [0, -0.25, 0.25, -0.4, 0.4]) {
          const c = shift * Math.max(0, along - w);
          let r: Rect;
          if (side === 'n') r = { x0: cx + c - w / 2, x1: cx + c + w / 2, y0: rect.y0 + gap, y1: rect.y0 + gap + d };
          else if (side === 's') r = { x0: cx + c - w / 2, x1: cx + c + w / 2, y0: rect.y1 - gap - d, y1: rect.y1 - gap };
          else if (side === 'o') r = { x0: rect.x0 + gap, x1: rect.x0 + gap + d, y0: cy + c - w / 2, y1: cy + c + w / 2 };
          else r = { x0: rect.x1 - gap - d, x1: rect.x1 - gap, y0: cy + c - w / 2, y1: cy + c + w / 2 };
          if (fits(r)) return { r, side };
        }
      }
      return null;
    };
    /** Caja en coordenadas «del lado»: u a lo largo de la pared, v hacia dentro de la estancia. */
    const local = (base: Rect, side: 'n' | 's' | 'e' | 'o') => {
      const alongX = side === 'n' || side === 's';
      return (mat: MatKey, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, r = 0) => {
        const L = alongX ? base.x1 - base.x0 : base.y1 - base.y0;
        const D = alongX ? base.y1 - base.y0 : base.x1 - base.x0;
        u0 = Math.max(0, u0);
        u1 = Math.min(L, u1);
        v0 = Math.max(0, v0);
        v1 = Math.min(D, v1);
        let x0: number, x1: number, z0: number, z1: number;
        if (side === 'n') [x0, x1, z0, z1] = [base.x0 + u0, base.x0 + u1, base.y0 + v0, base.y0 + v1];
        else if (side === 's') [x0, x1, z0, z1] = [base.x0 + u0, base.x0 + u1, base.y1 - v1, base.y1 - v0];
        else if (side === 'o') [x0, x1, z0, z1] = [base.x0 + v0, base.x0 + v1, base.y0 + u0, base.y0 + u1];
        else [x0, x1, z0, z1] = [base.x1 - v1, base.x1 - v0, base.y0 + u0, base.y0 + u1];
        add(boxPart(M, mat, x0, x1, z0, z1, y0, y1, r ? { r } : {}));
      };
    };

    if (kind === 'dormitorio') {
      const wide = Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0) >= 2.6;
      const bw = wide ? 1.6 : 0.95;
      const set = againstWall(bw + (wide ? 1.0 : 0.5), 2.1) ?? againstWall(bw, 2.05);
      if (set) {
        const b = local(set.r, set.side);
        const L = set.side === 'n' || set.side === 's' ? set.r.x1 - set.r.x0 : set.r.y1 - set.r.y0;
        const u0 = (L - bw) / 2;
        b('walnut', u0 - 0.1, u0 + bw + 0.1, 0, 0.08, 0, 1.05);
        b('walnut', u0, u0 + bw, 0.08, 2.05, 0.1, 0.3);
        b('linen', u0 + 0.02, u0 + bw - 0.02, 0.1, 2.03, 0.3, 0.52, 0.06);
        b('sage', u0, u0 + bw, 1.0, 2.05, 0.33, 0.55, 0.06);
        b('linen', u0 + 0.08, u0 + bw / 2 - 0.04, 0.12, 0.55, 0.52, 0.66, 0.07);
        if (wide) b('linen', u0 + bw / 2 + 0.04, u0 + bw - 0.08, 0.12, 0.55, 0.52, 0.66, 0.07);
        if (L - bw > 0.8) {
          b('walnut', 0, Math.min(0.45, u0 - 0.05), 0.04, 0.44, 0.2, 0.5);
          b('walnut', Math.max(u0 + bw + 0.05, L - 0.45), L, 0.04, 0.44, 0.2, 0.5);
          b('glow', 0.12, 0.32, 0.15, 0.35, 0.5, 0.72);
          b('glow', L - 0.32, L - 0.12, 0.15, 0.35, 0.5, 0.72);
        }
        claim(set.r, 'cama');
      }
      const ward = againstWall(1.8, 0.6);
      if (ward) {
        const b = local(ward.r, ward.side);
        b('white', 0, 1.8, 0, 0.6, 0.05, 2.2);
        b('black', 0.89, 0.91, 0.6, 0.605, 0.1, 2.15);
        claim(ward.r, 'armario');
      }
    } else if (kind === 'salon') {
      const sofa = againstWall(2.4, 0.95);
      if (sofa) {
        const b = local(sofa.r, sofa.side);
        b('fabric', 0, 2.4, 0, 0.95, 0.12, 0.44, 0.05);
        b('fabric', 0, 2.4, 0, 0.22, 0.42, 0.85, 0.05);
        b('fabric', 0, 0.2, 0, 0.95, 0.42, 0.64, 0.05);
        b('fabric', 2.2, 2.4, 0, 0.95, 0.42, 0.64, 0.05);
        b('terracotta', 0.3, 0.75, 0.24, 0.38, 0.44, 0.82, 0.06);
        b('sage', 1.65, 2.1, 0.24, 0.38, 0.44, 0.82, 0.06);
        claim(sofa.r, 'sofá');
        // Mesa baja y alfombra delante del sofá.
        const into = (d: number) => {
          const s = sofa.side;
          const r = sofa.r;
          return s === 'n'
            ? { x0: r.x0 + 0.5, x1: r.x1 - 0.5, y0: r.y1 + d, y1: r.y1 + d + 0.6 }
            : s === 's'
              ? { x0: r.x0 + 0.5, x1: r.x1 - 0.5, y0: r.y0 - d - 0.6, y1: r.y0 - d }
              : s === 'o'
                ? { x0: r.x1 + d, x1: r.x1 + d + 0.6, y0: r.y0 + 0.5, y1: r.y1 - 0.5 }
                : { x0: r.x0 - d - 0.6, x1: r.x0 - d, y0: r.y0 + 0.5, y1: r.y1 - 0.5 };
        };
        const table = into(0.45);
        if (fits(table, 0.2)) {
          add(
            boxPart(M, 'walnut', table.x0, table.x1, table.y0, table.y1, 0.34, 0.38, { r: 0.02 }),
            boxPart(M, 'black', table.x0 + 0.05, table.x1 - 0.05, table.y0 + 0.05, table.y1 - 0.05, 0, 0.34),
            boxPart(M, 'rug', table.x0 - 0.5, table.x1 + 0.5, table.y0 - 0.5, table.y1 + 0.5, 0, 0.012),
          );
          claim(table, 'mesa baja');
        }
      }
      const tv = againstWall(1.8, 0.45);
      if (tv) {
        const b = local(tv.r, tv.side);
        b('walnut', 0, 1.8, 0, 0.45, 0.15, 0.55);
        b('black', 0.25, 1.55, 0.05, 0.1, 0.9, 1.65);
        claim(tv.r, 'mueble');
      }
    } else if (kind === 'cocina') {
      const len = Math.min(3.6, Math.max(1.8, Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0) - 0.6));
      const run = againstWall(len, 0.65) ?? againstWall(1.8, 0.65);
      if (run) {
        const b = local(run.r, run.side);
        const L = run.side === 'n' || run.side === 's' ? run.r.x1 - run.r.x0 : run.r.y1 - run.r.y0;
        b('white', 0, L, 0, 0.62, 0.1, 0.88);
        b('black', 0.02, L - 0.02, 0.02, 0.6, 0, 0.1);
        b('stone', 0, L, 0, 0.65, 0.88, 0.92);
        b('black', L * 0.25, L * 0.25 + 0.6, 0.1, 0.5, 0.92, 0.925);
        b('steel', L * 0.65, L * 0.65 + 0.5, 0.1, 0.45, 0.9, 0.93);
        b('walnut', 0, L, 0, 0.35, 1.5, 2.2);
        claim(run.r, 'cocina');
      }
      const isl = { x0: (rect.x0 + rect.x1) / 2 - 0.9, x1: (rect.x0 + rect.x1) / 2 + 0.9, y0: (rect.y0 + rect.y1) / 2 - 0.45, y1: (rect.y0 + rect.y1) / 2 + 0.45 };
      if (Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0) > 3.4 && fits(isl, 0.9)) {
        add(boxPart(M, 'walnut', isl.x0, isl.x1, isl.y0, isl.y1, 0, 0.88), boxPart(M, 'stone', isl.x0 - 0.05, isl.x1 + 0.05, isl.y0 - 0.05, isl.y1 + 0.05, 0.88, 0.93));
        claim(isl, 'isla');
      }
    } else if (kind === 'comedor') {
      const cx = (rect.x0 + rect.x1) / 2;
      const cy = (rect.y0 + rect.y1) / 2;
      const along = rect.x1 - rect.x0 >= rect.y1 - rect.y0;
      const t = along ? { x0: cx - 0.9, x1: cx + 0.9, y0: cy - 0.45, y1: cy + 0.45 } : { x0: cx - 0.45, x1: cx + 0.45, y0: cy - 0.9, y1: cy + 0.9 };
      const withChairs = along ? { ...t, y0: t.y0 - 0.55, y1: t.y1 + 0.55 } : { ...t, x0: t.x0 - 0.55, x1: t.x1 + 0.55 };
      if (fits(withChairs, 0.1)) {
        add(boxPart(M, 'oak', t.x0, t.x1, t.y0, t.y1, 0.72, 0.76, { r: 0.01 }), boxPart(M, 'black', cx - 0.05, cx + 0.05, cy - 0.05, cy + 0.05, 0, 0.72));
        for (const k of [-0.55, 0, 0.55]) {
          for (const sgn of [-1, 1]) {
            const px = along ? cx + k : cx + sgn * 0.7;
            const pz = along ? cy + sgn * 0.7 : cy + k;
            add(boxPart(M, 'leather', px - 0.22, px + 0.22, pz - 0.22, pz + 0.22, 0.43, 0.49, { r: 0.02 }), boxPart(M, 'black', px - 0.18, px + 0.18, pz - 0.18, pz + 0.18, 0, 0.43));
          }
        }
        claim(withChairs, 'comedor');
      }
    } else if (kind === 'bano') {
      const v = againstWall(1.0, 0.5);
      if (v) {
        const b = local(v.r, v.side);
        b('walnut', 0, 1.0, 0, 0.5, 0.35, 0.82);
        b('stone', 0, 1.0, 0, 0.52, 0.82, 0.86);
        b('white', 0.3, 0.7, 0.1, 0.4, 0.86, 0.94);
        b('mirror', 0.1, 0.9, 0, 0.015, 1.05, 1.9);
        claim(v.r, 'lavabo');
      }
      const sh = againstWall(0.9, 0.9);
      if (sh) {
        const b = local(sh.r, sh.side);
        b('stone', 0, 0.9, 0, 0.9, 0, 0.04);
        b('glass', 0, 0.9, 0.88, 0.9, 0.04, 2.0);
        claim(sh.r, 'ducha');
      }
    } else if (kind === 'estudio') {
      const d = againstWall(1.4, 0.7);
      if (d) {
        const b = local(d.r, d.side);
        b('oak', 0, 1.4, 0, 0.7, 0.72, 0.76);
        b('black', 0.03, 0.08, 0.05, 0.65, 0, 0.72);
        b('black', 1.32, 1.37, 0.05, 0.65, 0, 0.72);
        b('black', 0.45, 0.95, 0.05, 0.1, 0.76, 1.1);
        b('leather', 0.45, 0.95, 0.85, 1.3, 0.43, 0.49, 0.02);
        claim(d.r, 'escritorio');
      }
      const shelf = againstWall(1.6, 0.35);
      if (shelf) {
        const b = local(shelf.r, shelf.side);
        b('walnut', 0, 1.6, 0, 0.35, 0, 2.0);
        b('book-a', 0.1, 0.7, 0.03, 0.3, 1.2, 1.45);
        b('book-c', 0.8, 1.5, 0.03, 0.3, 0.6, 0.86);
        claim(shelf.r, 'estantería');
      }
    }
    // Una planta en una esquina libre, en cualquier estancia.
    for (const [px, py] of [
      [rect.x0 + 0.35, rect.y0 + 0.35],
      [rect.x1 - 0.35, rect.y1 - 0.35],
      [rect.x1 - 0.35, rect.y0 + 0.35],
      [rect.x0 + 0.35, rect.y1 - 0.35],
    ]) {
      const r = { x0: px - 0.25, x1: px + 0.25, y0: py - 0.25, y1: py + 0.25 };
      if (kind !== 'bano' && fits(r)) {
        add(
          cylPart(M, 'pot', px, py, 0, 0.42, 0.4),
          spherePart(M, 'leaf', px, 0.95, py, 0.62, 0.7, 0.62),
          spherePart(M, 'leaf-dark', px + 0.08, 1.2, py - 0.05, 0.4),
        );
        claim(r, 'planta');
        break;
      }
    }
    out.lights.push({ p: [room.camera.x, height - 0.35, room.camera.y], intensity: 4.5, distance: 7 });
    const items = out.parts.length - before;
    out.placed.push({ room: room.name, kind, items });
  }
  return out;
}
