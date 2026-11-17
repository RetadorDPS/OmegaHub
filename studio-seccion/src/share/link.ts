/**
 * Enlace para compartir un proyecto sin servidor.
 *
 * La geometría (muros, huecos, losa, estancias), los acabados y el nombre se
 * comprimen y viajan en el fragmento de la URL (#/ver/…). El fragmento no se
 * envía al servidor que sirve la app: quien recibe el enlace reconstruye el
 * modelo en su navegador. El plano original (PDF o imagen) NO se incluye.
 */
import { migrateProject } from '../model/project';
import { SCHEMA_VERSION, type Project } from '../model/types';

const PREFIX = 'v1.';
/** Límite prudente: algunos clientes de mensajería recortan URLs muy largas. */
export const MAX_LINK_CHARS = 60000;

const r = (n: number) => Math.round(n * 1000) / 1000;

/** Solo lo necesario para ver el modelo, con cotas redondeadas al milímetro. */
export function shareablePayload(p: Project) {
  return {
    s: SCHEMA_VERSION,
    n: p.name,
    f: p.finishes,
    pr: p.presentation,
    w: p.walls.map((w) => [w.id, r(w.a.x), r(w.a.y), r(w.b.x), r(w.b.y), r(w.thickness), r(w.height)]),
    o: p.openings.map((o) => [o.id, o.wallId, o.kind === 'door' ? 1 : 0, r(o.offset), r(o.width), r(o.height), r(o.sill), o.leaf ?? '']),
    l: p.slab ? { p: p.slab.points.map((q) => [r(q.x), r(q.y)]), c: p.slab.closed ? 1 : 0, t: r(p.slab.thickness) } : null,
    r: p.rooms.map((m) => [m.id, m.name, r(m.camera.x), r(m.camera.y)]),
  };
}

type Payload = ReturnType<typeof shareablePayload>;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

export async function encodeProject(p: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(shareablePayload(p)));
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Reconstruye el proyecto. Lanza un Error con mensaje legible si el enlace no es válido. */
export async function decodeProject(token: string): Promise<Project> {
  if (!token.startsWith(PREFIX)) throw new Error('El enlace no es de Studio Sección o está incompleto.');
  let data: Payload;
  try {
    const bytes = await pipe(fromBase64Url(token.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    data = JSON.parse(new TextDecoder().decode(bytes)) as Payload;
  } catch {
    throw new Error('El enlace está dañado o incompleto. Pide que te lo vuelvan a enviar.');
  }
  if (!data || !Array.isArray(data.w) || !Array.isArray(data.o) || !Array.isArray(data.r)) {
    throw new Error('El enlace no contiene un proyecto válido.');
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
  // Los datos llegan de fuera: se reconstruyen campo a campo, sin confiar en su forma.
  return migrateProject({
    schemaVersion: SCHEMA_VERSION,
    id: `compartido-${token.slice(-12)}`,
    name: str(data.n) || 'Proyecto compartido',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    units: 'm',
    plan: null,
    calibration: null,
    planOpacity: 0.7,
    finishes: data.f,
    presentation: data.pr
      ? { furnish: data.pr.furnish !== false, roof: data.pr.roof !== false, ambience: data.pr.ambience === 'day' ? 'day' : 'dusk' }
      : undefined,
    walls: data.w.slice(0, 2000).map((w) => ({
      id: str(w[0]),
      a: { x: num(w[1]), y: num(w[2]) },
      b: { x: num(w[3]), y: num(w[4]) },
      thickness: Math.min(1, Math.max(0.05, num(w[5]))),
      height: Math.min(8, Math.max(0.5, num(w[6]))),
    })),
    openings: data.o.slice(0, 2000).map((o) => ({
      id: str(o[0]),
      wallId: str(o[1]),
      kind: o[2] === 1 ? 'door' : 'window',
      offset: num(o[3]),
      width: num(o[4]),
      height: num(o[5]),
      sill: num(o[6]),
      ...(o[7] === 'swing' || o[7] === 'sliding-glass' || o[7] === 'none' ? { leaf: o[7] } : {}),
    })),
    slab: data.l
      ? {
          points: (data.l.p ?? []).slice(0, 500).map((q) => ({ x: num(q[0]), y: num(q[1]) })),
          closed: data.l.c === 1,
          thickness: Math.min(1, Math.max(0.05, num(data.l.t))),
        }
      : null,
    rooms: data.r.slice(0, 200).map((m) => ({ id: str(m[0]), name: str(m[1], 40), camera: { x: num(m[2]), y: num(m[3]) } })),
  });
}

export function shareUrl(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/ver/${token}`;
}
