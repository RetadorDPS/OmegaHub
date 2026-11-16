/**
 * Visita guiada: paradas (encuadres) unidas por tramos. Un tramo `path` es una
 * curva con puntos intermedios para posición y para el punto de mira; un tramo
 * `cut` es un fundido corto, sin desplazamiento, para cuando no hay un camino
 * comprobado entre dos encuadres.
 *
 * Este módulo no depende del DOM: las pruebas muestrean las mismas curvas que
 * dibuja el visor para comprobar que ningún tramo interior atraviesa un muro.
 */
import { CatmullRomCurve3, Vector3 } from 'three';

export type V3 = [number, number, number];

export interface Pose {
  pos: V3;
  look: V3;
}

export interface TourStop {
  id: string;
  /** Capítulo que se muestra en la interfaz. */
  chapter: string;
  /** Rótulo discreto de estancia. */
  label: string;
  note?: string;
  pose: Pose;
  /** ¿La cámara está a pie (dentro o en terraza)? Decide a qué modo libre se pasa. */
  onFoot: boolean;
  /** Oculta cubierta y techos (vista de maqueta). */
  cutaway?: boolean;
}

export type TourLeg =
  | { kind: 'path'; via: V3[]; lookVia: V3[]; seconds: number }
  | { kind: 'cut' };

export interface Tour {
  stops: TourStop[];
  /** legs[i] une stops[i] con stops[i + 1]. */
  legs: TourLeg[];
}

export const smootherstep = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

interface LegCurves {
  pos: CatmullRomCurve3;
  look: CatmullRomCurve3;
}

const cache = new WeakMap<Tour, (LegCurves | null)[]>();

function curvesOf(tour: Tour): (LegCurves | null)[] {
  let c = cache.get(tour);
  if (c) return c;
  c = tour.legs.map((leg, i) => {
    if (leg.kind !== 'path') return null;
    const a = tour.stops[i].pose;
    const b = tour.stops[i + 1].pose;
    const pts = (list: V3[]) => list.map((p) => new Vector3(...p));
    const pos = new CatmullRomCurve3(pts([a.pos, ...leg.via, b.pos]), false, 'centripetal');
    const look = new CatmullRomCurve3(pts([a.look, ...leg.lookVia, b.look]), false, 'centripetal');
    pos.arcLengthDivisions = 400;
    look.arcLengthDivisions = 200;
    return { pos, look };
  });
  cache.set(tour, c);
  return c;
}

/**
 * Encuadre para una posición continua `s` de la visita (0 = primera parada,
 * 1 = segunda…). Dentro de cada tramo se suaviza el arranque y la llegada.
 */
export function poseAt(tour: Tour, s: number, outPos: Vector3, outLook: Vector3): void {
  const last = tour.stops.length - 1;
  const clamped = Math.max(0, Math.min(last, s));
  const i = Math.max(0, Math.min(last - 1, Math.floor(clamped)));
  const f = clamped - i;
  if (last === 0) {
    outPos.set(...tour.stops[0].pose.pos);
    outLook.set(...tour.stops[0].pose.look);
    return;
  }
  const curves = curvesOf(tour)[i];
  if (!curves || f <= 0 || f >= 1) {
    // En un tramo `cut` se mantiene el encuadre de salida hasta completar el fundido.
    const stop = tour.stops[f >= 1 ? i + 1 : i];
    outPos.set(...stop.pose.pos);
    outLook.set(...stop.pose.look);
    return;
  }
  const e = smootherstep(f);
  curves.pos.getPointAt(e, outPos);
  curves.look.getPoint(e, outLook);
}

/** Muestrea en planta (x, z) la curva de posición de un tramo `path`. */
export function sampleLegPlan(tour: Tour, legIndex: number, samples = 400): { x: number; y: number; height: number }[] {
  const curves = curvesOf(tour)[legIndex];
  if (!curves) return [];
  const out: { x: number; y: number; height: number }[] = [];
  const p = new Vector3();
  for (let k = 0; k <= samples; k++) {
    curves.pos.getPointAt(k / samples, p);
    out.push({ x: p.x, y: p.z, height: p.y });
  }
  return out;
}

export const legSeconds = (tour: Tour, legIndex: number): number => {
  const leg = tour.legs[legIndex];
  return leg && leg.kind === 'path' ? leg.seconds : 0;
};
