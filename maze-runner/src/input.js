/* =============================================================
   Maze Runner Mobile — Entrada: táctil (joystick + arrastre),
   teclado y ratón con pointer lock. Sensibilidad/zona muerta/
   invertir Y configurables (ajustes de cámara).
   ============================================================= */

export class Input {
  constructor(canvas, els = {}) {
    this.canvas = canvas;
    this.els = els;
    this.moveX = 0; this.moveY = 0;
    this.run = false;
    this.lookX = 0; this.lookY = 0;
    this.press = { flash: false, flare: false, use: false, lookBack: false, camToggle: false };
    this.keys = new Set();
    this.stickId = null;
    this.lookId = null;

    // ajustes de cámara (configurables desde la UI)
    this.sens = 1.0;
    this.invertY = false;
    this.deadZone = 0.14;
    this.response = 0.7;      // 0..1: 1 = instantáneo, menos = más suave

    this.runToggle = false;
    this.enabled = false;
    this.onPause = null;
    this.onToggleMap = null;
    this._bind();
  }

  applySettings(s = {}) {
    if (typeof s.sens === 'number') this.sens = Math.max(0.3, Math.min(2.5, s.sens));
    if (typeof s.invertY === 'boolean') this.invertY = s.invertY;
  }

  _bind() {
    const cv = this.canvas;

    cv.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      cv.setPointerCapture?.(e.pointerId);
      const rect = cv.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      if (px < rect.width * 0.45 && this.stickId === null) {
        this.stickId = e.pointerId;
        this.stickOrigin = { x: px, y: py };
        this.moveX = 0; this.moveY = 0;
        if (this.els.stick) {
          this.els.stick.style.display = 'block';
          this.els.stick.style.left = px + 'px';
          this.els.stick.style.top = py + 'px';
          this._setKnob(0, 0);
        }
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookPrev = { x: e.clientX, y: e.clientY };
      }
      e.preventDefault();
    }, { passive: false });

    const move = (e) => {
      if (!this.enabled) return;
      if (e.pointerId === this.stickId && this.stickOrigin) {
        const rect = cv.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        let dx = px - this.stickOrigin.x, dy = py - this.stickOrigin.y;
        const R = 52;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        const nd = Math.min(1, d / R);
        if (nd < this.deadZone) { this.moveX = 0; this.moveY = 0; }
        else {
          const k = (nd - this.deadZone) / (1 - this.deadZone) / (nd || 1);
          this.moveX = (dx / R) * k; this.moveY = (dy / R) * k;
        }
        this._setKnob(dx, dy);
      } else if (e.pointerId === this.lookId && this.lookPrev) {
        const TOUCH_SENS = 0.0022;
        this.lookX += (e.clientX - this.lookPrev.x) * TOUCH_SENS * this.sens * 1.6;
        const dy = (e.clientY - this.lookPrev.y) * TOUCH_SENS * this.sens * 1.1;
        this.lookY += this.invertY ? dy : -dy;
        this.lookPrev = { x: e.clientX, y: e.clientY };
      }
      e.preventDefault();
    };
    cv.addEventListener('pointermove', move, { passive: false });
    cv.addEventListener('pointerup', (e) => this._up(e), { passive: false });
    cv.addEventListener('pointercancel', (e) => this._up(e), { passive: false });
    // red de seguridad: si el SO se traga el pointerup/cancel del canvas (gesto
    // del sistema, cambio de app, captura perdida…) el stick se quedaba "pegado"
    // para siempre — ningún toque nuevo lo liberaba porque stickId ya no era null.
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    window.addEventListener('blur', () => this._releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._releaseAll(); });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // no interceptar atajos de juego mientras se escribe en un campo de texto
      // (nombre del corredor, semilla manual, URL/clave de Supabase…)
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.press.flash = true;
      if (e.code === 'KeyG') this.press.flare = true;
      if (e.code === 'KeyE' || e.code === 'Space') this.press.use = true;
      if (e.code === 'KeyQ' || e.code === 'KeyC') this.press.lookBack = true;
      if (e.code === 'KeyV') this.press.camToggle = true;
      if (e.code === 'Escape' && this.onPause) this.onPause();
      if (e.code === 'KeyM' && this.onToggleMap) this.onToggleMap();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); });

    // ratón + pointer lock
    cv.addEventListener('click', () => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== cv && window.matchMedia('(pointer:fine)').matches) {
        cv.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === cv) {
        const MOUSE_SENS = 0.0014;
        this.lookX += e.movementX * MOUSE_SENS * this.sens;
        const dy = e.movementY * MOUSE_SENS * this.sens * 0.7;
        this.lookY += this.invertY ? dy : -dy;
      }
    });

    // botones táctiles
    const bind = (el, key, toggle) => {
      if (!el) return;
      const down = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (toggle) { this.runToggle = !this.runToggle; el.classList.toggle('on', this.runToggle); }
        else this.press[key] = true;
      };
      el.addEventListener('pointerdown', down, { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bind(this.els.btnRun, null, true);
    bind(this.els.btnFlash, 'flash', false);
    bind(this.els.btnFlare, 'flare', false);
    bind(this.els.btnAction, 'use', false);
    bind(this.els.btnLookBack, 'lookBack', false);
    bind(this.els.btnCam, 'camToggle', false);
  }

  _up(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = null; this.moveX = 0; this.moveY = 0;
      if (this.els.stick) this.els.stick.style.display = 'none';
    }
    if (e.pointerId === this.lookId) { this.lookId = null; this.lookPrev = null; }
  }

  /** Suelta el stick/mirada sin esperar al evento del navegador — ver _bind(). */
  _releaseAll() {
    this.stickId = null; this.lookId = null; this.lookPrev = null;
    this.moveX = 0; this.moveY = 0;
    if (this.els.stick) this.els.stick.style.display = 'none';
  }

  _setKnob(dx, dy) {
    if (!this.els.knob) return;
    this.els.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Teclado -> joystick virtual (desktop). */
  pollKeyboard() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (x || y) {
      const d = Math.hypot(x, y);
      this.moveX = x / d; this.moveY = y / d;
    } else if (this.stickId === null) {
      this.moveX = 0; this.moveY = 0;
    }
    if (k.has('ShiftLeft') || k.has('ShiftRight')) this.run = true;
    else this.run = this.runToggle;
  }

  consumeLookX() { const v = this.lookX * this.response; this.lookX -= v; return v; }
  consumeLookY() { const v = this.lookY * this.response; this.lookY -= v; return v; }
  consume(k) { const v = this.press[k]; this.press[k] = false; return v; }

  reset() {
    // además de los acumuladores: suelta cualquier stick/mirada que se haya
    // quedado "pegado" de la partida anterior (ver _releaseAll más arriba).
    this._releaseAll();
    this.lookX = this.lookY = 0;
    this.run = false; this.runToggle = false;
    this.press.flash = this.press.flare = this.press.use = false;
    if (this.els.btnRun) this.els.btnRun.classList.remove('on');
  }
}
