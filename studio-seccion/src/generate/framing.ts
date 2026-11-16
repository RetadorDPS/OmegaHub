/**
 * Entramado ligero ILUSTRATIVO para la demo: soleras, montantes, cargaderos y
 * viguetas. Se calcula a partir de los mismos muros y huecos que el resto del
 * modelo para que la estructura coincida con la casa terminada, pero no es un
 * cálculo estructural ni se genera para planos subidos por el usuario.
 */
import { openingSpan } from '../model/project';
import { localToWorld, type LocalPart, type Part } from './parts';
import type { WallLayout } from './walls';

const STUD = 0.05;
const SPACING = 0.6;

export function framingForWall(layout: WallLayout): LocalPart[] {
  const { wall, length, extA, extB } = layout;
  const depth = Math.min(wall.thickness * 0.7, 0.14);
  const h = wall.height;
  const out: LocalPart[] = [];
  const piece = (u: number, y: number, su: number, sy: number) =>
    out.push({ mat: 'stud', layer: 'estructura', u, y, v: 0, su, sy, sv: depth });
  const start = -extA;
  const end = length + extB;
  const doors = layout.openings.filter((o) => o.kind === 'door').map(openingSpan);

  // Solera inferior interrumpida en los pasos de puerta; durmiente superior doble y continuo.
  let cursor = start;
  for (const [u0, u1] of doors) {
    if (u0 - cursor > 0.01) piece((cursor + u0) / 2, STUD / 2, u0 - cursor, STUD);
    cursor = u1;
  }
  if (end - cursor > 0.01) piece((cursor + end) / 2, STUD / 2, end - cursor, STUD);
  piece((start + end) / 2, h - STUD / 2, end - start, STUD);
  piece((start + end) / 2, h - STUD * 1.5, end - start, STUD);

  const studBottom = STUD;
  const studTop = h - 2 * STUD;
  const spans = layout.openings.map((o) => ({ o, span: openingSpan(o) }));
  const inOpening = (u: number) =>
    spans.find(({ span }) => u > span[0] - STUD && u < span[1] + STUD);

  // Montantes a ejes regulares en los tramos macizos.
  const count = Math.max(1, Math.round((end - start) / SPACING));
  for (let i = 0; i <= count; i++) {
    const u = start + STUD / 2 + ((end - start - STUD) * i) / count;
    if (inOpening(u)) continue;
    piece(u, (studBottom + studTop) / 2, STUD, studTop - studBottom);
  }

  for (const { o, span } of spans) {
    const [u0, u1] = span;
    const top = o.sill + o.height;
    const header = Math.min(0.2, Math.max(0.1, studTop - top));
    // Montantes de jamba a ambos lados del hueco.
    piece(u0 - STUD / 2, (studBottom + studTop) / 2, STUD, studTop - studBottom);
    piece(u1 + STUD / 2, (studBottom + studTop) / 2, STUD, studTop - studBottom);
    // Cargadero sobre el hueco.
    if (studTop - top > 0.02) {
      piece((u0 + u1) / 2, top + header / 2, o.width, header);
    }
    const n = Math.max(1, Math.round(o.width / SPACING));
    // Enanos sobre el cargadero.
    if (studTop - (top + header) > 0.06) {
      for (let i = 1; i < n; i++) {
        piece(u0 + (o.width * i) / n, (top + header + studTop) / 2, STUD, studTop - top - header);
      }
    }
    // Peana y enanos bajo las ventanas.
    if (o.sill > 0.1) {
      piece((u0 + u1) / 2, o.sill - STUD / 2, o.width, STUD);
      for (let i = 1; i < n; i++) {
        piece(u0 + (o.width * i) / n, (studBottom + o.sill - STUD) / 2, STUD, o.sill - STUD - studBottom);
      }
    }
  }
  return out;
}

export function wallFraming(layouts: WallLayout[]): Part[] {
  const out: Part[] = [];
  for (const layout of layouts) {
    for (const lp of framingForWall(layout)) out.push(localToWorld(layout.wall.a, layout.dir, lp));
  }
  return out;
}

/** Viguetas de cubierta paralelas al eje z, apoyadas a `y0`, sobre un rectángulo en planta. */
export function roofJoists(
  rect: { x0: number; x1: number; z0: number; z1: number },
  y0: number,
  depth: number,
  spacing = SPACING,
): Part[] {
  const out: Part[] = [];
  const { x0, x1, z0, z1 } = rect;
  const w = 0.06;
  const n = Math.max(1, Math.round((x1 - x0) / spacing));
  for (let i = 0; i <= n; i++) {
    const x = x0 + w / 2 + ((x1 - x0 - w) * i) / n;
    out.push({
      shape: 'box',
      mat: 'stud',
      layer: 'estructura',
      p: [x, y0 + depth / 2, (z0 + z1) / 2],
      s: [w, depth, z1 - z0],
    });
  }
  // Zunchos de borde que cierran las cabezas de las viguetas.
  for (const z of [z0 + w / 2, z1 - w / 2]) {
    out.push({
      shape: 'box',
      mat: 'stud',
      layer: 'estructura',
      p: [(x0 + x1) / 2, y0 + depth / 2, z],
      s: [x1 - x0, depth, w],
    });
  }
  return out;
}
