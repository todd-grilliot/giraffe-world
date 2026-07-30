// Keyboard + mouse + touch, flattened into one little state object the game
// reads each frame.

export class Input {
  constructor(canvas) {
    this.keys      = new Set();
    this.stick     = { x: 0, y: 0 };   // -1..1, from touch
    this.look      = { x: 0, y: 0 };   // consumed and zeroed every frame
    this.jumpEdge  = false;            // true for exactly one frame per press
    this.jumpHeld  = false;
    this.enabled   = false;
    this._dragId   = null;
    this._last     = { x: 0, y: 0 };
    this._touchJump = false;

    this.isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches
                 || navigator.maxTouchPoints > 1;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'spacebar') { this.jumpEdge = true; e.preventDefault(); }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
    addEventListener('blur', () => { this.keys.clear(); this.jumpHeld = false; });

    // drag anywhere on the canvas to swing the camera
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this._dragId = e.pointerId;
      this._last.x = e.clientX; this._last.y = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this._dragId !== e.pointerId) return;
      this.look.x += (e.clientX - this._last.x) * 0.0052;
      this.look.y += (e.clientY - this._last.y) * 0.0034;
      this._last.x = e.clientX; this._last.y = e.clientY;
    });
    const endDrag = (e) => {
      if (this._dragId === e.pointerId) {
        this._dragId = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    addEventListener('wheel', (e) => { if (this.enabled) e.preventDefault(); }, { passive: false });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
  }

  bindTouch(stickEl, nubEl, jumpEl) {
    let id = null, cx = 0, cy = 0, R = 52;

    const start = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      id = t.identifier ?? 'mouse';
      const r = stickEl.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      R = r.width / 2 - 8;
      move(e);
    };
    const move = (e) => {
      if (id === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = list.find(p => (p.identifier ?? 'mouse') === id);
      if (!t) return;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      nubEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick.x = dx / R;
      this.stick.y = dy / R;
      e.preventDefault();
    };
    const end = () => {
      id = null;
      this.stick.x = this.stick.y = 0;
      nubEl.style.transform = '';
    };

    stickEl.addEventListener('touchstart', start, { passive: false });
    stickEl.addEventListener('touchmove',  move,  { passive: false });
    stickEl.addEventListener('touchend',   end);
    stickEl.addEventListener('touchcancel', end);

    jumpEl.addEventListener('touchstart', (e) => {
      this.jumpEdge = true; this._touchJump = true; e.preventDefault();
    }, { passive: false });
    jumpEl.addEventListener('touchend', () => { this._touchJump = false; });
    jumpEl.addEventListener('touchcancel', () => { this._touchJump = false; });
  }

  /** Movement on the camera's ground plane: {x,z} in -1..1, plus jump flags. */
  sample(basis) {
    const k = this.keys;
    let f = 0, r = 0;
    if (k.has('w') || k.has('arrowup'))    f += 1;
    if (k.has('s') || k.has('arrowdown'))  f -= 1;
    if (k.has('d') || k.has('arrowright')) r += 1;
    if (k.has('a') || k.has('arrowleft'))  r -= 1;

    // touch stick overrides when it's actually being pushed
    if (Math.abs(this.stick.x) > 0.06 || Math.abs(this.stick.y) > 0.06) {
      r = this.stick.x;
      f = -this.stick.y;
    }

    const x = basis.fx * f + basis.rx * r;
    const z = basis.fz * f + basis.rz * r;

    const jump = this.jumpEdge;
    this.jumpEdge = false;
    this.jumpHeld = k.has(' ') || k.has('spacebar') || this._touchJump;

    return { x, z, jump, jumpHeld: this.jumpHeld };
  }

  /** Camera look for this frame, from drag plus Q/E and comma/period. */
  takeLook(dt) {
    const out = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    const k = this.keys;
    if (k.has('q')) out.x -= 2.4 * dt;
    if (k.has('e')) out.x += 2.4 * dt;
    if (k.has('r')) out.y -= 1.4 * dt;
    if (k.has('f')) out.y += 1.4 * dt;
    return out;
  }
}
