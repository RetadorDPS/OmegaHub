/* =============================================================
   Maze Runner Mobile — Texturas y sprites procedurales (128 px)
   Ruido multi-octava determinista, suciedad, óxido, musgo,
   grietas y sombreado de aristas. Cero assets externos.
   ============================================================= */

const TS = 128;

/* ------------------------------ ruido ------------------------------ */

function texRand32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de valor enrejado P×P (enrollable => textura sin costuras). */
function noiseGrid(seed, P) {
  const r = texRand32(seed);
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const w = (a) => ((a % P) + P) % P;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
    const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

function fbm(n, x, y, oct, gain = 0.5) {
  let s = 0, amp = 1, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { s += amp * n(x * f, y * f); tot += amp; amp *= gain; f *= 2; }
  return s / tot;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/* --------------------------- utilidades --------------------------- */

function cv(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Textura por píxel: fn(x, y, u, v, n) -> [r,g,b,a?] en 0..255 */
function pixTex(fn, size = TS) {
  const c = cv(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const P = 8, P2 = 16, P3 = 32;
  const n1 = noiseGrid(1, P), n2 = noiseGrid(2, P2), n3 = noiseGrid(3, P3), n4 = noiseGrid(4, P2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const g = (hash2(x, y) + 0.0);
      const c4 = fn(x, y, u, v, {
        n1: fbm(n1, u * P, v * P, 4),
        n2: fbm(n2, u * P2, v * P2, 3),
        n3: fbm(n3, u * P3, v * P3, 2),
        n4: fbm(n4, u * P2, v * P2, 4),
        g,
      });
      const i = (y * size + x) * 4;
      d[i] = c4[0]; d[i + 1] = c4[1]; d[i + 2] = c4[2]; d[i + 3] = c4.length > 3 ? c4[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { w: size, h: size, data: new Uint8ClampedArray(ctx.getImageData(0, 0, size, size).data.buffer), ctx, canvas: c };
}

/** Detalles vectoriales dibujados sobre una textura ya generada. */
function detail(tex, draw) {
  draw(tex.ctx, tex.w, tex.h);
  tex.data = new Uint8ClampedArray(tex.ctx.getImageData(0, 0, tex.w, tex.h).data.buffer);
  return tex;
}

function finish(tex) { return { w: tex.w, h: tex.h, data: tex.data }; }

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ============================== MUROS ============================== */

function brickMask(u, v, bw, bh, mortar) {
  const row = Math.floor(v / bh);
  const off = (row % 2) * bw * 0.5;
  const lx = (u + off) % bw;
  const ly = v % bh;
  const mx = Math.min(lx, bw - lx), my = Math.min(ly, bh - ly);
  const edge = Math.min(mx / bw, my / bh);
  return {
    mortar: edge < mortar,
    ao: smooth(0, mortar * 2.6, edge),
    row, id: hash2(Math.floor((u + off) / bw), row),
  };
}

const wallGlade = () => pixTex((x, y, u, v, n) => {
  const b = brickMask(u, v, 0.25, 0.125, 0.012);
  let r = 104, g = 110, bl = 92;
  const tone = 0.82 + b.id * 0.30 + n.n1 * 0.22 + (n.g - 0.5) * 0.10;
  r *= tone; g *= tone; bl *= tone * 0.96;
  if (b.mortar) { const m = 0.42; r *= m; g *= m; bl *= m; }
  r *= b.ao * 0.35 + 0.65; g *= b.ao * 0.35 + 0.65; bl *= b.ao * 0.35 + 0.65;
  const moss = smooth(0.52, 0.86, n.n2 * (0.5 + v * 0.9));
  r = lerp(r, 62, moss * 0.75); g = lerp(g, 104, moss * 0.75); bl = lerp(bl, 48, moss * 0.75);
  const damp = smooth(0.62, 0.95, n.n4) * (0.25 + 0.75 * v);
  r *= 1 - damp * 0.35; g *= 1 - damp * 0.30; bl *= 1 - damp * 0.22;
  return [r, g, bl];
});

const wallMoss = () => pixTex((x, y, u, v, n) => {
  const b = brickMask(u, v, 0.25, 0.125, 0.014);
  let r = 96, g = 88, bl = 74;
  const tone = 0.80 + b.id * 0.34 + n.n1 * 0.20 + (n.g - 0.5) * 0.10;
  r *= tone; g *= tone; bl *= tone * 0.95;
  if (b.mortar) { const m = 0.38; r *= m; g *= m; bl *= m; }
  r *= b.ao * 0.4 + 0.6; g *= b.ao * 0.4 + 0.6; bl *= b.ao * 0.4 + 0.6;
  const moss = smooth(0.46, 0.80, n.n2 * (0.55 + v * 0.8));
  r = lerp(r, 58, moss * 0.8); g = lerp(g, 98, moss * 0.8); bl = lerp(bl, 46, moss * 0.8);
  const dark = smooth(0.58, 0.92, n.n4) * (0.2 + 0.8 * v);
  r *= 1 - dark * 0.4; g *= 1 - dark * 0.36; bl *= 1 - dark * 0.3;
  return [r, g, bl];
});

const wallMetal = () => pixTex((x, y, u, v, n) => {
  const pw = 0.5, ph = 0.5;
  const px = u % pw, py = v % ph;
  const ex = Math.min(px, pw - px), ey = Math.min(py, ph - py);
  const bevel = smooth(0, 0.02, Math.min(ex, ey));
  let r = 74, g = 80, bl = 88;
  const tone = 0.86 + n.n1 * 0.24 + bevel * 0.22 + (n.g - 0.5) * 0.08;
  r *= tone; g *= tone; bl *= tone;
  const seam = 1 - smooth(0.004, 0.014, Math.min(ex, ey));
  r *= 1 - seam * 0.55; g *= 1 - seam * 0.55; bl *= 1 - seam * 0.5;
  const rust = smooth(0.56, 0.86, n.n2 * (0.55 + v * 0.7));
  r = lerp(r, 116, rust * 0.8); g = lerp(g, 62, rust * 0.8); bl = lerp(bl, 34, rust * 0.8);
  r *= 1 - smooth(0.5, 1, n.n3) * 0.22; g *= 1 - smooth(0.5, 1, n.n3) * 0.22; bl *= 1 - smooth(0.5, 1, n.n3) * 0.2;
  return [r, g, bl];
});

const wallConcrete = () => pixTex((x, y, u, v, n) => {
  const b = brickMask(u, v, 0.5, 0.25, 0.010);
  let r = 152, g = 140, bl = 112;
  const tone = 0.84 + b.id * 0.26 + n.n1 * 0.26 + (n.g - 0.5) * 0.10;
  r *= tone; g *= tone; bl *= tone;
  if (b.mortar) { const m = 0.55; r *= m; g *= m; bl *= m * 1.05; }
  r *= b.ao * 0.3 + 0.7; g *= b.ao * 0.3 + 0.7; bl *= b.ao * 0.3 + 0.7;
  const sand = smooth(0.55, 1.0, v) * 0.35;
  r = lerp(r, 186, sand); g = lerp(g, 168, sand); bl = lerp(bl, 124, sand);
  const stain = smooth(0.55, 0.95, n.n4);
  r *= 1 - stain * 0.18; g *= 1 - stain * 0.2; bl *= 1 - stain * 0.22;
  return [r, g, bl];
});

const wallCruel = () => pixTex((x, y, u, v, n) => {
  const gx = u % 0.125, gy = v % 0.125;
  const bar = (gx < 0.055 && gy < 0.055) ? 1 : 0;
  let r = 62, g = 68, bl = 76;
  const tone = 0.85 + n.n1 * 0.3 + (n.g - 0.5) * 0.08;
  r *= tone; g *= tone; bl *= tone;
  if (!bar) { const d = 0.22; r *= d; g *= d; bl *= d * 1.1; }
  else {
    const hi = smooth(0.03, 0.052, Math.min(gx, gy)) * 0.3;
    r *= 1 + hi; g *= 1 + hi; bl *= 1 + hi;
  }
  const rust = smooth(0.62, 0.92, n.n2);
  r = lerp(r, 104, rust * 0.6); g = lerp(g, 52, rust * 0.6); bl = lerp(bl, 30, rust * 0.6);
  return [r, g, bl];
});

const wallDoor = () => pixTex((x, y, u, v) => {
  // rastrillo: barrotes opacos, huecos transparentes
  const col = u % (1 / 7);
  const bar = col < 0.55;
  if (!bar) return [0, 0, 0, 0];
  const cx = (col - 0.27) / 0.27;
  const cyl = 1 - Math.abs(cx) * Math.abs(cx) * 0.8;
  const cross = (v % 0.25) < 0.06 || v < 0.05 || v > 0.94;
  let r = 96, g = 102, bl = 110;
  const t = 0.55 + cyl * 0.7;
  r *= t; g *= t; bl *= t;
  if (cross) { r *= 1.15; g *= 1.12; bl *= 1.08; }
  return [r, g, bl, 255];
});

/* ============================== SUELOS ============================== */

const floorGlade = () => pixTex((x, y, u, v, n) => {
  let r = 74, g = 92, bl = 56;
  const t = 1 + (n.n1 - 0.5) * 0.85 + (n.n2 - 0.5) * 0.35 + (n.g - 0.5) * 0.30;
  r *= t; g *= t; bl *= t;
  const dirt = smooth(0.45, 0.85, n.n2);
  r = lerp(r, 92, dirt * 0.6); g = lerp(g, 78, dirt * 0.6); bl = lerp(bl, 52, dirt * 0.6);
  const stone = smooth(0.78, 0.97, n.n3);
  r = lerp(r, 120, stone * 0.5); g = lerp(g, 118, stone * 0.5); bl = lerp(bl, 108, stone * 0.5);
  return [r, g, bl];
});

const floorStone = () => pixTex((x, y, u, v, n) => {
  const b = brickMask(u, v, 0.25, 0.25, 0.014);
  let r = 84, g = 80, bl = 70;
  const tone = 0.82 + b.id * 0.3 + n.n1 * 0.24 + (n.g - 0.5) * 0.28;
  r *= tone; g *= tone; bl *= tone;
  if (b.mortar) { const m = 0.5; r *= m; g *= m; bl *= m; }
  r *= b.ao * 0.35 + 0.65; g *= b.ao * 0.35 + 0.65; bl *= b.ao * 0.35 + 0.65;
  const grime = smooth(0.5, 0.95, n.n4) * 0.35;
  r *= 1 - grime; g *= 1 - grime; bl *= 1 - grime * 0.9;
  return [r, g, bl];
});

const floorGrate = () => pixTex((x, y, u, v, n) => {
  const gx = u % 0.0625, gy = v % 0.25;
  const bar = gx < 0.7;
  let r = 74, g = 78, bl = 84;
  const t = 0.82 + n.n1 * 0.3 + (n.g - 0.5) * 0.26;
  r *= t; g *= t; bl *= t;
  if (!bar) { const d = 0.18; r *= d; g *= d; bl *= d; }
  else {
    const hi = smooth(0.35, 0.7, gx / 0.7) * 0.25;
    r *= 1 + hi; g *= 1 + hi; bl *= 1 + hi;
  }
  const rust = smooth(0.6, 0.9, n.n2);
  r = lerp(r, 108, rust * 0.55); g = lerp(g, 56, rust * 0.55); bl = lerp(bl, 32, rust * 0.55);
  return [r, g, bl];
});

const floorSand = () => pixTex((x, y, u, v, n) => {
  let r = 178, g = 158, bl = 116;
  const ripple = Math.sin((u * 26 + n.n1 * 5) + Math.sin(v * 18) * 1.6) * 0.5 + 0.5;
  const t = 0.82 + ripple * 0.2 + n.n2 * 0.16 + (n.g - 0.5) * 0.22;
  r *= t; g *= t; bl *= t;
  const pebble = smooth(0.86, 0.99, n.n3);
  r = lerp(r, 128, pebble * 0.7); g = lerp(g, 120, pebble * 0.7); bl = lerp(bl, 104, pebble * 0.7);
  return [r, g, bl];
});

const floorCruel = () => pixTex((x, y, u, v, n) => {
  const b = brickMask(u, v, 0.5, 0.5, 0.012);
  let r = 58, g = 62, bl = 68;
  const tone = 0.84 + b.id * 0.24 + n.n1 * 0.22 + (n.g - 0.5) * 0.2;
  r *= tone; g *= tone; bl *= tone;
  if (b.mortar) { const m = 0.42; r *= m; g *= m; bl *= m; }
  const rust = smooth(0.66, 0.95, n.n2);
  r = lerp(r, 96, rust * 0.5); g = lerp(g, 50, rust * 0.5); bl = lerp(bl, 28, rust * 0.5);
  const drain = smooth(0.02, 0.0, Math.abs(v - 0.5));
  r *= 1 - drain * 0.5; g *= 1 - drain * 0.5; bl *= 1 - drain * 0.45;
  return [r, g, bl];
});

/* ============================== TECHOS ============================== */

function ceilTex(base, tint, kind) {
  return () => pixTex((x, y, u, v, n) => {
    let [r, g, bl] = base;
    const t = 0.75 + n.n1 * 0.42 + (n.g - 0.5) * 0.26;
    r *= t; g *= t; bl *= t;
    if (kind === 'panels') {
      const ex = Math.min(u % 0.5, 0.5 - (u % 0.5)), ey = Math.min(v % 0.5, 0.5 - (v % 0.5));
      const seam = 1 - smooth(0.006, 0.02, Math.min(ex, ey));
      r *= 1 - seam * 0.5; g *= 1 - seam * 0.5; bl *= 1 - seam * 0.45;
      const pipe = smooth(0.02, 0.0, Math.abs((u % 0.25) - 0.125)) * 0.5;
      r *= 1 - pipe * 0.4; g *= 1 - pipe * 0.4; bl *= 1 - pipe * 0.35;
    } else {
      const blot = smooth(0.55, 0.95, n.n2);
      r *= 1 - blot * 0.35; g *= 1 - blot * 0.33; bl *= 1 - blot * 0.3;
    }
    r = lerp(r, tint[0], 0.25); g = lerp(g, tint[1], 0.25); bl = lerp(bl, tint[2], 0.25);
    return [r, g, bl];
  });
}

/* ============================== SPRITES ============================== */

function drawGriever(ctx, size, ph) {
  const S = size / 128;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); ctx.ellipse(64 * S, 116 * S, 38 * S, 8 * S, 0, 0, Math.PI * 2); ctx.fill();

  const legs = [[-26, -8], [-32, 0], [-26, 8], [26, -8], [32, 0], [26, 8]];
  legs.forEach((l, i) => {
    const sw = Math.sin(ph * Math.PI * 2 + i * 1.9) * 7 * S;
    ctx.strokeStyle = '#191c21'; ctx.lineWidth = 5 * S; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(64 * S + l[0] * 0.42 * S, 84 * S);
    ctx.quadraticCurveTo(64 * S + l[0] * 0.9 * S, 90 * S + l[1] * 1.3 * S + sw,
      64 * S + l[0] * 1.15 * S, 114 * S + Math.abs(l[1]) * 0.2 * S + sw * 0.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,165,185,0.30)'; ctx.lineWidth = 1.6 * S;
    ctx.stroke();
  });

  const g = ctx.createLinearGradient(0, 52 * S, 0, 108 * S);
  g.addColorStop(0, '#6d757f'); g.addColorStop(0.42, '#39404a'); g.addColorStop(1, '#121417');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(64 * S, 84 * S, 38 * S, 26 * S, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(170,185,205,0.30)'; ctx.lineWidth = 2 * S;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.ellipse(64 * S, 84 * S, 38 * S - i * 9 * S, 26 * S - i * 6 * S, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#24282e';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(64 * S + i * 13 * S, 62 * S);
    ctx.lineTo(64 * S + i * 13 * S + 4 * S, 44 * S + Math.abs(i) * 4 * S);
    ctx.lineTo(64 * S + i * 13 * S + 9 * S, 62 * S);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(190,210,235,0.35)'; ctx.lineWidth = 2 * S;
  ctx.beginPath(); ctx.ellipse(64 * S, 84 * S, 37 * S, 25 * S, 0, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();

  ctx.fillStyle = '#1e2229';
  ctx.beginPath(); ctx.ellipse(64 * S, 56 * S, 21 * S, 16 * S, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(160,175,195,0.35)'; ctx.lineWidth = 1.6 * S; ctx.stroke();
  const eg = ctx.createRadialGradient(70 * S, 54 * S, 0, 70 * S, 54 * S, 14 * S);
  eg.addColorStop(0, '#fff3d2'); eg.addColorStop(0.28, '#ff7a22'); eg.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(70 * S, 54 * S, 14 * S, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5a10';
  ctx.beginPath(); ctx.arc(70 * S, 54 * S, 4 * S, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b3037'; ctx.lineWidth = 5 * S; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(52 * S, 70 * S); ctx.lineTo(38 * S, 86 * S);
  ctx.moveTo(76 * S, 70 * S); ctx.lineTo(90 * S, 86 * S);
  ctx.stroke();
  ctx.strokeStyle = '#3b414a'; ctx.lineWidth = 3 * S;
  ctx.beginPath();
  ctx.moveTo(58 * S, 44 * S); ctx.quadraticCurveTo(48 * S, 22 * S, 34 * S, 16 * S);
  ctx.moveTo(70 * S, 44 * S); ctx.quadraticCurveTo(80 * S, 22 * S, 94 * S, 16 * S);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBattery(ctx, s) {
  const S = s / 128;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(64 * S, 112 * S, 26 * S, 6 * S, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(42 * S, 0, 86 * S, 0);
  g.addColorStop(0, '#14501f'); g.addColorStop(0.35, '#3fd46e'); g.addColorStop(1, '#0e3a17');
  ctx.fillStyle = g;
  roundRect(ctx, 46 * S, 58 * S, 36 * S, 54 * S, 5 * S); ctx.fill();
  ctx.fillStyle = '#c9d2cf'; roundRect(ctx, 55 * S, 46 * S, 18 * S, 13 * S, 3 * S); ctx.fill();
  ctx.fillStyle = '#0b1a10'; ctx.fillRect(46 * S, 82 * S, 36 * S, 7 * S);
  ctx.fillStyle = '#eaffef'; ctx.font = `bold ${22 * S}px monospace`; ctx.fillText('+', 58 * S, 78 * S);
  const eg = ctx.createRadialGradient(64 * S, 52 * S, 0, 64 * S, 52 * S, 26 * S);
  eg.addColorStop(0, 'rgba(130,255,180,0.55)'); eg.addColorStop(1, 'rgba(130,255,180,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(64 * S, 52 * S, 26 * S, 0, Math.PI * 2); ctx.fill();
}

function drawFlare(ctx, s) {
  const S = s / 128;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#c03a2b'; roundRect(ctx, 55 * S, 60 * S, 18 * S, 46 * S, 4 * S); ctx.fill();
  ctx.fillStyle = '#efe8d6'; ctx.fillRect(55 * S, 46 * S, 18 * S, 15 * S);
  ctx.fillStyle = '#ff7a3c'; ctx.fillRect(55 * S, 38 * S, 18 * S, 10 * S);
  ctx.fillStyle = '#7d221a'; ctx.fillRect(55 * S, 92 * S, 18 * S, 6 * S);
  const eg = ctx.createRadialGradient(64 * S, 42 * S, 0, 64 * S, 42 * S, 28 * S);
  eg.addColorStop(0, 'rgba(255,200,130,0.65)'); eg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(64 * S, 42 * S, 28 * S, 0, Math.PI * 2); ctx.fill();
}

function drawMedkit(ctx, s) {
  const S = s / 128;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(64 * S, 112 * S, 30 * S, 6 * S, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dfe3dc'; roundRect(ctx, 36 * S, 62 * S, 56 * S, 44 * S, 5 * S); ctx.fill();
  ctx.fillStyle = '#b7bcb6'; roundRect(ctx, 36 * S, 62 * S, 56 * S, 10 * S, 5 * S); ctx.fill();
  ctx.fillStyle = '#8f9591'; roundRect(ctx, 54 * S, 52 * S, 20 * S, 11 * S, 3 * S); ctx.fill();
  ctx.fillStyle = '#c62a22';
  ctx.fillRect(58 * S, 78 * S, 12 * S, 26 * S);
  ctx.fillRect(49 * S, 87 * S, 30 * S, 9 * S);
  const eg = ctx.createRadialGradient(64 * S, 88 * S, 0, 64 * S, 88 * S, 36 * S);
  eg.addColorStop(0, 'rgba(255,120,120,0.3)'); eg.addColorStop(1, 'rgba(255,120,120,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(64 * S, 88 * S, 36 * S, 0, Math.PI * 2); ctx.fill();
}

function drawCode(ctx, s) {
  const S = s / 128;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#2a2f36'; roundRect(ctx, 36 * S, 46 * S, 56 * S, 46 * S, 4 * S); ctx.fill();
  ctx.fillStyle = '#57606c';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(42 * S + i * 9 * S, 92 * S, 5 * S, 10 * S);
    ctx.fillRect(42 * S + i * 9 * S, 36 * S, 5 * S, 10 * S);
  }
  const g = ctx.createLinearGradient(0, 52 * S, 0, 86 * S);
  g.addColorStop(0, '#7df6ff'); g.addColorStop(1, '#0d7f95');
  ctx.fillStyle = g; roundRect(ctx, 44 * S, 54 * S, 40 * S, 30 * S, 3 * S); ctx.fill();
  ctx.fillStyle = '#08252c'; ctx.font = `bold ${11 * S}px monospace`; ctx.fillText('CRUEL', 48 * S, 74 * S);
  const eg = ctx.createRadialGradient(64 * S, 68 * S, 0, 64 * S, 68 * S, 40 * S);
  eg.addColorStop(0, 'rgba(120,245,255,0.5)'); eg.addColorStop(1, 'rgba(120,245,255,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(64 * S, 68 * S, 40 * S, 0, Math.PI * 2); ctx.fill();
}

function drawBeacon(ctx, s) {
  const S = s / 128;
  ctx.clearRect(0, 0, s, s);
  const g = ctx.createLinearGradient(0, 4 * S, 0, 124 * S);
  g.addColorStop(0, 'rgba(120,255,180,0)');
  g.addColorStop(0.5, 'rgba(120,255,180,0.45)');
  g.addColorStop(1, 'rgba(200,255,225,0.95)');
  ctx.fillStyle = g; ctx.fillRect(48 * S, 4 * S, 32 * S, 118 * S);
  ctx.fillStyle = 'rgba(235,255,240,0.95)';
  ctx.beginPath();
  ctx.moveTo(64 * S, 40 * S); ctx.lineTo(78 * S, 62 * S); ctx.lineTo(64 * S, 84 * S); ctx.lineTo(50 * S, 62 * S);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(180,255,210,0.8)'; ctx.lineWidth = 3 * S;
  ctx.beginPath(); ctx.ellipse(64 * S, 116 * S, 30 * S, 8 * S, 0, 0, Math.PI * 2); ctx.stroke();
}

function spriteTex(draw, size = 128) {
  const c = cv(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  draw(ctx, size);
  return { w: size, h: size, data: new Uint8ClampedArray(ctx.getImageData(0, 0, size, size).data.buffer) };
}

/* ============================== BUILD ============================== */

export function buildTextures() {
  const wallDoorTex = detail(wallDoor(), (ctx, w, h) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, h * 0.86, w, h * 0.14); ctx.clip();
    ctx.fillStyle = '#c8a41e'; ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = '#1b1d20';
    for (let i = -20; i < w; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, h); ctx.lineTo(i + 12, h); ctx.lineTo(i + 22, h * 0.86); ctx.lineTo(i + 10, h * 0.86);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  });
  const cruelWall = detail(wallCruel(), (ctx, w, h) => {
    ctx.fillStyle = '#8d221a'; ctx.fillRect(0, h * 0.40, w, h * 0.055);
    ctx.fillStyle = 'rgba(220,214,200,0.75)';
    ctx.font = `bold ${Math.round(h * 0.05)}px monospace`;
    ctx.fillText('CRUEL', w * 0.06, h * 0.455);
  });
  const metalWall = detail(wallMetal(), (ctx, w, h) => {
    ctx.fillStyle = 'rgba(190,200,215,0.55)';
    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        for (const [ox, oy] of [[0.08, 0.08], [0.42, 0.08], [0.08, 0.42], [0.42, 0.42]]) {
          ctx.beginPath();
          ctx.arc((px * 0.5 + ox) * w, (py * 0.5 + oy) * h, Math.max(2, w * 0.012), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });

  return {
    walls: [
      finish(wallGlade()), finish(wallMoss()), finish(metalWall),
      finish(wallConcrete()), finish(cruelWall), finish(wallDoorTex),
    ],
    floors: [
      finish(floorGlade()), finish(floorStone()), finish(floorGrate()),
      finish(floorSand()), finish(floorCruel()),
    ],
    ceils: [
      finish(ceilTex([38, 46, 34], [24, 32, 22], 'rough')()),
      finish(ceilTex([34, 33, 30], [20, 20, 18], 'rough')()),
      finish(ceilTex([30, 34, 40], [18, 21, 26], 'panels')()),
      finish(ceilTex([70, 62, 46], [44, 39, 29], 'rough')()),
      finish(ceilTex([24, 27, 32], [13, 15, 18], 'panels')()),
    ],
  };
}

export function buildSprites() {
  return {
    griever: [spriteTex((c, s) => drawGriever(c, s, 0)), spriteTex((c, s) => drawGriever(c, s, 0.5))],
    battery: spriteTex(drawBattery),
    flare: spriteTex(drawFlare),
    medkit: spriteTex(drawMedkit),
    code: spriteTex(drawCode),
    beacon: spriteTex(drawBeacon),
  };
}
