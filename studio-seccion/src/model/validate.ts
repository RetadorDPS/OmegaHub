import { DEFAULTS, type Project } from './types';
import {
  formatMeters,
  isSelfIntersecting,
  pointInPolygon,
  polygonArea,
  wallLength,
} from './geometry';
import { openingSpan } from './project';
import { buildCollisionWorld, isFree } from '../generate/collision';

export type IssueCode =
  | 'sin-escala'
  | 'sin-muros'
  | 'muro-corto'
  | 'hueco-sin-muro'
  | 'hueco-fuera'
  | 'hueco-solapado'
  | 'hueco-alto'
  | 'sin-losa'
  | 'losa-abierta'
  | 'losa-pocos-puntos'
  | 'losa-autointerseccion'
  | 'losa-pequena'
  | 'sin-estancia'
  | 'estancia-fuera'
  | 'estancia-en-muro';

/** Hacia qué herramienta o paso llevar al usuario para corregirlo. */
export type FixAction = 'calibrate' | 'wall' | 'slab' | 'room' | 'select';

export interface Issue {
  code: IssueCode;
  level: 'error' | 'aviso';
  message: string;
  fix: FixAction;
  /** Elemento afectado, si lo hay. */
  ref?: { type: 'wall' | 'opening' | 'room' | 'slab'; id: string };
}

export interface Validation {
  issues: Issue[];
  /** Hay geometría suficiente y coherente para levantar el modelo. */
  canGenerate: boolean;
  /** Además, hay al menos un punto interior válido desde el que caminar. */
  canWalk: boolean;
  /** Ids de estancias con punto de cámara utilizable. */
  walkableRooms: string[];
}

export function validateProject(p: Project): Validation {
  const issues: Issue[] = [];
  const err = (i: Omit<Issue, 'level'>) => issues.push({ ...i, level: 'error' });
  const warn = (i: Omit<Issue, 'level'>) => issues.push({ ...i, level: 'aviso' });

  if (p.plan && !p.calibration) {
    err({
      code: 'sin-escala',
      message:
        'Falta calibrar la escala: marca dos puntos del plano e indica la distancia real entre ellos.',
      fix: 'calibrate',
    });
  }

  if (p.walls.length === 0) {
    err({ code: 'sin-muros', message: 'Todavía no hay muros trazados.', fix: 'wall' });
  }
  for (const w of p.walls) {
    if (wallLength(w) < 0.1) {
      err({
        code: 'muro-corto',
        message: 'Hay un muro de menos de 10 cm. Alárgalo o bórralo.',
        fix: 'select',
        ref: { type: 'wall', id: w.id },
      });
    }
  }

  const wallsById = new Map(p.walls.map((w) => [w.id, w]));
  for (const o of p.openings) {
    const wall = wallsById.get(o.wallId);
    const label = o.kind === 'door' ? 'La puerta' : 'La ventana';
    const ref = { type: 'opening' as const, id: o.id };
    if (!wall) {
      err({ code: 'hueco-sin-muro', message: `${label} no está sobre ningún muro.`, fix: 'select', ref });
      continue;
    }
    const L = wallLength(wall);
    const [u0, u1] = openingSpan(o);
    const m = DEFAULTS.openingMargin - 1e-6;
    if (u0 < m || u1 > L - m) {
      err({
        code: 'hueco-fuera',
        message: `${label} (${formatMeters(o.width)}) se sale de su muro de ${formatMeters(L)}. Muévela o redúcela.`,
        fix: 'select',
        ref,
      });
    }
    if (o.sill + o.height > wall.height + 1e-6) {
      err({
        code: 'hueco-alto',
        message: `${label} es más alta que su muro (${formatMeters(wall.height)}).`,
        fix: 'select',
        ref,
      });
    }
    for (const other of p.openings) {
      if (other.id <= o.id || other.wallId !== o.wallId) continue;
      const [v0, v1] = openingSpan(other);
      if (u0 < v1 - 1e-6 && v0 < u1 - 1e-6) {
        err({
          code: 'hueco-solapado',
          message: 'Hay dos huecos superpuestos en el mismo muro. Separa uno de ellos.',
          fix: 'select',
          ref,
        });
      }
    }
  }

  let slabOk = false;
  if (!p.slab || p.slab.points.length === 0) {
    err({
      code: 'sin-losa',
      message: 'Falta el contorno de la losa: trázalo o propónlo a partir de los muros y valídalo.',
      fix: 'slab',
    });
  } else if (p.slab.points.length < 3) {
    err({ code: 'losa-pocos-puntos', message: 'El contorno de la losa necesita al menos tres puntos.', fix: 'slab' });
  } else if (!p.slab.closed) {
    err({ code: 'losa-abierta', message: 'El contorno de la losa está sin cerrar.', fix: 'slab' });
  } else if (isSelfIntersecting(p.slab.points)) {
    err({
      code: 'losa-autointerseccion',
      message: 'El contorno de la losa se cruza consigo mismo. Mueve sus vértices hasta que no se corte.',
      fix: 'slab',
      ref: { type: 'slab', id: 'slab' },
    });
  } else if (polygonArea(p.slab.points) < 1) {
    err({ code: 'losa-pequena', message: 'La losa mide menos de 1 m². Revisa la escala o el contorno.', fix: 'slab' });
  } else {
    slabOk = true;
  }

  const walkableRooms: string[] = [];
  if (p.rooms.length === 0) {
    warn({
      code: 'sin-estancia',
      message:
        'Sin estancias no se puede entrar a pie: marca al menos una y coloca su punto de cámara dentro.',
      fix: 'room',
    });
  } else {
    const world = buildCollisionWorld(p);
    for (const r of p.rooms) {
      const ref = { type: 'room' as const, id: r.id };
      if (slabOk && !pointInPolygon(r.camera, p.slab!.points)) {
        warn({
          code: 'estancia-fuera',
          message: `El punto de cámara de «${r.name}» está fuera de la losa.`,
          fix: 'room',
          ref,
        });
      } else if (!isFree(r.camera, world, DEFAULTS.bodyRadius)) {
        warn({
          code: 'estancia-en-muro',
          message: `El punto de cámara de «${r.name}» está pegado a un muro o dentro de él.`,
          fix: 'room',
          ref,
        });
      } else if (slabOk) {
        walkableRooms.push(r.id);
      }
    }
  }

  const canGenerate = !issues.some((i) => i.level === 'error');
  return { issues, canGenerate, canWalk: canGenerate && walkableRooms.length > 0, walkableRooms };
}
