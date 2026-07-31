// The glow. Every one she picks up makes her brighter, and past about halfway
// it stops being a warm shine and starts being a problem.
//
// Fixed pools: one sprite, one flame cone, one Points cloud, one light. Nothing
// is created after startup however powerful she gets.

import * as THREE from 'three';

const MOTES = 90;

export class Aura {
  constructor(scene) {
    this.power = 0;        // 0..1
    this.shown = 0;        // eased, so a pickup ramps rather than snaps
    this.group = new THREE.Group();
    scene.add(this.group);

    // --- soft halo around the whole body
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), color: 0xffd98a, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }));
    this.halo.scale.setScalar(3);
    this.group.add(this.halo);

    // --- flame licking upward, only once she's well along
    const flame = new THREE.ConeGeometry(0.44, 2.2, 10, 1, true);
    this.flame = new THREE.Mesh(flame, new THREE.MeshBasicMaterial({
      color: 0xffe08a, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.flame.position.y = 1.5;
    this.group.add(this.flame);

    // --- motes streaming up off her
    const g = new THREE.BufferGeometry();
    this.mPos = new Float32Array(MOTES * 3);
    this.mCol = new Float32Array(MOTES * 3);
    this.mLife = new Float32Array(MOTES);
    this.mVel = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) this.mPos[i * 3 + 1] = -9999;
    g.setAttribute('position', new THREE.BufferAttribute(this.mPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.mCol, 3));
    this.moteGeo = g;
    // A textured point, not a bare one: untextured points draw as hard squares,
    // which additive-blend into floating white paper rather than sparks.
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.16, map: haloTexture(), vertexColors: true, transparent: true,
      opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.next = 0;

    this.light = new THREE.PointLight(0xffc860, 0, 16, 2);
    this.group.add(this.light);

    this._c = new THREE.Color();
  }

  /** @param p 0..1 — how far through the collection she is */
  setPower(p) { this.power = THREE.MathUtils.clamp(p, 0, 1); }

  update(dt, t, pos) {
    // ease toward the target so each pickup swells in rather than popping
    this.shown += (this.power - this.shown) * Math.min(1, dt * 2.2);
    const p = this.shown;
    this.group.position.set(pos.x, pos.y, pos.z);

    if (p < 0.001) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Colour: warm gold early, then it starts cycling, and by the end it's
    // strobing hard enough to be alarming.
    const strobe = Math.max(0, (p - 0.45) / 0.55);          // 0 until nearly half way
    const rate = 1.2 + strobe * 26;
    const hue = strobe > 0.02 ? (t * rate * 0.16) % 1 : 0.11;
    const sat = 0.55 + strobe * 0.45;
    const lit = 0.6 + strobe * 0.25;
    this._c.setHSL(hue, sat, lit);
    // a fast flicker on top once she's near the end
    const flick = 1 + Math.sin(t * (8 + strobe * 60)) * (0.08 + strobe * 0.35);

    const pulse = 1 + Math.sin(t * (2 + strobe * 10)) * 0.09;

    this.halo.material.color.copy(this._c);
    this.halo.material.opacity = (0.22 + p * 0.65) * flick;
    this.halo.scale.setScalar((2.4 + p * 6.2) * pulse);
    this.halo.position.y = 1.0;

    this.flame.material.color.copy(this._c);
    this.flame.material.opacity = Math.max(0, (p - 0.35)) * 0.5 * flick;
    this.flame.scale.set(0.8 + p * 0.5, (0.7 + p * 1.2) * pulse, 0.8 + p * 0.5);
    this.flame.position.y = 1.2 + p * 0.6;
    this.flame.rotation.y += dt * (1 + strobe * 6);

    this.light.color.copy(this._c);
    this.light.intensity = p * 3.4 * flick;
    this.light.distance = 8 + p * 22;
    this.light.position.y = 1.1;

    this._motes(dt, p, strobe);
  }

  _motes(dt, p, strobe) {
    // spawn rate climbs with power
    const want = p * (1 + strobe * 3);
    this._acc = (this._acc || 0) + want * dt * 34;
    while (this._acc >= 1) {
      this._acc -= 1;
      const i = this.next; this.next = (this.next + 1) % MOTES;
      const a = i * 3;
      const r = 0.5 + Math.random() * (0.5 + p);
      const th = Math.random() * Math.PI * 2;
      this.mPos[a]     = Math.cos(th) * r;
      this.mPos[a + 1] = Math.random() * 0.4;
      this.mPos[a + 2] = Math.sin(th) * r;
      this.mVel[a]     = Math.cos(th) * 0.5;
      this.mVel[a + 1] = 2.2 + Math.random() * (2 + p * 6);
      this.mVel[a + 2] = Math.sin(th) * 0.5;
      this.mCol[a] = this._c.r; this.mCol[a + 1] = this._c.g; this.mCol[a + 2] = this._c.b;
      this.mLife[i] = 1;
    }

    for (let i = 0; i < MOTES; i++) {
      if (this.mLife[i] <= 0) continue;
      this.mLife[i] -= dt * 1.5;
      const a = i * 3;
      this.mPos[a]     += this.mVel[a] * dt;
      this.mPos[a + 1] += this.mVel[a + 1] * dt;
      this.mPos[a + 2] += this.mVel[a + 2] * dt;
      const f = Math.max(0, this.mLife[i]);
      this.mCol[a] *= 0.96; this.mCol[a + 1] *= 0.96; this.mCol[a + 2] *= 0.96;
      if (f <= 0) this.mPos[a + 1] = -9999;
    }
    this.motes.material.size = 0.10 + p * 0.16;
    this.moteGeo.attributes.position.needsUpdate = true;
    this.moteGeo.attributes.color.needsUpdate = true;
  }
}

let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0,    'rgba(255,255,255,0.95)');
  grad.addColorStop(0.25, 'rgba(255,240,190,0.55)');
  grad.addColorStop(0.6,  'rgba(255,200,110,0.16)');
  grad.addColorStop(1,    'rgba(255,180,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _halo = new THREE.CanvasTexture(c);
  _halo.colorSpace = THREE.SRGBColorSpace;
  return _halo;
}
