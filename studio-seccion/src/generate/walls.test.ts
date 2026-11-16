import { describe, expect, it } from 'vitest';
import { createProject, makeOpening, makeWall } from '../model/project';
import { layoutWall, pieceToBox } from './walls';
import { buildCollisionWorld, firstBlockedPoint, isFree, moveWithCollisions } from './collision';
import { validateProject } from '../model/validate';
import { openingLocalParts } from './openings';
import { framingForWall } from './framing';
import type { Project } from '../model/types';

/** Planta en L de 8 × 7 m con un muro interior y una puerta en él. */
function lProject(doorOffset = 2): Project {
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
  p.openings = [makeOpening(inner.id, 'door', doorOffset)];
  p.slab = { points: pts, closed: true, thickness: 0.25 };
  p.rooms = [{ id: 'r1', name: 'Sala', camera: { x: 2, y: 2 } }];
  return p;
}

describe('segmentación de muros', () => {
  it('parte un muro con puerta en dos macizos y un dintel', () => {
    const p = lProject();
    const inner = p.walls[6];
    const layout = layoutWall(inner, p);
    const kinds = layout.pieces.map((x) => x.kind);
    expect(kinds).toEqual(['solid', 'lintel', 'solid']);
    const lintel = layout.pieces[1];
    expect(lintel.u0).toBeCloseTo(1.55, 6);
    expect(lintel.u1).toBeCloseTo(2.45, 6);
    expect(lintel.y0).toBeCloseTo(2.1, 6);
    expect(lintel.y1).toBeCloseTo(inner.height, 6);
    // El hueco es aire: ninguna pieza ocupa la puerta por debajo del dintel.
    for (const piece of layout.pieces) {
      const overlaps = piece.u0 < 2.45 - 1e-6 && piece.u1 > 1.55 + 1e-6;
      if (overlaps) expect(piece.y0).toBeGreaterThanOrEqual(2.1 - 1e-6);
    }
  });

  it('añade antepecho y dintel en una ventana', () => {
    const p = lProject();
    const north = p.walls[0];
    p.openings.push(makeOpening(north.id, 'window', 2));
    const layout = layoutWall(north, p);
    expect(layout.pieces.map((x) => x.kind)).toEqual(['solid', 'sill', 'lintel', 'solid']);
    const sill = layout.pieces[1];
    expect(sill.y1).toBeCloseTo(0.9, 6);
    expect(layout.pieces[2].y0).toBeCloseTo(2.1, 6);
  });

  it('conserva la cota: un muro de 4 m genera 4 m de geometría entre ejes', () => {
    const p = lProject();
    const inner = p.walls[6];
    const layout = layoutWall(inner, p);
    expect(layout.length).toBeCloseTo(4, 9);
    const total = layout.pieces
      .filter((x) => x.kind === 'solid' || x.kind === 'lintel')
      .reduce((s, x) => s + (x.u1 - x.u0), 0);
    // La pieza se prolonga solo lo necesario para macizar la esquina con el perímetro.
    expect(total).toBeCloseTo(4 + layout.extA + layout.extB, 6);
    expect(layout.extA + layout.extB).toBeLessThanOrEqual(0.1 + 1e-9);
    const box = pieceToBox(layout, layout.pieces[0]);
    expect(box.cx).toBeCloseTo(4, 6);
    expect(box.sz).toBeCloseTo(0.1, 6);
  });

  it('maciza las esquinas y distingue cara interior de exterior', () => {
    const p = lProject();
    const north = layoutWall(p.walls[0], p);
    expect(north.extA).toBeCloseTo(0.1, 6);
    expect(north.extB).toBeCloseTo(0.1, 6);
    expect([north.sidePlus, north.sideMinus].sort()).toEqual(['exterior', 'interior']);
    const inner = layoutWall(p.walls[6], p);
    expect(inner.sidePlus).toBe('interior');
    expect(inner.sideMinus).toBe('interior');
  });

  it('ignora en la generación un hueco que no cabe y lo señala al validar', () => {
    const p = lProject();
    p.openings[0].offset = 3.9;
    const layout = layoutWall(p.walls[6], p);
    expect(layout.openings).toHaveLength(0);
    expect(layout.pieces).toHaveLength(1);
    const v = validateProject(p);
    expect(v.canGenerate).toBe(false);
    expect(v.issues.some((i) => i.code === 'hueco-fuera')).toBe(true);
  });

  it('genera marco con espesor y hoja para la puerta, y entramado con cargadero', () => {
    const p = lProject();
    const layout = layoutWall(p.walls[6], p);
    const parts = openingLocalParts(layout, layout.openings[0]);
    expect(parts.filter((x) => x.mat === 'frame').length).toBeGreaterThanOrEqual(3);
    expect(parts.some((x) => x.mat === 'door' && x.swing)).toBe(true);
    const studs = framingForWall(layout);
    expect(studs.length).toBeGreaterThan(8);
    // Ningún montante cruza el paso de la puerta por debajo del cargadero.
    for (const s of studs) {
      const inDoor = s.u + s.su / 2 > 1.56 && s.u - s.su / 2 < 2.44;
      if (inDoor) expect(s.y - s.sy / 2).toBeGreaterThanOrEqual(2.1 - 1e-6);
    }
  });
});

