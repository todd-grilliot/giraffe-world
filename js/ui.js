// Everything that isn't 3D: the gate, the title card, the HUD, the note that
// pops when you find a lantern, the journal, and the ending.

import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const _proj = new THREE.Vector3();   // scratch, so projecting doesn't allocate

const norm = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
const clamp01 = (v) => Math.max(0.04, Math.min(0.96, v));

export class UI {
  constructor(data, hooks) {
    this.data  = data;
    this.hooks = hooks;          // { onStart, onReset, onSoundToggle, onClose }
    this.open  = null;           // which screen is currently up
    this.score = 0;
    this._gateTries = 0;
    this._toastTimer = null;

    $('found-total').textContent = data.notes.length;

    // --- gate ---
    $('gate-welcome').textContent  = data.gate.welcome || '';
    $('gate-question').textContent = data.gate.question || '';
    $('gate-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._tryGate();
    });

    // --- title ---
    $('title-h').textContent    = data.intro.title || "Giraffe World";
    $('title-body').textContent = data.intro.body || '';
    $('title-go').textContent   = data.intro.button || 'Go';
    $('title-go').addEventListener('click', () => {
      this.hide('title');
      this.hooks.onStart?.();
    });

    // --- note modal ---
    $('note-close').addEventListener('click', () => this.closeNote());

    // --- journal ---
    $('hud-journal').addEventListener('click', () => this.showJournal());
    $('journal-close').addEventListener('click', () => this.hide('journal'));
    $('journal-reset').addEventListener('click', () => {
      if (confirm('Start over from the beginning? Everything you’ve found will be cleared.')) {
        this.hooks.onReset?.();
      }
    });

    // --- finale ---
    $('finale-close').addEventListener('click', () => {
      this.hooks.onFinaleClosed?.();
      this.hide('finale');
    });

