// The ending. Once all sixteen are found the giraffe takes off, and the world
// stops being a platformer and becomes something to fly through and wreck.
//
// Everything here is built from fixed-size pools — one trail mesh, one sparkle
// cloud, one debris batch, three instanced meshes for the birds. Nothing is
// allocated per frame and nothing grows, so a phone can hold the frame rate
// however long she flies around.

import * as THREE from 'three';

const TRAIL   = 70;    // ribbon segments
const SPARKS  = 220;   // glitter particles
const DEBRIS  = 96;    // shards from smashed things
const BIRDS   = 18;
const FLYING  = 18;    // how many smashed objects can be in the air at once

const SPEED      = 46;
const BOOST      = 78;
const TURN       = 2.0;
const PITCH_RATE = 1.5;
const HIT_RADIUS = 4.6;

const BOUNDS = { x: 430, zMin: -220, zMax: 580, yMin: 3, yMax: 250 };

const FORWARD = new THREE.Vector3(0, 0, 1);   // hoisted; this runs every frame

export class Celebration {
  constructor(scene, camera, world, player, ui) {
    this.scene = scene; this.camera = camera;
    this.world = world; this.player = player; this.ui = ui;
    this.active = false;
    this.built = false;
    this.time = 0;

    this.pos = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0;
    this.roll = 0;
    this.dir = new THREE.Vector3(0, 0, 1);
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3(1, 1, 1);
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
  }

  // ------------------------------------------------------------ setup

