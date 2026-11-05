/* =============================================================
   Maze Runner Mobile — Entidades: Grievers, objetos y bengalas

   v2: ciclo de peligro día/noche fiel a la película — de día los
   Grievers son evitables (sentidos cortos, lentos, se rinden
   rápido); de noche son la amenaza real (perciben mucho más,
   corren casi tanto como tú y no sueltan la presa). Así se puede
   explorar de día sin morir constantemente, y el reloj importa.
   ============================================================= */

import { FL } from './world.js';

export const ITEM_DEFS = {
  battery: { sprite: 'battery', h: 0.8, yBase: 0.03, label: 'Batería (+45% linterna)' },
  flare: { sprite: 'flare', h: 0.8, yBase: 0.03, label: 'Bengala (+1)' },
  medkit: { sprite: 'medkit', h: 0.75, yBase: 0.03, label: 'Botiquín (+35 vida)' },
  code: { sprite: 'code', h: 0.75, yBase: 0.35, label: 'Código CRUEL' },
  note: { sprite: 'note', h: 0.6, yBase: 0.05, label: 'Página de la bitácora' },
};

export class Item {
  constructor(x, y, floor, type) {
    this.x = x; this.y = y; this.floor = floor; this.type = type;
    this.taken = false;
    this.bob = Math.random() * Math.PI * 2;
  }
  update(dt) { this.bob += dt * 2.2; }
}

export class Flare {
  constructor(x, y, floor, vx, vy) {
    this.x = x; this.y = y; this.floor = floor;
    this.vx = vx; this.vy = vy;
    this.life = 32;
    this.intensity = 1;
    this.dead = false;
  }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (!world.circleBlocked(this.floor, nx, this.y, 0.15)) this.x = nx; else this.vx *= -0.4;
    if (!world.circleBlocked(this.floor, this.x, ny, 0.15)) this.y = ny; else this.vy *= -0.4;
    this.vx *= 0.86; this.vy *= 0.86;
    const t = this.life;
    this.intensity = t > 3 ? 1 : Math.max(0, t / 3) * (0.6 + 0.4 * Math.sin(performance.now() * 0.02));
  }
}

const PATROL = 0, CHASE = 1, SEARCH = 2;

// sentidos y velocidad por franja horaria (unidades de mundo = pasillo de 3u)
const SENSE = {
  day: { see: 13, hearRun: 15, hearWalk: 5, chase: 3.4, search: 2.3, patrol: 1.6, alert: 3.0, dmg: 10 },
  night: { see: 26, hearRun: 28, hearWalk: 12, chase: 5.6, search: 3.6, patrol: 2.0, alert: 7.5, dmg: 20 },
};

export class Griever {
  constructor(x, y, floor, id) {
    this.id = id;
    this.x = x; this.y = y; this.floor = floor;
    this.spawnX = x; this.spawnY = y;
    this.state = PATROL;
    this.alertTimer = 0;
    this.attackCd = 0;
    this.target = null;
    this.retarget = 0;
    this.stuck = 0;
    this.lastX = x; this.lastY = y;
    this.animT = Math.random() * 10;
    this.growlCd = Math.random() * 3;
  }

  update(dt, game) {
    const p = game.player, w = game.world;
    this.animT += dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    this.growlCd -= dt;

    if (this.floor !== p.floor) return;
    if (game.time < game.graceTime) return;   // gracia inicial: nadie persigue al empezar

    const S = game.isNight ? SENSE.night : SENSE.day;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy);

    // streaming: fuera de rango, latente
    if (d > 85) { this.state = PATROL; return; }

    // sentidos (el subsuelo, siempre oscuro, oye y ve un poco más)
    const underBoost = this.floor === FL.UNDER ? 1.12 : 1;
    const sees = d < S.see * underBoost && w.hasLineOfSight(this.floor, this.x, this.y, p.x, p.y);
    const noiseR = p.running ? S.hearRun : (p.moving ? S.hearWalk : 0);
    const hears = noiseR > 0 && d < noiseR * underBoost;

