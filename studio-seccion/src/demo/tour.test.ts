import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { villaMirador, DEMO_BOUNDS, DEMO_COLLIDERS, DEMO_ENTRY_POINTS, DEMO_PARTS, ROOF } from './villaMirador';
import { demoTour } from './tour';
import { buildCollisionWorld, firstBlockedPoint, isFree } from '../generate/collision';
import { poseAt, sampleLegPlan } from '../viewer/tour';
import { validateProject } from '../model/validate';
import { layoutWalls } from '../generate/walls';
import { wallFraming } from '../generate/framing';

const world = buildCollisionWorld(villaMirador, DEMO_COLLIDERS, DEMO_BOUNDS);
/** Holgura de la cámara respecto a muros, vidrios y muebles. */
const CLEARANCE = 0.2;

describe('Villa Mirador', () => {
  it('es un proyecto válido con el mismo modelo que un plano subido', () => {
    const v = validateProject(villaMirador);
    expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(v.walkableRooms).toHaveLength(villaMirador.rooms.length);
  });

  it('tiene puntos de entrada libres de obstáculos', () => {
    for (const e of DEMO_ENTRY_POINTS) {
      expect(isFree(e.point, world, 0.22), e.name).toBe(true);
    }
  });

  it('genera entramado y piezas etiquetadas por capa', () => {
    const studs = wallFraming(layoutWalls(villaMirador));
    expect(studs.length).toBeGreaterThan(250);
    const layers = new Set(DEMO_PARTS.map((p) => p.layer));
    for (const l of ['base', 'cubierta', 'mobiliario', 'entorno', 'acabados']) {
      expect(layers.has(l as never), l).toBe(true);
    }
  });
});

describe('visita guiada de Villa Mirador', () => {
  it('recorre exterior, acercamiento, terraza, salón, cocina y dormitorio', () => {
    expect(demoTour.stops.map((s) => s.id)).toEqual([
      'exterior',
      'acercamiento',
      'terraza',
      'salon',
      'cocina',
      'dormitorio',
    ]);
    expect(demoTour.legs).toHaveLength(demoTour.stops.length - 1);
  });

  it('ningún tramo a pie atraviesa un muro, un vidrio ni un mueble', () => {
    demoTour.legs.forEach((leg, i) => {
      if (leg.kind !== 'path') return;
      const samples = sampleLegPlan(demoTour, i, 600);
      // Solo cuenta la parte del tramo que va a altura de persona.
      const walking = samples.filter((p) => p.height < 2.2);
      if (walking.length < 2) return;
      const blocked = firstBlockedPoint(walking, world, CLEARANCE, 0.02);
      expect(blocked, `tramo ${demoTour.stops[i].id} → ${demoTour.stops[i + 1].id}`).toBeNull();
    });
  });

  it('los tramos aéreos no cruzan la cubierta ni bajan del terreno', () => {
    [0, 1].forEach((i) => {
      for (const p of sampleLegPlan(demoTour, i, 300)) {
        const overRoof = p.x > ROOF.x0 - 0.3 && p.x < ROOF.x1 + 0.3 && p.y > ROOF.z0 - 0.3 && p.y < ROOF.z1 + 0.3;
        if (overRoof) expect(p.height).toBeLessThan(ROOF.y0 - 0.5);
        expect(p.height).toBeGreaterThan(1.2);
      }
    });
  });

  it('mantiene la altura de ojos en interiores', () => {
    for (const p of sampleLegPlan(demoTour, 3, 200)) expect(p.height).toBeCloseTo(1.6, 2);
    const pos = new Vector3();
    const look = new Vector3();
    poseAt(demoTour, 3, pos, look);
    expect(pos.y).toBeCloseTo(1.6, 6);
  });

  it('es reversible: la misma posición devuelve el mismo encuadre', () => {
    const a = new Vector3();
    const b = new Vector3();
    const l = new Vector3();
    poseAt(demoTour, 2.37, a, l);
    poseAt(demoTour, 3.9, b, l);
    poseAt(demoTour, 2.37, b, l);
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });
});
