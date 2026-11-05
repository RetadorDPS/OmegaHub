/* =============================================================
   Maze Runner Mobile — Generación y consultas del mundo (v2)

   El laberinto se genera dos veces:
   1) "Lógico": el backtracking recursivo + trenzado de siempre,
      sobre una rejilla compacta (una celda = una decisión).
   2) "Dilatado": cada celda lógica se expande a un bloque de
      DIL×DIL celdas físicas. El resultado son pasillos anchos
      (como la avenida de la Gladero en la película) separados
      por muros gruesos y colosales — y un mundo bastante más
      grande — sin complicar el algoritmo de generación en sí.

   El resto del juego (jugador, Grievers, render, minimapa) sólo
   ve la rejilla FÍSICA (this.W, this.H, this.grid, ...).
   ============================================================= */

import { makeRng } from './rng.js';

export const T = { FLOOR: 0, WALL: 1, DOOR: 2, HATCH_DOWN: 3, HATCH_UP: 4, EXIT: 5 };
export const FL = { SURFACE: 0, UNDER: 1 };
export const BIOME = { GLADE: 0, A: 1, B: 2, C: 3, CRUEL: 4 };
export const BIOME_NAME = ['El Área', 'Clásico', 'Industrial', 'Ruinas', 'CRUEL'];

/** Celdas físicas por celda lógica — pasillos de 3 unidades de ancho. */
export const DIL = 3;

/** Altura de muro/techo por bioma, en 1/16 de celda. Muros colosales. */
export const HEIGHTS = [88, 54, 67, 48, 18];