    // --- sound ---
    $('hud-sound').addEventListener('click', () => {
      const on = this.hooks.onSoundToggle?.();
      $('hud-sound').classList.toggle('off', !on);
    });

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (this.open === 'note')    this.closeNote();
        else if (this.open)          this.hide(this.open);
      } else if (k === 'j' && (!this.open || this.open === 'journal')) {
        if (this.open === 'journal') this.hide('journal');
        else if (this._started)      this.showJournal();
      }
    });
  }

  /** True while a screen is up — the game loop pauses input while it is. */
  isBlocking() { return this.open !== null; }

  show(id) {
    $(id).classList.remove('hidden');
    this.open = id;
  }

  hide(id) {
    $(id).classList.add('hidden');
    if (this.open === id) this.open = null;
    this.hooks.onClose?.();
  }

  // ------------------------------------------------------------- gate

  showGate() {
    this.show('gate');
    setTimeout(() => $('gate-input').focus(), 350);
  }

  _tryGate() {
    const given = norm($('gate-input').value);
    const ok = (this.data.gate.answers || []).some(a => {
      const n = norm(String(a));
      return n.length > 0 && n === given;
    });

    if (ok) {
      this.hide('gate');
      this.showTitle();
      this.hooks.onUnlock?.();
      return;
    }

    this._gateTries++;
    const panel = document.querySelector('#gate .panel');
    panel.classList.remove('shake');
    void panel.offsetWidth;           // restart the animation
    panel.classList.add('shake');
    $('gate-input').select();

    if (this._gateTries >= 2 && this.data.gate.hint) {
      const h = $('gate-hint');
      h.textContent = this.data.gate.hint;
      h.classList.add('show');
    }
  }

  // ------------------------------------------------------------- title

  showTitle() {
    this._started = true;
    this.show('title');
  }

  hideLoading() { $('loading').classList.add('hidden'); }

  showHUD(touch) {
    $('hud').classList.remove('hidden');
    if (touch) $('touch').classList.remove('hidden');
  }

  // ------------------------------------------------------------- note

  showNote(i) {
    const n = this.data.notes[i];
    if (!n) return;
    $('note-num').textContent   = `${i + 1} of ${this.data.notes.length}`;
    $('note-title').textContent = n.title || '';
    $('note-date').textContent  = n.date || '';
    $('note-date').style.display = n.date ? '' : 'none';
    $('note-body').textContent  = n.body || '';
    $('note-draft').classList.toggle('hidden', !n.draft);

    const img = $('note-photo');
    img.src = n.photo;
    img.alt = n.title || `Memory ${i + 1}`;

    this.show('note');
  }

  closeNote() { this.hide('note'); }

  // ------------------------------------------------------------- journal

  showJournal() {
    const found = this.hooks.getFound?.() || new Set();
    const total = this.data.notes.length;
    $('journal-sub').textContent = found.size === total
      ? 'You found every one.'
      : `${found.size} of ${total} found — the light always knows where the next one is.`;

    const grid = $('journal-grid');
    grid.innerHTML = '';
    this.data.notes.forEach((n, i) => {
      const cell = document.createElement('button');
      cell.className = 'jslot' + (found.has(i) ? ' found' : '');
      if (found.has(i)) {
        const img = document.createElement('img');
        img.src = n.thumb || n.photo;
        img.alt = n.title || `Memory ${i + 1}`;
        img.loading = 'lazy';
        const label = document.createElement('span');
        label.className = 'jnum';
        label.textContent = n.title || `#${i + 1}`;
        cell.append(img, label);
        cell.addEventListener('click', () => {
          $('journal').classList.add('hidden');
          this.open = null;
          this.showNote(i);
        });
      } else {
        const label = document.createElement('span');
        label.className = 'jnum';
        label.textContent = i + 1;
        cell.append(label);
        cell.disabled = true;
      }
      grid.append(cell);
    });

    this.show('journal');
  }

  // ------------------------------------------------------------- finale

  showFinale() {
    const f = this.data.finale || {};
    $('finale-title').textContent = f.title || 'You found them all.';
    $('finale-body').textContent  = f.body || '';
    $('finale-draft').classList.toggle('hidden', !f.draft);
    this.show('finale');
  }

  // ------------------------------------------------------------- hud bits

  setCount(n) {
    $('found-count').textContent = n;
    const btn = $('hud-journal');
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
  }

  setSparks(n) { $('spark-count').textContent = n; }

  /** Names the track for a few seconds whenever a new one starts. */
  nowPlaying(title) {
    const el = $('now-playing');
    el.textContent = '♪  ' + title;
    el.classList.add('show');
    clearTimeout(this._npTimer);
    this._npTimer = setTimeout(() => el.classList.remove('show'), 4800);
  }

  // ------------------------------------------------------------- the ending

  /** Two cards: the shout, then the thing it's actually there to say. */
  showCongrats() {
    const el = $('congrats');
    const span = el.querySelector('span');
    const FADE = 650;

    const card = (text, holdMs, then) => {
      span.textContent = text;
      el.classList.remove('hidden', 'fading');
      // replay the pop-in even though the node is being reused
      span.style.animation = 'none';
      void span.offsetWidth;
      span.style.animation = '';
      this._congratsA = setTimeout(() => {
        el.classList.add('fading');
        this._congratsB = setTimeout(then, FADE);
      }, holdMs);
    };

    clearTimeout(this._congratsA);
    clearTimeout(this._congratsB);
    card('CONGRATULATIONS!', 2000, () => {
      card('You’re the best sister!', 4000, () => el.classList.add('hidden'));
    });
  }

  /**
   * A score pop where the thing was, and the running total. Pooled: at most a
   * dozen nodes live at once and each is reused, rather than churning the DOM
   * while she's ploughing through scenery at speed.
   *
   * `big` is for the ones worth making a fuss about — giraffes and birds.
   */
  popScore(worldPos, camera, amount = 10, big = false) {
    this.score = (this.score || 0) + amount;
    const board = $('score-board');
    board.classList.remove('hidden', 'bump');
    void board.offsetWidth;
    board.classList.add('bump');
    $('score-value').textContent = this.score.toLocaleString();

    const now = performance.now();
    // small hits are throttled so they can't spam; the big ones always show
    if (!big && now - (this._lastPop || 0) < 45) return;
    this._lastPop = now;

    if (!this._pool) {
      this._pool = [];
      this._poolAt = 0;
      const host = $('scores');
      for (let i = 0; i < 12; i++) {
        const d = document.createElement('div');
        d.className = 'score-pop';
        d.style.display = 'none';
        host.append(d);
        this._pool.push(d);
      }
    }

    const v = _proj.copy(worldPos).project(camera);
    const behind = v.z > 1;
    // A small hit behind the camera isn't worth showing; a giraffe or a bird is,
    // so put it on screen rather than throwing the moment away.
    if (behind && !big) return;
    const el = this._pool[this._poolAt];
    this._poolAt = (this._poolAt + 1) % this._pool.length;
    el.style.display = 'none';
    // reflow so the animation restarts even if this node was mid-flight
    void el.offsetWidth;
    el.textContent = '+' + amount;
    el.className = 'score-pop' + (big ? ' big' : '');
    const px = behind ? 50 : clamp01(v.x * 0.5 + 0.5) * 100;
    const py = behind ? 46 : clamp01(-v.y * 0.5 + 0.5) * 100;
    el.style.left = `${px}%`;
    el.style.top  = `${py}%`;
    el.style.display = '';
  }

  // ------------------------------------------------------------- talking

  showTalkPrompt(touch) {
    const p = $('talk-prompt');
    if (p.classList.contains('hidden')) {
      p.textContent = touch ? (this.data.npcPromptTouch || 'Tap TALK') : (this.data.npcPrompt || 'Press E to talk');
      p.classList.remove('hidden');
    }
    if (touch) $('talk-btn').classList.remove('hidden');
  }

  hideTalkPrompt() {
    $('talk-prompt').classList.add('hidden');
    $('talk-btn').classList.add('hidden');
  }

  showSpeech(name, text) {
    $('speech-name').textContent = name;
    $('speech-text').textContent = text;
    const el = $('speech');
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }

  hideSpeech() { $('speech').classList.add('hidden'); }

  /** Keep the bubble pinned over whoever is speaking. */
  placeSpeech(worldPos, camera) {
    const el = $('speech');
    if (el.classList.contains('hidden')) return;
    const v = _proj.copy(worldPos).project(camera);
    if (v.z > 1) { el.style.opacity = '0'; return; }
    el.style.opacity = '1';
    el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    el.style.top  = `${(-v.y * 0.5 + 0.5) * 100}%`;
  }

  toast(msg, ms = 2600) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
}
