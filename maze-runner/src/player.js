/* =============================================================
   Maze Runner Mobile — Jugador (movimiento, stamina, linterna)

   v2: recalibrado para pasillos de 3 unidades de ancho — el radio
   y las velocidades ya no pelean con el espacio disponible, así
   que la asistencia es un remate, no un parche. Incluye un giro
   rápido de 180° ("mirar atrás") para la huida fluida que pedía
   la jugabilidad de la película.
   ============================================================= */

import { FL } from './world.js';

export const WALK = 3.6;
export const RUN = 6.2;

export class Player {
  constructor(world) {
    this.world = world;
    this.x = world.spawn.x;
    this.y = world.spawn.y;
    this.floor = FL.SURFACE;
    this.dir = world.spawn.dir ?? -Math.PI / 2;
    this.turnTarget = null;      // giro rápido en curso (mirar atrás)
    this.pitch = 0;
    this.health = 100;
    this.stamina = 100;
    this.battery = 100;
    this.flares = 3;
    this.codes = 0;
    this.notes = 0;
    this.flashOn = true;
    this.running = false;
    this.moving = false;
    this.speedNow = 0;
    this.bob = 0;
    this.bobScale = 0.5;   // 0..1, ajustable en opciones
    this.hurtT = 0;
    this.regenT = 0;
    this.radius = 0.34;    // pasillo de 3u de ancho => sobra espacio de sobra
    this.assist = true;    // asistencia de movimiento, ajustable en opciones
  }

  get maxStamina() { return 100; }

  applySettings(s = {}) {
    if (typeof s.bob === 'number') this.bobScale = Math.max(0, Math.min(1, s.bob));
    if (typeof s.assist === 'boolean') this.assist = s.assist;
  }

  update(dt, input, game) {
    const w = this.world;

    // --- giro rápido (mirar atrás): toma el control de la mirada mientras dura ---
    if (this.turnTarget != null) {
      const diff = normAngle(this.turnTarget - this.dir);
      const step = Math.sign(diff) * Math.min(Math.abs(diff), 9.5 * dt);
      this.dir += step;
      if (Math.abs(diff) < 0.03) { this.dir = this.turnTarget; this.turnTarget = null; }
      input.consumeLookX(); input.consumeLookY(); // descarta el arrastre acumulado durante el giro
    } else {
      this.dir += input.consumeLookX();
      if (input.consume('lookBack')) {
        this.turnTarget = normAngle(this.dir + Math.PI);
      }
    }
    this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch + input.consumeLookY()));

    // --- movimiento deseado ---
    let fwd = -input.moveY;
    let str = input.moveX;
    const mag = Math.hypot(fwd, str);
    if (mag > 1) { fwd /= mag; str /= mag; }
    this.moving = mag > 0.08;

    const wantRun = input.run || mag > 0.85;
    this.running = wantRun && this.stamina > 2 && this.moving;
    const speed = this.running ? RUN : WALK;
    if (this.stamina <= 0) this.running = false;
    this.speedNow = this.moving ? speed : 0;

    const dirX = Math.cos(this.dir), dirY = Math.sin(this.dir);
    const rightX = -dirY, rightY = dirX;
    let vx = (dirX * fwd + rightX * str) * speed;
    let vy = (dirY * fwd + rightY * str) * speed;

    // --- asistencia de centrado en el pasillo (si no hay strafe intencionado) ---
    if (this.assist && this.moving && Math.abs(str) < 0.3) {
      const vlen = Math.hypot(vx, vy);
      if (vlen > 0.01) {
        const ux = vx / vlen, uy = vy / vlen;
        const perpX = -uy, perpY = ux;
        const R = 0.3, maxP = 1.3, step = 0.18;
        let l = 0, r = 0;
        while (l < maxP && !w.circleBlocked(this.floor, this.x - perpX * l, this.y - perpY * l, R)) l += step;
        while (r < maxP && !w.circleBlocked(this.floor, this.x + perpX * r, this.y + perpY * r, R)) r += step;
        const diff = r - l;
        if (Math.abs(diff) > 0.15) {
          const corr = Math.min(1.1, Math.abs(diff)) * Math.sign(diff) * speed * 0.45;
          vx += perpX * corr; vy += perpY * corr;
        }
      }
    }

    this.moveWithAssist(vx * dt, vy * dt, w, dt);

    // --- stamina ---
    if (this.running) this.stamina -= 15 * dt;
    else this.stamina += 13 * dt;
    this.stamina = Math.max(0, Math.min(100, this.stamina));

    // --- linterna ---
    if (this.flashOn && this.battery > 0) {
      const drain = this.floor === FL.UNDER ? 1.5 : 0.85;
      this.battery = Math.max(0, this.battery - drain * dt);
      if (this.battery === 0) game.toast?.('⚠ Linterna sin batería', 2.2);
    }

    // --- regeneración leve tras 8 s sin daño ---
    if (this.hurtT > 0) this.hurtT -= dt;
    this.regenT = this.hurtT > 0 ? 0 : this.regenT + dt;
    if (this.regenT > 8 && this.health < 100) this.health = Math.min(100, this.health + 1.6 * dt);

    // --- balanceo de cámara ---
    if (this.moving) {
      this.bob += dt * (this.running ? 11 : 7);
      game.audio?.step(this.running);
    } else this.bob += dt * 1.5;

    // --- si una puerta se cierra encima, expulsa al corredor ---
    const cx = Math.floor(this.x), cy = Math.floor(this.y);
    if (w.isBlocked(this.floor, cx, cy)) {
      const opts = [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]];
      for (const [ox, oy] of opts) {
        if (!w.circleBlocked(this.floor, cx + 0.5 + ox, cy + 0.5 + oy, this.radius)) {
          this.x = cx + 0.5 + ox; this.y = cy + 0.5 + oy; break;
        }
      }
    }
  }

  /**
   * Movimiento con asistencia (4 pasos):
   *  1. intento completo
   *  2. deslizamiento por un eje
   *  3. esquina redondeada: avanza parcialmente en el otro eje
   *  4. empuje lateral para rodear el obstáculo (sólo con asistencia)
   */
  moveWithAssist(dx, dy, w, dt) {
    const r = this.radius;
    const free = (x, y) => !w.circleBlocked(this.floor, x, y, r);
    if (dx === 0 && dy === 0) return;

    if (free(this.x + dx, this.y + dy)) { this.x += dx; this.y += dy; return; }

    let moved = false;
    if (dx !== 0 && free(this.x + dx, this.y)) { this.x += dx; moved = true; }
    if (dy !== 0 && free(this.x, this.y + dy)) { this.y += dy; moved = true; }
    if (moved) return;

    if (!this.assist) return;

    for (const k of [0.65, 0.35]) {
      if (free(this.x + dx, this.y + dy * k)) { this.x += dx; this.y += dy * k; return; }
      if (free(this.x + dx * k, this.y + dy)) { this.x += dx * k; this.y += dy; return; }
    }

    const l = Math.hypot(dx, dy);
    if (l > 1e-6) {
      const px = -dy / l, py = dx / l;
      const push = 3.4 * dt;
      if (free(this.x + px * push, this.y + py * push)) { this.x += px * push; this.y += py * push; }
      else if (free(this.x - px * push, this.y - py * push)) { this.x -= px * push; this.y -= py * push; }
    }
  }

  get bobOffset() {
    const amp = this.running ? 0.014 : 0.007;
    return Math.sin(this.bob) * amp * this.bobScale;
  }
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
