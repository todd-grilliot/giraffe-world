// The things worth finding: sixteen memory lanterns, a scattering of sparks,
// and the firefly that knows where the next lantern is.

import * as THREE from 'three';
import { CFG } from './config.js';

const GOLD  = 0xffd980;
const GOLD2 = 0xffb347;

// ------------------------------------------------------------- memory lanterns

export class Memories {
  constructor(scene, anchors, count) {
    this.items = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    const coreGeo  = new THREE.IcosahedronGeometry(0.46, 1);
    const shellGeo = new THREE.IcosahedronGeometry(0.78, 1);
    const ringGeo  = new THREE.TorusGeometry(0.98, 0.035, 6, 28);

    for (let i = 0; i < count; i++) {
      const at = anchors[i] || anchors[anchors.length - 1];
      const g  = new THREE.Group();
      g.position.copy(at);

      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: GOLD }));
      const shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({
        color: GOLD2, transparent: true, opacity: 0.24, wireframe: true,
      }));
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: GOLD, transparent: true, opacity: 0.45,
      }));
      ring.rotation.x = Math.PI / 2;

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture(), color: GOLD, transparent: true,
        opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      halo.scale.setScalar(3.4);

      g.add(core, shell, ring, halo);
      this.group.add(g);

      this.items.push({
        index: i, obj: g, core, shell, ring, halo,
        home: at.clone(), found: false, phase: i * 1.7,
      });
    }

    // One roaming light shared by all of them. Sixteen real point lights would
    // make three.js recompile shaders every time one came in or out of view.
    this.light = new THREE.PointLight(GOLD, 1.6, 11, 2);
    this.light.position.set(0, -999, 0);
    scene.add(this.light);
  }

  setFound(i, found) {
    const it = this.items[i];
    if (!it) return;
    it.found = found;
    it.obj.visible = !found;
  }

  /** Nearest not-yet-found lantern by list order — that's where the firefly points. */
  next() {
    return this.items.find(it => !it.found) || null;
  }

  /** Returns the item the player just touched, or null. */
  checkPickup(pos) {
    for (const it of this.items) {
      if (it.found) continue;
      const dx = pos.x - it.obj.position.x;
      const dy = (pos.y + CFG.height * 0.5) - it.obj.position.y;
      const dz = pos.z - it.obj.position.z;
      if (dx * dx + dy * dy + dz * dz < CFG.pickupRadius * CFG.pickupRadius) return it;
    }
    return null;
  }

  update(dt, t, playerPos) {
    let lit = null, litD = Infinity;

    for (const it of this.items) {
      if (it.found) continue;
      const p = t * 1.4 + it.phase;
      it.obj.position.y = it.home.y + Math.sin(p) * 0.22;
      it.core.rotation.y += dt * 0.9;
      it.core.rotation.x += dt * 0.5;
      it.shell.rotation.y -= dt * 0.45;
      it.ring.rotation.z += dt * 0.7;
      const pulse = 0.9 + Math.sin(p * 2) * 0.1;
      it.halo.scale.setScalar(3.4 * pulse);

      // brighten as you get close, so "warmer / colder" reads without a UI
      if (playerPos) {
        const d = it.obj.position.distanceTo(playerPos);
        const near = THREE.MathUtils.clamp(1 - (d - 3) / 14, 0, 1);
        it.halo.material.opacity = 0.4 + near * 0.4;
        if (d < litD) { litD = d; lit = it; }
      }
    }

    if (lit && litD < 22) this.light.position.copy(lit.obj.position);
    this.light.intensity = lit && litD < 22 ? 1.6 * (1 - litD / 22) : 0;
  }
}

// ------------------------------------------------------------- sparks

/** Little collectible motes strewn along the route. Pure encouragement. */
export class Sparks {
  constructor(scene, points) {
    this.points = points.map(p => ({ pos: p.clone(), taken: false }));
    const geo = new THREE.IcosahedronGeometry(0.19, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff0bb });
    this.mesh = new THREE.InstancedMesh(geo, mat, points.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this._m4 = new THREE.Matrix4();
    this._q  = new THREE.Quaternion();
    this._e  = new THREE.Euler();
    this._s  = new THREE.Vector3(1, 1, 1);
    this._p  = new THREE.Vector3();
    this.taken = 0;
  }

  setTaken(list) {
    for (const i of list) if (this.points[i]) { this.points[i].taken = true; }
    this.taken = this.points.filter(p => p.taken).length;
  }

  /** Index of a spark within reach, or -1. */
  checkPickup(pos) {
    const r2 = CFG.sparkRadius * CFG.sparkRadius;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.taken) continue;
      const dx = pos.x - p.pos.x;
      const dy = (pos.y + CFG.height * 0.5) - p.pos.y;
      const dz = pos.z - p.pos.z;
      if (dx * dx + dy * dy + dz * dz < r2) return i;
    }
    return -1;
  }

  take(i) {
    if (!this.points[i] || this.points[i].taken) return false;
    this.points[i].taken = true;
    this.taken++;
    return true;
  }

  update(dt, t) {
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.taken) {
        this._s.setScalar(0);
      } else {
        this._s.setScalar(1);
        this._e.set(t * 1.1 + i, t * 1.6 + i * 0.4, 0);
      }
      this._p.set(p.pos.x, p.pos.y + (p.taken ? 0 : Math.sin(t * 2.4 + i) * 0.16), p.pos.z);
      this._q.setFromEuler(this._e);
      this.mesh.setMatrixAt(i, this._m4.compose(this._p, this._q, this._s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------- the firefly

/** Orbits the giraffe, then swims off toward whatever she should find next. */
export class Companion {
  constructor(scene) {
    this.pos  = new THREE.Vector3();
    this.obj  = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff6d5 }),
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), color: 0xffe9a8, transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(1.5);
    this.light = new THREE.PointLight(0xffe0a0, 1.1, 7, 2);

    this.obj.add(core, glow, this.light);
    scene.add(this.obj);
    this.glow = glow;
    this._t = 0;
  }

  update(dt, t, player, target) {
    this._t += dt;

    // where we'd like to be: hovering between the giraffe and the next lantern
    const want = new THREE.Vector3(player.pos.x, player.pos.y + 1.9, player.pos.z);
    if (target) {
      const to = new THREE.Vector3().subVectors(target.obj.position, want);
      const d  = to.length();
      to.normalize();
      // hang further ahead when the goal is far away, tuck in close when it's near
      want.addScaledVector(to, THREE.MathUtils.clamp(d * 0.28, 0.9, 4.6));
    }
    want.x += Math.sin(this._t * 1.7) * CFG.guideOrbit * 0.4;
    want.y += Math.sin(this._t * 2.3) * 0.28;
    want.z += Math.cos(this._t * 1.4) * CFG.guideOrbit * 0.4;

    this.pos.lerp(want, Math.min(1, dt * CFG.guideSpeed));
    this.obj.position.copy(this.pos);

    const pulse = 0.8 + Math.sin(t * 4.2) * 0.2;
    this.glow.scale.setScalar(1.5 * pulse);
    this.light.intensity = 1.0 * pulse;
  }
}

// ------------------------------------------------------------- shared texture

let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0,    'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,232,168,0.72)');
  grad.addColorStop(0.55, 'rgba(255,200,110,0.20)');
  grad.addColorStop(1,    'rgba(255,190,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _halo = new THREE.CanvasTexture(c);
  _halo.colorSpace = THREE.SRGBColorSpace;
  return _halo;
}
