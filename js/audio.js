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

  jump()   { this._blip(430, { type: 'triangle', dur: 0.14, gain: 0.32, slide: 260 }); }
  double() { this._blip(560, { type: 'triangle', dur: 0.16, gain: 0.30, slide: 330 }); }
  land()   { this._blip(150, { type: 'sine',     dur: 0.10, gain: 0.22, slide: -60 }); }
  bounce() {
    this._blip(300, { type: 'square', dur: 0.10, gain: 0.16, slide: 480 });
    this._blip(600, { type: 'sine',   dur: 0.22, gain: 0.20, slide: 500, delay: 0.04 });
  }
  splash() { this._blip(320, { type: 'sine', dur: 0.3, gain: 0.2, slide: -220 }); }

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
