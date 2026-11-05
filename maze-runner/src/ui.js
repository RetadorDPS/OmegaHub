/* =============================================================
   Maze Runner Mobile — Interfaz (menús, HUD, ranking, ajustes)
   ============================================================= */

import * as Store from './storage.js';
import { seedLabel } from './rng.js';

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function runnerRank(kind, data) {
  const notes = data.notes || 0, mapped = data.mapped || 0;
  if (kind === 'win') {
    if (data.time < 200 && notes >= 4) return '🏆 Corredor Legendario';
    if (data.sector >= 6 || mapped > 0.55) return '⭐ Corredor Veterano';
    return '🏃 Corredor de El Área';
  }
  if (data.sector >= 5 || mapped > 0.4) return '💀 Casi lo logras — Corredor Caído';
  return '🔰 Novato del Laberinto';
}

export class UI {
  constructor(game) {
    this.game = game;
    this.el = (id) => document.getElementById(id);
    this.panels = ['panelTitle', 'panelHelp', 'panelScores', 'panelPause', 'panelEnd', 'panelMap', 'panelLore'];
    this.seedMode = 'daily';
    this.lastOpts = null;
    this.toastTimer = null;

    const savedName = Store.getName();
    if (savedName && this.el('inpName')) this.el('inpName').value = savedName;

    if (window.matchMedia('(pointer: coarse)').matches) this.el('touch').classList.remove('hidden');

    this.bind();
    this.loadCfg();
    this.bindSettings();
    this.showPanel('panelTitle');

    game.on.toast = (m, d) => this.toast(m, d);
    game.on.end = (kind, data) => this.showEnd(kind, data);
    game.on.sting = () => this.sting();
    game.input.onPause = () => this.togglePause();
    game.input.onToggleMap = () => this.openMap();
  }

  /** Pausa la partida y muestra un panel por encima (mapa, bitácora…). */
  pauseInto(panel) {
    const g = this.game;
    this._cameFrom = g.state;
    if (g.state === 'play') g.pause();
    this.showPanel(panel);
  }

  resumeFromOverlay() {
    this.game.resume();
    this.showPanel(null);
  }

  openMap() {
    this.renderBigMap();
    this.pauseInto('panelMap');
  }

  openLore() {
    this.renderLore();
    this.pauseInto('panelLore');
  }

  renderBigMap() {
    const g = this.game, mm = g.minimap, big = this.el('mapBig');
    if (!mm || !big) return;
    const origCv = mm.cv, origCtx = mm.ctx;
    mm.cv = big; mm.ctx = big.getContext('2d');
    mm.draw(g, { labels: true });
    mm.cv = origCv; mm.ctx = origCtx;
    const pct = Math.round(mm.percentExplored() * 100);
    this.el('mapPct').textContent = `${pct}% cartografiado`;
  }

  renderLore() {
    const log = this.game.player?.loreLog || [];
    const el = this.el('loreList');
    if (!el) return;
    if (!log.length) { el.innerHTML = '<div class="tiny-note">Aún no has encontrado ninguna página. Están repartidas por los sectores y el subsuelo.</div>'; return; }
    el.innerHTML = log.map((line) => `<div class="lore-entry">${escapeHtml(line)}</div>`).join('');
  }

