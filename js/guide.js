// The little firefly that hangs between the giraffe and wherever she's headed.
// It always knows where the current favour is, so being lost isn't possible.

import * as THREE from 'three';
import { CFG } from './config.js';

// scratch, so steering the guide light doesn't allocate every frame
const _want = new THREE.Vector3();
const _to   = new THREE.Vector3();

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

    // where we'd like to be: hovering between the giraffe and wherever she's headed
    const want = _want.set(player.pos.x, player.pos.y + 1.9, player.pos.z);
    if (target) {
      const to = _to.subVectors(target, want);
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
