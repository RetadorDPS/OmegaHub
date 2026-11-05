/* =============================================================
   Maze Runner Mobile — Minimapa con niebla de guerra

   v2: radio de revelado y alcance del abanico de visión escalados
   al mundo ancho (DIL). Admite un modo "etiquetas" para el panel
   de Mapa del Corredor a pantalla completa (números de sector,
   leyenda) además del minimapa compacto de la esquina.
   ============================================================= */

import { T, DIL } from './world.js';

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

  draw(game, opts = {}) {
    const labels = !!opts.labels;
    const w = this.world, p = game.player, f = p.floor;
    const cv = this.cv, ctx = this.ctx;
    const W = cv.width, H = cv.height;
    const cell = Math.min(W / w.W, H / w.H);
    const ox = (W - cell * w.W) / 2, oy = (H - cell * w.H) / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);

    const seen = this.seen[f];
    const grid = w.grid[f], bio = w.biome[f];
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
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
        ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.6, cell + 0.6);
      }
    }

    // rejilla de sectores (+ números si se piden etiquetas, para el mapa grande)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (const b of w.blocks) {
      ctx.strokeRect(ox + b.x0 * cell, oy + b.y0 * cell, b.w * cell, b.h * cell);
      if (!labels) continue;
      const anySeen = (() => {
        for (let y = b.y0; y < b.y0 + b.h; y += Math.max(1, b.h >> 2)) {
          for (let x = b.x0; x < b.x0 + b.w; x += Math.max(1, b.w >> 2)) if (seen[y * w.W + x]) return true;
        }
        return false;
      })();
      if (!anySeen) continue;
      ctx.fillStyle = 'rgba(232,163,60,0.85)';
      ctx.font = `${Math.max(10, cell * 3)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lbl = b.isGlade ? '⌂' : String(b.sector);
      ctx.fillText(lbl, ox + (b.x0 + b.w / 2) * cell, oy + (b.y0 + b.h / 2) * cell);
    }

    // objetos conocidos
    for (const it of game.items) {
      if (it.taken || it.floor !== f) continue;
      const i = Math.floor(it.y) * w.W + Math.floor(it.x);
      if (!seen[i] && Math.hypot(it.x - p.x, it.y - p.y) > 16) continue;
      ctx.fillStyle = it.type === 'code' ? '#5ff0ff' : it.type === 'note' ? '#e8dcb8' : it.type === 'medkit' ? '#ff6b6b' : it.type === 'battery' ? '#7dff9c' : '#ffb04a';
      ctx.beginPath();
      ctx.arc(ox + it.x * cell, oy + it.y * cell, Math.max(1.6, cell * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    // grievers en radar (rango corto)
    for (const g of game.grievers) {
      if (g.floor !== f) continue;
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d > 32) continue;
      ctx.fillStyle = `rgba(255,70,40,${Math.max(0.25, 1 - d / 32)})`;
      ctx.beginPath();
      ctx.arc(ox + g.x * cell, oy + g.y * cell, Math.max(1.8, cell * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }

    // salida (si se conoce o ya hay 3 códigos)
    if (w.exit && (game.player.codes >= 3 || seen[Math.floor(w.exit.y) * w.W + Math.floor(w.exit.x)])) {
      ctx.strokeStyle = '#5cff9d'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox + (w.exit.x + DIL / 2) * cell, oy + (w.exit.y + DIL / 2) * cell, Math.max(3, cell * 1.4), 0, Math.PI * 2);
      ctx.stroke();
    }

    // jugador
    const pxx = ox + p.x * cell, pyy = oy + p.y * cell;
    ctx.save();
    ctx.translate(pxx, pyy);
    ctx.rotate(p.dir + Math.PI / 2);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(0, -cell * 1.6); ctx.lineTo(cell * 1.0, cell * 1.0); ctx.lineTo(0, cell * 0.4); ctx.lineTo(-cell * 1.0, cell * 1.0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
