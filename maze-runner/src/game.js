/* =============================================================
   Maze Runner Mobile — bucle de juego, ciclo día/noche y reglas

   v2: de día el peligro es manejable — se puede explorar, mapear
   y recoger objetos sin morir cada minuto. De noche cambia todo:
   sentidos y velocidad de los Grievers se disparan y las puertas
   quedan cerradas. El reloj del HUD cuenta ahora hacia ese
   instante, como el de la película. Además: bitácora de notas
   coleccionables (lore original) y un "aguijonazo" narrativo al
   recibir daño de un Griever.
   ============================================================= */

import { World, T, FL, BIOME } from './world.js';
import { Player } from './player.js';
import { Griever, Item, Flare } from './entities.js';
import { Renderer } from './render3d.js';
import { Minimap } from './minimap.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { dailySeed, randomSeed, seedLabel } from './rng.js';
import * as Store from './storage.js';

export const DAY_LEN = 240;
export const NIGHT_LEN = 120;

const LORE = [
  'Página 1: Desperté sin nombre, solo el eco metálico de la Caja cerrándose sobre mí.',
  'Página 2: Dicen que el Área lleva siglos aquí. Yo llevo tres días y ya no estoy seguro de nada.',
  'Página 3: Los muros se mueven de noche. Lo he visto. Nadie me cree, pero lo he visto.',
  'Página 4: CRUEL no es un nombre, es una promesa. Alguien la escribió con sangre en la piedra.',
  'Página 5: Un Corredor no vuelve dos veces del mismo pasillo. O aprende el patrón, o se queda en él.',
  'Página 6: Soñé con un lugar sin muros. Desperté llorando sin saber por qué.',
  'Página 7: Las puertas se abren cada mañana. Cada mañana, un poco menos de nosotros vuelve a cruzarlas.',
  'Página 8: Si encuentras esto, Corredor: la salida existe. Yo no la encontré. Tú puedes.',
];

const FLASHBACKS = [
  'una voz dice tu nombre… pero no la recuerdas',
  'un pasillo blanco, una puerta, un grito que no es tuyo',
  'el zumbido de una máquina, antes de todo esto',
  'alguien te sostiene la mano. no sabes quién',
  '«CRUEL es bueno». ¿por qué no te lo crees?',
  'el Área ardiendo, en otra vida que no fue la tuya',
];