  _build() {
    if (this.built) return;
    this.built = true;
    const scene = this.scene;

    // --- gradient sky. A backdrop sphere with two colours that drift through
    // --- the spectrum as she flies, so the whole screen keeps changing.
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(700, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          top:    { value: new THREE.Color(0x3b1d6e) },
          mid:    { value: new THREE.Color(0xff7ab8) },
          bottom: { value: new THREE.Color(0x2de2e6) },
          band:   { value: 0 },
        },
        vertexShader: `
          varying vec3 vP;
          void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float band;
          varying vec3 vP;
          void main() {
            float h = normalize(vP).y * 0.5 + 0.5;
            vec3 c = h > 0.5 ? mix(mid, top, (h - 0.5) * 2.0) : mix(bottom, mid, h * 2.0);
            // soft moving bands, like a slow aurora
            c += 0.06 * sin(h * 42.0 + band) * vec3(1.0, 0.7, 1.0);
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.visible = false;
    scene.add(this.sky);

    // --- rainbow ribbon. One strip, two verts per segment, rewritten each frame.
    {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(TRAIL * 2 * 3);
      const col = new Float32Array(TRAIL * 2 * 3);
      const idx = [];
      for (let i = 0; i < TRAIL - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      this.trailGeo = g;
      // Normal blending, not additive: added on top of a bright sky every hue
      // saturates to white and the rainbow disappears.
      this.trail = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide, transparent: true,
        opacity: 0.9, depthWrite: false,
      }));
      this.trail.frustumCulled = false;
      this.trail.visible = false;
      scene.add(this.trail);
      this.trailPts = Array.from({ length: TRAIL }, () => new THREE.Vector3());
      this.trailUp  = Array.from({ length: TRAIL }, () => new THREE.Vector3(0, 1, 0));
    }

    // --- sparkles
    {
      const g = new THREE.BufferGeometry();
      this.sparkPos = new Float32Array(SPARKS * 3);
      this.sparkCol = new Float32Array(SPARKS * 3);
      this.sparkVel = new Float32Array(SPARKS * 3);
      this.sparkLife = new Float32Array(SPARKS);
      g.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
      this.sparkGeo = g;
      this.sparks = new THREE.Points(g, new THREE.PointsMaterial({
        size: 0.55, vertexColors: true, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.sparks.frustumCulled = false;
      this.sparks.visible = false;
      scene.add(this.sparks);
      this.sparkNext = 0;
    }

    // --- debris shards, one batch
    {
      this.debris = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ vertexColors: false, color: 0xffffff }),
        DEBRIS,
      );
      this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // setColorAt is what allocates instanceColor and flags the shader to use
      // it; assigning the attribute by hand leaves every shard white.
      const white = new THREE.Color(0xffffff);
      for (let i = 0; i < DEBRIS; i++) this.debris.setColorAt(i, white);
      this.debris.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.debris.frustumCulled = false;
      this.debris.visible = false;
      scene.add(this.debris);
      this.debrisState = Array.from({ length: DEBRIS }, () => ({
        life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        spin: new THREE.Vector3(), rot: new THREE.Euler(), size: 1,
      }));
      this.debrisNext = 0;
    }

    // --- birds: body + two wings, each its own instanced batch so all eighteen
    // --- cost three draw calls and can still flap
    {
      const bodyGeo = new THREE.ConeGeometry(0.34, 1.5, 5);
      bodyGeo.rotateX(Math.PI / 2);
      const wingGeo = new THREE.BoxGeometry(1.9, 0.09, 0.62);
      const mat = new THREE.MeshLambertMaterial({ color: 0x35405c });
      const matW = new THREE.MeshLambertMaterial({ color: 0x4a5878 });
      this.birdBody = new THREE.InstancedMesh(bodyGeo, mat, BIRDS);
      this.birdWL   = new THREE.InstancedMesh(wingGeo, matW, BIRDS);
      this.birdWR   = new THREE.InstancedMesh(wingGeo, matW, BIRDS);
      for (const m of [this.birdBody, this.birdWL, this.birdWR]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.visible = false;
        scene.add(m);
      }
      this.birds = Array.from({ length: BIRDS }, (_, i) => this._newBird(i));
    }

    // --- things that can be smashed, bucketed by z so we only test what's near
    this.buckets = new Map();
    const push = (item) => {
      const k = Math.floor(item.pos.z / 24);
      if (!this.buckets.has(k)) this.buckets.set(k, []);
      this.buckets.get(k).push(item);
    };
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const child of this.world.group.children) {
      if (child.isInstancedMesh) {
        for (let i = 0; i < child.count; i++) {
          child.getMatrixAt(i, m4);
          p.setFromMatrixPosition(m4);
          push({ kind: 'inst', mesh: child, index: i, pos: p.clone(), dead: false });
        }
      } else if (child.isMesh && child.visible && child.geometry?.type !== 'PlaneGeometry') {
        push({ kind: 'mesh', mesh: child, pos: child.position.clone(), dead: false });
      }
    }

    this.flying = [];
    this._zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  _newBird(i) {
    const a = (i / BIRDS) * Math.PI * 2;
    const r = 60 + (i % 5) * 34;
    return {
      pos: new THREE.Vector3(Math.cos(a) * r, 18 + (i % 7) * 9, 170 + Math.sin(a) * r),
      yaw: a + Math.PI / 2,
      speed: 8 + (i % 4) * 2.5,
      flap: i * 0.7,
      dead: 0,
    };
  }

  // ------------------------------------------------------------ lifecycle

  start() {
    this._build();
    this.active = true;
    this.time = 0;
    this.pos.copy(this.player.pos).add(new THREE.Vector3(0, 6, 0));
    this.yaw = Math.PI; this.pitch = 0.18; this.roll = 0;
    for (const v of this.trailPts) v.copy(this.pos);
    for (const o of [this.sky, this.trail, this.sparks, this.debris, this.birdBody, this.birdWL, this.birdWR]) {
      o.visible = true;
    }
    this.scene.fog.far = 900;
    this.scene.fog.near = 260;
    this.ui.showCongrats();
  }

  // ------------------------------------------------------------ per frame

  update(dt, input) {
    this.time += dt;
    const t = this.time;

    // --- steering
    const raw = input.raw();
    this.yaw   -= raw.x * TURN * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch - raw.y * PITCH_RATE * dt, -1.15, 1.15);
    this.pitch += (0 - this.pitch) * dt * 0.25;              // eases back to level
    this.roll  += ((-raw.x) - this.roll) * Math.min(1, dt * 4);

    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();

    const speed = raw.boost ? BOOST : SPEED;
    this.pos.addScaledVector(this.dir, speed * dt);

    // --- big soft boundary
    const B = BOUNDS;
    if (this.pos.x >  B.x)    { this.pos.x =  B.x;    this.yaw += dt * 2; }
    if (this.pos.x < -B.x)    { this.pos.x = -B.x;    this.yaw += dt * 2; }
    if (this.pos.z >  B.zMax) { this.pos.z =  B.zMax; this.yaw += dt * 2; }
    if (this.pos.z <  B.zMin) { this.pos.z =  B.zMin; this.yaw += dt * 2; }
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, B.yMin, B.yMax);

    this._poseGiraffe(t);
    this._updateSky(t);
    this._updateTrail(t);
    this._updateSparks(dt, t);
    this._updateBirds(dt, t);
    this._smash(dt);
    this._updateFlying(dt);
    this._updateDebris(dt);
    this._updateCamera(dt);
  }

  _poseGiraffe(t) {
    const obj = this.player.obj;
    obj.position.copy(this.pos);
    // face along the flight path, tipped horizontal, banking into turns
    this._q.setFromUnitVectors(FORWARD, this.dir);
    obj.quaternion.copy(this._q);
    obj.rotateX(Math.PI / 2.05);        // nose-down into the superman lie
    obj.rotateZ(this.roll * 0.55);
    this.player.flyPose(t, this.roll);
  }

  _updateSky(t) {
    const u = this.sky.material.uniforms;
    // hue drifts with time and with where she is, so the sky is never the same twice
    const k = t * 0.06 + this.pos.z * 0.0016 + this.pos.x * 0.0009;
    u.top.value.setHSL((k) % 1, 0.62, 0.30);
    u.mid.value.setHSL((k + 0.13) % 1, 0.85, 0.62);
    u.bottom.value.setHSL((k + 0.31) % 1, 0.78, 0.55);
    u.band.value = t * 1.4;
    this.sky.position.copy(this.pos);
    this.scene.fog.color.copy(u.mid.value).multiplyScalar(0.85);
  }

  _updateTrail(t) {
    // shift the history back one and drop the newest point in at the tail
    for (let i = TRAIL - 1; i > 0; i--) {
      this.trailPts[i].copy(this.trailPts[i - 1]);
      this.trailUp[i].copy(this.trailUp[i - 1]);
    }
    this.trailPts[0].copy(this.pos).addScaledVector(this.dir, -3.0);
    this._v.set(0, 1, 0).applyAxisAngle(this.dir, this.roll * 0.55);
    this.trailUp[0].crossVectors(this.dir, this._v).normalize();

    const pos = this.trailGeo.attributes.position.array;
    const col = this.trailGeo.attributes.color.array;
    for (let i = 0; i < TRAIL; i++) {
      const f = i / (TRAIL - 1);
      const w = (1 - f) * 0.95 + 0.04;            // tapers to nothing at the tail
      const p = this.trailPts[i], u = this.trailUp[i];
      const a = i * 6;
      pos[a]     = p.x - u.x * w; pos[a + 1] = p.y - u.y * w; pos[a + 2] = p.z - u.z * w;
      pos[a + 3] = p.x + u.x * w; pos[a + 4] = p.y + u.y * w; pos[a + 5] = p.z + u.z * w;

      // ~2.5 full turns of the wheel across the ribbon, so even the short
      // stretch that's on screen shows several bands rather than one colour
      const c = _hsl((t * 0.5 - f * 2.5) % 1, 0.95, 0.56);
      const fade = 0.35 + (1 - f) * 0.65;         // stays coloured, just softens
      col[a]     = col[a + 3] = c.r * fade;
      col[a + 1] = col[a + 4] = c.g * fade;
      col[a + 2] = col[a + 5] = c.b * fade;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  _emitSpark(x, y, z, spread, hue) {
    const i = this.sparkNext; this.sparkNext = (this.sparkNext + 1) % SPARKS;
    const a = i * 3;
    this.sparkPos[a] = x; this.sparkPos[a + 1] = y; this.sparkPos[a + 2] = z;
    this.sparkVel[a]     = (Math.random() - 0.5) * spread;
    this.sparkVel[a + 1] = (Math.random() - 0.5) * spread;
    this.sparkVel[a + 2] = (Math.random() - 0.5) * spread;
    const c = _hsl(hue ?? Math.random(), 1, 0.66);
    this.sparkCol[a] = c.r; this.sparkCol[a + 1] = c.g; this.sparkCol[a + 2] = c.b;
    this.sparkLife[i] = 1;
  }

  _updateSparks(dt, t) {
    for (let n = 0; n < 3; n++) {
      this._emitSpark(
        this.pos.x - this.dir.x * 1.6 + (Math.random() - 0.5) * 1.4,
        this.pos.y - this.dir.y * 1.6 + (Math.random() - 0.5) * 1.4,
        this.pos.z - this.dir.z * 1.6 + (Math.random() - 0.5) * 1.4,
        3, (t * 0.5) % 1,
      );
    }
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt * 0.75;
      const a = i * 3;
      this.sparkPos[a]     += this.sparkVel[a] * dt;
      this.sparkPos[a + 1] += this.sparkVel[a + 1] * dt - 2 * dt;
      this.sparkPos[a + 2] += this.sparkVel[a + 2] * dt;
      const f = Math.max(0, this.sparkLife[i]);
      this.sparkCol[a] *= 0.985; this.sparkCol[a + 1] *= 0.985; this.sparkCol[a + 2] *= 0.985;
      if (f <= 0) { this.sparkPos[a + 1] = -9999; }
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
  }

  _updateBirds(dt, t) {
    for (let i = 0; i < BIRDS; i++) {
      const b = this.birds[i];
      if (b.dead > 0) {
        b.dead -= dt;
        if (b.dead <= 0) Object.assign(b, this._newBird((i * 7 + Math.floor(t)) % BIRDS));
        else { this.birdBody.setMatrixAt(i, this._zeroM); this.birdWL.setMatrixAt(i, this._zeroM); this.birdWR.setMatrixAt(i, this._zeroM); continue; }
      }
      b.yaw += Math.sin(t * 0.35 + i) * 0.4 * dt;
      b.pos.x += Math.sin(b.yaw) * b.speed * dt;
      b.pos.z += Math.cos(b.yaw) * b.speed * dt;
      b.pos.y += Math.sin(t * 0.7 + i * 1.3) * 2.2 * dt;
      if (Math.abs(b.pos.x) > 300 || b.pos.z < -200 || b.pos.z > 560) b.yaw += Math.PI;

      const flap = Math.sin(t * 9 + b.flap) * 0.7;
      this._e.set(0, b.yaw, 0);
      this._q.setFromEuler(this._e);
      this._s.set(1, 1, 1);
      this.birdBody.setMatrixAt(i, this._m.compose(b.pos, this._q, this._s));
      this._e.set(0, b.yaw, flap);
      this._q.setFromEuler(this._e);
      this._v.set(b.pos.x - Math.cos(b.yaw) * 0.95, b.pos.y + 0.1, b.pos.z + Math.sin(b.yaw) * 0.95);
      this.birdWL.setMatrixAt(i, this._m.compose(this._v, this._q, this._s));
      this._e.set(0, b.yaw, -flap);
      this._q.setFromEuler(this._e);
      this._v.set(b.pos.x + Math.cos(b.yaw) * 0.95, b.pos.y + 0.1, b.pos.z - Math.sin(b.yaw) * 0.95);
      this.birdWR.setMatrixAt(i, this._m.compose(this._v, this._q, this._s));

      if (b.pos.distanceToSquared(this.pos) < HIT_RADIUS * HIT_RADIUS * 1.6) {
        b.dead = 2.5;
        this._burst(b.pos, 0x9fb4ff, 7);
        this.ui.popScore(b.pos, this.camera);
      }
    }
    this.birdBody.instanceMatrix.needsUpdate = true;
    this.birdWL.instanceMatrix.needsUpdate = true;
    this.birdWR.instanceMatrix.needsUpdate = true;
  }

  /** Anything close enough gets knocked out of the world. */
  _smash(dt) {
    const k = Math.floor(this.pos.z / 24);
    const r2 = HIT_RADIUS * HIT_RADIUS;
    for (let b = k - 1; b <= k + 1; b++) {
      const list = this.buckets.get(b);
      if (!list) continue;
      for (const item of list) {
        if (item.dead) continue;
        if (item.pos.distanceToSquared(this.pos) > r2) continue;
        item.dead = true;
        this._break(item);
      }
    }
  }

  _break(item) {
    let colour = 0xffffff;
    if (item.kind === 'inst') {
      item.mesh.setMatrixAt(item.index, this._zeroM);
      item.mesh.instanceMatrix.needsUpdate = true;
      colour = item.mesh.material.color.getHex();
    } else {
      colour = item.mesh.material.color.getHex();
      if (this.flying.length < FLYING) {
        const away = this._v.copy(item.pos).sub(this.pos).normalize();
        this.flying.push({
          mesh: item.mesh, life: 5.5,
          vel: new THREE.Vector3(away.x * 26 + this.dir.x * 18, 16 + Math.random() * 12, away.z * 26 + this.dir.z * 18),
          spin: new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7),
        });
      } else {
        item.mesh.visible = false;
      }
    }
    this._burst(item.pos, colour, 6);
    this.ui.popScore(item.pos, this.camera);
  }

  _burst(at, colour, n) {
    const c = new THREE.Color(colour);
    for (let i = 0; i < n; i++) {
      const j = this.debrisNext; this.debrisNext = (this.debrisNext + 1) % DEBRIS;
      const d = this.debrisState[j];
      d.life = 2.4;
      d.pos.copy(at);
      d.vel.set((Math.random() - 0.5) * 26, Math.random() * 20 + 4, (Math.random() - 0.5) * 26);
      d.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      d.size = 0.35 + Math.random() * 0.75;
      this.debris.setColorAt(j, c);
      this._debrisColourDirty = true;
      this._emitSpark(at.x, at.y, at.z, 14, Math.random());
    }
    if (this._debrisColourDirty) {
      this.debris.instanceColor.needsUpdate = true;
      this._debrisColourDirty = false;
    }
  }

  _updateFlying(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.life -= dt;
      f.vel.y -= 30 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.life <= 0 || f.mesh.position.y < -40) {
        f.mesh.visible = false;
        this.flying.splice(i, 1);
      }
    }
  }

  _updateDebris(dt) {
    for (let i = 0; i < DEBRIS; i++) {
      const d = this.debrisState[i];
      if (d.life <= 0) { this.debris.setMatrixAt(i, this._zeroM); continue; }
      d.life -= dt;
      d.vel.y -= 34 * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.rot.x += d.spin.x * dt; d.rot.y += d.spin.y * dt; d.rot.z += d.spin.z * dt;
      this._q.setFromEuler(d.rot);
      const s = d.size * Math.max(0, Math.min(1, d.life));
      this._s.set(s, s, s);
      this.debris.setMatrixAt(i, this._m.compose(d.pos, this._q, this._s));
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }

  _updateCamera(dt) {
    this._camPos.copy(this.pos)
      .addScaledVector(this.dir, -9.5)
      .add(this._v.set(0, 3.4, 0));
    this.camera.position.lerp(this._camPos, Math.min(1, dt * 5.5));
    this._camLook.copy(this.pos).addScaledVector(this.dir, 9);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._camLook);
    this.camera.rotateZ(this.roll * 0.22);
  }
}

const _c = new THREE.Color();
function _hsl(h, s, l) { return _c.setHSL(((h % 1) + 1) % 1, s, l); }
