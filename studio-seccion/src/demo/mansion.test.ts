import { describe, expect, it } from 'vitest';
// Los mismos datos con los que se dibuja el PDF de prueba de la mansión.
import { ESTANCIAS, HUECOS, MUROS } from '../../scripts/lib/plano-mansion.mjs';
import { createProject, makeOpening, makeWall } from '../model/project';
import { polygonArea, proposeOutlineFromWalls } from '../model/geometry';
import { validateProject } from '../model/validate';
import { buildProjectScene } from '../viewer/sceneDef';
import { firstBlockedPoint } from '../generate/collision';
import { sampleLegPlan } from '../viewer/tour';

/** El proyecto que resulta de trazar el PDF de la mansión con el editor. */
function mansion() {
  const p = createProject('Mansión en U');
  const ids = new Map<string, string>();
  p.walls = MUROS.map(([id, ax, ay, bx, by, t]) => {
    const w = makeWall({ x: ax, y: ay }, { x: bx, y: by }, { thickness: t, height: 2.9 });
    ids.set(id, w.id);
    return w;
  });
  p.openings = HUECOS.map(([muro, tipo, off, ancho]) =>
    tipo === 'puerta'
      ? makeOpening(ids.get(muro)!, 'door', off, { width: ancho, height: ancho > 1.6 ? 2.4 : 2.1, leaf: ancho > 1.6 ? 'none' : 'swing' })
      : makeOpening(ids.get(muro)!, 'window', off, { width: ancho, height: 1.5, sill: 0.9 }),
  );
  const outline = proposeOutlineFromWalls(p.walls);
  p.slab = outline ? { points: outline, closed: true, thickness: 0.3 } : null;
  p.rooms = ESTANCIAS.map(([name, x, y], i) => ({ id: `r${i}`, name, camera: { x, y } }));
  return p;
}

describe('plano de prueba de la mansión (440 m²)', () => {
  it('se valida completo: losa en U propuesta desde los muros y todas las estancias accesibles', () => {
    const p = mansion();
    expect(p.slab).not.toBeNull();
    expect(polygonArea(p.slab!.points)).toBeCloseTo(440, 0);
    const v = validateProject(p);
    expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(v.walkableRooms).toHaveLength(10);
  });

  it('genera el modelo amueblado y una visita continua que pasa por las puertas', () => {
    const def = buildProjectScene(mansion());
    expect(def.furnishing!.filter((f) => f.items > 0).length).toBeGreaterThanOrEqual(8);
    const legs = def.tour.legs.map((l, i) => ({ l, i })).filter(({ l, i }) => i >= 2 && l.kind === 'path');
    // Entre las 10 estancias hay 9 tramos: todos deben encontrar camino a pie.
    expect(legs.length).toBe(9);
    for (const { i } of legs) {
      expect(firstBlockedPoint(sampleLegPlan(def.tour, i, 500), def.world, 0.2, 0.02), `tramo ${i}`).toBeNull();
    }
  });
});
