// The other giraffes. They wander a patch that's been checked for walls and
// ledges, they stop and turn to face you while they're talking, and what they
// say depends on how many of the glowing things you've taken off them.

import * as THREE from 'three';
import { buildGiraffe } from './giraffe.js';

const TALK_RANGE = 4.6;    // close enough for the prompt to appear
const KEEP_RANGE = 9.0;    // conversation continues until you're this far off
const VIEW_RANGE = 44;     // beyond this they aren't drawn — each is ~33 meshes
const FLEE_RANGE = 26;
const WALK       = 2.6;
const FLEE_SPEED = 13;

export class NPCs {
  constructor(scene, world, data) {
    this.world = world;
    this.list = [];

    for (const spec of (data?.people || [])) {
      const rig = buildGiraffe({ outfit: spec.outfit || [] });
      rig.root.scale.setScalar(0.92);
      scene.add(rig.root);

      const home = new THREE.Vector3(spec.at[0], spec.at[1], spec.at[2]);
      const n = {
        name: spec.name,
        spec,                        // their whole entry, for whatever they say
        cursor: { key: null, i: 0 }, // which line of which script they're on
        rig,
        home,
        pos: home.clone(),
        radius: spec.loop ?? 5,
        phase: Math.random() * Math.PI * 2,
        facing: 0,
        bob: Math.random() * 6,
        fleeing: false,
        talking: false,
        dead: false,
        ground: home.y,
      };
      n.radius = this._safeRadius(n);
      this.list.push(n);
    }
  }

  /**
   * Shrink a walking circle until it stays on solid ground and clear of walls.
   * Left alone, a giraffe will happily stroll into a castle or off a cliff and
   * spend the rest of the game hovering inside a wall.
   */
  _safeRadius(n) {
    const SAMPLES = 16;
    for (let r = n.radius; r >= 0; r -= 0.5) {
      let ok = true;
      for (let i = 0; i < SAMPLES && ok; i++) {
        const a = (i / SAMPLES) * Math.PI * 2;
        const x = n.home.x + Math.cos(a) * r;
        const z = n.home.z + Math.sin(a) * r;
        const g = this._groundAt(x, z, n.home.y);
        // no floor, or a step too big to be walking up
        if (g === null || Math.abs(g - n.home.y) > 1.2) { ok = false; break; }
        if (this._blocked(x, g, z)) ok = false;
      }
      if (ok) return Math.max(0, r);
    }
    return 0;                    // nowhere safe to walk: stand still instead
  }

  /** Is something solid occupying the space a giraffe's body would be in? */
  _blocked(x, y, z) {
    const R = 0.75, HEAD = 2.2;
    for (const s of this.world.solids) {
      if (x + R < s.min.x || x - R > s.max.x) continue;
      if (z + R < s.min.z || z - R > s.max.z) continue;
      if (s.max.y <= y + 0.3) continue;          // it's the floor, or below it
      if (s.min.y >= y + HEAD) continue;         // it's overhead
      return true;
    }
    return false;
  }

  /** Highest surface under a point, or null if there's nothing to stand on. */
  _groundAt(x, z, near) {
    let best = null;
    for (const s of this.world.solids) {
      if (x < s.min.x - 0.3 || x > s.max.x + 0.3) continue;
      if (z < s.min.z - 0.3 || z > s.max.z + 0.3) continue;
      if (s.max.y > near + 2.5) continue;
      if (best === null || s.max.y > best) best = s.max.y;
    }
    return best;
  }

  /** Nearest one close enough to chat to, or null. */
  nearest(pos, keep) {
    const range = keep ? KEEP_RANGE : TALK_RANGE;
    let best = null, bd = range * range;
    for (const n of this.list) {
      if (n.dead) continue;
      const d = n.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /**
   * The line they're on. `step` moves them along first — the first press of E
   * shows what they're already saying, later presses advance, so re-opening a
   * conversation never skips the line she just walked away from.
   *
   * What they say is entirely the quest system's call; this only keeps the
   * cursor and hands back text. Returns '' when they've run out, which closes
   * the bubble and lets the favour move on to its next state.
   */
  speak(n, quests, step, onCue) {
    if (step) n.cursor.i++;
    const said = quests.say(n.spec, n.cursor, onCue);
    if (!said.text) { n.cursor.key = null; n.cursor.i = 0; return ''; }
    n.cursor.key = said.key;
    n.cursor.i = said.i;
    return said.text;
  }

  update(dt, t, playerPos, flying, talkingTo) {
    for (const n of this.list) {
      if (n.dead) { n.rig.root.visible = false; continue; }

      const far = n.pos.distanceToSquared(playerPos) > VIEW_RANGE * VIEW_RANGE;
      n.rig.root.visible = !far;
      if (far) { n.talking = false; continue; }

      n.talking = !flying && talkingTo === n;
      let moving = 0;

      if (n.talking) {
        // stand still and look at her — otherwise they wander off mid-sentence
        const dx = playerPos.x - n.pos.x, dz = playerPos.z - n.pos.z;
        if (dx * dx + dz * dz > 0.04) n.facing = turnTo(n.facing, Math.atan2(dx, dz), dt * 6);
      } else if (flying) {
        const d = n.pos.distanceTo(playerPos);
        if (d < FLEE_RANGE) {
          n.fleeing = true;
          const away = _v.copy(n.pos).sub(playerPos).setY(0);
          if (away.lengthSq() < 0.001) away.set(1, 0, 0);
          away.normalize();
          away.x += Math.sin(t * 3 + n.phase) * 0.5;
          away.z += Math.cos(t * 3 + n.phase) * 0.5;
          away.normalize();
          n.pos.addScaledVector(away, FLEE_SPEED * dt);
          n.facing = Math.atan2(away.x, away.z);
          moving = 1;
        } else {
          n.fleeing = false;
          moving = this._loop(n, dt, 1.35);
        }
      } else {
        n.fleeing = false;
        moving = this._loop(n, dt, 1);
      }

      const g = this._groundAt(n.pos.x, n.pos.z, n.ground);
      if (g !== null) n.ground += (g - n.ground) * Math.min(1, dt * 8);
      n.pos.y = n.ground;

      this._animate(n, t, moving);
    }
  }

  _loop(n, dt, speedScale) {
    if (n.radius <= 0.05) return 0;            // nowhere safe to go; idle in place
    n.phase += dt * (WALK * speedScale) / Math.max(1, n.radius);
    const x = n.home.x + Math.cos(n.phase) * n.radius;
    const z = n.home.z + Math.sin(n.phase) * n.radius;
    const dx = x - n.pos.x, dz = z - n.pos.z;
    n.pos.x = x; n.pos.z = z;
    if (Math.abs(dx) + Math.abs(dz) > 0.0001) n.facing = Math.atan2(dx, dz);
    return 1;
  }

  /** Arms permanently up, because they're delighted. Or terrified. */
  _animate(n, t, moving) {
    const r = n.rig;
    r.root.position.copy(n.pos);
    r.root.rotation.y = n.facing;

    const step = t * (n.fleeing ? 13 : 6.5) + n.bob;
    const sw = Math.sin(step) * moving;
    r.legL.rotation.x =  sw * 0.75;
    r.legR.rotation.x = -sw * 0.75;

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

function turnTo(from, to, step) {
  let d = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  if (Math.abs(d) <= step) return to;
  return from + Math.sign(d) * step;
}

const _v = new THREE.Vector3();
