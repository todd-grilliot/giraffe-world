// The soundtrack. Plays the playlist straight through in order, then loops.
//
// One <audio> element does all the work. Browsers only allow playback to start
// from a real user gesture, so `start()` is called from the Go button.

export class Music {
  constructor(data, onTrack) {
    this.tracks  = (data.playlist || []).slice();
    this.volume  = typeof data.volume === 'number' ? data.volume : 0.42;
    this.onTrack = onTrack || (() => {});

    this.on      = true;
    this.playing = false;
    this.index   = -1;
    this.current = null;
    this._failed = new Set();   // tracks that wouldn't load; don't keep retrying
    this._fade   = null;

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
    if (this.playing || !this.tracks.length) return;
    this.playing = true;
    this._play(0);
  }

  /** Back to the top of the playlist — for the ending. */
  playFirst() {
    if (!this.playing || !this.tracks.length) return;
    this._play(0);
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

  /** Next in the list, wrapping. Skips anything that failed to load. */
  _advance() {
    if (!this.tracks.length) return;
    for (let step = 1; step <= this.tracks.length; step++) {
      const next = (this.index + step) % this.tracks.length;
      if (!this._failed.has(this.tracks[next].file)) return this._play(next);
    }
    // everything is broken; stop rather than spin
    this.playing = false;
  }

  _play(i) {
    const track = this.tracks[i];
    if (!track) return;
    this.index = i;
    this.current = track;
    this.el.src = track.file;
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