export class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas, {
      stick: document.getElementById('stick'),
      knob: document.getElementById('stickKnob'),
      btnRun: document.getElementById('btnRun'),
      btnFlash: document.getElementById('btnFlash'),
      btnFlare: document.getElementById('btnFlare'),
      btnAction: document.getElementById('btnAction'),
      btnLookBack: document.getElementById('btnLookBack'),
      btnCam: document.getElementById('btnCam'),
    });
    this.audio = new Sfx();
    this.on = { toast: null, end: null, region: null, sting: null };

    this.hudEl = {
      sectorName: document.getElementById('sectorName'),
      doorState: document.getElementById('doorState'),
      barHealth: document.getElementById('barHealth'),
      barStamina: document.getElementById('barStamina'),
      barBattery: document.getElementById('barBattery'),
      flareCount: document.getElementById('flareCount'),
      clock: document.getElementById('clock'),
      clockLabel: document.getElementById('clockLabel'),
      codesChip: document.getElementById('codesChip'),
      notesChip: document.getElementById('notesChip'),
      cycleChip: document.getElementById('cycleChip'),
      interactHint: document.getElementById('interactHint'),
      damage: document.getElementById('damage'),
      threat: document.getElementById('threat'),
      threatArrow: document.querySelector('#threat .arrow'),
      threatLbl: document.querySelector('#threat .lbl'),
    };

    this.state = 'menu';
    this.world = null;
    this.player = null;
    this.grievers = [];
    this.items = [];
    this.flares = [];
    this.minimap = null;

    this.time = 0;
    this.cycleT = 0;
    this.isNight = false;
    this.dayFactor = 1;
    this.warnStage = 0;
    this.graceTime = 18;
    this.darkAdapt = 0;
    this.adaptMsg = false;
    this.maxSector = 1;
    this.seed = 0;
    this.runName = 'Corredor';
    this.threat = null;
    this.lastRegionLabel = null;
    this.flowT = 0;
    this.hudT = 0;
    this.mmT = 0;
    this.heartT = 0;
    this.damageFlash = 0;
    this.quality = 0.5;

    this._lastTs = 0;
    window.addEventListener('resize', () => this._resizeRenderer());
    requestAnimationFrame((t) => this._frame(t));
  }

  toast(msg, dur = 2.2) { this.on.toast?.(msg, dur); }

  _resizeRenderer() {
    if (!this.canvas) return;
    this.renderer.resize(this.canvas.clientWidth, this.canvas.clientHeight, this.quality);
  }

  /* ---------------------------------------------------------- partida */

  async startRun(opts = {}) {
    this.audio.init();
    this.audio.setEnabled(opts.sound !== false);
    this.runName = (opts.name || 'Corredor').slice(0, 16);
    this.quality = opts.quality || 0.5;
    this._resizeRenderer();

    const cfg = opts.cfg || Store.getConfig();
    this.cfg = cfg;
    let seed;
    if (opts.seedMode === 'manual') {
      seed = (parseInt(opts.seed, 10) >>> 0) || randomSeed();
    } else if (opts.seedMode === 'daily') {
      seed = dailySeed();
      if (cfg && cfg.url && cfg.key) {
        const online = await Store.sbDailySeedRpc(cfg);
        if (online != null) seed = online >>> 0;
        else Store.sbEnsureDaily(cfg, seed);
      }
    } else {
      seed = randomSeed();
    }
    this.seed = seed >>> 0;

    this.world = new World(this.seed);
    this.player = new Player(this.world);
    const settings = Store.getSettings();
    this.player.applySettings(settings);
    this.input.applySettings(settings);
    this.minimap = new Minimap(document.getElementById('minimap'), this.world);

    this.grievers = []; this.items = []; this.flares = [];
    this.spawnEntities();

    this.time = 0; this.cycleT = 0; this.isNight = false; this.dayFactor = 1; this.warnStage = 0;
    this.darkAdapt = 0; this.adaptMsg = false; this.maxSector = 1; this.threat = null; this.lastRegionLabel = null;
    this.input.enabled = true;
    this.input.reset();
    this.state = 'play';
    this.toast(`☀ Encuentra los 3 códigos CRUEL y escapa — semilla ${seedLabel(this.seed)}`, 4.5);
  }

  quit() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.reset();
  }

  pause() { if (this.state === 'play') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'play'; }

  applySettings(settings) {
    this.player?.applySettings(settings);
    this.input.applySettings(settings);
    this.audio.setEnabled(settings.sound !== false);
  }

  /* ---------------------------------------------------------- mundo vivo */

  spawnEntities() {
    const w = this.world;
    for (let s = 1; s <= 8; s++) {
      const b = w.blocks.find((x) => x.sector === s);
      const n = b && b.biome !== BIOME.A ? 2 : 1;
      for (let k = 0; k < n; k++) this._spawnGriever(s, FL.SURFACE);
      this._addItem(s, FL.SURFACE, 'battery');
      this._addItem(s, FL.SURFACE, 'battery');
      this._addItem(s, FL.SURFACE, 'flare');
      if (w.rng.chance(0.75)) this._addItem(s, FL.SURFACE, 'medkit');
    }
    for (let k = 0; k < 7; k++) this._spawnGriever(w.rng.int(9), FL.UNDER);
    for (let k = 0; k < 5; k++) this._addItem(w.rng.int(9), FL.UNDER, 'battery');
    for (let k = 0; k < 3; k++) this._addItem(w.rng.int(9), FL.UNDER, 'flare');
    for (let k = 0; k < 2; k++) this._addItem(w.rng.int(9), FL.UNDER, 'medkit');

    const order = [1, 2, 3, 4, 5, 6, 7, 8];
    w.rng.shuffle(order);
    this._addItem(order[0], FL.SURFACE, 'code');
    this._addItem(order[1], FL.SURFACE, 'code');
    this._addItem(w.rng.int(9), FL.UNDER, 'code');

    // bitácora del corredor: páginas sueltas por el laberinto
    for (let k = 2; k < 8; k++) this._addItem(order[k], FL.SURFACE, 'note');
    this._addItem(w.rng.int(9), FL.UNDER, 'note');
    this._addItem(w.rng.int(9), FL.UNDER, 'note');
  }

  _spawnGriever(region, floor) {
    const c = this.world.randCell(region, floor);
    if (!c) return;
    this.grievers.push(new Griever(c.x, c.y, floor, this.grievers.length));
  }

  _addItem(region, floor, type) {
    const c = this.world.randCell(region, floor);
    if (!c) return;
    this.items.push(new Item(c.x, c.y, floor, type));
  }

  interact() {
    const w = this.world, p = this.player;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const t = w.typeAt(p.floor, cx, cy);
    if (t === T.HATCH_DOWN && p.floor === FL.SURFACE) {
      p.floor = FL.UNDER; this.audio.descend(); this.toast('⬇ Bajas a los túneles CRUEL', 2.4);
    } else if (t === T.HATCH_UP && p.floor === FL.UNDER) {
      p.floor = FL.SURFACE; this.audio.descend(); this.toast('⬆ Subes a la superficie', 2.4);
    } else if (t === T.EXIT) {
      if (p.codes >= 3) this.win();
      else this.toast(`La salida está sellada. Códigos CRUEL: ${p.codes}/3`, 2.6);
    }
  }

  throwFlare() {
    const p = this.player;
    if (p.flares <= 0) return;
    p.flares--;
    const dirX = Math.cos(p.dir), dirY = Math.sin(p.dir);
    this.flares.push(new Flare(p.x + dirX * 0.4, p.y + dirY * 0.4, p.floor, dirX * 4, dirY * 4));
    this.audio.flare();
  }

  pickup(item) {
    const p = this.player;
    switch (item.type) {
      case 'battery': p.battery = Math.min(100, p.battery + 45); this.audio.pickup(); break;
      case 'flare': p.flares++; this.audio.pickup(); break;
      case 'medkit': p.health = Math.min(100, p.health + 35); this.audio.pickup(); break;
      case 'code': p.codes++; this.audio.code(); this.toast(`🔷 Código CRUEL ${p.codes}/3`, 3); break;
      case 'note': {
        const line = LORE[Math.min(p.notes, LORE.length - 1)];
        p.notes++;
        p.loreLog = p.loreLog || [];
        p.loreLog.push(line);
        this.audio.code();
        this.toast(`📖 ${line}`, 5.5);
        break;
      }
      default: break;
    }
    item.taken = true;
  }

  damagePlayer(n, kx = 0, ky = 0) {
    const p = this.player;
    if (p.health <= 0) return;
    p.health = Math.max(0, p.health - n);
    p.hurtT = 8; p.regenT = 0;
    this.damageFlash = 1;
    this.audio.hurt();
    const w = this.world;
    const nx = p.x - kx * 0.3, ny = p.y - ky * 0.3;
    if (!w.circleBlocked(p.floor, nx, p.y, p.radius)) p.x = nx;
    if (!w.circleBlocked(p.floor, p.x, ny, p.radius)) p.y = ny;
    // "aguijonazo": un destello de memoria, como en la película
    const line = FLASHBACKS[(Math.random() * FLASHBACKS.length) | 0];
    this.on.sting?.(line);
    this.toast(`⚡ ${line}…`, 2.6);
  }

  win() {
    if (this.state !== 'play') return;
    this.state = 'win';
    this.input.enabled = false;
    this.audio.win();
    const entry = { name: this.runName, time: this.time, sector: this.maxSector, date: new Date().toISOString().slice(0, 10) };
    Store.addScore(entry);
    if (this.cfg && this.cfg.url && this.cfg.key) Store.sbSubmit(this.cfg, entry);
    this.on.end?.('win', { time: this.time, sector: this.maxSector, notes: this.player.notes, mapped: this.minimap?.percentExplored() ?? 0 });
  }

  die() {
    if (this.state !== 'play') return;
    this.state = 'dead';
    this.input.enabled = false;
    this.audio.lose();
    this.on.end?.('dead', { time: this.time, sector: this.maxSector, notes: this.player.notes, mapped: this.minimap?.percentExplored() ?? 0 });
  }

  /* ---------------------------------------------------------- bucle */

  _frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - (this._lastTs || ts)) / 1000));
    this._lastTs = ts;
    if (this.state === 'play') this.update(dt);
    if (this.world) this.renderer.render(this);
    if (this.state === 'play') this.updateHud(dt);
    requestAnimationFrame((t) => this._frame(t));
  }

  update(dt) {
    this.time += dt;
    this.threat = null;
    const p = this.player, w = this.world;

    this.input.pollKeyboard();
    if (this.input.consume('flash')) { p.flashOn = !p.flashOn; this.audio.click(); }
    if (this.input.consume('flare')) this.throwFlare();
    if (this.input.consume('use')) this.interact();
    if (this.input.consume('camToggle')) {
      const mode = this.renderer.toggleCameraMode();
      this.toast(mode === 'third' ? '🎥 Cámara en tercera persona' : '🎥 Cámara en primera persona', 1.6);
    }

    p.update(dt, this.input, this);
    this.updateCycle(dt);

    // adaptación a la oscuridad: apagar la linterna recompensa con visión corta
    const dark = !p.flashOn || p.battery <= 0;
    this.darkAdapt = Math.max(0, Math.min(1, this.darkAdapt + (dark ? dt / 3.5 : -dt / 1.2)));
    if (this.darkAdapt >= 0.97 && !this.adaptMsg) { this.adaptMsg = true; this.toast('👁 Tus ojos se adaptan a la oscuridad', 2.6); }
    if (!dark) this.adaptMsg = false;

    // campo de flujo compartido (BFS) hacia el jugador — radio grande: pasillos de 3u
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.35; w.computeFlow(p.floor, p.x, p.y, 70); }

    for (const g of this.grievers) g.update(dt, this);

    for (const it of this.items) {
      if (it.taken) continue;
      it.update(dt);
      if (it.floor === p.floor && Math.hypot(it.x - p.x, it.y - p.y) < 0.9) this.pickup(it);
    }

    for (const fl of this.flares) fl.update(dt, w);
    this.flares = this.flares.filter((fl) => !fl.dead);

    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.12; this.minimap.reveal(this); this.minimap.draw(this); }

    const region = w.regionAt(p.floor, p.x, p.y);
    if (p.floor === FL.SURFACE && region >= 1) this.maxSector = Math.max(this.maxSector, region);
    const label = w.regionLabel(p.floor, p.x, p.y);
    if (label !== this.lastRegionLabel) { this.lastRegionLabel = label; this.on.region?.(label); }

    if (p.health < 35 && p.health > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.audio.heart(); this.heartT = 0.7 + p.health / 60; }
    }

    if (p.health <= 0) this.die();
  }

  updateCycle(dt) {
    const total = DAY_LEN + NIGHT_LEN;
    this.cycleT += dt;
    if (this.cycleT >= total) this.cycleT -= total;
    const night = this.cycleT >= DAY_LEN;
    if (night !== this.isNight) {
      this.isNight = night;
      for (const d of this.world.doors) d.target = night ? 0 : 1;
      this.audio.door(night);
      this.toast(night ? '☾ ANOCHECE — las puertas grandes se cierran. No hay refugio fuera de El Área.' : '☀ Amanece: las puertas se abren de nuevo', 3.5);
      this.warnStage = 0;
    }
    if (!this.isNight) {
      const left = DAY_LEN - this.cycleT;
      if (this.warnStage === 0 && left < 60) { this.warnStage = 1; this.toast('⚠ Queda un minuto: busca refugio antes de que anochezca', 3); }
      else if (this.warnStage === 1 && left < 20) { this.warnStage = 2; this.toast('⚠ ¡Las puertas se cierran en 20 s!', 2.8); }
    }

    const fade = 15;
    if (this.cycleT < DAY_LEN - fade) this.dayFactor = 1;
    else if (this.cycleT < DAY_LEN) this.dayFactor = 1 - ((this.cycleT - (DAY_LEN - fade)) / fade) * 0.82;
    else if (this.cycleT < total - fade) this.dayFactor = 0.18;
    else this.dayFactor = 0.18 + ((this.cycleT - (total - fade)) / fade) * 0.82;

    for (const d of this.world.doors) {
      if (d.open === d.target) continue;
      const speed = 0.4 * dt;
      if (d.open < d.target) d.open = Math.min(d.target, d.open + speed);
      else d.open = Math.max(d.target, d.open - speed);
    }
  }

  updateHud(dt) {
    this.hudT -= dt;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 4);
    if (this.hudEl.damage) this.hudEl.damage.style.opacity = String(this.damageFlash);
    if (this.hudT > 0) return;
    this.hudT = 0.1;

    const p = this.player, w = this.world, e = this.hudEl;
    const total = DAY_LEN + NIGHT_LEN;
    if (e.sectorName) e.sectorName.textContent = w.regionLabel(p.floor, p.x, p.y);
    if (e.doorState) {
      const anyClosing = this.world.doors.some((d) => d.open < 0.9);
      e.doorState.textContent = this.isNight ? 'Puertas cerradas' : (anyClosing ? 'Puertas abriéndose…' : 'Puertas abiertas');
    }
    if (e.barHealth) e.barHealth.style.width = `${Math.max(0, p.health)}%`;
    if (e.barStamina) e.barStamina.style.width = `${Math.max(0, p.stamina)}%`;
    if (e.barBattery) e.barBattery.style.width = `${Math.max(0, p.battery)}%`;
    if (e.flareCount) e.flareCount.textContent = `x${p.flares}`;

    // reloj: cuenta atrás hasta el próximo cambio de ciclo (como en la película)
    const secsLeft = Math.max(0, Math.ceil(this.isNight ? total - this.cycleT : DAY_LEN - this.cycleT));
    if (e.clock) {
      e.clock.textContent = `${String((secsLeft / 60) | 0).padStart(2, '0')}:${String(secsLeft % 60).padStart(2, '0')}`;
      e.clock.classList.toggle('urgent', !this.isNight && secsLeft < 20);
    }
    if (e.clockLabel) e.clockLabel.textContent = this.isNight ? 'Amanece en' : 'Anochece en';
    if (e.codesChip) e.codesChip.textContent = `Códigos ${p.codes}/3`;
    if (e.notesChip) {
      e.notesChip.classList.toggle('hidden', !p.notes);
      if (p.notes) e.notesChip.textContent = `📖 ${p.notes}/8`;
    }
    if (e.cycleChip) e.cycleChip.textContent = this.isNight ? '☾ Noche' : '☀ Día';

    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const ct = w.typeAt(p.floor, cx, cy);
    let hint = '';
    if (ct === T.HATCH_DOWN) hint = 'Pulsa ⚡ para bajar al subsuelo';
    else if (ct === T.HATCH_UP) hint = 'Pulsa ⚡ para subir a la superficie';
    else if (ct === T.EXIT) hint = p.codes >= 3 ? 'Pulsa ⚡ para escapar' : `Salida sellada (códigos ${p.codes}/3)`;
    if (e.interactHint) { e.interactHint.textContent = hint; e.interactHint.classList.toggle('hidden', !hint); }

    if (e.threat) {
      if (this.threat) {
        const dx = this.threat.x - p.x, dy = this.threat.y - p.y;
        const rel = Math.atan2(dy, dx) - p.dir;
        if (e.threatArrow) e.threatArrow.style.transform = `rotate(${rel}rad)`;
        if (e.threatLbl) e.threatLbl.textContent = this.threat.d < 8 ? '¡ENCIMA!' : 'TE PERSIGUE';
        e.threat.classList.remove('hidden');
        e.threat.classList.toggle('near', this.threat.d < 8);
      } else {
        e.threat.classList.add('hidden');
      }
    }
  }
}
