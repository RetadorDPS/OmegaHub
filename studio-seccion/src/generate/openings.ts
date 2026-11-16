/**
 * Carpinterías: marcos con espesor, vidrio y hojas, generados a partir de los
 * mismos huecos que segmentan el muro.
 */
import type { Opening } from '../model/types';
import { openingSpan } from '../model/project';
import { localToWorld, type LocalPart, type Part } from './parts';
import type { WallLayout } from './walls';

const PROFILE = 0.055;

export function openingLocalParts(layout: WallLayout, o: Opening): LocalPart[] {
  const t = layout.wall.thickness;
  const depth = Math.min(Math.max(t * 0.55, 0.07), 0.14);
  const [u0, u1] = openingSpan(o);
  const y0 = o.sill;
  const y1 = o.sill + o.height;
  const out: LocalPart[] = [];
  const frame = (u: number, y: number, su: number, sy: number, sv = depth, v = 0) =>
    out.push({ mat: 'frame', layer: 'carpinterias', u, y, v, su, sy, sv });

  // Marco perimetral.
  frame(u0 + PROFILE / 2, (y0 + y1) / 2, PROFILE, o.height);
  frame(u1 - PROFILE / 2, (y0 + y1) / 2, PROFILE, o.height);
  frame((u0 + u1) / 2, y1 - PROFILE / 2, o.width - 2 * PROFILE, PROFILE);

  if (o.kind === 'window') {
    frame((u0 + u1) / 2, y0 + PROFILE / 2, o.width - 2 * PROFILE, PROFILE);
    // Montantes intermedios en ventanales anchos.
    const panes = Math.max(1, Math.round(o.width / 1.35));
    for (let i = 1; i < panes; i++) {
      frame(u0 + (o.width * i) / panes, (y0 + y1) / 2, PROFILE * 0.8, o.height - 2 * PROFILE);
    }
    out.push({
      mat: 'glass',
      layer: 'carpinterias',
      u: (u0 + u1) / 2,
      y: (y0 + y1) / 2,
      v: 0,
      su: o.width - 2 * PROFILE,
      sy: o.height - 2 * PROFILE,
      sv: 0.014,
      noShadow: true,
    });
    // Vierteaguas / repisa cuando hay antepecho.
    if (o.sill > 0.05) {
      out.push({
        mat: 'frame',
        layer: 'carpinterias',
        u: (u0 + u1) / 2,
        y: y0 - 0.012,
        v: 0,
        su: o.width + 0.06,
        sy: 0.024,
        sv: t + 0.06,
      });
    }
    return out;
  }

  // Puertas.
  const leaf = o.leaf ?? 'swing';
  const clearW = o.width - 2 * PROFILE;
  const clearH = o.height - PROFILE;
  if (leaf === 'swing') {
    // Hoja abierta ~100° hacia el lado +v, con bisagra en u0.
    out.push({
      mat: 'door',
      layer: 'carpinterias',
      u: u0 + PROFILE + clearW / 2,
      y: y0 + clearH / 2,
      v: depth / 2 - 0.02,
      su: clearW,
      sy: clearH,
      sv: 0.04,
      swing: { pivotU: u0 + PROFILE, pivotV: depth / 2, angle: (100 * Math.PI) / 180 },
    });
  } else if (leaf === 'sliding-glass') {
    // Corredera de vidrio recogida por fuera, a continuación del hueco.
    const side = layout.sidePlus === 'exterior' ? 1 : -1;
    const v = side * (t / 2 + 0.035);
    const cu = u1 + 0.03 + o.width / 2;
    const p = 0.045;
    const part = (u: number, y: number, su: number, sy: number) =>
      out.push({ mat: 'frame', layer: 'carpinterias', u, y, v, su, sy, sv: 0.04 });
    part(cu - o.width / 2 + p / 2, y0 + clearH / 2, p, clearH);
    part(cu + o.width / 2 - p / 2, y0 + clearH / 2, p, clearH);
    part(cu, y0 + clearH - p / 2, o.width - 2 * p, p);
    part(cu, y0 + p / 2, o.width - 2 * p, p);
    out.push({
      mat: 'glass',
      layer: 'carpinterias',
      u: cu,
      y: y0 + clearH / 2,
      v,
      su: o.width - 2 * p,
      sy: clearH - 2 * p,
      sv: 0.012,
      noShadow: true,
    });
    // Guía superior a lo largo del hueco y de la hoja recogida.
    out.push({
      mat: 'frame',
      layer: 'carpinterias',
      u: (u0 + cu + o.width / 2) / 2,
      y: y0 + clearH + 0.03,
      v,
      su: cu + o.width / 2 - u0,
      sy: 0.05,
      sv: 0.06,
    });
  }
  return out;
}

export function openingParts(layouts: WallLayout[]): Part[] {
  const out: Part[] = [];
  for (const layout of layouts) {
    for (const o of layout.openings) {
      for (const lp of openingLocalParts(layout, o)) {
        out.push(localToWorld(layout.wall.a, layout.dir, lp));
      }
    }
  }
  return out;
}