const SECTOR_DEF = [
  { n: 1, r: 0, c: 1, biome: BIOME.A },
  { n: 2, r: 0, c: 2, biome: BIOME.B },
  { n: 3, r: 1, c: 2, biome: BIOME.A },
  { n: 4, r: 2, c: 2, biome: BIOME.C },
  { n: 5, r: 2, c: 1, biome: BIOME.A },
  { n: 6, r: 2, c: 0, biome: BIOME.B },
  { n: 7, r: 1, c: 0, biome: BIOME.A },
  { n: 8, r: 0, c: 0, biome: BIOME.C },
];
const GLADE = 4; // índice de bloque r=1,c=1

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
    this.build();
  }

  build() {
    this.buildLogical();
    this.dilate();
    this.buildCellLists();
  }

  /* ============================================================
     FASE 1 — generación lógica (idéntica en espíritu a la v1,
     pero todo vive en this.l* hasta que dilate() la expande)
     ============================================================ */

  buildLogical() {
    const rng = this.rng;
    const colW = [13 + 2 * rng.int(3), 13 + 2 * rng.int(3), 13 + 2 * rng.int(3)];
    const rowH = [13 + 2 * rng.int(3), 13 + 2 * rng.int(3), 13 + 2 * rng.int(3)];
    const lw = colW[0] + colW[1] + colW[2], lh = rowH[0] + rowH[1] + rowH[2];
    this.lw = lw; this.lh = lh;
    const xs = [0, colW[0], colW[0] + colW[1]];
    const ys = [0, rowH[0], rowH[0] + rowH[1]];

    this.blocks = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const def = SECTOR_DEF.find((d) => d.r === r && d.c === c);
        this.blocks[r * 3 + c] = {
          i: r * 3 + c, r, c, x0: xs[c], y0: ys[r], w: colW[c], h: rowH[r],
          sector: def ? def.n : 0, biome: def ? def.biome : BIOME.GLADE, isGlade: !def,
        };
      }
    }

    const N = lw * lh;
    this.lgrid = [new Uint8Array(N).fill(T.WALL), new Uint8Array(N).fill(T.WALL)];
    this.lregion = [new Uint8Array(N), new Uint8Array(N)];
    this.lbiome = [new Uint8Array(N), new Uint8Array(N)];
    this.lsky = [new Uint8Array(N), new Uint8Array(N)];
    this.ldoorIdx = [new Int16Array(N).fill(-1), new Int16Array(N).fill(-1)];
    this.doors = [];

    for (const b of this.blocks) {
      for (let y = b.y0; y < b.y0 + b.h; y++) {
        for (let x = b.x0; x < b.x0 + b.w; x++) {
          const i = y * lw + x;
          this.lregion[FL.SURFACE][i] = b.sector;
          this.lbiome[FL.SURFACE][i] = b.biome;
          this.lregion[FL.UNDER][i] = b.sector;
          this.lbiome[FL.UNDER][i] = BIOME.CRUEL;
        }
      }
    }

    for (const b of this.blocks) {
      if (b.isGlade) this.carveGlade(b);
      else this.carveMaze(FL.SURFACE, b, b.biome === BIOME.B ? 0.12 : 0.07);
    }
    this.carveUnderground();

    // zonas sin techo (ruinas a cielo abierto) en el bioma C
    for (const b of this.blocks) {
      if (b.biome !== BIOME.C) continue;
      const n = 1 + rng.int(2);
      for (let k = 0; k < n; k++) {
        const px = b.x0 + 3 + rng.int(Math.max(1, b.w - 5));
        const py = b.y0 + 3 + rng.int(Math.max(1, b.h - 5));
        for (let y = py; y < Math.min(b.y0 + b.h - 1, py + 2); y++) {
          for (let x = px; x < Math.min(b.x0 + b.w - 1, px + 2); x++) {
            const i = y * lw + x;
            if (this.lgrid[FL.SURFACE][i] === T.WALL) this.lgrid[FL.SURFACE][i] = T.FLOOR;
            this.lsky[FL.SURFACE][i] = 1;
          }
        }
      }
    }

    this.placeDoors();
    this.placeHatches();
    this.placeExit();
  }

  carveMaze(floor, block, braid = 0.08) {
    const g = this.lgrid[floor], W = this.lw, rng = this.rng;
    const { x0, y0, w, h } = block;
    const startX = x0 + 1, startY = y0 + 1;
    g[startY * W + startX] = T.FLOOR;
    const stack = [[startX, startY]];
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs = rng.shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]]);
      let moved = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx > x0 && nx < x0 + w - 1 && ny > y0 && ny < y0 + h - 1 && g[ny * W + nx] === T.WALL) {
          g[(cy + dy / 2) * W + (cx + dx / 2)] = T.FLOOR;
          g[ny * W + nx] = T.FLOOR;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }
    // trenzado: abre bucles para que huir sea posible
    for (let y = y0 + 1; y < y0 + h - 1; y++) {
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        if (g[y * W + x] !== T.WALL || !rng.chance(braid)) continue;
        const horiz = g[y * W + (x - 1)] === T.FLOOR && g[y * W + (x + 1)] === T.FLOOR;
        const vert = g[(y - 1) * W + x] === T.FLOOR && g[(y + 1) * W + x] === T.FLOOR;
        if (horiz || vert) g[y * W + x] = T.FLOOR;
      }
    }
  }

  carveGlade(block) {
    const g = this.lgrid[FL.SURFACE], W = this.lw, rng = this.rng;
    const { x0, y0, w, h } = block;
    for (let y = y0 + 1; y < y0 + h - 1; y++) {
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        g[y * W + x] = T.FLOOR;
        this.lsky[FL.SURFACE][y * W + x] = 1;
      }
    }
    // el punto de aparición cae en el centro geométrico exacto del bloque:
    // los pilares decorativos deben evitarlo.
    const cx = x0 + (w >> 1), cy = y0 + (h >> 1);
    for (let k = 0; k < 4; k++) {
      const px = x0 + 2 + rng.int(Math.max(1, w - 4));
      const py = y0 + 2 + rng.int(Math.max(1, h - 4));
      if (Math.abs(px - cx) > 2 || Math.abs(py - cy) > 2) g[py * W + px] = T.WALL;
    }
  }

  carveUnderground() {
    const g = this.lgrid[FL.UNDER], W = this.lw, H = this.lh, rng = this.rng;
    g[1 * W + 1] = T.FLOOR;
    const stack = [[1, 1]];
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs = rng.shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]]);
      let moved = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && g[ny * W + nx] === T.WALL) {
          g[(cy + dy / 2) * W + (cx + dx / 2)] = T.FLOOR;
          g[ny * W + nx] = T.FLOOR;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (g[y * W + x] !== T.WALL || !rng.chance(0.045)) continue;
        const horiz = g[y * W + (x - 1)] === T.FLOOR && g[y * W + (x + 1)] === T.FLOOR;
        const vert = g[(y - 1) * W + x] === T.FLOOR && g[(y + 1) * W + x] === T.FLOOR;
        if (horiz || vert) g[y * W + x] = T.FLOOR;
      }
    }
    // cámaras CRUEL
    for (let k = 0; k < 6; k++) {
      const cx = 3 + rng.int(Math.max(1, W - 7)), cy = 3 + rng.int(Math.max(1, H - 7));
      for (let y = cy; y < Math.min(H - 1, cy + 4); y++) {
        for (let x = cx; x < Math.min(W - 1, cx + 4); x++) g[y * W + x] = T.FLOOR;
      }
    }
  }

  carveDoorAxis(x, y, axis) {
    const g = this.lgrid[FL.SURFACE], W = this.lw;
    const set = (xx, yy) => { if (g[yy * W + xx] === T.WALL) g[yy * W + xx] = T.FLOOR; };
    if (axis === 'v') { set(x, y - 1); set(x, y - 2); set(x, y + 1); set(x, y + 2); }
    else { set(x - 1, y); set(x - 2, y); set(x + 1, y); set(x + 2, y); }
  }

  makeDoor(ia, ib) {
    const A = this.blocks[ia], B = this.blocks[ib];
    const rng = this.rng;
    let x, y, axis;
    if (A.c === B.c) {
      axis = 'v';
      const top = A.r < B.r ? A : B;
      const xr0 = Math.max(A.x0, B.x0) + 1, xr1 = Math.min(A.x0 + A.w, B.x0 + B.w) - 2;
      x = xr0 + 2 * rng.int(Math.max(1, Math.floor((xr1 - xr0) / 2)));
      y = top.y0 + top.h - 1;
    } else {
      axis = 'h';
      const left = A.c < B.c ? A : B;
      const yr0 = Math.max(A.y0, B.y0) + 1, yr1 = Math.min(A.y0 + A.h, B.y0 + B.h) - 2;
      y = yr0 + 2 * rng.int(Math.max(1, Math.floor((yr1 - yr0) / 2)));
      x = left.x0 + left.w - 1;
    }
    this.carveDoorAxis(x, y, axis);

    const i = y * this.lw + x;
    const d = { x, y, axis, open: 1, target: 1, id: this.doors.length };
    this.doors.push(d);
    this.lgrid[FL.SURFACE][i] = T.DOOR;
    this.ldoorIdx[FL.SURFACE][i] = d.id;
  }

  placeDoors() {
    for (const o of [1, 5, 7, 3]) this.makeDoor(GLADE, o);
    const ring = [[0, 1], [1, 2], [2, 5], [5, 8], [8, 7], [7, 6], [6, 3], [3, 0]];
    for (const [a, b] of ring) this.makeDoor(a, b);
  }

  randomFloorInBlock(floor, block) {
    const g = this.lgrid[floor], W = this.lw, rng = this.rng;
    for (let tries = 0; tries < 400; tries++) {
      const x = block.x0 + 1 + rng.int(Math.max(1, block.w - 2));
      const y = block.y0 + 1 + rng.int(Math.max(1, block.h - 2));
      if (g[y * W + x] === T.FLOOR) return { x, y };
    }
    return { x: block.x0 + (block.w >> 1), y: block.y0 + (block.h >> 1) };
  }

  placeHatches() {
    this.hatches = [];
    const W = this.lw;
    const addHatch = (block) => {
      const { x, y } = this.randomFloorInBlock(FL.SURFACE, block);
      this.lgrid[FL.SURFACE][y * W + x] = T.HATCH_DOWN;
      this.lgrid[FL.UNDER][y * W + x] = T.HATCH_UP;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = (y + dy) * W + (x + dx);
        if (this.lgrid[FL.SURFACE][ni] === T.WALL) this.lgrid[FL.SURFACE][ni] = T.FLOOR;
        if (this.lgrid[FL.UNDER][ni] === T.WALL) this.lgrid[FL.UNDER][ni] = T.FLOOR;
      }
      this.hatches.push({ x, y });
    };
    addHatch(this.blocks[GLADE]);
    const candidates = this.blocks.filter((b) => !b.isGlade);
    this.rng.shuffle(candidates);
    addHatch(candidates[0]);
    addHatch(candidates[1]);
  }

  placeExit() {
    const corners = this.blocks.filter((b) => !b.isGlade && (b.r === 0 || b.r === 2) && (b.c === 0 || b.c === 2));
    const block = this.rng.pick(corners);
    const gb = this.blocks[GLADE];
    const gx = gb.x0 + (gb.w >> 1), gy = gb.y0 + (gb.h >> 1);
    const g = this.lgrid[FL.SURFACE], W = this.lw;
    let best = null, bestD = -1;
    for (let y = block.y0 + 1; y < block.y0 + block.h - 1; y++) {
      for (let x = block.x0 + 1; x < block.x0 + block.w - 1; x++) {
        if (g[y * W + x] !== T.FLOOR) continue;
        const d = (x - gx) * (x - gx) + (y - gy) * (y - gy);
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (!best) best = this.randomFloorInBlock(FL.SURFACE, block);
    g[best.y * W + best.x] = T.EXIT;
    this.exit = { x: best.x, y: best.y, region: block.sector };
  }

  /* ============================================================
     FASE 2 — dilatación: cada celda lógica -> bloque DIL×DIL físico
     ============================================================ */

  dilate() {
    const lw = this.lw, lh = this.lh;
    const W = lw * DIL, H = lh * DIL;
    this.W = W; this.H = H;
    const N = W * H;
    this.grid = [new Uint8Array(N), new Uint8Array(N)];
    this.region = [new Uint8Array(N), new Uint8Array(N)];
    this.biome = [new Uint8Array(N), new Uint8Array(N)];
    this.sky = [new Uint8Array(N), new Uint8Array(N)];
    this.wallH = [new Uint8Array(N), new Uint8Array(N)];
    this.ceilH = [new Uint8Array(N), new Uint8Array(N)];
    this.doorIdx = [new Int16Array(N).fill(-1), new Int16Array(N).fill(-1)];

    for (let f = 0; f < 2; f++) {
      const lgrid = this.lgrid[f], lregion = this.lregion[f], lbiome = this.lbiome[f], lsky = this.lsky[f], ldoorIdx = this.ldoorIdx[f];
      const grid = this.grid[f], region = this.region[f], biome = this.biome[f], sky = this.sky[f], wallH = this.wallH[f], ceilH = this.ceilH[f], doorIdx = this.doorIdx[f];
      for (let ly = 0; ly < lh; ly++) {
        for (let lx = 0; lx < lw; lx++) {
          const li = ly * lw + lx;
          const t = lgrid[li], bio = lbiome[li], reg = lregion[li], skyv = lsky[li], did = ldoorIdx[li];
          const h = HEIGHTS[bio];
          const py0 = ly * DIL, px0 = lx * DIL;
          for (let dy = 0; dy < DIL; dy++) {
            const rowBase = (py0 + dy) * W + px0;
            for (let dx = 0; dx < DIL; dx++) {
              const pi = rowBase + dx;
              grid[pi] = t; region[pi] = reg; biome[pi] = bio; sky[pi] = skyv;
              wallH[pi] = h; ceilH[pi] = h;
              if (did >= 0) doorIdx[pi] = did;
            }
          }
        }
      }
    }

    // remapea a coordenadas físicas todo lo que se calculó en fase lógica
    this.hatches = this.hatches.map((h) => ({ x: h.x * DIL, y: h.y * DIL }));
    this.exit = { x: this.exit.x * DIL, y: this.exit.y * DIL, region: this.exit.region };
    for (const d of this.doors) { d.x *= DIL; d.y *= DIL; }
    for (const b of this.blocks) { b.x0 *= DIL; b.y0 *= DIL; b.w *= DIL; b.h *= DIL; }

    const gb = this.blocks[GLADE];
    this.spawn = { x: gb.x0 + gb.w / 2, y: gb.y0 + gb.h / 2, dir: -Math.PI / 2, floor: FL.SURFACE };

    // campo de flujo (BFS compartido): estructuras reutilizables, a tamaño físico
    this.flowDist = new Int32Array(N);
    this.flowStamp = new Int32Array(N).fill(-1);
    this.flowQueue = new Int32Array(N);
    this.flowStampId = 0;
    this.flowValidFloor = -1;
  }

  buildCellLists() {
    this.cellsByRegion = [{}, {}];
    for (let f = 0; f < 2; f++) {
      const grid = this.grid[f], region = this.region[f];
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== T.FLOOR) continue;
        const r = region[i];
        (this.cellsByRegion[f][r] = this.cellsByRegion[f][r] || []).push(i);
      }
    }
  }

  /* ---------------------------------------------------------- consultas */

  idx(x, y) { return y * this.W + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }

  typeAt(floor, x, y) {
    if (!this.inBounds(x, y)) return T.WALL;
    return this.grid[floor][y * this.W + x];
  }

  isBlocked(floor, x, y) {
    const t = this.typeAt(floor, x, y);
    if (t === T.WALL) return true;
    if (t === T.DOOR) {
      const di = this.doorIdx[floor][this.idx(x, y)];
      return di >= 0 && this.doors[di].open < 0.55;
    }
    return false;
  }

  circleBlocked(floor, x, y, r) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.isBlocked(floor, cx, cy)) continue;
        const nx = Math.max(cx, Math.min(x, cx + 1));
        const ny = Math.max(cy, Math.min(y, cy + 1));
        const ddx = x - nx, ddy = y - ny;
        if (ddx * ddx + ddy * ddy < r * r) return true;
      }
    }
    return false;
  }

  hasLineOfSight(floor, x0, y0, x1, y1, maxDist = 40) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) return false;
    const steps = Math.max(1, Math.ceil(dist * 4));
    const sx = dx / steps, sy = dy / steps;
    let x = x0, y = y0;
    for (let i = 0; i < steps; i++) {
      x += sx; y += sy;
      if (this.isBlocked(floor, Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  regionAt(floor, x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (!this.inBounds(cx, cy)) return 0;
    return this.region[floor][cy * this.W + cx];
  }

  biomeAt(floor, x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (!this.inBounds(cx, cy)) return BIOME.A;
    return this.biome[floor][cy * this.W + cx];
  }

  regionLabel(floor, x, y) {
    const r = this.regionAt(floor, x, y);
    if (floor === FL.UNDER) return r === 0 ? 'Subsuelo · bajo El Área' : `Subsuelo · bajo el Sector ${r}`;
    if (r === 0) return 'El Área · Zona segura';
    return `Sector ${r} · ${BIOME_NAME[this.biomeAt(floor, x, y)]}`;
  }

  /** Celda de suelo al azar dentro de una región (0 = El Área, 1..8 = sectores). */
  randCell(region, floor = FL.SURFACE) {
    const list = this.cellsByRegion[floor][region];
    if (!list || !list.length) return null;
    const i = list[this.rng.int(list.length)];
    return { x: (i % this.W) + 0.5, y: Math.floor(i / this.W) + 0.5 };
  }

  /* ---------------------------------------------------------- IA: campo de flujo */

  computeFlow(floor, tx, ty, radius = 70) {
    const W = this.W, H = this.H;
    let cx = Math.max(0, Math.min(W - 1, Math.floor(tx)));
    let cy = Math.max(0, Math.min(H - 1, Math.floor(ty)));
    if (this.isBlocked(floor, cx, cy)) {
      const found = this._findFree(floor, cx, cy);
      if (!found) return;
      cx = found.x; cy = found.y;
    }
    const s = ++this.flowStampId;
    const dist = this.flowDist, stamp = this.flowStamp, q = this.flowQueue;
    let head = 0, tail = 0;
    const start = cy * W + cx;
    dist[start] = 0; stamp[start] = s; q[tail++] = start;
    const minX = Math.max(0, cx - radius), maxX = Math.min(W - 1, cx + radius);
    const minY = Math.max(0, cy - radius), maxY = Math.min(H - 1, cy + radius);
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < tail) {
      const cur = q[head++];
      const px = cur % W, py = (cur / W) | 0;
      const d = dist[cur];
      if (d >= radius) continue;
      for (const [dx, dy] of N4) {
        const nx = px + dx, ny = py + dy;
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        const ni = ny * W + nx;
        if (stamp[ni] === s || this.isBlocked(floor, nx, ny)) continue;
        stamp[ni] = s; dist[ni] = d + 1; q[tail++] = ni;
      }
    }
    this.flowValidFloor = floor;
  }

  _findFree(floor, cx, cy) {
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (!this.isBlocked(floor, cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
        }
      }
    }
    return null;
  }

  flowAt(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return Infinity;
    const i = y * this.W + x;
    return this.flowStamp[i] === this.flowStampId ? this.flowDist[i] : Infinity;
  }

  /** Centro de la celda vecina con menor distancia del campo de flujo (o null). */
  nextFlowStep(floor, x, y) {
    if (floor !== this.flowValidFloor) return null;
    const cx = Math.floor(x), cy = Math.floor(y);
    const cur = this.flowAt(cx, cy);
    if (!Number.isFinite(cur)) return null;
    let best = cur, bx = null, by = null;
    const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of N8) {
      const nx = cx + dx, ny = cy + dy;
      if (this.isBlocked(floor, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (this.isBlocked(floor, cx + dx, cy) || this.isBlocked(floor, cx, cy + dy))) continue;
      const d = this.flowAt(nx, ny);
      if (d < best) { best = d; bx = nx; by = ny; }
    }
    if (bx === null) return null;
    return { x: bx + 0.5, y: by + 0.5 };
  }
}
