/* =============================================================
   Maze Runner Mobile — Minimapa con niebla de guerra

   v3: el minimapa de la esquina (HUD) ya NO intenta encajar el
   laberinto entero (hasta 141×141 unidades) en un lienzo de 200px —
   eso dejaba el marcador del jugador en ~2px y era ilegible. Ahora
   el modo "local" (por defecto) dibuja una ventana centrada en el
   jugador, con el mismo tamaño de celda grande tanto si el mundo es
   enorme como si es pequeño. El "Mapa del Corredor" a pantalla
   completa sigue mostrando el mundo entero (opts.full) para
   cartografiar, pero ahora dibuja SIEMPRE el esqueleto de sectores
   (contorno + número), incluso sin explorar — así no es un vacío
   negro sin sentido antes de haber recorrido nada.

   También añade un modo "pánico": cuando el jugador está en peligro
   cercano, el HUD puede pedir que se resalte una flecha hacia El
   Área (refugio) — una dirección en línea recta, no una ruta exacta
   por el laberinto (eso exigiría un segundo campo de flujo completo
   cada frame, que competiría por los mismos buffers que usa la IA de
   los Grievers).
   ============================================================= */

import { T, DIL, FL } from './world.js';

const COLORS = {
  floor: ['#6a8a53', '#55503f', '#474e58', '#a8966b', '#2f343b'],
  wall: ['#2a3324', '#221f1b', '#1e2228', '#413a2b', '#14171b'],
};