    if (sees || hears) {
      this.state = CHASE;
      this.alertTimer = S.alert;
      this.lastX = p.x; this.lastY = p.y;
    } else if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) this.state = SEARCH;
    }

    let tx, ty;
    if (this.state === CHASE) { tx = p.x; ty = p.y; }
    else if (this.state === SEARCH) {
      tx = this.lastX; ty = this.lastY;
      if (Math.hypot(tx - this.x, ty - this.y) < 1.6) this.state = PATROL;
    } else {
      this.retarget -= dt;
      if (!this.target || this.retarget <= 0 || Math.hypot(this.target.x - this.x, this.target.y - this.y) < 1) {
        this.pickWander(w);
        this.retarget = 5 + Math.random() * 5;
      }
      tx = this.target ? this.target.x : this.spawnX;
      ty = this.target ? this.target.y : this.spawnY;
    }

    // dirección deseada: campo de flujo hacia el jugador (persecución/búsqueda)
    let dirX = 0, dirY = 0;
    const useFlow = this.state === CHASE || this.state === SEARCH;
    if (useFlow) {
      const step = w.nextFlowStep(this.floor, this.x, this.y);
      if (step) { dirX = step.x - this.x; dirY = step.y - this.y; }
      else { dirX = tx - this.x; dirY = ty - this.y; }
    } else {
      dirX = tx - this.x; dirY = ty - this.y;
    }
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len; dirY /= len;

    // separación entre grievers
    for (const o of game.grievers) {
      if (o === this || o.floor !== this.floor) continue;
      const ox = this.x - o.x, oy = this.y - o.y;
      const od = Math.hypot(ox, oy);
      if (od > 0.001 && od < 1.6) { dirX += (ox / od) * 0.7; dirY += (oy / od) * 0.7; }
    }
    // huyen de las bengalas
    for (const f of game.flares) {
      if (f.floor !== this.floor) continue;
      const fx = this.x - f.x, fy = this.y - f.y;
      const fd = Math.hypot(fx, fy);
      if (fd > 0.001 && fd < 5.5) { dirX += (fx / fd) * 0.6; dirY += (fy / fd) * 0.6; }
    }

    const dl = Math.hypot(dirX, dirY) || 1;
    dirX /= dl; dirY /= dl;

    let sp = this.state === CHASE ? S.chase : this.state === SEARCH ? S.search : S.patrol;
    if (this.floor === FL.UNDER) sp *= 1.05;

    const nx = this.x + dirX * sp * dt;
    const ny = this.y + dirY * sp * dt;
    const before = this.x + this.y;
    if (!w.circleBlocked(this.floor, nx, this.y, 0.5)) this.x = nx;
    if (!w.circleBlocked(this.floor, this.x, ny, 0.5)) this.y = ny;
    if (Math.abs(this.x + this.y - before) < 0.0005) {
      this.stuck += dt;
      if (this.stuck > 0.8) { this.pickWander(w); this.stuck = 0; }
    } else this.stuck = 0;

    // ataque
    const nd = Math.hypot(p.x - this.x, p.y - this.y);
    if (nd < 1.05 && this.attackCd <= 0) {
      this.attackCd = 1.3;
      game.damagePlayer(S.dmg, (p.x - this.x) / (nd || 1), (p.y - this.y) / (nd || 1));
    }
    // gruñido
    if (this.state === CHASE && this.growlCd <= 0) {
      this.growlCd = 1.6 + Math.random() * 2.2;
      game.audio.growl(Math.max(0, 1 - nd / 20));
    }
    // indicador de amenaza en el HUD: el perseguidor más cercano
    if (this.state === CHASE) {
      if (!game.threat || nd < game.threat.d) game.threat = { x: this.x, y: this.y, d: nd };
    }
  }

  pickWander(w) {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 14;
      const x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r;
      if (!w.circleBlocked(this.floor, x, y, 0.6)) { this.target = { x, y }; return; }
    }
    this.target = { x: this.spawnX, y: this.spawnY };
  }
}