  sting() {
    const el = this.el('sting');
    if (!el) return;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._stingTimer);
    this._stingTimer = setTimeout(() => el.classList.remove('show'), 900);
  }

  /* ---------------------------------------------------------- paneles */

  showPanel(name) {
    for (const p of this.panels) this.el(p).classList.toggle('hidden', p !== name);
    this.el('menus').classList.toggle('hidden', !name);
    this.el('hud').classList.toggle('hidden', !!name);
    if (name) this.el('rotate').classList.remove('armed');
  }

  /* ---------------------------------------------------------- eventos */

  bind() {
    const g = this.game;

    for (const chip of document.querySelectorAll('#seedModes .chip')) {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#seedModes .chip').forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        this.seedMode = chip.dataset.mode;
        this.el('inpSeed').classList.toggle('hidden', this.seedMode !== 'manual');
      });
    }

    this.el('btnStart').addEventListener('click', () => this.start('random'));
    this.el('btnHelp').addEventListener('click', () => this.showPanel('panelHelp'));
    this.el('btnScores').addEventListener('click', () => { this.renderScores('scoreList'); this.showPanel('panelScores'); });
    for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => this.showPanel('panelTitle'));
    for (const b of document.querySelectorAll('[data-resume]')) b.addEventListener('click', () => this.resumeFromOverlay());

    this.el('minimapWrap')?.addEventListener('click', () => this.openMap());
    this.el('btnLore')?.addEventListener('click', () => this.openLore());

    this.el('btnRefreshScores')?.addEventListener('click', () => this.renderScores('scoreList'));
    this.el('btnClearScores')?.addEventListener('click', () => { Store.clearScores(); this.renderScores('scoreList'); });

    this.el('btnSaveCfg').addEventListener('click', () => {
      const cfg = { url: this.el('inpUrl').value.trim(), key: this.el('inpKey').value.trim() };
      Store.setConfig(cfg);
      this.cfgStatus(cfg.url ? 'Guardado ✓' : 'Desconectado (ranking sólo local)');
    });
    this.el('btnTestCfg').addEventListener('click', async () => {
      const cfg = { url: this.el('inpUrl').value.trim(), key: this.el('inpKey').value.trim() };
      this.cfgStatus('Probando…');
      const top = await Store.sbTop(cfg, 3);
      this.cfgStatus(top ? `Conectado ✓ (${top.length} filas)` : 'Sin conexión o sin tablas ✗');
    });

    this.el('btnFull')?.addEventListener('click', () => this.toggleFullscreen());
    this.el('btnPause').addEventListener('click', () => this.togglePause());
    this.el('btnResume').addEventListener('click', () => { g.resume(); this.showPanel(null); });
    this.el('btnRestart').addEventListener('click', () => { this.showPanel(null); this.start('same'); });
    this.el('btnQuit').addEventListener('click', () => { g.quit(); this.showPanel('panelTitle'); });

    this.el('btnAgain').addEventListener('click', () => { this.showPanel(null); this.start('same'); });
    this.el('btnNewSeed').addEventListener('click', () => { this.showPanel(null); this.start('random'); });
    this.el('btnMenu').addEventListener('click', () => { g.quit(); this.showPanel('panelTitle'); });

    this.el('btnRotSkip')?.addEventListener('click', () => this.el('rotate').classList.remove('armed'));
  }

  bindSettings() {
    const s = Store.getSettings();
    this.el('rngSens').value = s.sens;
    this.el('sensVal').textContent = Number(s.sens).toFixed(1);
    this.el('chkInvert').checked = !!s.invertY;
    this.el('chkAssist').checked = s.assist !== false;
    this.el('rngBob').value = s.bob;
    this.el('bobVal').textContent = `${Math.round(s.bob * 100)}%`;
    this.el('chkSound').checked = s.sound !== false;

    const apply = () => {
      const st = {
        sens: parseFloat(this.el('rngSens').value),
        invertY: this.el('chkInvert').checked,
        assist: this.el('chkAssist').checked,
        bob: parseFloat(this.el('rngBob').value),
        sound: this.el('chkSound').checked,
      };
      Store.saveSettings(st);
      this.el('sensVal').textContent = st.sens.toFixed(1);
      this.el('bobVal').textContent = `${Math.round(st.bob * 100)}%`;
      this.game.applySettings(st);
    };
    ['rngSens', 'chkInvert', 'chkAssist', 'rngBob', 'chkSound'].forEach((id) => this.el(id)?.addEventListener('input', apply));
  }

  cfgStatus(t) {
    const s = this.el('cfgStatus');
    if (!s) return;
    s.textContent = t;
    clearTimeout(this._cfgTimer);
    this._cfgTimer = setTimeout(() => { if (s.textContent === t) s.textContent = ''; }, 3500);
  }

  loadCfg() {
    const cfg = Store.getConfigSaved();
    this.el('inpUrl').value = cfg.url || '';
    this.el('inpKey').value = cfg.key || '';
  }

  toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.()
          .then(() => { screen.orientation?.lock?.('landscape').catch(() => {}); })
          .catch(() => {});
      } else {
        document.exitFullscreen?.();
      }
    } catch { /* no soportado en este navegador */ }
  }

  /* ---------------------------------------------------------- partida */

  start(mode) {
    const name = (this.el('inpName').value || 'Corredor').slice(0, 16);
    Store.setName(name);
    const quality = parseFloat(this.el('selQuality').value);
    const sound = this.el('chkSound').checked;

    let seedMode, seed;
    if (mode === 'same' && this.lastOpts) {
      seedMode = this.lastOpts.seedMode; seed = this.lastOpts.seed;
    } else {
      seedMode = this.seedMode;
      seed = parseInt(this.el('inpSeed').value, 10) || 0;
    }
    const opts = { name, seedMode, seed, quality, sound, cfg: Store.getConfig() };
    this.lastOpts = opts;
    this.showPanel(null);
    this.toggleFullscreenOnStart();
    this.game.startRun(opts);
  }

  toggleFullscreenOnStart() {
    try {
      document.documentElement.requestFullscreen?.()
        .then(() => { screen.orientation?.lock?.('landscape').catch(() => {}); })
        .catch(() => {});
    } catch { /* ignorar */ }
    if (window.matchMedia('(orientation: portrait)').matches && window.matchMedia('(pointer: coarse)').matches) {
      this.el('rotate').classList.add('armed');
    }
  }

  togglePause() {
    const g = this.game;
    if (g.state === 'play') {
      g.pause();
      this.el('pauseStats').innerHTML = `
        <div class="stat"><div class="k">TIEMPO</div><div class="v">${fmt(g.time)}</div></div>
        <div class="stat"><div class="k">SECTOR</div><div class="v">${g.maxSector}</div></div>
        <div class="stat"><div class="k">CÓDIGOS</div><div class="v">${g.player.codes}/3</div></div>
        <div class="stat"><div class="k">SEMILLA</div><div class="v">${seedLabel(g.seed)}</div></div>`;
      this.showPanel('panelPause');
    } else if (g.state === 'paused') {
      g.resume();
      this.showPanel(null);
    }
  }

  showEnd(kind, data) {
    const g = this.game, win = kind === 'win';
    this.el('endTitle').textContent = win ? '🟢 ¡HAS ESCAPADO DEL LABERINTO!' : '☠ TE HAN ATRAPADO';
    this.el('endArt').classList.toggle('win', win);
    const rank = this.el('endRank');
    if (rank) rank.textContent = runnerRank(kind, data);
    this.el('endBody').innerHTML = `
      <div class="stats">
        <div class="stat"><div class="k">CORREDOR</div><div class="v">${escapeHtml(g.runName)}</div></div>
        <div class="stat"><div class="k">TIEMPO</div><div class="v">${fmt(data.time)}</div></div>
        <div class="stat"><div class="k">SECTOR</div><div class="v">${data.sector}/8</div></div>
        <div class="stat"><div class="k">CÓDIGOS</div><div class="v">${g.player.codes}/3</div></div>
        <div class="stat"><div class="k">BITÁCORA</div><div class="v">${data.notes || 0}/8</div></div>
        <div class="stat"><div class="k">CARTOGRAFIADO</div><div class="v">${Math.round((data.mapped || 0) * 100)}%</div></div>
      </div>
      <div class="tiny-note">Semilla: ${seedLabel(g.seed)}${win ? '' : ' — reinténtala con «Repetir semilla»'}</div>`;
    this.renderScores('endScores');
    this.showPanel('panelEnd');
  }

  async renderScores(containerId) {
    const el = this.el(containerId);
    if (!el) return;
    const local = Store.getScores().slice(0, 10);
    let html = '';
    if (!local.length) html += '<div class="tiny-note">Sin registros locales todavía.</div>';
    local.forEach((s, i) => {
      html += `<div class="score-row"><span class="pos">${i + 1}</span><span>${escapeHtml(s.name)}</span><span class="t">${fmt(s.time)}</span><span class="d">Sect. ${s.sector || '-'}</span></div>`;
    });
    const cfg = Store.getConfig();
    if (cfg.url && cfg.key) {
      html += '<div class="tiny-note" style="margin-top:8px">ONLINE · SUPABASE</div>';
      const top = await Store.sbTop(cfg, 10);
      if (top && top.length) {
        top.forEach((s, i) => {
          html += `<div class="score-row"><span class="pos">${i + 1}</span><span>${escapeHtml(s.username || '—')}</span><span class="t">${fmt(s.escape_time_seconds)}</span><span class="d">Sect. ${s.sector_reached || '-'}</span></div>`;
        });
      } else {
        html += '<div class="tiny-note">Sin datos online todavía.</div>';
      }
    }
    el.innerHTML = html;
  }

  /* ---------------------------------------------------------- toast */

  toast(msg, dur = 2) {
    const t = this.el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), dur * 1000);
  }
}
