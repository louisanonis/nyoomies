// Tiny synthesized sound layer (WebAudio, no asset files).

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
  }

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    gain.gain.value = 0.0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, filter, gain };
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => { e.osc.stop(); e.osc2.stop(); }, 300);
    this.engine = null;
  }

  setEngine(speed, boosting, alive) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const f = 40 + speed * 0.13;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.5 + 2, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(boosting ? 1800 : 700, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(alive ? 0.08 : 0, t, 0.08);
  }

  blip(freq = 660, dur = 0.08, type = 'square', vol = 0.15, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur = 0.4, vol = 0.3, freq = 1200) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  play(name) {
    switch (name) {
      case 'count': return this.blip(440, 0.15, 'square', 0.12);
      case 'go': return this.blip(880, 0.35, 'square', 0.15);
      case 'gate': return this.blip(990, 0.07, 'triangle', 0.12, 300);
      case 'lap': this.blip(660, 0.1, 'triangle', 0.15); return setTimeout(() => this.blip(990, 0.15, 'triangle', 0.15), 90);
      case 'shatter': return this.noise(0.6, 0.35, 2500);
      case 'kill': return this.blip(300, 0.25, 'sawtooth', 0.12, 600);
      case 'pickup': return this.blip(1200, 0.08, 'sine', 0.15, 500);
      case 'pad': return this.blip(200, 0.2, 'sawtooth', 0.08, 400);
      case 'ability': return this.blip(520, 0.18, 'sawtooth', 0.1, -300);
      case 'shield': return this.blip(1500, 0.2, 'sine', 0.15, -900);
      case 'hop': return this.blip(400, 0.15, 'triangle', 0.15, 600);
      case 'click': return this.blip(1000, 0.04, 'square', 0.06);
      case 'buy': return this.blip(1300, 0.12, 'triangle', 0.12, 400);
      case 'bad': return this.blip(180, 0.3, 'sawtooth', 0.12, -100);
      default: return undefined;
    }
  }
}
