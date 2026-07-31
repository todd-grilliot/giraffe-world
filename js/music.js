// The soundtrack. Plays the playlist straight through in order, then loops.
//
// Two <audio> elements, not one. Whatever is coming next is fetched while the
// current track is still playing, so the handoff costs nothing. Setting .src at
// the moment a track ends means downloading most of a megabyte in the middle of
// the game, and on a phone connection that stutters the frame loop — which is
// invisible when you test on localhost and obvious when she plays it for real.
//
// Browsers only allow playback to start from a real user gesture, so `start()`
// is called from the Go button.

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

    this.el        = this._makeEl();   // the one you can hear
    this._spare    = this._makeEl();   // quietly buffering whatever is next
    this._spareFor = null;
  }

  _makeEl() {
    const el = new Audio();
    el.preload = 'auto';
    el.volume = 0;
    // Only the element actually playing drives the playlist. The spare fires
    // these too while it buffers, and must not move anything along.
    el.addEventListener('ended', () => { if (el === this.el) this._advance(); });
    el.addEventListener('error', () => {
      const src = el.getAttribute('src');
      if (src) this._failed.add(src);
      // a missing or broken file shouldn't end the music for the rest of the visit
      if (el === this.el && this.playing) this._advance();
      else if (el === this._spare) { this._spareFor = null; this._warmNext(); }
    });
    return el;
  }

  /**
   * Start fetching the first track while she's still reading the title screen,
   * so pressing Go doesn't kick off a download at the same moment the world
   * starts rendering. Safe to call before any user gesture — loading is allowed,
   * only playback needs the gesture.
   */
  prime() {
    const first = this.tracks[0];
    if (!first) return;
    this._spare.src = first.file;
    this._spare.load();
    this._spareFor = first.file;
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.playing || !this.tracks.length) return;
    this.playing = true;
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

  /**
   * The one moment the playlist is allowed to jump: Sage finally sings her one
   * line, and the song she's spent eleven years not finishing comes in under
   * it. `seek` skips the long silent intro so it lands on the melody rather
   * than on nothing — the timing is the whole joke.
   */
  cueTrack(match, seek = 0) {
    if (!this.playing) return false;
    const i = this.tracks.findIndex(t => t.file.includes(match));
    if (i < 0 || i === this.index) return false;
    const from = this.el;
    this._fadeTo(0, 700, from);
    setTimeout(() => { from.pause(); this._play(i, seek); }, 720);
    return true;
  }

  /** currentTime throws before metadata lands, so wait for it if we must. */
  _seekTo(el, sec) {
    if (!sec) { try { el.currentTime = 0; } catch {} return; }
    const apply = () => { try { el.currentTime = sec; } catch {} };
    if (el.readyState >= 1) apply();
    else el.addEventListener('loadedmetadata', apply, { once: true });
  }

  _play(i, seek = 0) {
    const track = this.tracks[i];
    if (!track) return;
    this.index = i;
    this.current = track;

    if (this._spareFor === track.file) {
      // Already buffered on the spare — swap the elements rather than reload.
      this.el.pause();
      const old = this.el;
      this.el = this._spare;
      this._spare = old;
      this._spareFor = null;
    } else if (this.el.getAttribute('src') !== track.file) {
      this.el.src = track.file;
    }

    this._seekTo(this.el, seek);
    this.el.volume = 0;

    if (this.on) {
      const p = this.el.play();
      if (p && p.catch) p.catch(() => {});   // autoplay refusal — stay quiet
      this._fadeTo(this.volume, 1500);
    }
    this.onTrack(track);
    this._warmNext();
  }

  /** Buffer whatever comes after the current track, so the handoff is free. */
  _warmNext() {
    if (this.tracks.length < 2) return;
    for (let step = 1; step <= this.tracks.length; step++) {
      const next = this.tracks[(this.index + step) % this.tracks.length];
      if (this._failed.has(next.file)) continue;
      if (this._spareFor !== next.file) {
        this._spare.pause();
        this._spare.src = next.file;
        this._spare.volume = 0;
        this._spare.load();
        this._spareFor = next.file;
      }
      return;
    }
  }

  /** Fades the element that was current when the fade started, not whichever
   *  is current when it ticks — the two swap during a track change. */
  _fadeTo(target, ms, el = this.el) {
    clearInterval(this._fade);
    const step = 40, from = el.volume;
    let t = 0;
    this._fade = setInterval(() => {
      t += step;
      const k = Math.min(1, t / ms);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k >= 1) clearInterval(this._fade);
    }, step);
  }
}