export class Minimap {
  constructor(canvas, world) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    const N = world.W * world.H;
    this.seen = [new Uint8Array(N), new Uint8Array(N)];
    this._floorTotal = null;
  }

  reveal(game) {
    const w = this.world, p = game.player, f = p.floor;
    const seen = this.seen[f];
    const px = p.x, py = p.y, W = w.W, H = w.H;
    const R = 16;
    const x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(W - 1, Math.ceil(px + R));
    const y0 = Math.max(0, Math.floor(py - R)), y1 = Math.min(H - 1, Math.ceil(py + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px, dy = y + 0.5 - py;
        if (dx * dx + dy * dy <= R * R) seen[y * W + x] = 1;
      }
    }
    // abanico de visión a lo largo de los pasillos (más alcance: son 3u de ancho)
    for (let i = 0; i < 50; i++) {
      const a = p.dir + (i / 50 - 0.5) * 2.0;
      const rx = Math.cos(a) * 0.55, ry = Math.sin(a) * 0.55;
      let x = px, y = py;
      for (let s = 0; s < 44; s++) {
        x += rx; y += ry;
        const cx = Math.floor(x), cy = Math.floor(y);
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
        seen[cy * W + cx] = 1;
        if (w.isBlocked(f, cx, cy)) break;
      }
    }
  }

  /** Fracción (0..1) del laberinto ya cartografiado, en ambos pisos. */
  percentExplored() {
    const w = this.world;
    if (this._floorTotal == null) {
      let total = 0;
      for (let f = 0; f < 2; f++) { const g = w.grid[f]; for (let i = 0; i < g.length; i++) if (g[i] === T.FLOOR) total++; }
      this._floorTotal = total || 1;
    }
    let seenCount = 0;
    for (let f = 0; f < 2; f++) {
      const g = w.grid[f], s = this.seen[f];
      for (let i = 0; i < g.length; i++) if (g[i] === T.FLOOR && s[i]) seenCount++;
    }
    return Math.min(1, seenCount / this._floorTotal);
  }

  /** Punto de refugio más cercano conocido: El Área, o una escotilla si está más cerca. */
  _refugePoint(game) {
    const w = this.world, p = game.player;
    let best = w.spawn, bestD = Infinity;
    if (p.floor === FL.SURFACE) {
      const dx = w.spawn.x - p.x, dy = w.spawn.y - p.y;
      bestD = dx * dx + dy * dy;
    }
    for (const h of w.hatches || []) {
      const dx = h.x - p.x, dy = h.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }

  draw(game, opts = {}) {
    const full = !!opts.full;
    const labels = !!opts.labels;
    const w = this.world, p = game.player, f = p.floor;
    const cv = this.cv, ctx = this.ctx;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);

    let cell, wx0, wy0;
    if (full) {
      cell = Math.min(W / w.W, H / w.H);
      wx0 = -(W / cell - w.W) / 2;
      wy0 = -(H / cell - w.H) / 2;
    } else {
      const R = opts.radius || 14;
      cell = Math.min(W, H) / (R * 2);
      wx0 = p.x - R;
      wy0 = p.y - R;
    }
    const toX = (wxx) => (wxx - wx0) * cell;
    const toY = (wyy) => (wyy - wy0) * cell;

    const seen = this.seen[f];
    const grid = w.grid[f], bio = w.biome[f];
    const cx0 = Math.max(0, Math.floor(wx0)), cx1 = Math.min(w.W - 1, Math.ceil(wx0 + W / cell));
    const cy0 = Math.max(0, Math.floor(wy0)), cy1 = Math.min(w.H - 1, Math.ceil(wy0 + H / cell));
    for (let y = cy0; y <= cy1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        const i = y * w.W + x;
        if (!seen[i]) continue;
        const t = grid[i];
        let c;
        if (t === T.WALL) c = COLORS.wall[bio[i]];
        else if (t === T.DOOR) {
          const d = w.doors[w.doorIdx[f][i]];
          c = d && d.open > 0.5 ? '#d8a53a' : '#c0392b';
        } else if (t === T.HATCH_DOWN || t === T.HATCH_UP) c = '#39c6d6';
        else if (t === T.EXIT) c = game.player.codes >= 3 ? '#5cff9d' : '#7a8f86';
        else c = COLORS.floor[bio[i]];
        ctx.fillStyle = c;
        ctx.fillRect(toX(x), toY(y), cell + 0.8, cell + 0.8);
      }
    }

    // esqueleto de sectores: contorno + número SIEMPRE visibles, estén o no
    // explorados — el jugador conoce la forma general de El Área desde el
    // principio (8 sectores alrededor de un centro), igual que en la peli.
    ctx.lineWidth = Math.max(1, cell * 0.06);
    for (const b of w.blocks) {
      const bx0 = toX(b.x0), by0 = toY(b.y0), bw = b.w * cell, bh = b.h * cell;
      if (bx0 + bw < 0 || by0 + bh < 0 || bx0 > W || by0 > H) continue;
      let anySeen = false;
      for (let y = b.y0; y < b.y0 + b.h && !anySeen; y += Math.max(1, b.h >> 2)) {
        for (let x = b.x0; x < b.x0 + b.w; x += Math.max(1, b.w >> 2)) if (seen[y * w.W + x]) { anySeen = true; break; }
      }
      ctx.strokeStyle = anySeen ? 'rgba(255,255,255,0.18)' : 'rgba(232,163,60,0.32)';
      ctx.strokeRect(bx0, by0, bw, bh);
      if (!labels && !full) continue;
      ctx.fillStyle = anySeen ? 'rgba(232,163,60,0.95)' : 'rgba(232,163,60,0.6)';
      ctx.font = `${Math.max(10, cell * 2.6)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lbl = b.isGlade ? '⌂' : String(b.sector);
      ctx.fillText(lbl, bx0 + bw / 2, by0 + bh / 2);
    }

    // objetos conocidos
    for (const it of game.items) {
      if (it.taken || it.floor !== f) continue;
      const i = Math.floor(it.y) * w.W + Math.floor(it.x);
      if (!seen[i] && Math.hypot(it.x - p.x, it.y - p.y) > 16) continue;
      ctx.fillStyle = it.type === 'code' ? '#5ff0ff' : it.type === 'note' ? '#e8dcb8' : it.type === 'medkit' ? '#ff6b6b' : it.type === 'battery' ? '#7dff9c' : '#ffb04a';
      ctx.beginPath();
      ctx.arc(toX(it.x), toY(it.y), Math.max(2, cell * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    // grievers en radar (rango corto)
    for (const g of game.grievers) {
      if (g.floor !== f) continue;
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d > 32) continue;
      ctx.fillStyle = `rgba(255,70,40,${Math.max(0.3, 1 - d / 32)})`;
      ctx.beginPath();
      ctx.arc(toX(g.x), toY(g.y), Math.max(2.4, cell * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }

    // salida (si se conoce o ya hay 3 códigos)
    if (w.exit && (game.player.codes >= 3 || seen[Math.floor(w.exit.y) * w.W + Math.floor(w.exit.x)])) {
      ctx.strokeStyle = '#5cff9d'; ctx.lineWidth = Math.max(1.5, cell * 0.08);
      ctx.beginPath();
      ctx.arc(toX(w.exit.x + DIL / 2), toY(w.exit.y + DIL / 2), Math.max(4, cell * 1.4), 0, Math.PI * 2);
      ctx.stroke();
    }

    // modo pánico: flecha (línea recta, no ruta) hacia el refugio conocido
    // más cercano — para ese momento de "¿por dónde vuelvo?" en plena huida.
    if (opts.panic) {
      const ref = this._refugePoint(game);
      const rdx = ref.x - p.x, rdy = ref.y - p.y;
      const rd = Math.hypot(rdx, rdy) || 1;
      const ang = Math.atan2(rdy, rdx);
      const pulse = 0.6 + 0.4 * Math.sin((game.time || 0) * 7);
      const ringR = Math.min(W, H) * 0.42;
      const ax = W / 2 + Math.cos(ang) * ringR, ay = H / 2 + Math.sin(ang) * ringR;
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = `rgba(255,70,60,${pulse})`;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(-7, 7); ctx.lineTo(-7, -7); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = `rgba(255,120,100,${pulse})`;
      ctx.font = `bold ${Math.max(9, cell * 1.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('REFUGIO', W / 2, Math.max(12, H * 0.08));
    }

    // jugador: marcador grande y SIEMPRE visible (tamaño mínimo fijo en
    // píxeles, no proporcional a la celda) — el fallo que reportaron era
    // justo este: en un mundo de 141 unidades el triángulo se quedaba en ~2px.
    const pxx = toX(p.x), pyy = toY(p.y);
    const R = Math.max(cell * 1.7, Math.min(W, H) * 0.045, 7);
    ctx.save();
    ctx.shadowColor = 'rgba(255,233,168,0.85)';
    ctx.shadowBlur = R * 0.8;
    ctx.translate(pxx, pyy);
    ctx.rotate(p.dir + Math.PI / 2);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(0, -R); ctx.lineTo(R * 0.62, R * 0.62); ctx.lineTo(0, R * 0.24); ctx.lineTo(-R * 0.62, R * 0.62);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** Franja de rumbo arriba del HUD: cardinales + marcas de salida/amenaza. */
  drawCompass(cv, game) {
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const p = game.player, world = this.world;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.fillStyle = 'rgba(8,10,12,0.5)'; ctx.fillRect(0, 0, w, h);

    const heading = (((-p.dir) * 180 / Math.PI) + 90 + 360) % 360; // 0=N 90=E 180=S 270=O
    const range = 75;
    const pxPerDeg = (w / 2) / range;
    const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };

    for (let d = -range; d <= range; d += 15) {
      let deg = Math.round(heading + d);
      deg = ((deg % 360) + 360) % 360;
      const x = w / 2 + d * pxPerDeg;
      const cardinal = deg % 45 === 0;
      ctx.strokeStyle = cardinal ? 'rgba(232,163,60,0.7)' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = cardinal ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(x, h * 0.58); ctx.lineTo(x, cardinal ? h * 0.95 : h * 0.78); ctx.stroke();
      if (cardinal) {
        ctx.fillStyle = deg === 0 ? '#ffd27a' : 'rgba(232,220,200,0.85)';
        ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(NAMES[deg] || '', x, h * 0.3);
      }
    }

    const bearingOf = (tx, ty) => {
      const ang = Math.atan2(ty - p.y, tx - p.x);
      return (((-ang) * 180 / Math.PI) + 90 + 360) % 360;
    };
    const delta = (a, b) => (((a - b + 540) % 360) - 180);
    const mark = (x, color, glyph) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, h * 0.2, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x, h * 0.2 + 1);
    };

    if (world.exit) {
      const ex = world.exit.x + DIL / 2, ey = world.exit.y + DIL / 2;
      const known = p.codes >= 3 || this.seen[p.floor][Math.floor(ey) * world.W + Math.floor(ex)];
      if (known) {
        const b = delta(bearingOf(ex, ey), heading);
        if (Math.abs(b) <= range) mark(w / 2 + b * pxPerDeg, '#5cff9d', '✦');
      }
    }
    if (game.threat) {
      const b = delta(bearingOf(game.threat.x, game.threat.y), heading);
      if (Math.abs(b) <= range) mark(w / 2 + b * pxPerDeg, '#ff5a48', '!');
    }

    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.moveTo(w / 2, 1); ctx.lineTo(w / 2 - 5, 9); ctx.lineTo(w / 2 + 5, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
