import { describe, expect, it } from 'vitest';
import { createProject, makeOpening, makeWall } from '../model/project';
import type { Project } from '../model/types';
import { buildCollisionWorld, firstBlockedPoint, isFree } from './collision';
import { furnishProject, roomKind } from './furnish';
import { findPath } from './pathfind';
import { buildProjectScene } from '../viewer/sceneDef';
import { sampleLegPlan } from '../viewer/tour';

function lProject(): Project {
  const p = createProject('L');
  const pts = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 7 },
    { x: 0, y: 7 },
  ];
  p.walls = pts.map((a, i) => makeWall(a, pts[(i + 1) % pts.length]));
  const inner = makeWall({ x: 4, y: 0 }, { x: 4, y: 4 }, { thickness: 0.1 });
  p.walls.push(inner);
  p.openings = [makeOpening(inner.id, 'door', 2), makeOpening(p.walls[4].id, 'door', 2)];
  p.slab = { points: pts, closed: true, thickness: 0.25 };
  p.rooms = [
    { id: 'a', name: 'Salón', camera: { x: 2, y: 2 } },
    { id: 'b', name: 'Cocina', camera: { x: 6, y: 2 } },
    { id: 'c', name: 'Dormitorio', camera: { x: 2, y: 5.5 } },
  ];
  return p;
}

describe('amueblado ilustrativo', () => {
  it('reconoce el tipo de estancia por su nombre', () => {
    expect(roomKind('Dormitorio principal')).toBe('dormitorio');
    expect(roomKind('SALÓN-comedor')).toBe('salon');
    expect(roomKind('Baño 2')).toBe('bano');
    expect(roomKind('Despacho')).toBe('estudio');
    expect(roomKind('Trastero')).toBe('otra');
  });

  it('amuebla sin tocar muros ni tapar puertas ni el punto de cámara', () => {
    const p = lProject();
    const walls = buildCollisionWorld(p);
    const f = furnishProject(p, walls);
    expect(f.placed.map((x) => x.kind)).toEqual(['salon', 'cocina', 'dormitorio']);
    expect(f.placed.every((x) => x.items > 0)).toBe(true);
    const world = buildCollisionWorld(p, f.colliders);
    for (const r of p.rooms) expect(isFree(r.camera, world, 0.22), r.name).toBe(true);
    // La puerta del tabique sigue siendo transitable con los muebles puestos.
    expect(firstBlockedPoint([{ x: 2.6, y: 2 }, { x: 5.4, y: 2 }], world, 0.22)).toBeNull();
  });
});

describe('recorrido continuo entre estancias', () => {
  it('encuentra un camino que pasa por la puerta y no por el muro', () => {
    const p = lProject();
    const world = buildCollisionWorld(p);
    const path = findPath(world, { x: 2, y: 2 }, { x: 6, y: 2 }, { radius: 0.25, bounds: { minX: -0.5, minY: -0.5, maxX: 8.5, maxY: 7.5 } });
    expect(path).not.toBeNull();
    expect(firstBlockedPoint(path!, world, 0.25)).toBeNull();
    // Cruza el tabique (x = 4) a la altura del hueco (y 1,55–2,45).
    const crossing = path!.findIndex((q, i) => i > 0 && path![i - 1].x < 4 && q.x >= 4);
    const a = path![crossing - 1];
    const b = path![crossing];
    const y = a.y + ((4 - a.x) / (b.x - a.x)) * (b.y - a.y);
    expect(y).toBeGreaterThan(1.55);
    expect(y).toBeLessThan(2.45);
  });

  it('la visita del modelo generado camina de una estancia a otra sin atravesar nada', () => {
    const def = buildProjectScene(lProject());
    const walking = def.tour.legs.map((l, i) => ({ l, i })).filter(({ l, i }) => l.kind === 'path' && i >= 2);
    expect(walking.length).toBe(2);
    for (const { i } of walking) {
      const samples = sampleLegPlan(def.tour, i, 400);
      expect(firstBlockedPoint(samples, def.world, 0.2, 0.02), `tramo ${i}`).toBeNull();
    }
    expect(def.roof).toBeDefined();
    expect(def.furnishing?.length).toBe(3);
  });
});
