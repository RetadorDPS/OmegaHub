/**
 * Trazado en planta: la huella de los muros y los huecos dibujados a ras de
 * suelo, como replanteo. Sale de los mismos intervalos que la geometría 3D.
 */
import { openingSpan } from '../model/project';
import { localToWorld, type LocalPart, type Part } from './parts';
import type { WallLayout } from './walls';

const LINE = 0.045;
const Y = 0.012;
const HEIGHT = 0.012;

export function planLineParts(layouts: WallLayout[]): Part[] {
  const out: Part[] = [];
  for (const layout of layouts) {
    const t = layout.wall.thickness;
    const local: LocalPart[] = [];
    const strip = (u0: number, u1: number, v: number, width: number) => {
      if (u1 - u0 < 1e-3) return;
      local.push({ mat: 'chalk', layer: 'trazado', u: (u0 + u1) / 2, y: Y, v, su: u1 - u0, sy: HEIGHT, sv: width, noShadow: true });
    };
    const cross = (u: number) =>
      local.push({ mat: 'chalk', layer: 'trazado', u, y: Y, v: 0, su: LINE, sy: HEIGHT, sv: t, noShadow: true });

    let cursor = -layout.extA;
    const solid = (u0: number, u1: number) => {
      // Dos líneas de cara y sus testas: el muro se lee como una banda hueca.
      strip(u0, u1, t / 2 - LINE / 2, LINE);
      strip(u0, u1, -t / 2 + LINE / 2, LINE);
      cross(u0 + LINE / 2);
      cross(u1 - LINE / 2);
    };
    for (const o of layout.openings) {
      const [u0, u1] = openingSpan(o);
      solid(cursor, u0);
      if (o.kind === 'window') {
        strip(u0, u1, 0, LINE * 0.7);
        strip(u0, u1, t / 2 - LINE / 2, LINE * 0.5);
        strip(u0, u1, -t / 2 + LINE / 2, LINE * 0.5);
      } else if ((o.leaf ?? 'swing') === 'swing') {
        // Hoja abierta a 90° y arco de barrido aproximado con cuerdas.
        const steps = 7;
        local.push({ mat: 'chalk', layer: 'trazado', u: u0 + LINE / 2, y: Y, v: t / 2 + o.width / 2, su: LINE * 0.7, sy: HEIGHT, sv: o.width, noShadow: true });
        for (let k = 0; k < steps; k++) {
          const a0 = (k / steps) * (Math.PI / 2);
          const a1 = ((k + 1) / steps) * (Math.PI / 2);
          const am = (a0 + a1) / 2;
          const chord = 2 * o.width * Math.sin((a1 - a0) / 2);
          local.push({
            mat: 'chalk',
            layer: 'trazado',
            u: u0 + o.width * Math.cos(am),
            y: Y,
            v: t / 2 + o.width * Math.sin(am),
            su: chord,
            sy: HEIGHT,
            sv: LINE * 0.45,
            swing: { pivotU: u0 + o.width * Math.cos(am), pivotV: t / 2 + o.width * Math.sin(am), angle: am + Math.PI / 2 },
            noShadow: true,
          });
        }
      }
      cursor = u1;
    }
    solid(cursor, layout.length + layout.extB);
    for (const lp of local) out.push(localToWorld(layout.wall.a, layout.dir, lp));
  }
  return out;
}
