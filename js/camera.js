// Third-person chase camera. Swings behind you when you run, and squeezes in
// when a wall gets between it and the giraffe.

import * as THREE from 'three';
import { CFG } from './config.js';

export class ChaseCamera {
  constructor(camera, world) {
    this.cam    = camera;
    this.world  = world;
    this.yaw    = 0;
    this.pitch  = 0.30;
    this.dist   = CFG.camDist;
    this.distScale = 1;   // raised on tall screens, where less world fits across
    this.target = new THREE.Vector3();
    this.smooth = new THREE.Vector3();
    this._first = true;
    this._want  = new THREE.Vector3();
    this._look  = new THREE.Vector3();
  }

  /** @param look {x,y} extra look input from mouse drag / keys / touch */
  update(dt, player, look, autoFollow) {
    this.yaw   -= look.x;
    this.pitch  = THREE.MathUtils.clamp(this.pitch + look.y, CFG.camPitchMin, CFG.camPitchMax);

    // when running forward and not steering the camera, drift in behind
    if (autoFollow && Math.abs(look.x) < 1e-4) {
      const speed = Math.hypot(player.vel.x, player.vel.z);
      if (speed > 3.5) {
        const want = player.facing + Math.PI;
        let d = ((want - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        this.yaw += d * Math.min(1, dt * 1.05);
      }
    }

    // follow point sits at the giraffe's chest, smoothed so jumps don't jolt
    this.target.set(player.pos.x, player.pos.y + 1.05, player.pos.z);
    if (this._first) { this.smooth.copy(this.target); this._first = false; }
    this.smooth.lerp(this.target, Math.min(1, dt * CFG.camLag));

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = this._want.set(
      Math.sin(this.yaw) * cp,
      sp + CFG.camHeight / CFG.camDist * 0.42,
      Math.cos(this.yaw) * cp,
    ).normalize();

    const dist = this._clearDistance(this.smooth, dir, CFG.camDist * this.distScale);
    this.dist += (dist - this.dist) * Math.min(1, dt * (dist < this.dist ? 22 : 6));

    this.cam.position.copy(this.smooth).addScaledVector(dir, this.dist);
    this._look.copy(this.smooth).addScaledVector(dir, -1.2);
    this._look.y += 0.4;
    this.cam.lookAt(this._look);
  }

  /** How far back can we sit before geometry gets in the way? */
  _clearDistance(origin, dir, max) {
    let best = max;
    for (const s of this.world.solids) {
      const t = raySlab(origin, dir, s.min, s.max, max);
      if (t !== null && t < best) best = t;
    }
    for (const s of this.world.camBlockers) {
      const t = raySlab(origin, dir, s.min, s.max, max);
      if (t !== null && t < best) best = t;
    }
    return Math.max(CFG.camMinDist, best - 0.45);
  }

  /** Camera-relative unit vectors on the ground plane. */
  basis(out) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    out.fx = -s; out.fz = -c;   // forward, away from the camera
    out.rx =  c; out.rz = -s;   // right = forward turned a quarter clockwise
    return out;
  }
}

// Slab method: nearest positive hit of a ray against an AABB, or null.
function raySlab(o, d, min, max, limit) {
  let tmin = 0, tmax = limit;
  for (const ax of ['x', 'y', 'z']) {
    const inv = 1 / (d[ax] || 1e-9);
    let t1 = (min[ax] - o[ax]) * inv;
    let t2 = (max[ax] - o[ax]) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? tmin : null;
}
