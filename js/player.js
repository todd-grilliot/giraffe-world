// The player: the giraffe rig from giraffe.js, plus the controller that moves it. Collision is an upright box swept against the world's boxes,
// one axis at a time — cheap, predictable, and it never lets you tunnel through.

import * as THREE from 'three';
import { CFG, SPAWN } from './config.js';
import { buildGiraffe } from './giraffe.js';

export class Player {
  constructor(scene, world) {
    this.world = world;
    this.pos   = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);   // FEET, not centre
    this.vel   = new THREE.Vector3();
    this.facing = 0;

    this.grounded    = false;
    this.groundSolid = null;
    this.coyote      = 0;
    this.buffered    = 0;
    this.jumps       = 0;
    this.runPhase    = 0;
    this.squash      = 1;
    this.launchLock  = 0;
    this.gliding     = false;
    this.cuttable    = false;   // is the current rise still trimmable on release?
    this.spawnPoint  = this.pos.clone();

    this.rig = buildGiraffe();
    this.obj = this.rig.root;
    this.obj.position.copy(this.pos);
    scene.add(this.obj);

    // a soft blob under the feet — real shadows are too coarse at this scale to
    // tell you where you're going to land
    const blobTex = makeBlobTexture();
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.blob);

    this._box = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    this.events = { jumped: false, landed: false, bounced: false, respawned: false, fluttered: false };
  }

  aabbAt(p, out = this._box) {
    out.min.set(p.x - CFG.radius, p.y, p.z - CFG.radius);
    out.max.set(p.x + CFG.radius, p.y + CFG.height, p.z + CFG.radius);
    return out;
  }

  respawn() {
    this.pos.copy(this.spawnPoint);
    this.vel.set(0, 0, 0);
    this.jumps = 0;
    this.launchLock = 0;
    this.gliding = false;
    this.cuttable = false;
    this.events.respawned = true;
  }

  /**
   * @param dt    seconds
   * @param input { x, z } in world space already (camera-relative math is done
   *              by the caller), plus { jump, jumpHeld }
   */
  update(dt, input) {
    const e = this.events;
    e.jumped = e.landed = e.bounced = e.respawned = e.fluttered = false;
    e.jumpIndex = 0;

    // ride whatever we're standing on
    if (this.grounded && this.groundSolid?.mover) {
      this.pos.add(this.groundSolid.mover.delta);
    }

    // --- horizontal acceleration -------------------------------------
    const wasGrounded = this.grounded;
    const accel = wasGrounded ? CFG.accelGround : CFG.accelAir;
    const fric  = wasGrounded ? CFG.frictionGround : CFG.frictionAir;

    // A mushroom has already decided where you're going; ignore steering for a
    // moment so a stray thumb can't throw off a shot that was aimed for you.
    this.launchLock = Math.max(0, this.launchLock - dt);
    const mag = this.launchLock > 0 ? 0 : Math.hypot(input.x, input.z);

    if (mag > 0.001) {
      const nx = input.x / mag, nz = input.z / mag;
      const want = Math.min(mag, 1) * CFG.moveSpeed;
      this.vel.x += nx * accel * dt;
      this.vel.z += nz * accel * dt;
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > want) {
        const k = want / speed;
        this.vel.x *= k; this.vel.z *= k;
      }
      this.facing = turnToward(this.facing, Math.atan2(nx, nz), CFG.turnSpeed * dt);
    } else if (this.launchLock <= 0) {
      const damp = Math.max(0, 1 - fric * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }

    // --- jumping ------------------------------------------------------
    if (input.jump) this.buffered = CFG.jumpBuffer;
    this.buffered = Math.max(0, this.buffered - dt);
    this.coyote   = wasGrounded ? CFG.coyoteTime : Math.max(0, this.coyote - dt);

    this.gliding = false;

    if (this.buffered > 0) {
      if (this.coyote > 0 && this.jumps === 0) {
        this.vel.y = CFG.jumpSpeed;
        this.jumps = 1; this.coyote = 0; this.buffered = 0;
        this.squash = 0.72; e.jumped = true; e.jumpIndex = 0;
        this.cuttable = input.jumpHeld;
      } else if (this.jumps < CFG.maxJumps) {
        // each one weaker than the last. max() so tapping while still rising
        // never slows you down.
        const boost = CFG.jumpSpeed * Math.pow(CFG.jumpFalloff, this.jumps);
        this.vel.y = Math.max(this.vel.y, boost);
        this.buffered = 0;
        this.squash = 0.74; e.jumped = true; e.jumpIndex = this.jumps;
        this.cuttable = input.jumpHeld;
        this.jumps++;
      } else if (this.vel.y < CFG.flutterFall) {
        // out of lift: a press can only ease the fall, never add height
        this.vel.y = CFG.flutterFall;
        this.buffered = 0;
        e.fluttered = true;
      }
    }

    // holding the button once the jumps are spent turns the drop into a glide
    if (!wasGrounded && this.jumps >= CFG.maxJumps && input.jumpHeld && this.vel.y < 0) {
      this.gliding = true;
    }

    // Variable jump height: letting go early trims the jump you're in, ONCE, on
    // the release. Applying it every airborne frame (as this used to) bled away
    // the whole climb in a fifth of a second and made mushroom launches fall
    // far short of where they were aimed.
    if (this.cuttable && !input.jumpHeld) {
      if (this.vel.y > 4) this.vel.y *= 0.62;
      this.cuttable = false;
    }

    const g = this.gliding ? CFG.gravity * CFG.glideGravity : CFG.gravity;
    this.vel.y = Math.max(CFG.maxFall, this.vel.y + g * dt);
    if (this.gliding) this.vel.y = Math.max(this.vel.y, CFG.flutterFall);

    // --- move and collide, one axis at a time -------------------------
    this.grounded = false;
    this.groundSolid = null;

    this._moveY(dt);
    this.pos.x += this.vel.x * dt;
    this._resolveH('x');
    this.pos.z += this.vel.z * dt;
    this._resolveH('z');

    if (this.grounded && !wasGrounded) { e.landed = true; this.squash = 1.3; }

    // --- fell off the world, or into the sea --------------------------
    if (this.pos.y < CFG.voidY) this.respawn();
    for (const w of this.world.waters) {
      if (this.pos.y < w.y - 0.5 && this.pos.x > w.x0 && this.pos.x < w.x1 &&
          this.pos.z > w.z0 && this.pos.z < w.z1) { this.respawn(); break; }
    }

    this._animate(dt);
  }

  /**
   * Vertical movement, swept rather than overlap-tested: at full falling speed a
   * frame covers more ground than the thinnest platform, so we ask "did the feet
   * cross this surface?" instead of "are the feet inside it now?".
   */
  _moveY(dt) {
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    const r = CFG.radius;

    if (this.vel.y <= 0) {
      let landOn = null, landY = -Infinity;
      for (const s of this.world.solids) {
        if (this.pos.x + r <= s.min.x || this.pos.x - r >= s.max.x) continue;
        if (this.pos.z + r <= s.min.z || this.pos.z - r >= s.max.z) continue;
        // must have started at or above the surface and ended at or below it
        if (prevY < s.max.y - 0.02 || this.pos.y > s.max.y) continue;
        if (s.max.y > landY) { landY = s.max.y; landOn = s; }
      }
      if (landOn) {
        this.pos.y = landY;
        if (landOn.bounce) {
          this._launch(landOn);
        } else {
          this.vel.y = 0;
          this.grounded = true;
          this.groundSolid = landOn;
          this.jumps = 0;
        }
      }
    } else {
      const headPrev = prevY + CFG.height, headNow = this.pos.y + CFG.height;
      for (const s of this.world.solids) {
        if (this.pos.x + r <= s.min.x || this.pos.x - r >= s.max.x) continue;
        if (this.pos.z + r <= s.min.z || this.pos.z - r >= s.max.z) continue;
        if (headPrev > s.min.y + 0.02 || headNow < s.min.y) continue;
        this.pos.y = s.min.y - CFG.height;
        this.vel.y = 0;
        break;
      }
    }
  }

  /**
   * Bounce pads throw you somewhere specific rather than just adding upward
   * speed. Given a target, we solve the arc that lands on it and overwrite the
   * whole velocity — so it doesn't matter how fast you arrived, from which
   * direction, or whether you jumped at the right moment. Touch it and you get
   * where it was always going to send you.
   */
  _launch(pad) {
    this.jumps = 0;
    this.squash = 0.55;
    this.cuttable = false;      // a throw is never trimmed by the jump button
    this.launchLock = 0;
    this.events.bounced = true;

    if (!pad.aim) {                       // plain trampoline, no destination
      this.vel.y = pad.bounce;
      return;
    }

    const g = -CFG.gravity;
    const margin = CFG.launchMargin;                      // clear the target by this much
    const rise = Math.max(0.6, (pad.aim.y - this.pos.y) + margin);
    const vy = Math.sqrt(2 * g * rise);
    const flight = vy / g + Math.sqrt(2 * margin / g);     // up to the peak, then down onto it

    this.vel.set(
      (pad.aim.x - this.pos.x) / flight,
      vy,
      (pad.aim.z - this.pos.z) / flight,
    );
    this.launchLock = CFG.launchLock;
  }

  /** Horizontal push-out, with a small step-up so kerbs and lips don't snag. */
  _resolveH(axis) {
    const STEP = 0.4;
    const box = this.aabbAt(this.pos);
    for (const s of this.world.solids) {
      if (box.min.x >= s.max.x || box.max.x <= s.min.x) continue;
      if (box.min.y >= s.max.y || box.max.y <= s.min.y) continue;
      if (box.min.z >= s.max.z || box.max.z <= s.min.z) continue;

      // low enough to just walk up onto
      if (s.max.y - this.pos.y <= STEP && s.max.y - this.pos.y > 0 && this.vel.y <= 0) {
        this.pos.y = s.max.y;
        this.grounded = true;
        this.groundSolid = s;
        this.jumps = 0;
        this.vel.y = 0;
        this.aabbAt(this.pos, box);
        continue;
      }

      const c = this.pos[axis];
      const mid = (s.min[axis] + s.max[axis]) / 2;
      if (c < mid) this.pos[axis] = s.min[axis] - CFG.radius;
      else         this.pos[axis] = s.max[axis] + CFG.radius;
      this.vel[axis] = 0;
      this.aabbAt(this.pos, box);
    }
  }

  /** Highest solid surface directly beneath the feet, for the blob shadow. */
  groundBelow() {
    let best = -Infinity;
    const x = this.pos.x, z = this.pos.z, r = CFG.radius * 0.8;
    for (const s of this.world.solids) {
      if (x + r < s.min.x || x - r > s.max.x) continue;
      if (z + r < s.min.z || z - r > s.max.z) continue;
      if (s.max.y > this.pos.y + 0.2) continue;
      if (s.max.y > best) best = s.max.y;
    }
    return best;
  }

  _animate(dt) {
    const f = this.rig;
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.facing;

    const speed = Math.hypot(this.vel.x, this.vel.z);
    const run   = Math.min(speed / CFG.moveSpeed, 1);
    this.runPhase += dt * (5 + run * 13);
    const t = performance.now() / 1000;

    // squash/stretch eases back to normal
    this.squash += (1 - this.squash) * Math.min(1, dt * 9);
    f.body.scale.set(2 - this.squash, this.squash, 2 - this.squash);

    if (this.grounded) {
      const sw = Math.sin(this.runPhase) * run;
      f.legL.rotation.x =  sw * 0.9;
      f.legR.rotation.x = -sw * 0.9;
      f.armL.rotation.x = -sw * 0.7;
      f.armR.rotation.x =  sw * 0.7;
      f.body.position.y = Math.abs(Math.sin(this.runPhase)) * 0.06 * run
                        + Math.sin(t * 2.2) * 0.018 * (1 - run);
      f.body.rotation.x = run * 0.16;
    } else if (this.gliding) {
      // arms out, legs dangling — clearly a float rather than a fall
      const flap = Math.sin(t * 9) * 0.16;
      f.legL.rotation.x = -0.25 + flap * 0.4;
      f.legR.rotation.x = -0.25 - flap * 0.4;
      f.armL.rotation.z =  1.25 + flap;
      f.armR.rotation.z = -1.25 - flap;
      f.armL.rotation.x = f.armR.rotation.x = -0.15;
      f.body.rotation.x = 0.1;
      f.body.position.y = Math.sin(t * 4.5) * 0.05;
    } else {
      // tuck in mid-air, reach out on the way down
      const fall = THREE.MathUtils.clamp(-this.vel.y / 16, -1, 1);
      f.legL.rotation.x = f.legR.rotation.x = -0.7 + fall * 0.5;
      f.armL.rotation.x = f.armR.rotation.x = -1.5 - fall * 0.6;
      f.armL.rotation.z = f.armR.rotation.z = 0;
      f.body.rotation.x = -fall * 0.2;
      f.body.position.y = 0;
    }

    f.tail.rotation.z = Math.sin(this.runPhase * 0.7) * (0.12 + run * 0.30);
    f.tail.rotation.x = Math.sin(this.runPhase * 0.5) * 0.1 - run * 0.18;

    // The neck is the whole character. It leans into a run, whips back on a
    // jump, and keeps a slow idle sway so she never looks frozen.
    const lean = this.grounded ? run * 0.20 : THREE.MathUtils.clamp(-this.vel.y / 30, -0.30, 0.26);
    f.neck.rotation.x = lean + Math.sin(t * 1.3) * 0.035;
    f.neck.rotation.z = Math.sin(this.runPhase * 0.5) * 0.07 * run + Math.sin(t * 0.9) * 0.02;
    // head counter-rotates so it stays roughly level however the neck leans
    f.head.rotation.x = -lean * 0.72 + Math.sin(t * 1.7) * 0.03;
    f.head.rotation.z = Math.sin(this.runPhase * 0.5) * 0.05 * run;

    const twitch = Math.sin(t * 0.9) > 0.985 ? 0.3 : 0;
    f.earL.rotation.z =  0.42 + twitch;
    f.earR.rotation.z = -0.42 - twitch;

    // Blob shadow. The real shadow map already handles standing on the ground,
    // so this only fades in once there's air underneath — which is exactly when
    // you need to know where you're going to land.
    const gy = this.groundBelow();
    const drop = gy > -Infinity ? this.pos.y - gy : Infinity;
    if (gy > -Infinity && drop > 0.3) {
      const d = THREE.MathUtils.clamp(drop, 0, 14);
      this.blob.visible = true;
      this.blob.position.set(this.pos.x, gy + 0.035, this.pos.z);
      const k = 1 - d / 18;
      this.blob.scale.setScalar(Math.max(0.45, k));
      const fadeIn = THREE.MathUtils.clamp((drop - 0.3) / 1.2, 0, 1);
      this.blob.material.opacity = 0.4 * fadeIn * Math.max(0.12, k);
    } else {
      this.blob.visible = false;
    }
  }
}

/** Superman: arms forward, legs trailing, neck stretched out along the flight. */
Player.prototype.flyPose = function (t, roll) {
  const f = this.rig;
  const flap = Math.sin(t * 6) * 0.1;
  f.body.scale.set(1, 1, 1);
  f.body.rotation.x = 0;
  f.body.position.y = 0;
  f.armL.rotation.set(-2.5, 0, 0.25 + flap);
  f.armR.rotation.set(-2.5, 0, -0.25 - flap);
  f.legL.rotation.set(0.35 + flap * 0.5, 0, 0);
  f.legR.rotation.set(0.35 - flap * 0.5, 0, 0);
  f.neck.rotation.set(-0.55 + Math.sin(t * 3) * 0.05, 0, -roll * 0.35);
  f.head.rotation.set(0.45, 0, 0);
  f.tail.rotation.set(0.5 + Math.sin(t * 7) * 0.2, 0, 0);
  f.earL.rotation.z =  0.55 + flap;
  f.earR.rotation.z = -0.55 - flap;
  this.blob.visible = false;
};

function turnToward(from, to, step) {
  let d = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  if (Math.abs(d) <= step) return to;
  return from + Math.sign(d) * step;
}

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0,    'rgba(0,0,0,0.9)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1,    'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
