// Tiny WebAudio synth — no audio files to load, no assets to host. Everything
// is a couple of oscillators and an envelope.

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.master = null;
    this._chimeStep = 0;
  }

  /** Must be called from a real user gesture or the browser won't allow audio. */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  }

  setEnabled(on) {
    this.on = on;
    if (this.master) this.master.gain.value = on ? 0.32 : 0;
  }

  /** A couple of seconds of white noise, made once and reused for every bang. */
  _noise() {
    if (this._noiseBuf) return this._noiseBuf;
    const n = Math.floor(this.ctx.sampleRate * 1.2);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  /** Filtered noise with an envelope — thumps, whooshes, crunches. */
  _burst({ dur = 0.3, gain = 0.3, from = 1800, to = 120, q = 1, type = 'lowpass', delay = 0 } = {}) {
    if (!this.ctx || !this.on) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    src.playbackRate.value = 1;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(from, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(env).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  _blip(freq, { type = 'sine', dur = 0.18, gain = 0.5, slide = 0, delay = 0, attack = 0.006 } = {}) {
    if (!this.ctx || !this.on) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Each jump in a chain sounds a little higher and a little softer. */
  jump(index = 0) {
    const n = Math.min(index, 4);
    this._blip(430 * Math.pow(1.16, n), {
      type: 'triangle', dur: 0.15 - n * 0.012,
      gain: 0.32 * Math.pow(0.82, n), slide: 260 - n * 30,
    });
  }
  /** The airy tick of a spent jump easing the fall. */
  flutter() {
    this._blip(880, { type: 'sine', dur: 0.13, gain: 0.09, slide: -180 });
  }
  land() {
    this._blip(150, { type: 'sine', dur: 0.10, gain: 0.22, slide: -60 });
    this._burst({ dur: 0.09, gain: 0.10, from: 900, to: 160 });
  }
  /** Mushroom: a springy thwang plus the woof of being flung. */
  bounce() {
    this._blip(260, { type: 'square', dur: 0.11, gain: 0.16, slide: 620 });
    this._blip(560, { type: 'sine',   dur: 0.30, gain: 0.22, slide: 620, delay: 0.04 });
    this._burst({ dur: 0.34, gain: 0.14, from: 500, to: 2600, type: 'bandpass', q: 0.7, delay: 0.02 });
  }
  splash() {
    this._blip(320, { type: 'sine', dur: 0.3, gain: 0.2, slide: -220 });
    this._burst({ dur: 0.34, gain: 0.16, from: 2600, to: 300 });
  }

  // ---- the fly-around -------------------------------------------------

  /** Corkscrew: a rising whoosh with a little sparkle on top. */
  spin() {
    this._burst({ dur: 0.5, gain: 0.24, from: 320, to: 3400, type: 'bandpass', q: 1.4 });
    [0, 0.06, 0.12, 0.18].forEach((d, i) =>
      this._blip(520 * Math.pow(1.26, i), { type: 'triangle', dur: 0.16, gain: 0.10, delay: d }));
  }
  /** Something in the scenery coming apart. */
  smash() {
    this._burst({ dur: 0.26, gain: 0.26, from: 2400, to: 180 });
    this._blip(110, { type: 'square', dur: 0.12, gain: 0.10, slide: -60 });
  }
  /** A bird, knocked politely out of the sky. */
  birdHit() {
    this._burst({ dur: 0.2, gain: 0.16, from: 3200, to: 900, type: 'bandpass', q: 1.2 });
    this._blip(1250, { type: 'sine', dur: 0.22, gain: 0.16, slide: -700 });
    this._blip(880,  { type: 'sine', dur: 0.26, gain: 0.12, slide: -420, delay: 0.05 });
  }
  /** Clobbering one of the neighbours: a big daft fanfare, no malice. */
  npcHit() {
    this._burst({ dur: 0.42, gain: 0.30, from: 2800, to: 140 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._blip(f, { type: 'triangle', dur: 0.42, gain: 0.20, delay: i * 0.055 }));
    this._blip(160, { type: 'sine', dur: 0.4, gain: 0.16, slide: -90 });
  }
  /** Someone says hello. */
  talk() {
    this._blip(680, { type: 'triangle', dur: 0.09, gain: 0.11, slide: 180 });
    this._blip(920, { type: 'triangle', dur: 0.09, gain: 0.08, slide: 140, delay: 0.06 });
  }

  /** Sparks climb a pentatonic scale as you string them together. */
  spark() {
    const scale = [523.25, 587.33, 698.46, 783.99, 880, 1046.5];
    const f = scale[this._chimeStep % scale.length];
    this._chimeStep++;
    clearTimeout(this._chimeReset);
    this._chimeReset = setTimeout(() => { this._chimeStep = 0; }, 1400);
    this._blip(f, { type: 'sine', dur: 0.24, gain: 0.20 });
    this._blip(f * 2, { type: 'sine', dur: 0.16, gain: 0.07 });
  }

  /** Warm arpeggio when a memory opens. */
  memory() {
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      this._blip(f, { type: 'triangle', dur: 0.9, gain: 0.22, delay: i * 0.1, attack: 0.02 });
      this._blip(f * 2, { type: 'sine', dur: 0.7, gain: 0.06, delay: i * 0.1 + 0.02 });
    });
  }

  finale() {
    const notes = [392, 493.88, 587.33, 783.99, 987.77, 1174.66];
    notes.forEach((f, i) => {
      this._blip(f, { type: 'triangle', dur: 1.8, gain: 0.20, delay: i * 0.17, attack: 0.05 });
    });
  }
}
