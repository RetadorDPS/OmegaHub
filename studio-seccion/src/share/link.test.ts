import { describe, expect, it } from 'vitest';
import { createProject, makeOpening, makeWall } from '../model/project';
import { villaMirador } from '../demo/villaMirador';
import { decodeProject, encodeProject } from './link';

describe('enlace para compartir', () => {
  it('reconstruye la misma geometría, acabados y estancias', async () => {
    const p = createProject('Casa en L');
    const pts = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 7 },
      { x: 0, y: 7 },
    ];
    p.walls = pts.map((a, i) => makeWall(a, pts[(i + 1) % pts.length]));
    p.openings = [makeOpening(p.walls[0].id, 'door', 2.25)];
    p.slab = { points: pts, closed: true, thickness: 0.25 };
    p.rooms = [{ id: 'r', name: 'Salón', camera: { x: 2, y: 2 } }];
    p.finishes = { ...p.finishes, floor: 'terrazo' };
    const back = await decodeProject(await encodeProject(p));
    expect(back.name).toBe('Casa en L');
    expect(back.walls.map((w) => [w.a, w.b])).toEqual(p.walls.map((w) => [w.a, w.b]));
    expect(back.openings[0]).toMatchObject({ wallId: p.walls[0].id, kind: 'door', offset: 2.25, width: 0.9 });
    expect(back.slab?.closed).toBe(true);
    expect(back.rooms[0].name).toBe('Salón');
    expect(back.finishes.floor).toBe('terrazo');
    expect(back.plan).toBeNull();
  });

  it('cabe en un enlace corto incluso para una vivienda grande', async () => {
    const token = await encodeProject(villaMirador);
    expect(token.length).toBeLessThan(4000);
  });

  it('rechaza enlaces ajenos o dañados con un mensaje claro', async () => {
    await expect(decodeProject('hola')).rejects.toThrow(/Studio Sección/);
    await expect(decodeProject('v1.%%%%')).rejects.toThrow(/dañado/);
  });
});
