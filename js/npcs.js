// The other giraffes. They wander their patch with their arms up, they have
// something to say if you walk over, and during the fly-around they scatter.

import * as THREE from 'three';
import { buildGiraffe } from './giraffe.js';

const TALK_RANGE = 4.2;
const VIEW_RANGE = 44;     // beyond this they are not drawn at all — each giraffe is ~33 meshes
const FLEE_RANGE = 26;     // how far off they notice her coming in the ending
const WALK       = 2.6;
const FLEE_SPEED = 13;

export class NPCs {
  constructor(scene, world, data) {
    this.world = world;
    this.list = [];
    this.talkingTo = null;

    for (const spec of (data?.people || [])) {
      const rig = buildGiraffe({ outfit: spec.outfit || [] });
      rig.root.scale.setScalar(0.92);
      scene.add(rig.root);

      const home = new THREE.Vector3(spec.at[0], spec.at[1], spec.at[2]);
      this.list.push({
        name: spec.name,
        lines: spec.lines || [],
        line: 0,
        rig,
        home,
        pos: home.clone(),
        radius: spec.loop ?? 5,
        phase: Math.random() * Math.PI * 2,
        facing: 0,
        bob: Math.random() * 6,
        fleeing: false,
        vel: new THREE.Vector3(),
        dead: false,
        ground: home.y,
      });
    }
  }

  /** Nearest one close enough to chat to, or null. */
  nearest(pos) {
    let best = null, bd = TALK_RANGE * TALK_RANGE;
    for (const n of this.list) {
      if (n.dead) continue;
      const d = n.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** Advance the given giraffe to their next line and return it. */
  say(n) {
    if (!n.lines.length) return '';
    const line = n.lines[n.line % n.lines.length];
    n.line++;
    return line;
  }

  update(dt, t, playerPos, flying) {
    for (const n of this.list) {
      if (n.dead) { n.rig.root.visible = false; continue; }

      const far = n.pos.distanceToSquared(playerPos) > VIEW_RANGE * VIEW_RANGE;
      n.rig.root.visible = !far;
      if (far) continue;                      // no point animating what isn't drawn

      let moving = 0;

      if (flying) {
        // she's coming in fast — bolt away from her, otherwise keep circling
        const d = n.pos.distanceTo(playerPos);
        if (d < FLEE_RANGE) {
          n.fleeing = true;
          const away = _v.copy(n.pos).sub(playerPos).setY(0);
          if (away.lengthSq() < 0.001) away.set(1, 0, 0);
          away.normalize();
          // veer sideways too, so they scatter instead of running in a line
          away.x += Math.sin(t * 3 + n.phase) * 0.5;
          away.z += Math.cos(t * 3 + n.phase) * 0.5;
          away.normalize();
          n.pos.addScaledVector(away, FLEE_SPEED * dt);
          n.facing = Math.atan2(away.x, away.z);
          moving = 1;
        } else {
          n.fleeing = false;
          moving = this._loop(n, dt, t, 1.35);
        }
      } else {
        moving = this._loop(n, dt, t, 1);
      }

      // keep their feet on whatever is under them
      const g = this._groundAt(n.pos, n.ground);
      n.ground += (g - n.ground) * Math.min(1, dt * 8);
      n.pos.y = n.ground;

      this._animate(n, dt, t, moving);
    }
  }

  _loop(n, dt, t, speedScale) {
    n.phase += dt * (WALK * speedScale) / Math.max(1, n.radius);
    const x = n.home.x + Math.cos(n.phase) * n.radius;
    const z = n.home.z + Math.sin(n.phase) * n.radius;
    const dx = x - n.pos.x, dz = z - n.pos.z;
    n.pos.x = x; n.pos.z = z;
    if (Math.abs(dx) + Math.abs(dz) > 0.0001) n.facing = Math.atan2(dx, dz);
    return 1;
  }

  /** Highest surface under a point, so they don't sink into hillsides. */
  _groundAt(p, fallback) {
    let best = -Infinity;
    for (const s of this.world.solids) {
      if (p.x < s.min.x - 0.3 || p.x > s.max.x + 0.3) continue;
      if (p.z < s.min.z - 0.3 || p.z > s.max.z + 0.3) continue;
      if (s.max.y > fallback + 2.5) continue;
      if (s.max.y > best) best = s.max.y;
    }
    return best > -Infinity ? best : fallback;
  }

  /** Arms permanently up, because they're delighted. */
  _animate(n, dt, t, moving) {
    const r = n.rig;
    r.root.position.copy(n.pos);
    r.root.rotation.y = n.facing;

    const step = t * (n.fleeing ? 13 : 6.5) + n.bob;
    const sw = Math.sin(step) * moving;
    r.legL.rotation.x =  sw * 0.75;
    r.legR.rotation.x = -sw * 0.75;

    // both arms straight up, waving a little
    const wave = Math.sin(t * 4 + n.bob) * 0.22;
    r.armL.rotation.set(0, 0,  2.5 + wave);
    r.armR.rotation.set(0, 0, -2.5 - wave);

    r.body.position.y = Math.abs(Math.sin(step)) * 0.055 * moving;
    r.body.rotation.x = n.fleeing ? 0.2 : 0.05;
    r.neck.rotation.x = (n.fleeing ? 0.22 : 0) + Math.sin(t * 1.6 + n.bob) * 0.05;
    r.neck.rotation.z = Math.sin(step * 0.5) * 0.06 * moving;
    r.head.rotation.x = -r.neck.rotation.x * 0.6;
    r.tail.rotation.z = Math.sin(step * 0.7) * 0.3;
    r.earL.rotation.z =  0.42 + wave * 0.4;
    r.earR.rotation.z = -0.42 - wave * 0.4;
  }
}

const _v = new THREE.Vector3();
