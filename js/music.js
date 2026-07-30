// The soundtrack. Plays the theme, then a random track off the album, then the
// theme again — so the theme comes round every other song.
//
// One <audio> element does all the work. Browsers only allow playback to start
// from a real user gesture, so `start()` is called from the Go button.

export class Music {
  constructor(data, onTrack) {
    this.theme    = data.theme;
    this.shuffle  = (data.shuffle || []).slice();
    this.volume   = typeof data.volume === 'number' ? data.volume : 0.42;
    this.onTrack  = onTrack || (() => {});

    this.on       = true;
    this.playing  = false;
    this.current  = null;
    this._lastPick = -1;        // so the random pick never repeats back to back
    this._failed   = new Set(); // tracks that wouldn't load; don't keep retrying
    this._fade     = null;

    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.volume = 0;
    this.el.addEventListener('ended', () => this._advance());
    this.el.addEventListener('error', () => {
      if (this.current) this._failed.add(this.current.file);
      // a missing or broken file shouldn't end the music for the rest of the visit
      if (this.playing) this._advance();
    });
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.playing) return;
    this.playing = true;
    this._play(this.theme);
  }

  setEnabled(on) {
    this.on = on;
    if (!on) {
      this.el.pause();
    } else if (this.playing) {
      this.el.play().catch(() => {});
      this._fadeTo(this.volume, 600);
    }
  }

  /**
   * Alternate by looking at what just played rather than by flipping a flag.
   * A flag has to be kept in step with reality by every caller; this can't drift,
   * so the theme is always exactly every other track.
   */
  _advance() {
    const themeJustPlayed = !!this.current && this.current.file === this.theme.file;
    const next = themeJustPlayed ? this._pick() : this.theme;
    if (next) this._play(next);
  }

  /** A random track that isn't the one we played last time. */
  _pick() {
    const usable = this.shuffle
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => i !== this._lastPick && !this._failed.has(t.file));

    // if that left nothing (tiny album, or everything failed), fall back
    const pool = usable.length
      ? usable
      : this.shuffle.map((t, i) => ({ t, i })).filter(({ t }) => !this._failed.has(t.file));
    if (!pool.length) return this.theme;

    const choice = pool[Math.floor(Math.random() * pool.length)];
    this._lastPick = choice.i;
    return choice.t;
  }

  _play(track) {
    this.current = track;
    this.el.src = track.file;
    this.el.currentTime = 0;
    this.el.volume = 0;
    if (this.on) {
      const p = this.el.play();
      if (p && p.catch) p.catch(() => {});   // autoplay refusal — stay quiet
      this._fadeTo(this.volume, 1500);
    }
    this.onTrack(track);
  }

  _fadeTo(target, ms) {
    clearInterval(this._fade);
    const step = 40, from = this.el.volume;
    let t = 0;
    this._fade = setInterval(() => {
      t += step;
      const k = Math.min(1, t / ms);
      this.el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k >= 1) clearInterval(this._fade);
    }, step);
  }
}
