/* =============================================================
   Maze Runner Mobile — Minimapa con niebla de guerra
   ============================================================= */

import { T } from './world.js';

const COLORS = {
  floor: ['#5d7a4a', '#4a453c', '#3f454d', '#96865f', '#2b2f35'],
  wall: ['#2a3324', '#221f1b', '#1e2228', '#413a2b', '#14171b'],
};

export class Minimap {
  constructor(canvas, world) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    const N = world.W * world.H;
    this.seen = [new Uint8Array(N), new Uint8Array(N)];
  }

  reveal(game) {
    const w = this.world, p = game.player, f = p.floor;
    const seen = this.seen[f];
    const px = p.x, py = p.y, W = w.W, H = w.H;
    const R = 7;
    const x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(W - 1, Math.ceil(px + R));
    const y0 = Math.max(0, Math.floor(py - R)), y1 = Math.min(H - 1, Math.ceil(py + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px, dy = y + 0.5 - py;
        if (dx * dx + dy * dy <= R * R) seen[y * W + x] = 1;
      }
    }
    // abanico de visión
    for (let i = 0; i < 44; i++) {
      const a = p.dir + (i / 44 - 0.5) * 1.9;
      const rx = Math.cos(a) * 0.28, ry = Math.sin(a) * 0.28;
      let x = px, y = py;
      for (let s = 0; s < 22; s++) {
        x += rx; y += ry;
        const cx = Math.floor(x), cy = Math.floor(y);
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
        seen[cy * W + cx] = 1;
        if (w.isBlocked(f, cx, cy)) break;
      }
    }
  }

  draw(game) {
    const w = this.world, p = game.player, f = p.floor;
    const cv = this.cv, ctx = this.ctx;
    const W = cv.width, H = cv.height;
    const cell = Math.min(W / w.W, H / w.H);
    const ox = (W - cell * w.W) / 2, oy = (H - cell * w.H) / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#07090a';
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

    // rejilla de sectores
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (const b of w.blocks) ctx.strokeRect(ox + b.x0 * cell, oy + b.y0 * cell, b.w * cell, b.h * cell);

    // objetos conocidos
    for (const it of game.items) {
      if (it.taken || it.floor !== f) continue;
      const i = Math.floor(it.y) * w.W + Math.floor(it.x);
      if (!seen[i] && Math.hypot(it.x - p.x, it.y - p.y) > 7) continue;
      ctx.fillStyle = it.type === 'code' ? '#5ff0ff' : it.type === 'medkit' ? '#ff6b6b' : it.type === 'battery' ? '#7dff9c' : '#ffb04a';
      ctx.beginPath();
      ctx.arc(ox + it.x * cell, oy + it.y * cell, Math.max(1.6, cell * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    // grievers en radar (rango corto)
    for (const g of game.grievers) {
      if (g.floor !== f) continue;
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d > 15) continue;
      ctx.fillStyle = `rgba(255,70,40,${Math.max(0.25, 1 - d / 15)})`;
      ctx.beginPath();
      ctx.arc(ox + g.x * cell, oy + g.y * cell, Math.max(1.8, cell * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }

    // salida (si se conoce o ya hay 3 códigos)
    if (w.exit && (game.player.codes >= 3 || seen[Math.floor(w.exit.y) * w.W + Math.floor(w.exit.x)])) {
      ctx.strokeStyle = '#5cff9d'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox + (w.exit.x + 0.5) * cell, oy + (w.exit.y + 0.5) * cell, Math.max(3, cell * 1.1), 0, Math.PI * 2);
      ctx.stroke();
    }

    // jugador
    const pxx = ox + p.x * cell, pyy = oy + p.y * cell;
    ctx.save();
    ctx.translate(pxx, pyy);
    ctx.rotate(p.dir + Math.PI / 2);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(0, -cell * 1.5); ctx.lineTo(cell * 0.9, cell * 0.9); ctx.lineTo(0, cell * 0.35); ctx.lineTo(-cell * 0.9, cell * 0.9);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