describe('colisiones', () => {
  const R = 0.22;

  it('deja pasar por la puerta y no por el muro', () => {
    const p = lProject(2);
    const world = buildCollisionWorld(p);
    // Por la puerta (centro en y = 2).
    expect(firstBlockedPoint([{ x: 2, y: 2 }, { x: 6, y: 2 }], world, R)).toBeNull();
    // Por el macizo (y = 3,4).
    expect(firstBlockedPoint([{ x: 2, y: 3.4 }, { x: 6, y: 3.4 }], world, R)).not.toBeNull();
    const through = moveWithCollisions({ x: 2, y: 2 }, { x: 4, y: 0 }, world, R);
    expect(through.x).toBeCloseTo(6, 3);
    const stopped = moveWithCollisions({ x: 2, y: 3.4 }, { x: 4, y: 0 }, world, R);
    expect(stopped.x).toBeLessThan(4 - 0.05 - R + 1e-3);
  });

  it('actualiza la colisión al mover la puerta', () => {
    const p = lProject(1);
    const world = buildCollisionWorld(p);
    // La puerta ya no está en y = 2: ahora ocupa 0,55–1,45.
    expect(firstBlockedPoint([{ x: 2, y: 2 }, { x: 6, y: 2 }], world, R)).not.toBeNull();
    expect(firstBlockedPoint([{ x: 2, y: 1 }, { x: 6, y: 1 }], world, R)).toBeNull();
  });

  it('una ventana no es transitable', () => {
    const p = lProject();
    p.openings.push(makeOpening(p.walls[0].id, 'window', 2));
    const world = buildCollisionWorld(p);
    expect(firstBlockedPoint([{ x: 2, y: 1 }, { x: 2, y: -1 }], world, R)).not.toBeNull();
  });

  it('desliza a lo largo del muro en vez de quedarse clavado', () => {
    const world = buildCollisionWorld(lProject());
    const end = moveWithCollisions({ x: 2, y: 3 }, { x: 3, y: 0.6 }, world, R);
    expect(end.x).toBeLessThan(4);
    expect(end.y).toBeGreaterThan(3.3);
    expect(isFree(end, world, R * 0.95)).toBe(true);
  });
});

describe('validación del proyecto', () => {
  it('acepta la L con estancia válida', () => {
    const v = validateProject(lProject());
    expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(v.canGenerate).toBe(true);
    expect(v.canWalk).toBe(true);
  });

  it('explica qué falta para entrar a pie', () => {
    const p = lProject();
    p.rooms = [];
    const v = validateProject(p);
    expect(v.canGenerate).toBe(true);
    expect(v.canWalk).toBe(false);
    expect(v.issues.some((i) => i.code === 'sin-estancia')).toBe(true);
    p.rooms = [{ id: 'r', name: 'Fuera', camera: { x: 6, y: 6 } }];
    expect(validateProject(p).issues.some((i) => i.code === 'estancia-fuera')).toBe(true);
    p.rooms = [{ id: 'r', name: 'En muro', camera: { x: 4.05, y: 3 } }];
    expect(validateProject(p).issues.some((i) => i.code === 'estancia-en-muro')).toBe(true);
  });

  it('rechaza losa autointersectada, huecos solapados y plano sin calibrar', () => {
    const p = lProject();
    p.slab = { points: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }], closed: true, thickness: 0.25 };
    expect(validateProject(p).issues.some((i) => i.code === 'losa-autointerseccion')).toBe(true);

    const q = lProject();
    q.openings.push(makeOpening(q.walls[6].id, 'door', 2.4));
    const vq = validateProject(q);
    expect(vq.issues.some((i) => i.code === 'hueco-solapado')).toBe(true);
    expect(vq.canGenerate).toBe(false);

    const r = lProject();
    r.plan = { kind: 'image', fileName: 'a.png', mime: 'image/png', bytes: 1, page: 1, pageCount: 1, width: 10, height: 10 };
    expect(validateProject(r).issues.some((i) => i.code === 'sin-escala')).toBe(true);
  });
});
