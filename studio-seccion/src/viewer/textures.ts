/**
 * Texturas procedurales dibujadas en un canvas 2D al arrancar el visor. Son
 * mapas de detalle casi neutros (el color lo pone el material) y se repiten
 * por metros reales gracias a las UV en escala de mundo de la geometría.
 * No hay imágenes externas ni activos con licencia de terceros.
 */
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { TextureKind } from './finishes';

/** Generador pseudoaleatorio determinista: las texturas son iguales en cada carga. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number, h = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function finish(c: HTMLCanvasElement, tileMeters: number): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1 / tileMeters, 1 / tileMeters);
  t.anisotropy = 8;
  return t;
}

function speckle(g: CanvasRenderingContext2D, size: number, r: () => number, count: number, lo: number, hi: number, maxR = 1.2) {
  for (let i = 0; i < count; i++) {
    const v = Math.round(lo + r() * (hi - lo));
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.5})`;
    g.beginPath();
    g.arc(r() * size, r() * size, 0.3 + r() * maxR, 0, Math.PI * 2);
    g.fill();
  }
}

function blotches(g: CanvasRenderingContext2D, size: number, r: () => number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.08 + r() * 0.22);
    const dark = r() > 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    // Se repite en los bordes para que la textura sea continua.
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) g.fillRect(x - rad + ox, y - rad + oy, rad * 2, rad * 2);
  }
}

function plaster(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  const r = rng(11);
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, 256, 256);
  blotches(g, 256, r, 16, 0.03);
  speckle(g, 256, r, 2600, 232, 250, 0.8);
  return c;
}

function concrete(): HTMLCanvasElement {
  const { c, g } = canvas(512);
  const r = rng(23);
  g.fillStyle = '#e9e9e9';
  g.fillRect(0, 0, 512, 512);
  blotches(g, 512, r, 26, 0.07);
  speckle(g, 512, r, 5200, 170, 255, 1.1);
  speckle(g, 512, r, 260, 120, 170, 1.6);
  return c;
}

function terrazzo(): HTMLCanvasElement {
  const { c, g } = canvas(512);
  const r = rng(37);
  g.fillStyle = '#f1f1f1';
  g.fillRect(0, 0, 512, 512);
  const tones = ['#c9c2b6', '#a9a39a', '#d9cdbd', '#8e8a84', '#e3d2c0', '#b9a58f'];
  for (let i = 0; i < 520; i++) {
    g.fillStyle = tones[Math.floor(r() * tones.length)];
    const x = r() * 512;
    const y = r() * 512;
    const w = 2 + r() * 7;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI);
    g.beginPath();
    g.moveTo(-w, -w * 0.5);
    g.lineTo(w * 0.7, -w * 0.7);
    g.lineTo(w, w * 0.4);
    g.lineTo(-w * 0.4, w * 0.8);
    g.closePath();
    g.fill();
    g.restore();
  }
  return c;
}

/** Tablas horizontales (suelo, tarima) o verticales (fachada de madera). */
function boards(seed: number, rows: number, vertical: boolean, contrast: number): HTMLCanvasElement {
  const size = 1024;
  const { c, g } = canvas(size);
  const r = rng(seed);
  const rowH = size / rows;
  for (let i = 0; i < rows; i++) {
    // Cada hilera se parte en tablas de largo distinto.
    let x = -r() * size * 0.5;
    while (x < size) {
      const w = size * (0.35 + r() * 0.5);
      const v = Math.round(236 - r() * contrast);
      g.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
      g.fillRect(x, i * rowH, w, rowH);
      // Veta.
      for (let k = 0; k < 14; k++) {
        const gy = i * rowH + r() * rowH;
        g.strokeStyle = `rgba(90,70,50,${0.03 + r() * 0.06})`;
        g.lineWidth = 0.6 + r();
        g.beginPath();
        g.moveTo(x, gy);
        g.bezierCurveTo(x + w * 0.3, gy + (r() - 0.5) * 5, x + w * 0.7, gy + (r() - 0.5) * 5, x + w, gy);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,30,22,0.42)';
      g.fillRect(x + w - 1, i * rowH, 1.2, rowH);
      x += w;
    }
    g.fillStyle = 'rgba(40,30,22,0.5)';
    g.fillRect(0, i * rowH, size, 1.4);
  }
  if (!vertical) return c;
  const out = canvas(size);
  out.g.translate(size, 0);
  out.g.rotate(Math.PI / 2);
  out.g.drawImage(c, 0, 0);
  return out.c;
}

function grass(): HTMLCanvasElement {
  const { c, g } = canvas(512);
  const r = rng(51);
  g.fillStyle = '#e2e2e2';
  g.fillRect(0, 0, 512, 512);
  blotches(g, 512, r, 30, 0.05);
  speckle(g, 512, r, 9000, 170, 250, 1.0);
  return c;
}

function gravel(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  const r = rng(63);
  g.fillStyle = '#dcdcdc';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, r, 5200, 120, 255, 1.5);
  return c;
}

function blueprintGrid(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  g.fillStyle = '#1c4f93';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const p = (i * 256) / 4;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 256);
    g.moveTo(0, p);
    g.lineTo(256, p);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.26)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  return c;
}

