/* =============================================================
   Maze Runner Mobile — Audio procedural (WebAudio, sin assets)
   ============================================================= */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.lastGrowl = 0;
    this.lastStep = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const n = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.55 : 0;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  tone(freq, dur, type = 'sine', gain = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, freq = 800, gain = 0.15, q = 1, sweepTo = null, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.t + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  step(running) {
    const now = performance.now();
    const gap = running ? 300 : 470;
    if (now - this.lastStep < gap) return;
    this.lastStep = now;
    this.noise(0.09, running ? 340 : 240, running ? 0.10 : 0.06, 1.4, 120);
  }

  growl(vol) {
    const now = performance.now();
    if (now - this.lastGrowl < 1400 || vol <= 0.02) return;
    this.lastGrowl = now;
    this.tone(58 + Math.random() * 18, 0.75, 'sawtooth', 0.10 * vol, 38);
    this.noise(0.7, 220, 0.09 * vol, 0.8, 90);
  }

  door(closing) {
    this.noise(1.1, closing ? 260 : 180, 0.16, 0.7, closing ? 70 : 420);
    this.tone(closing ? 70 : 52, 1.0, 'square', 0.06, closing ? 40 : 90);
  }

  pickup() { this.tone(660, 0.10, 'triangle', 0.16); this.tone(990, 0.12, 'triangle', 0.12, null, 0.07); }
  code() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.14, null, i * 0.09)); }
  hurt() { this.noise(0.35, 900, 0.22, 0.6, 120); this.tone(140, 0.32, 'sawtooth', 0.14, 60); }
  heart() { this.tone(52, 0.16, 'sine', 0.22, 34); this.tone(46, 0.18, 'sine', 0.16, 30, 0.20); }
  flare() { this.noise(0.5, 1800, 0.12, 0.5, 500); this.tone(880, 0.25, 'triangle', 0.08, 1600); }
  descend() { this.tone(300, 0.9, 'sine', 0.12, 70); this.noise(0.9, 500, 0.10, 0.6, 90); }
  win() { [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.16, null, i * 0.14)); }
  lose() { [330, 262, 220, 165].forEach((f, i) => this.tone(f, 0.6, 'sawtooth', 0.14, null, i * 0.20)); }
  click() { this.tone(520, 0.05, 'square', 0.08); }
}
