// Everything that isn't 3D: the gate, the title card, the HUD, the note that
// pops when you find a lantern, the journal, and the ending.

const $ = (id) => document.getElementById(id);

const norm = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '');

export class UI {
  constructor(data, hooks) {
    this.data  = data;
    this.hooks = hooks;          // { onStart, onReset, onSoundToggle, onClose }
    this.open  = null;           // which screen is currently up
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
    $('finale-close').addEventListener('click', () => this.hide('finale'));

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

  toast(msg, ms = 2600) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
}