function art(seed: number, palette: string[]): HTMLCanvasElement {
  const { c, g } = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = palette[0];
  g.fillRect(0, 0, 256, 256);
  for (let i = 1; i < palette.length; i++) {
    g.fillStyle = palette[i];
    g.beginPath();
    if (i % 2) {
      g.arc(40 + r() * 176, 60 + r() * 150, 30 + r() * 60, 0, Math.PI * 2);
    } else {
      g.rect(r() * 150, 90 + r() * 100, 60 + r() * 120, 40 + r() * 90);
    }
    g.fill();
  }
  return c;
}

const cache = new Map<string, Texture>();
const sources = new Map<string, HTMLCanvasElement>();

/** Mapa de normales a partir de la luminancia (las juntas y vetas oscuras se leen como hendiduras). */
function normalFromCanvas(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
  const { c, g } = canvas(w, h);
  const out = g.createImageData(w, h);
  const at = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

function linear(c: HTMLCanvasElement, tileMeters: number): CanvasTexture {
  const t = finish(c, tileMeters);
  t.colorSpace = NoColorSpace;
  return t;
}

const NORMAL_STRENGTH: Record<Exclude<TextureKind, 'none'>, number> = {
  plaster: 2.2,
  concrete: 2.6,
  terrazzo: 1.2,
  planks: 5,
  'boards-vertical': 5,
};

function cached(key: string, make: () => Texture): Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Textura de detalle para un acabado. Se clona por material porque la repetición es propia de cada uno. */
function sourceCanvas(kind: Exclude<TextureKind, 'none'>): HTMLCanvasElement {
  let c = sources.get(kind);
  if (!c) {
    c =
      kind === 'plaster'
        ? plaster()
        : kind === 'concrete'
          ? concrete()
          : kind === 'terrazzo'
            ? terrazzo()
            : kind === 'planks'
              ? boards(71, 16, false, 34)
              : boards(83, 10, true, 40);
    sources.set(kind, c);
  }
  return c;
}

export function finishTexture(kind: TextureKind, tile: number): Texture | null {
  if (kind === 'none') return null;
  return cached(`${kind}@${tile}`, () => finish(sourceCanvas(kind), tile));
}

/** Relieve del acabado: misma repetición que su textura de color. */
export function finishNormal(kind: TextureKind, tile: number): Texture | null {
  if (kind === 'none') return null;
  return cached(`${kind}-n@${tile}`, () => linear(normalFromCanvas(sourceCanvas(kind), NORMAL_STRENGTH[kind]), tile));
}

const deckCanvas = () => sources.get('deck') ?? (sources.set('deck', boards(97, 14, false, 30)), sources.get('deck')!);
const soffitCanvas = () => sources.get('soffit') ?? (sources.set('soffit', boards(103, 20, false, 22)), sources.get('soffit')!);
const gravelCanvas = () => sources.get('gravel') ?? (sources.set('gravel', gravel()), sources.get('gravel')!);
export const deckTexture = () => cached('deck', () => finish(deckCanvas(), 1.9));
export const deckNormal = () => cached('deck-n', () => linear(normalFromCanvas(deckCanvas(), 5), 1.9));
export const soffitTexture = () => cached('soffit', () => finish(soffitCanvas(), 2.2));
export const soffitNormal = () => cached('soffit-n', () => linear(normalFromCanvas(soffitCanvas(), 4), 2.2));
export const grassTexture = () => cached('grass', () => finish(grass(), 13));
export const gravelTexture = () => cached('gravel', () => finish(gravelCanvas(), 1.4));
export const gravelNormal = () => cached('gravel-n', () => linear(normalFromCanvas(gravelCanvas(), 4), 1.4));
export const concreteTexture = () => cached('concrete-base', () => finish(sourceCanvas('concrete'), 3));
export const concreteNormal = () => cached('concrete-base-n', () => linear(normalFromCanvas(sourceCanvas('concrete'), 2.6), 3));
export const blueprintTexture = () => cached('blueprint', () => finish(blueprintGrid(), 4));
export const artTexture = (which: 'a' | 'b') =>
  cached(`art-${which}`, () => {
    const t = new CanvasTexture(
      which === 'a'
        ? art(5, ['#e8dfd0', '#b5694a', '#2f3a4a', '#d9b38c', '#6f7d6a'])
        : art(9, ['#ded6c8', '#7f8c78', '#c98d5b', '#34373d']),
    );
    t.colorSpace = SRGBColorSpace;
    return t;
  });

/** Rótulo de texto como textura (cotas y nombres de estancia en la maqueta). */
export function labelTexture(text: string, opts: { color?: string; background?: string | null; weight?: number } = {}) {
  const pad = 18;
  const font = `${opts.weight ?? 500} 44px "Instrument Sans Variable", system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const h = 72;
  const { c, g } = canvas(w, h);
  if (opts.background !== null) {
    g.fillStyle = opts.background ?? 'rgba(22,23,26,0.86)';
    g.beginPath();
    g.roundRect(0, 0, w, h, 14);
    g.fill();
  }
  g.font = font;
  g.fillStyle = opts.color ?? '#f3eee4';
  g.textBaseline = 'middle';
  g.fillText(text, pad, h / 2 + 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return { texture: t, aspect: w / h };
}
