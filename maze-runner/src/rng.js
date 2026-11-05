/* =============================================================
   Maze Runner Mobile — Núcleo determinista
   Misma semilla => mismo laberinto (semilla diaria / manual)
   ============================================================= */

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

export function makeRng(seed) {
  const f = mulberry32(seed >>> 0);
  return {
    next: f,
    int: (n) => Math.floor(f() * n),
    range: (a, b) => a + f() * (b - a),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
  };
}

/** Semilla diaria estable a partir de la fecha UTC (YYYYMMDD). */
export function dailySeed(d = new Date()) {
  const s = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return parseInt(s, 10) >>> 0;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function seedLabel(seed) {
  return String(seed).padStart(6, '0').slice(-6);
}
