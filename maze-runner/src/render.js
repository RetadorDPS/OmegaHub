/* =============================================================
   Maze Runner Mobile — Raycaster (DDA) con alturas variables por
   bioma, oclusión ambiental vertical, suelo/techo, puertas tipo
   rastrillo (pasables al abrir), sprites con z-buffer, niebla,
   linterna cónica y adaptación a la oscuridad.
   ============================================================= */

import { T, FL } from './world.js';
import { buildTextures, buildSprites } from './textures.js';

const RTS = 128;
const FLASH_I = 2.6;
const COS_IN = Math.cos(0.32), COS_OUT = Math.cos(0.62);

// ambiente, niebla y color de niebla por bioma (0 Área,1 A,2 B,3 C,4 CRUEL)
const BIOME_LIGHT = [
  { amb: 0.62, fog: 0.045, fr: 34, fg: 44, fb: 30 },
  { amb: 0.34, fog: 0.095, fr: 15, fg: 17, fb: 15 },
  { amb: 0.30, fog: 0.125, fr: 12, fg: 14, fb: 18 },
  { amb: 0.46, fog: 0.055, fr: 58, fg: 48, fb: 36 },
  { amb: 0.26, fog: 0.200, fr: 4, fg: 5, fb: 7 },
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.tex = buildTextures();
    this.sprites = buildSprites();
    this.vScale = 0.85;
    this.ceilSmooth = 1.2;
    this.resize(canvas.clientWidth || 360, canvas.clientHeight || 200, 0.5);
  }

  resize(cssW, cssH, quality = 0.5) {
    const scale = Math.max(0.3, Math.min(0.85, quality || 0.5));
    let rw = Math.round((cssW || 360) * scale);
    let rh = Math.round((cssH || 200) * scale);
    rw = Math.max(220, Math.min(620, rw));
    rh = Math.max(130, Math.min(400, rh));
    this.rw = rw; this.rh = rh;
    this.canvas.width = rw; this.canvas.height = rh;
    this.img = this.ctx.createImageData(rw, rh);
    this.data = this.img.data;

    this.perp = new Float32Array(rw);
    this.colH = new Float32Array(rw);
    this.texId = new Uint8Array(rw);
    this.texX = new Float32Array(rw);
    this.side = new Uint8Array(rw);
    this.rayDirX = new Float32Array(rw);
    this.rayDirY = new Float32Array(rw);
    this.cone = new Float32Array(rw);
    this.drawStart = new Int32Array(rw);
    this.drawEnd = new Int32Array(rw);
    this.wallA = new Float32Array(rw);
    this.wallB = new Float32Array(rw);
    this.doorCount = new Uint8Array(rw);
    this.doorCell = new Int32Array(rw * 4);
    this.doorDist = new Float32Array(rw * 4);
    this.doorWallX = new Float32Array(rw * 4);
    this.zbuf = new Float32Array(rw);
  }

  render(game) {
    const w = game.world, p = game.player, f = p.floor;
    const rw = this.rw, rh = this.rh, data = this.data;
    const W = w.W, H = w.H;
    const grid = w.grid[f], biomeArr = w.biome[f], skyArr = w.sky[f];
    const wallHArr = w.wallH[f], ceilHArr = w.ceilH[f];
    const px = p.x, py = p.y;
    const dirX = Math.cos(p.dir), dirY = Math.sin(p.dir);
    const planeScale = 0.5 * this.vScale * (rw / rh);
    const planeX = -dirY * planeScale, planeY = dirX * planeScale;
    const horizon = Math.round(rh * 0.5 + p.pitch * rh + (p.bobOffset || 0) * rh);

    const flashOn = p.flashOn && p.battery > 0;
    const underAdapt = Math.max(0, Math.min(1, game.darkAdapt || 0));
    const adaptMul = 1 + 2.2 * underAdapt;
    const ambMul = f === FL.UNDER ? 1 : (0.30 + 0.70 * (game.dayFactor ?? 1));
    const biomeHere = w.biomeAt(f, px, py);
    const bl0 = BIOME_LIGHT[biomeHere];
    const fogDensity = bl0.fog, fogR = bl0.fr, fogG = bl0.fg, fogB = bl0.fb;

    const targetCeil = Math.max(0.55, (ceilHArr[w.idx(Math.max(0, Math.min(W - 1, Math.floor(px))), Math.max(0, Math.min(H - 1, Math.floor(py))))] || 19) / 16);
    this.ceilSmooth += (targetCeil - this.ceilSmooth) * 0.12;

    const flares = game.flares || [];
    const flareLight = (wx, wy) => {
      let s = 0;
      for (let k = 0; k < flares.length; k++) {
        const fl = flares[k];
        if (fl.floor !== f) continue;
        const dx = wx - fl.x, dy = wy - fl.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 49) s += (fl.intensity || 1) * 2.2 / (1 + 0.5 * d2);
      }
      return s;
    };

    /* ---------------- 1) DDA por columna ---------------- */
    for (let x = 0; x < rw; x++) {
      const camX = (2 * x) / rw - 1;
      const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      this.rayDirX[x] = rdx; this.rayDirY[x] = rdy;
      const rl = Math.hypot(rdx, rdy) || 1;
      const cosA = (rdx * dirX + rdy * dirY) / rl;
      let coneV = 0;
      if (flashOn) {
        const t = Math.max(0, Math.min(1, (cosA - COS_OUT) / (COS_IN - COS_OUT)));
        coneV = t * t * (3 - 2 * t);
      }
      this.cone[x] = coneV;

      let mapX = Math.floor(px), mapY = Math.floor(py);
      const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let stepX, stepY, sideDistX, sideDistY;
      if (rdx < 0) { stepX = -1; sideDistX = (px - mapX) * ddx; } else { stepX = 1; sideDistX = (mapX + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sideDistY = (py - mapY) * ddy; } else { stepY = 1; sideDistY = (mapY + 1 - py) * ddy; }

      let side = 0, hit = false, perp = 60, guard = 0;
      this.doorCount[x] = 0;
      let gotWall = false;
      while (!hit && guard++ < 300) {
        if (sideDistX < sideDistY) { sideDistX += ddx; mapX += stepX; side = 0; }
        else { sideDistY += ddy; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= W || mapY >= H) { hit = true; perp = 60; break; }
        const ci = mapY * W + mapX;
        const t = grid[ci];
        if (t === T.WALL) {
          hit = true; gotWall = true;
          perp = side === 0 ? sideDistX - ddx : sideDistY - ddy;
          this.texId[x] = biomeArr[ci];
          this.colH[x] = (wallHArr[ci] || 19) / 16;
          this.side[x] = side;
          let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
          wallX -= Math.floor(wallX);
          this.texX[x] = wallX;
        } else if (t === T.DOOR) {
          const dperp = side === 0 ? sideDistX - ddx : sideDistY - ddy;
          const k = this.doorCount[x];
          if (k < 4) {
            this.doorCell[x * 4 + k] = ci;
            this.doorDist[x * 4 + k] = dperp;
            let wallX = side === 0 ? py + dperp * rdy : px + dperp * rdx;
            wallX -= Math.floor(wallX);
            this.doorWallX[x * 4 + k] = wallX;
            this.doorCount[x] = k + 1;
          }
        }
      }
      this.perp[x] = perp;
      if (!gotWall) { this.texId[x] = biomeHere; this.colH[x] = 1.2; }

      // extensión en pantalla del muro + iluminación de la columna
      const unit = (this.vScale * rh) / Math.max(0.0001, perp);
      const wh = this.colH[x];
      const lineH = unit * wh;
      const bottomF = horizon + 0.5 * unit;
      const topF = bottomF - lineH;
      let ds = Math.round(topF), de = Math.round(bottomF);
      if (ds < 0) ds = 0; if (ds > rh) ds = rh;
      if (de < 0) de = 0; if (de > rh) de = rh;
      this.drawStart[x] = ds; this.drawEnd[x] = de;
      this.zbuf[x] = perp;

      if (gotWall) {
        const hitX = px + perp * rdx, hitY = py + perp * rdy;
        const blW = BIOME_LIGHT[this.texId[x]];
        const fogA = Math.min(1, 1 - Math.exp(-perp * fogDensity));
        const shade = this.side[x] === 1 ? 0.78 : 1;
        let lum = blW.amb * ambMul * adaptMul + this.cone[x] * FLASH_I / (1 + 0.22 * perp + 0.085 * perp * perp) + flareLight(hitX, hitY);
        lum = Math.min(1.35, lum);
        this.wallA[x] = lum * (1 - fogA) * shade;
        this.wallB[x] = fogA;
      } else {
        this.wallA[x] = 0; this.wallB[x] = 1;
      }
    }

    /* ---------------- 2) suelo y techo ---------------- */
    const rayDir0X = dirX - planeX, rayDir0Y = dirY - planeY;
    const rayDir1X = dirX + planeX, rayDir1Y = dirY + planeY;
    const posZFloor = 0.5 * this.vScale * rh;
    const posZCeil = (this.ceilSmooth - 0.5) * this.vScale * rh;

    for (let y = 0; y < rh; y++) {
      const isFloor = y > horizon;
      const prow = isFloor ? y - horizon : horizon - y;
      if (prow <= 0) continue;
      const rowDist = (isFloor ? posZFloor : posZCeil) / prow;
      if (rowDist <= 0 || rowDist > 80) continue;
      const stepX = (rowDist * (rayDir1X - rayDir0X)) / rw;
      const stepY = (rowDist * (rayDir1Y - rayDir0Y)) / rw;
      let fx = px + rowDist * rayDir0X, fy = py + rowDist * rayDir0Y;
      const fogA = Math.min(1, 1 - Math.exp(-rowDist * fogDensity));
      const flashFall = flashOn ? FLASH_I / (1 + 0.22 * rowDist + 0.085 * rowDist * rowDist) : 0;

      for (let x = 0; x < rw; x++) {
        if (y >= this.drawStart[x] && y < this.drawEnd[x]) { fx += stepX; fy += stepY; continue; }
        const o = (y * rw + x) * 4;
        const cx = Math.floor(fx), cy = Math.floor(fy);
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) {
          data[o] = fogR; data[o + 1] = fogG; data[o + 2] = fogB; data[o + 3] = 255;
          fx += stepX; fy += stepY; continue;
        }
        const ci = cy * W + cx;
        const bio = biomeArr[ci];
        const sky = !isFloor && skyArr[ci];
        let r, g, bch;
        let lum = Math.min(1.3, BIOME_LIGHT[bio].amb * ambMul * adaptMul + this.cone[x] * flashFall + flareLight(fx, fy));

        if (sky) {
          const t = Math.max(0, Math.min(1, prow / 40));
          const day = game.dayFactor ?? 1;
          r = (10 + 70 * day) * (1 - t) + (48 + 90 * day) * t;
          g = (14 + 90 * day) * (1 - t) + (64 + 100 * day) * t;
          bch = (22 + 110 * day) * (1 - t) + (90 + 120 * day) * t;
          const a = 1 - fogA, b = fogA;
          data[o] = r * a + fogR * b; data[o + 1] = g * a + fogG * b; data[o + 2] = bch * a + fogB * b; data[o + 3] = 255;
          fx += stepX; fy += stepY; continue;
        }

        const tex = isFloor ? this.tex.floors[bio] : this.tex.ceils[bio];
        const tx = Math.min(RTS - 1, Math.max(0, ((fx - cx) * tex.w) | 0));
        const ty = Math.min(RTS - 1, Math.max(0, ((fy - cy) * tex.h) | 0));
        const ti = (ty * tex.w + tx) * 4;
        r = tex.data[ti]; g = tex.data[ti + 1]; bch = tex.data[ti + 2];

        if (isFloor) {
          const ct = grid[ci];
          if (ct === T.HATCH_DOWN || ct === T.HATCH_UP) {
            const hx = fx - cx, hy = fy - cy;
            if (hx < 0.12 || hx > 0.88 || hy < 0.12 || hy > 0.88) { r = 110; g = 195; bch = 210; lum = Math.max(lum, 0.55); }
          } else if (ct === T.EXIT) {
            const ex = fx - cx - 0.5, ey = fy - cy - 0.5;
            if (ex * ex + ey * ey < 0.16) {
              const pulse = 0.65 + 0.35 * Math.sin((game.time || 0) * 4);
              r = 110 * pulse; g = 255 * pulse; bch = 175 * pulse;
              lum = Math.max(lum, 1.05);
            }
          }
        }

        const a = lum * (1 - fogA), b = fogA;
        const o2 = o;
        data[o2] = r * a + fogR * b;
        data[o2 + 1] = g * a + fogG * b;
        data[o2 + 2] = bch * a + fogB * b;
        data[o2 + 3] = 255;
        fx += stepX; fy += stepY;
      }
    }

    /* ---------------- 3) muros ---------------- */
    for (let x = 0; x < rw; x++) {
      const ds = this.drawStart[x], de = this.drawEnd[x];
      if (de <= ds) continue;
      const tex = this.tex.walls[this.texId[x]];
      const unit = (this.vScale * rh) / Math.max(0.0001, this.perp[x]);
      const lineH = unit * this.colH[x];
      const bottomF = horizon + 0.5 * unit;
      const topF = bottomF - lineH;
      const step = tex.h / unit; // la textura se repite cada unidad de mundo
      let texX = Math.min(RTS - 1, Math.max(0, (this.texX[x] * tex.w) | 0));
      if ((this.side[x] === 0 && this.rayDirX[x] > 0) || (this.side[x] === 1 && this.rayDirY[x] < 0)) texX = tex.w - 1 - texX;
      let texPos = (ds - topF) * step;
      const invLineH = 1 / Math.max(1, lineH);
      const a = this.wallA[x], b = this.wallB[x];
      for (let y = ds; y < de; y++) {
        let ty = texPos | 0;
        ty = ((ty % tex.h) + tex.h) % tex.h;
        texPos += step;
        const ti = (ty * tex.w + texX) * 4;
        if (tex.data[ti + 3] < 16) continue; // hueco transparente (rastrillo)
        const vv = (y - topF) * invLineH;
        const edge = vv < 1 - vv ? vv : 1 - vv;
        const ao = edge < 0.14 ? 0.64 + edge * 2.57 : 1;
        const o = (y * rw + x) * 4;
        data[o] = tex.data[ti] * a * ao + fogR * b;
        data[o + 1] = tex.data[ti + 1] * a * ao + fogG * b;
        data[o + 2] = tex.data[ti + 2] * a * ao + fogB * b;
        data[o + 3] = 255;
      }
    }

    /* ---------------- 4) puertas (rastrillo, pasable al abrir) ---------------- */
    for (let x = 0; x < rw; x++) {
      const n = this.doorCount[x];
      if (!n) continue;
      // de lejos a cerca para pintar correctamente encima de lo que haya detrás
      const order = [0, 1, 2, 3].slice(0, n).sort((i, j) => this.doorDist[x * 4 + j] - this.doorDist[x * 4 + i]);
      for (const k of order) {
        const ci = this.doorCell[x * 4 + k];
        const doorId = w.doorIdx[f][ci];
        const d = doorId >= 0 ? w.doors[doorId] : null;
        const open = d ? d.open : 1;
        if (open >= 0.999) continue;
        const perp = this.doorDist[x * 4 + k];
        const wh = (wallHArr[ci] || 19) / 16;
        const unit = (this.vScale * rh) / Math.max(0.0001, perp);
        const lineH = unit * wh;
        const bottomF = horizon + 0.5 * unit;
        const topF = bottomF - lineH;
        const visibleTopF = topF + lineH * open; // el panel baja desde el techo
        let ds = Math.max(0, Math.round(topF)), de = Math.min(rh, Math.round(visibleTopF));
        if (de <= ds) continue;
        const tex = this.tex.walls[5]; // textura de rastrillo
        const texX = Math.min(RTS - 1, Math.max(0, (this.doorWallX[x * 4 + k] * tex.w) | 0));
        const step = tex.h / unit;
        let texPos = (ds - topF) * step;
        const fogA = Math.min(1, 1 - Math.exp(-perp * fogDensity));
        const lum = Math.min(1.2, BIOME_LIGHT[biomeHere].amb * ambMul * adaptMul + this.cone[x] * FLASH_I / (1 + 0.22 * perp + 0.085 * perp * perp));
        const a = lum * (1 - fogA), b = fogA;
        for (let y = ds; y < de; y++) {
          let ty = texPos | 0; ty = ((ty % tex.h) + tex.h) % tex.h;
          texPos += step;
          const ti = (ty * tex.w + texX) * 4;
          if (tex.data[ti + 3] < 16) continue;
          const o = (y * rw + x) * 4;
          data[o] = tex.data[ti] * a + fogR * b;
          data[o + 1] = tex.data[ti + 1] * a + fogG * b;
          data[o + 2] = tex.data[ti + 2] * a + fogB * b;
          data[o + 3] = 255;
        }
        if (perp < this.zbuf[x]) this.zbuf[x] = perp;
      }
    }

    /* ---------------- 5) sprites ---------------- */
    const list = [];
    for (const g of game.grievers || []) {
      if (g.floor !== f) continue;
      const frame = Math.floor(g.animT * 6) % 2;
      list.push({ x: g.x, y: g.y, tex: this.sprites.griever[frame], h: 1.0, yBase: 0, emissive: true });
    }
    for (const it of game.items || []) {
      if (it.taken || it.floor !== f) continue;
      const bob = Math.sin(it.bob || 0) * 0.08;
      const def = ITEM_H[it.type] || { h: 0.5, yBase: 0.1 };
      list.push({ x: it.x, y: it.y, tex: this.sprites[it.type], h: def.h, yBase: def.yBase + bob });
    }
    for (const fl of game.flares || []) {
      if (fl.floor !== f) continue;
      list.push({ x: fl.x, y: fl.y, tex: this.sprites.flare, h: 0.3, yBase: 0.02, emissive: true });
    }
    if (w.exit && w.exit.region != null) {
      list.push({ x: w.exit.x + 0.5, y: w.exit.y + 0.5, tex: this.sprites.beacon, h: 1.5, yBase: 0, emissive: true, floorOnly: f === FL.SURFACE });
    }

    list.sort((s1, s2) => {
      const d1 = (s1.x - px) * (s1.x - px) + (s1.y - py) * (s1.y - py);
      const d2 = (s2.x - px) * (s2.x - px) + (s2.y - py) * (s2.y - py);
      return d2 - d1;
    });

    for (const s of list) {
      if (s.floorOnly === false) continue;
      const sx = s.x - px, sy = s.y - py;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const transformX = invDet * (dirY * sx - dirX * sy);
      const transformY = invDet * (-planeY * sx + planeX * sy);
      if (transformY <= 0.1) continue;
      const lineH = (this.vScale * rh) / transformY;
      const hpx = s.h * lineH;
      const wpx = hpx * (s.tex.w / s.tex.h);
      const screenX = (rw / 2) * (1 + transformX / transformY);
      const bottom = horizon + (0.5 - s.yBase) * lineH;
      const top = bottom - hpx;
      const x0 = Math.floor(screenX - wpx / 2), x1 = Math.ceil(screenX + wpx / 2);
      if (x1 < 0 || x0 >= rw) continue;
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(rh - 1, Math.ceil(bottom));

      const dist = Math.hypot(sx, sy);
      const cosA = (s.x - px) * dirX / (dist || 1) + (s.y - py) * dirY / (dist || 1);
      let coneV = 0;
      if (flashOn) {
        const t = Math.max(0, Math.min(1, (cosA - COS_OUT) / (COS_IN - COS_OUT)));
        coneV = t * t * (3 - 2 * t);
      }
      const fogA = Math.min(1, 1 - Math.exp(-dist * fogDensity));
      const biomeAtS = w.biomeAt(f, s.x, s.y);
      let lum = Math.min(1.3, BIOME_LIGHT[biomeAtS].amb * ambMul * adaptMul + coneV * FLASH_I / (1 + 0.22 * dist + 0.085 * dist * dist) + flareLight(s.x, s.y));
      const a = lum * (1 - fogA), b = fogA;

      const xs0 = Math.max(0, x0), xs1 = Math.min(rw, x1);
      for (let x = xs0; x < xs1; x++) {
        if (transformY >= this.zbuf[x]) continue;
        const txf = ((x - (screenX - wpx / 2)) * s.tex.w) / wpx;
        const tx = txf | 0;
        if (tx < 0 || tx >= s.tex.w) continue;
        for (let y = y0; y <= y1; y++) {
          const tyf = ((y - top) * s.tex.h) / hpx;
          const ty = tyf | 0;
          if (ty < 0 || ty >= s.tex.h) continue;
          const ti = (ty * s.tex.w + tx) * 4;
          const al = s.tex.data[ti + 3];
          if (al < 24) continue;
          const o = (y * rw + x) * 4;
          const r = s.tex.data[ti], g = s.tex.data[ti + 1], bb = s.tex.data[ti + 2];
          if (s.emissive && r > 170 && g < 150 && bb < 130) {
            const e = Math.max(lum, 0.5 + 0.4 * Math.sin((game.time || 0) * 6));
            data[o] = Math.min(255, r * e); data[o + 1] = Math.min(255, g * e * 0.9); data[o + 2] = Math.min(255, bb * e);
          } else {
            data[o] = r * a + fogR * b; data[o + 1] = g * a + fogG * b; data[o + 2] = bb * a + fogB * b;
          }
          data[o + 3] = 255;
        }
      }
    }

    this.ctx.putImageData(this.img, 0, 0);
  }
}

const ITEM_H = {
  battery: { h: 0.55, yBase: 0.02 },
  flare: { h: 0.55, yBase: 0.02 },
  medkit: { h: 0.5, yBase: 0.02 },
  code: { h: 0.5, yBase: 0.25 },
};
