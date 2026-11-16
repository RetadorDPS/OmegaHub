import { describe, expect, it } from 'vitest';
import {
  isSelfIntersecting,
  pointInPolygon,
  polygonArea,
  proposeOutlineFromWalls,
  formatMeters,
} from './geometry';
import { makeWall, fitOpeningOffset, makeOpening, rescalePlanGeometry, migrateProject, createProject } from './project';

const L_SHAPE = [
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 8, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 7 },
  { x: 0, y: 7 },
];

describe('geometría de contornos', () => {
  it('calcula el área de una planta en L', () => {
    expect(polygonArea(L_SHAPE)).toBeCloseTo(8 * 4 + 4 * 3, 6);
  });

  it('detecta un contorno que se cruza consigo mismo', () => {
    const lazo = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    expect(isSelfIntersecting(lazo)).toBe(true);
    expect(isSelfIntersecting(L_SHAPE)).toBe(false);
  });

  it('distingue dentro y fuera de la L', () => {
    expect(pointInPolygon({ x: 2, y: 6 }, L_SHAPE)).toBe(true);
    expect(pointInPolygon({ x: 6, y: 6 }, L_SHAPE)).toBe(false);
  });

  it('formatea cotas en español', () => {
    expect(formatMeters(4)).toBe('4,00 m');
  });
});

describe('propuesta de contorno a partir de muros', () => {
  const ring = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => makeWall(p, pts[(i + 1) % pts.length]));

  it('recupera el perímetro de una L ignorando el muro interior', () => {
    const walls = [...ring(L_SHAPE), makeWall({ x: 4, y: 0 }, { x: 4, y: 4 })];
    const outline = proposeOutlineFromWalls(walls);
    expect(outline).not.toBeNull();
    expect(outline!.length).toBe(6);
    expect(polygonArea(outline!)).toBeCloseTo(44, 6);
  });

  it('ignora un muro suelto que no cierra nada', () => {
    const walls = [...ring(L_SHAPE), makeWall({ x: 1, y: 1 }, { x: 2, y: 3 })];
    expect(polygonArea(proposeOutlineFromWalls(walls)!)).toBeCloseTo(44, 6);
  });

  it('devuelve null si el perímetro está abierto', () => {
    const walls = ring(L_SHAPE).slice(0, 5);
    expect(proposeOutlineFromWalls(walls)).toBeNull();
  });

  it('funciona aunque los muros estén trazados en sentidos mezclados', () => {
    const walls = ring(L_SHAPE).map((w, i) => (i % 2 ? { ...w, a: w.b, b: w.a } : w));
    expect(polygonArea(proposeOutlineFromWalls(walls)!)).toBeCloseTo(44, 6);
  });
});

describe('huecos sobre muro', () => {
  const wall = makeWall({ x: 0, y: 0 }, { x: 4, y: 0 });

  it('recoloca un hueco para que no se salga del muro', () => {
    expect(fitOpeningOffset(wall, [], 0.1, 0.9)).toBeCloseTo(0.5, 6);
    expect(fitOpeningOffset(wall, [], 3.95, 0.9)).toBeCloseTo(3.5, 6);
  });

  it('no deja pisar otro hueco', () => {
    const door = makeOpening(wall.id, 'door', 1.0);
    const c = fitOpeningOffset(wall, [door], 1.2, 0.9)!;
    expect(c - 0.45).toBeGreaterThanOrEqual(1.45 + 0.05 - 1e-9);
  });

  it('rechaza un hueco más ancho que el muro', () => {
    expect(fitOpeningOffset(wall, [], 2, 4.2)).toBeNull();
  });
});

describe('escala y persistencia', () => {
  it('reescala la planta al recalibrar sin tocar espesores ni alturas', () => {
    const wall = makeWall({ x: 0, y: 0 }, { x: 2, y: 0 });
    const door = makeOpening(wall.id, 'door', 1);
    const g = rescalePlanGeometry(
      { calibration: null, walls: [wall], openings: [door], slab: null, rooms: [] },
      2,
    );
    expect(g.walls[0].b.x).toBe(4);
    expect(g.walls[0].thickness).toBe(wall.thickness);
    expect(g.openings[0].offset).toBe(2);
    expect(g.openings[0].width).toBe(door.width);
  });

  it('migra un proyecto guardado y rechaza datos ajenos o futuros', () => {
    const p = createProject('Prueba');
    const copy = JSON.parse(JSON.stringify(p));
    delete copy.finishes;
    expect(migrateProject(copy).finishes.floor).toBe('roble');
    expect(() => migrateProject({ hola: 1 })).toThrow();
    expect(() => migrateProject({ ...copy, schemaVersion: 99 })).toThrow(/más reciente/);
  });
});
