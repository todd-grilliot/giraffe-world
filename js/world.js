// The world: five zones strung along +Z, getting higher and later in the day as
// you go. Everything you can stand on is an axis-aligned box, which keeps
// collision honest and cheap.

import * as THREE from 'three';

// ---------------------------------------------------------------- palettes

// Sky/fog/light anchors sampled at a zone's centre and lerped between, so
// walking north slowly turns morning into night.
const PALETTES = [
  { z: -20, sky:0xa9d9f2, fog:0xd2e8f4, sun:0xfff4dd, hemiSky:0xd2ecff, hemiGnd:0x74945e, amb:0.50, sunI:1.15, fogNear:34, fogFar:150 },
  { z:  20, sky:0xa9d9f2, fog:0xd2e8f4, sun:0xfff4dd, hemiSky:0xd2ecff, hemiGnd:0x74945e, amb:0.50, sunI:1.15, fogNear:34, fogFar:150 },
  { z:  90, sky:0x9ed6ee, fog:0xc4e3ec, sun:0xfff1d2, hemiSky:0xc9e9ff, hemiGnd:0x5f8f7a, amb:0.52, sunI:1.10, fogNear:30, fogFar:140 },
  { z: 165, sky:0x7cae9c, fog:0x87a894, sun:0xe8f0cd, hemiSky:0xa8d9c4, hemiGnd:0x3d5940, amb:0.46, sunI:0.85, fogNear:20, fogFar:104 },
  { z: 245, sky:0xf3a877, fog:0xf0c19c, sun:0xffcf94, hemiSky:0xffd3a8, hemiGnd:0x9a7a5e, amb:0.52, sunI:1.05, fogNear:28, fogFar:150 },
  { z: 330, sky:0x0b1020, fog:0x131c38, sun:0x9fb4ff, hemiSky:0x2b3a6b, hemiGnd:0x141a2e, amb:0.40, sunI:0.55, fogNear:26, fogFar:170 },
  { z: 400, sky:0x0b1020, fog:0x131c38, sun:0x9fb4ff, hemiSky:0x2b3a6b, hemiGnd:0x141a2e, amb:0.40, sunI:0.55, fogNear:26, fogFar:170 },
];

const _cA = new THREE.Color(), _cB = new THREE.Color();

export function paletteAt(z, out = {}) {
  let i = 0;
  while (i < PALETTES.length - 2 && z > PALETTES[i + 1].z) i++;
  const a = PALETTES[i], b = PALETTES[i + 1];
  const t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  const s = t * t * (3 - 2 * t); // smoothstep, so the light never snaps

  for (const key of ['sky', 'fog', 'sun', 'hemiSky', 'hemiGnd']) {
    _cA.setHex(a[key]); _cB.setHex(b[key]);
    out[key] = (out[key] || new THREE.Color()).copy(_cA).lerp(_cB, s);
  }
  out.amb     = THREE.MathUtils.lerp(a.amb,     b.amb,     s);
  out.sunI    = THREE.MathUtils.lerp(a.sunI,    b.sunI,    s);
  out.fogNear = THREE.MathUtils.lerp(a.fogNear, b.fogNear, s);
  out.fogFar  = THREE.MathUtils.lerp(a.fogFar,  b.fogFar,  s);
  out.night   = THREE.MathUtils.clamp((z - 250) / 80, 0, 1);
  return out;
}

// ---------------------------------------------------------------- builder

const BOX = new THREE.BoxGeometry(1, 1, 1);

class Builder {
  constructor(scene) {
    this.scene   = scene;
    this.solids  = [];   // { min, max, mesh?, bounce?, mover? }
    this.movers  = [];
    this.waters  = [];   // { x0,x1,z0,z1, y }
    this.camBlockers = []; // things the camera must not see through, but you can
                           // walk through — big trunks, mostly
    this.mats    = new Map();
    this.group   = new THREE.Group();
    scene.add(this.group);
  }

  mat(color, opts = {}) {
    const key = color + '|' + JSON.stringify(opts);
    if (!this.mats.has(key)) {
      this.mats.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
    }
    return this.mats.get(key);
  }

  /** A platform you can stand on. `y` is the WALKING SURFACE, not the centre. */
  plat(x, y, z, w, d, color, opts = {}) {
    const h = opts.thickness ?? 1.2;
    const mesh = new THREE.Mesh(BOX, this.mat(color, opts.matOpts));
    mesh.position.set(x, y - h / 2, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const solid = {
      min: new THREE.Vector3(x - w / 2, y - h, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y,     z + d / 2),
      mesh, bounce: opts.bounce || 0,
    };
    this.solids.push(solid);
    return solid;
  }

  /** A platform that slides back and forth. Standing on it carries you along. */
  moving(x, y, z, w, d, color, { axis = 'x', amp = 6, period = 5, phase = 0, ...opts } = {}) {
    const solid = this.plat(x, y, z, w, d, color, opts);
    const home = new THREE.Vector3(x, y, z);
    solid.mover = {
      solid, home, axis, amp, period, phase,
      offset: 0,                       // where we are relative to `home`
      delta: new THREE.Vector3(),      // how far we moved this frame — riders get this too
      update(t) {
        const want = Math.sin((t / this.period + this.phase) * Math.PI * 2) * this.amp;
        const d = want - this.offset;
        this.offset = want;
        this.delta.set(0, 0, 0);
        this.delta[this.axis] = d;
        solid.mesh.position[this.axis] += d;
        solid.min[this.axis] += d;
        solid.max[this.axis] += d;
      },
    };
    this.movers.push(solid.mover);
    return solid;
  }

  /**
   * Stops the camera without stopping the player. A solid trunk would shove you
   * off the branches spiralling around it, but a camera that can see straight
   * through a three-metre tree fills the screen with bark.
   */
  blocker(cx, cy, cz, w, h, d) {
    this.camBlockers.push({
      min: new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
      max: new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2),
    });
  }

  /** Decoration — drawn, but you pass right through it. */
  deco(geo, mat, x, y, z, rot = 0, scale = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = rot;
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(scale.x, scale.y, scale.z);
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  water(x0, z0, x1, z1, y, color = 0x4a9fc4) {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
    const mat = new THREE.MeshLambertMaterial({
      color, transparent: true, opacity: 0.78, depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.group.add(m);
    this.waters.push({ x0, x1, z0, z1, y, mesh: m });
    return m;
  }

  /**
   * A pile of boxes drawn in a single call. Solid ones still get their own
   * collision box, and because the visual is one InstancedMesh each block can
   * still be knocked out individually at the end — a castle this way costs one
   * draw call instead of seventy.
   *
   * Note `y` here is the block's CENTRE, unlike plat().
   */
  bricks(color, list) {
    const mesh = new THREE.InstancedMesh(BOX, this.mat(color), list.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
    const q = new THREE.Quaternion(), sc = new THREE.Vector3();
    list.forEach((bk, i) => {
      p.set(bk.x, bk.y, bk.z);
      sc.set(bk.w, bk.h, bk.d);
      mesh.setMatrixAt(i, m4.compose(p, q, sc));
      if (bk.solid) {
        this.solids.push({
          min: new THREE.Vector3(bk.x - bk.w / 2, bk.y - bk.h / 2, bk.z - bk.d / 2),
          max: new THREE.Vector3(bk.x + bk.w / 2, bk.y + bk.h / 2, bk.z + bk.d / 2),
          bounce: 0,
        });
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Many copies of one shape in one draw call — for trees, rocks, grass. */
  instanced(geo, mat, transforms) {
    const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    transforms.forEach((t, i) => {
      pos.set(t.x, t.y, t.z);
      e.set(t.rx || 0, t.ry || 0, t.rz || 0);
      q.setFromEuler(e);
      const s = t.s ?? 1;
      scl.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
      mesh.setMatrixAt(i, m4.compose(pos, q, scl));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
}

// deterministic pseudo-random, so the world is identical on every visit
let _seed = 1337;
function rnd() { _seed = (_seed * 1664525 + 1013904223) % 4294967296; return _seed / 4294967296; }
const rr = (a, b) => a + rnd() * (b - a);

// ---------------------------------------------------------------- trees etc.

function trees(b, spots, { trunk = 0x6b4b32, leaf = 0x4a7c46, leaf2 = 0x3f6b3c } = {}) {
  const trunkGeo = new THREE.CylinderGeometry(0.34, 0.5, 1, 6);
  const leafGeo  = new THREE.IcosahedronGeometry(1, 0);
  const tA = [], lA = [], lB = [];
  for (const s of spots) {
    const h = s.h ?? rr(4.5, 8.5);
    tA.push({ x: s.x, y: s.y + h / 2, z: s.z, sy: h, s: 1, ry: rr(0, 6.3) });
    const cw = h * 0.42;
    lA.push({ x: s.x, y: s.y + h * 0.94, z: s.z, s: cw, ry: rr(0, 6.3), rz: rr(-0.2, 0.2) });
    lB.push({ x: s.x + rr(-0.7, 0.7), y: s.y + h * 1.32, z: s.z + rr(-0.7, 0.7), s: cw * 0.66, ry: rr(0, 6.3) });
  }
  b.instanced(trunkGeo, b.mat(trunk),  tA);
  b.instanced(leafGeo,  b.mat(leaf),   lA);
  b.instanced(leafGeo,  b.mat(leaf2),  lB);
}

function rocks(b, spots, color = 0x8b8478) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  b.instanced(geo, b.mat(color), spots.map(s => ({
    x: s.x, y: s.y, z: s.z, s: s.s ?? rr(0.5, 1.5),
    ry: rr(0, 6.3), rx: rr(-0.3, 0.3),
  })));
}

function tufts(b, spots, color = 0x6ba556) {
  const geo = new THREE.ConeGeometry(0.22, 1, 4);
  b.instanced(geo, b.mat(color), spots.map(s => ({
    x: s.x, y: s.y + 0.22, z: s.z,
    sy: rr(0.35, 0.8), sx: rr(0.5, 0.9), sz: rr(0.5, 0.9), ry: rr(0, 6.3),
  })));
}

/**
 * A bouncy mushroom. Touch the cap and it throws you at `aim` — the arc is
 * solved at launch, so there's no timing or run-up to get right. The pad is
 * deliberately wider than the cap it sits under, so a near miss still counts.
 */
function mushroom(b, x, y, z, { cap = 0xd4574e, stem = 0xf0e4cf, r = 2.1, bounce = 24, aim = null } = {}) {
  const stemH = 1.4;
  b.deco(new THREE.CylinderGeometry(r * 0.3, r * 0.42, stemH, 8), b.mat(stem), x, y - stemH / 2 + 0.1, z);
  const capMesh = b.deco(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), b.mat(cap), x, y - 0.35, z);
  capMesh.scale.set(1, 0.62, 1);
  const s = b.plat(x, y + 0.05, z, r * 1.75, r * 1.75, cap, { thickness: 0.5, bounce, castShadow: false });
  s.mesh.visible = false;
  if (aim) s.aim = new THREE.Vector3(aim[0], aim[1], aim[2]);
  return s;
}

/**
 * A castle out of a few dozen blocks. Walls are solid so you can climb the
 * ramparts; the trimmings are decoration. Either way every single block is its
 * own mesh, so at the end she can take the whole thing apart.
 */
function castle(b, cx, gy, cz, { s = 3, half = 2, stone = 0x9c9689, roof = 0x8a4a44 } = {}) {
  const wall = [];   // all one instanced batch at the end
  const brick = (x, y, z, solid, w = s, h = s, d = s) =>
    wall.push({ x, y: y + h / 2, z, w: w * 0.98, h: h * 0.98, d: d * 0.98, solid });

  const R = half * s;                       // half-width of the courtyard
  const gateAt = -R;                        // gate in the near wall

  // --- curtain walls, two courses high
  for (let level = 0; level < 2; level++) {
    const y = gy + level * s;
    for (let i = -half; i <= half; i++) {
      const o = i * s;
      // near wall, with a gap for the gate
      if (!(i === 0 && level === 0)) brick(cx + o, y, cz + gateAt, true);
      brick(cx + o, y, cz + R, true);        // far wall
      if (Math.abs(i) !== half) {            // side walls (corners are towers)
        brick(cx - R, y, cz + o, true);
        brick(cx + R, y, cz + o, true);
      }
    }
  }
  // lintel over the gate
  brick(cx, gy + s, cz + gateAt, true);

  // --- battlements: alternating merlons around the top, decorative
  const top = gy + 2 * s;
  for (let i = -half; i <= half; i++) {
    if (i % 2) continue;
    const o = i * s;
    for (const [px, pz] of [[cx + o, cz + gateAt], [cx + o, cz + R], [cx - R, cz + o], [cx + R, cz + o]]) {
      brick(px, top + s * 0.3, pz, false, s * 0.6, s * 0.6, s * 0.6);
    }
  }

  // --- corner towers, a course taller, with a cap
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = cx + sx * R, tz = cz + sz * R;
    for (let level = 0; level < 3; level++) brick(tx, gy + level * s, tz, true, s * 1.25, s, s * 1.25);
    b.deco(new THREE.ConeGeometry(s * 0.95, s * 1.15, 6), b.mat(roof), tx, gy + 3 * s + s * 0.55, tz);
    b.deco(new THREE.SphereGeometry(s * 0.13, 6, 5), b.mat(0xf0d97a), tx, gy + 3 * s + s * 1.2, tz);
  }

  // --- keep in the middle, so there's something to stand on
  const kx = cx, kz = cz;
  for (let level = 0; level < 3; level++) brick(kx, gy + level * s, kz, true, s * 1.6, s, s * 1.6);
  b.deco(new THREE.ConeGeometry(s * 1.25, s * 1.5, 6), b.mat(roof), kx, gy + 3 * s + s * 0.7, kz);

  b.bricks(stone, wall);   // the whole castle, one draw call
  b.blocker(cx, gy + s * 1.5, cz, (half * 2 + 2) * s, s * 3, (half * 2 + 2) * s);
}

/** A little house for a giraffe — tall door, because giraffe. */
function hut(b, x, y, z, { wall = 0xe8dcc4, roof = 0xa8503f, face = 0, w = 5, d = 5, h = 4.2 } = {}) {
  b.plat(x, y + h, z, w, d, wall, { thickness: h });
  const r = b.deco(new THREE.ConeGeometry(w * 0.86, h * 0.8, 4), b.mat(roof), x, y + h + h * 0.4, z, Math.PI / 4 + face);
  r.receiveShadow = true;
  const fz = Math.cos(face), fx = Math.sin(face);
  b.deco(new THREE.BoxGeometry(1.1, 2.6, 0.2), b.mat(0x5f4632), x + fx * (d / 2 + 0.05), y + 1.3, z + fz * (d / 2 + 0.05), face);
  b.deco(new THREE.BoxGeometry(1.0, 1.0, 0.2), b.mat(0x93c8e0), x - fz * (w / 2 + 0.05), y + 2.6, z + fx * (w / 2 + 0.05), face + Math.PI / 2);
}

/** Parked in the clouds. Nobody knows whose it is. */
function spaceship(b, x, y, z) {
  const HULL = 0xb9c2d6, TRIM = 0x6f7d99, GLASS = 0x8fe3ff;
  const hull = b.deco(new THREE.SphereGeometry(4.4, 16, 10), b.mat(HULL), x, y, z);
  hull.scale.set(1, 0.28, 1);
  const rim = b.deco(new THREE.TorusGeometry(4.3, 0.5, 8, 20), b.mat(TRIM), x, y, z);
  rim.rotation.x = Math.PI / 2;
  const dome = b.deco(new THREE.SphereGeometry(2.0, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    b.mat(GLASS, { transparent: true, opacity: 0.55 }), x, y + 0.7, z);
  dome.castShadow = false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.deco(new THREE.SphereGeometry(0.36, 6, 5), b.mat(0xffd166),
      x + Math.cos(a) * 3.5, y - 0.5, z + Math.sin(a) * 3.5);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const lx = x + Math.cos(a) * 2.6, lz = z + Math.sin(a) * 2.6;
    const leg = b.deco(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 6), b.mat(TRIM), lx, y - 1.5, lz);
    leg.rotation.x = Math.sin(a) * 0.22; leg.rotation.z = -Math.cos(a) * 0.22;
    b.deco(new THREE.SphereGeometry(0.5, 8, 6), b.mat(TRIM), lx, y - 2.7, lz);
  }
  // you can land on it
  b.plat(x, y + 1.15, z, 5.4, 5.4, HULL, { thickness: 0.5, castShadow: false }).mesh.visible = false;
  b.blocker(x, y, z, 9, 4, 9);
}

/** A big cactus in sunglasses, because the desert should have some attitude. */
function cactus(b, x, y, z, { s = 1, face = 0 } = {}) {
  const GREEN = 0x4f8f5c, GREEN_D = 0x3f7549, SHADE = 0x201d26, LENS = 0x2f3a4a;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = face;
  b.group.add(g);

  const add = (geo, color, px, py, pz, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, b.mat(color));
    m.position.set(px, py, pz);
    m.rotation.x = rx; m.rotation.z = rz;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const H = 8.2 * s, R = 1.05 * s;
  add(new THREE.CylinderGeometry(R * 0.92, R * 1.12, H, 12), GREEN, 0, H / 2, 0);
  add(new THREE.SphereGeometry(R * 0.92, 12, 8), GREEN, 0, H, 0);

  // ribs, so it isn't a smooth pole
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rib = add(new THREE.BoxGeometry(0.1 * s, H * 0.94, 0.1 * s), GREEN_D,
      Math.cos(a) * R * 0.94, H / 2, Math.sin(a) * R * 0.94);
    rib.scale.z = 1.8;
  }

  // two arms: out, then up
  for (const dir of [-1, 1]) {
    const armY = H * (dir < 0 ? 0.52 : 0.42);
    const reach = 1.5 * s * dir;
    add(new THREE.CylinderGeometry(R * 0.5, R * 0.55, Math.abs(reach) * 2, 10),
      GREEN, reach * 0.55, armY, 0, 0, Math.PI / 2);
    const upH = 2.4 * s * (dir < 0 ? 1.15 : 0.9);
    add(new THREE.CylinderGeometry(R * 0.48, R * 0.52, upH, 10), GREEN, reach, armY + upH / 2, 0);
    add(new THREE.SphereGeometry(R * 0.48, 10, 8), GREEN, reach, armY + upH, 0);
  }

  // sunglasses
  const eyeY = H * 0.86, front = R * 0.86;
  const lensGeo = new THREE.SphereGeometry(0.34 * s, 10, 8);
  for (const dx of [-0.44 * s, 0.44 * s]) {
    const lens = add(lensGeo, LENS, dx, eyeY, front);
    lens.scale.set(1.05, 0.82, 0.34);
  }
  add(new THREE.BoxGeometry(0.34 * s, 0.1 * s, 0.14 * s), SHADE, 0, eyeY + 0.04 * s, front);
  for (const dx of [-0.86 * s, 0.86 * s]) {
    add(new THREE.BoxGeometry(0.5 * s, 0.09 * s, 0.12 * s), SHADE, dx, eyeY + 0.05 * s, front * 0.5);
  }

  b.blocker(x, y + H / 2, z, R * 2.4, H, R * 2.4);
  return g;
}

// ---------------------------------------------------------------- the world

export function buildWorld(scene) {
  _seed = 1337;
  const b = new Builder(scene);

  const GRASS = 0x6ea24f, GRASS_D = 0x5c8b41, DIRT = 0x8a6a4a, WOOD = 0x9a6f45;
  const STONE = 0x9a9488, SAND = 0xe6d29b, MOSS = 0x4f7a4a, CLOUD = 0xe2eaff;

  const memoryAnchors = [];   // 16 points, in the order Sarah should meet them
  const checkpoints   = [];
  const sparkPoints   = [];
  const mem = (x, y, z) => { memoryAnchors.push(new THREE.Vector3(x, y, z)); };
  const cp  = (x, y, z) => { checkpoints.push(new THREE.Vector3(x, y, z)); };
  const spark = (x, y, z) => { sparkPoints.push(new THREE.Vector3(x, y, z)); };
  /**
   * A run of sparks between two points. y0/y1 are the SURFACE heights at each
   * end; the sparks float chest-high above that, with a gentle bulge in the
   * middle that traces a jump without ever floating out of reach.
   */
  const sparkArc = (x0, y0, z0, x1, y1, z1, n) => {
    const span  = Math.hypot(x1 - x0, z1 - z0);
    const bulge = Math.min(1.0, span * 0.07);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      spark(
        THREE.MathUtils.lerp(x0, x1, t),
        THREE.MathUtils.lerp(y0, y1, t) + 0.85 + Math.sin(t * Math.PI) * bulge,
        THREE.MathUtils.lerp(z0, z1, t),
      );
    }
  };

  // ======================================================= 1. HOME MEADOW
  b.plat(0, 0, 18.5, 48, 75, GRASS, { thickness: 3 });   // stops at z=56, where the water begins
  cp(0, 2.2, -6);

  // little house
  b.plat(-12.5, 3.4, 24, 8, 7, 0xe8dcc4, { thickness: 3.4 });
  const roof = b.deco(new THREE.ConeGeometry(6.6, 3.2, 4), b.mat(0xa8503f), -12.5, 5.0, 24, Math.PI / 4);
  roof.receiveShadow = true;
  b.deco(new THREE.BoxGeometry(1.2, 2.1, 0.2), b.mat(0x5f4632), -12.5, 1.05, 20.4);
  b.deco(new THREE.BoxGeometry(1.5, 1.5, 0.2), b.mat(0x93c8e0), -15.2, 2.2, 20.4);
  b.deco(new THREE.BoxGeometry(1.5, 1.5, 0.2), b.mat(0x93c8e0), -9.8, 2.2, 20.4);

  // picket fence along the west edge
  {
    const posts = [];
    for (let z = 2; z < 44; z += 1.6) posts.push({ x: -21, y: 0.75, z, sy: 1.5, s: 0.9 });
    b.instanced(new THREE.BoxGeometry(0.22, 1, 0.22), b.mat(0xe4dccb), posts);
  }

  // A castle right by the start, so there's something to head towards before
  // the first lantern is even found. Every block of it can be knocked out later.
  castle(b, 16, 0, -6, { s: 3, half: 2 });

  // homes for the neighbours
  hut(b, 12, 0, 20, { face: Math.PI, roof: 0x4f7ba8 });
  hut(b, -19, 0, 46, { face: -0.5, roof: 0x7a9e4f, w: 4.4, d: 4.4, h: 3.8 });

  trees(b, [
    { x: 18, y: 0, z: 26, h: 6 },
    { x: -17, y: 0, z: 40, h: 8 }, { x: 9, y: 0, z: 45, h: 5.5 },
    { x: -6, y: 0, z: 48, h: 6.5 }, { x: 20, y: 0, z: 44, h: 7 },
  ]);
  tufts(b, Array.from({ length: 46 }, () => ({ x: rr(-22, 22), y: 0, z: rr(-14, 54) })));
  rocks(b, [{ x: 8, y: 0.4, z: -2, s: 0.8 }, { x: -4, y: 0.3, z: 14, s: 0.6 }]);

  // memory 1 — right there, so she knows what she's looking for
  mem(0, 1.4, 7);
  sparkArc(0, 0, -3, 0, 0, 5, 3);

  // memory 2 — round the side of the house
  mem(-12.5, 1.4, 29.5);
  sparkArc(-4, 0, 22, -11, 0, 29, 4);

  // memory 3 — first real jump: three steps up to a lookout
  b.plat(9,  2.2, 34, 5.8, 5.8, DIRT);
  b.plat(13, 4.4, 38, 5.4, 5.4, DIRT);
  b.plat(9,  6.6, 42, 6.0, 6.0, WOOD);
  mem(9, 8.0, 42);
  sparkArc(9, 2.2, 34, 13, 4.4, 38, 3);
  sparkArc(13, 4.4, 38, 9, 6.6, 42, 3);
  cp(9, 7.4, 42);

  // ======================================================= 2. THE CREEK
  b.water(-30, 56, 30, 128, -1.4);
  b.plat(-22, 0, 92.5, 16, 73, GRASS_D, { thickness: 3 });  // west bank, abuts the meadow at z=56
  b.plat(24,  0, 92.5, 14, 73, GRASS_D, { thickness: 3 });  // east bank

  trees(b, [
    { x: -20, y: 0, z: 68 }, { x: -24, y: 0, z: 88 }, { x: -19, y: 0, z: 110 },
    { x: 25, y: 0, z: 72 }, { x: 22, y: 0, z: 96 }, { x: 26, y: 0, z: 118 },
  ], { leaf: 0x4d8560, leaf2: 0x3e6e4e });
  rocks(b, Array.from({ length: 14 }, () => ({ x: rr(-28, 28), y: rr(-1, 0.2), z: rr(58, 126), s: rr(0.5, 1.3) })), 0x7d867e);

  // stepping stones, zig-zagging north
  const stones = [
    [-3, 0.8, 62], [3.5, 1.1, 72], [-2, 1.4, 78], [4.5, 1.1, 84],
  ];
  for (const [x, y, z] of stones) b.plat(x, y, z, 4.8, 4.8, STONE, { thickness: 2.6 });
  sparkArc(0, 0, 57, -3, 0.8, 62, 3);
  for (let i = 0; i < stones.length - 1; i++) {
    sparkArc(stones[i][0], stones[i][1], stones[i][2], stones[i+1][0], stones[i+1][1], stones[i+1][2], 2);
  }

  // memory 4 — a stone island in the middle of the water
  b.plat(-6.5, 1.6, 90, 7, 7, STONE, { thickness: 3 });
  tufts(b, [{ x: -8, y: 1.6, z: 91 }, { x: -5, y: 1.6, z: 88.5 }], 0x6f9a55);
  mem(-6.5, 3.0, 90);
  cp(-6.5, 2.9, 90);

  // memory 5 — up a small waterfall on the east bank
  b.plat(14, 2.4, 96, 6, 6, MOSS);
  b.plat(19, 5.0, 102, 5.5, 5.5, MOSS);
  b.plat(14.5, 7.6, 108, 5, 5, MOSS);
  b.water(11.6, 105.6, 17.4, 110.4, 7.55, 0x6fc0dd);
  mem(14.5, 9.0, 108);
  sparkArc(-6.5, 1.6, 90, 14, 2.4, 96, 4);
  sparkArc(14, 2.4, 96, 19, 5.0, 102, 3);

  // memory 6 — across two sliding lily pads
  b.moving(2, 4.0, 114, 6.5, 6.5, 0x579c68, { axis: 'x', amp: 6, period: 7.5, thickness: 0.7 });
  b.moving(-4, 5.4, 122, 6.5, 6.5, 0x579c68, { axis: 'x', amp: 5.5, period: 6.5, phase: 0.5, thickness: 0.7 });
  b.plat(-14, 6.4, 126, 9, 6, GRASS_D, { thickness: 4 });
  mem(-14, 7.8, 126);
  cp(-14, 7.8, 126);

  // ======================================================= 3. THE DEEP WOODS
  b.plat(0, 6.4, 152, 46, 46, 0x4b6b3f, { thickness: 4 });
  // Kept to the edges: trees through the middle of the wood spent most of
  // their time between the camera and the giraffe.
  trees(b, Array.from({ length: 15 }, () => ({
    x: (rr(0, 1) < 0.5 ? -1 : 1) * rr(12, 22), y: 6.4, z: rr(132, 174), h: rr(7, 13),
  })), { trunk: 0x59402c, leaf: 0x36613c, leaf2: 0x2c5233 });
  tufts(b, Array.from({ length: 34 }, () => ({ x: rr(-21, 21), y: 6.4, z: rr(132, 174) })), 0x3f6b3a);
  rocks(b, Array.from({ length: 10 }, () => ({ x: rr(-20, 20), y: 6.8, z: rr(134, 172), s: rr(0.6, 1.6) })), 0x6d6a5e);

  hut(b, -19, 6.4, 148, { face: Math.PI * 0.5, wall: 0xd9cbb0, roof: 0x5a4030, w: 4.6, d: 4.6, h: 4 });

  // memory 7 — tucked behind the treeline, off the obvious path
  b.plat(-16, 7.6, 142, 6, 6, 0x54764a);
  mem(-16, 9.0, 142);
  sparkArc(-14, 6.4, 132, -16, 7.6, 141, 3);

  // memory 8 — first bounce: mushroom up to a branch platform. The cap's launch
  // speed has to clear the branch with room to spare, or the jump reads as broken.
  // The pad sits well back from the branch: throw from too close and the arc is
  // so steep it clips the platform's leading edge on the way up instead of
  // sailing over it.
  mushroom(b, 4, 7.2, 147, { cap: 0xd4574e, bounce: 28, aim: [4, 14.5, 156] });
  b.plat(4, 14.5, 156, 7.5, 7.5, WOOD);
  mem(4, 15.9, 156);
  sparkArc(4, 7.6, 147, 4, 13.5, 154, 4);
  cp(4, 14.3, 156);

  // memory 9 — a spiral of branches around the big tree, evenly spaced so each
  // step is a single jump
  b.deco(new THREE.CylinderGeometry(2.2, 3.2, 34, 10), b.mat(0x503a28), -6, 23, 166);
  b.blocker(-6, 23, 166, 5.4, 34, 5.4);
  // Crown, so the trunk doesn't just stop in mid-air above the canopy platform.
  //
  // Held well clear of the branch below it. These are `deco`, so they aren't
  // camera occluders and nothing pulls the view in when it meets one — the
  // camera simply ends up inside the leaves and the screen goes green. The
  // chase sits about 5.8 above her feet, and the top branch is at 25.8, so
  // every underside here stays above 33 to leave the climb an open sky.
  b.deco(new THREE.IcosahedronGeometry(5.6, 0), b.mat(0x2c5233), -6, 39.5, 166, 0.6);
  b.deco(new THREE.IcosahedronGeometry(3.8, 0), b.mat(0x36613c), -10.5, 37.5, 168.5, 1.2);
  b.deco(new THREE.IcosahedronGeometry(3.6, 0), b.mat(0x36613c), -1.5, 37.6, 163.5, 2.1);
  // wide branches — the climb should be about looking around, not about landing
  // on a dinner plate four times in a row
  const spiral = [
    [-1.5, 17.0, 164], [-4.5, 19.2, 170.5], [-10.5, 21.4, 169], [-12, 23.6, 163],
  ];
  for (const [x, y, z] of spiral) b.plat(x, y, z, 7, 7, 0x6b4c33, { thickness: 0.8 });
  b.plat(-6, 25.8, 166, 9, 9, 0x3f6b3c);
  mem(-6, 27.2, 166);
  for (let i = 0; i < spiral.length - 1; i++) {
    sparkArc(spiral[i][0], spiral[i][1], spiral[i][2], spiral[i+1][0], spiral[i+1][1], spiral[i+1][2], 2);
  }
  cp(-6, 25.6, 166);

  // memory 10 — a hop across moving branches out of the canopy
  b.moving(2, 26.6, 174, 6.5, 6.5, 0x6b4c33, { axis: 'x', amp: 5.5, period: 7, thickness: 0.7 });
  b.moving(8, 26.6, 182, 6.5, 6.5, 0x6b4c33, { axis: 'z', amp: 4, period: 6, phase: 0.3, thickness: 0.7 });
  b.plat(14, 25.4, 190, 11, 10, 0x54764a, { thickness: 4 });
  mem(14, 26.8, 190);
  cp(14, 26.8, 190);

  // ramp back down toward the sea
  for (let i = 0; i < 6; i++) {
    b.plat(14 - i * 1.2, 25.4 - i * 3.8, 198.25 + i * 5.5, 7.5 - i * 0.2, 6.5, i < 3 ? 0x54764a : SAND, { thickness: 1.4 });
  }

  // ======================================================= 4. THE COAST
  b.plat(0, 1.6, 232, 54, 50, SAND, { thickness: 4 });
  // wide enough that its far edge dissolves into fog instead of showing a seam
  b.water(-150, 206, 150, 430, -0.8, 0x3f8fb8);
  rocks(b, Array.from({ length: 18 }, () => ({ x: rr(-26, 26), y: rr(1.4, 2.6), z: rr(210, 254), s: rr(0.4, 1.4) })), 0xb5a88c);
  tufts(b, Array.from({ length: 16 }, () => ({ x: rr(-25, 25), y: 1.6, z: rr(210, 250) })), 0xa8b06a);

  // The dry inland side of the sand. One big cactus in sunglasses, standing
  // where she comes over the ridge, and a couple of smaller ones behind it.
  cactus(b, -15, 1.6, 214, { s: 1.25, face: 0.18 });
  cactus(b, 15, 1.6, 209, { s: 0.8, face: -0.5 });
  hut(b, 6, 1.6, 219, { face: Math.PI, wall: 0xf0e0bc, roof: 0xc47f52, w: 4.6, d: 4.6, h: 3.9 });
  cactus(b, -22, 1.6, 232, { s: 0.62, face: 0.9 });
  trees(b, [
    { x: -22, y: 1.6, z: 216, h: 7 }, { x: 23, y: 1.6, z: 222, h: 6.5 }, { x: -24, y: 1.6, z: 246, h: 7.5 },
  ], { trunk: 0x8a6a4a, leaf: 0x5f8f52, leaf2: 0x527f47 });

  // a smaller one down on the sand
  castle(b, 12, 1.6, 236, { s: 2.4, half: 1, stone: 0xdcc79a, roof: 0xb0764a });

  // memory 11 — end of the pier
  for (let i = 0; i < 8; i++) {
    b.plat(-8 - i * 0.4, 2.6, 236 + i * 3.2, 4.4, 3.2, WOOD, { thickness: 0.5 });
    b.deco(new THREE.CylinderGeometry(0.22, 0.22, 4, 5), b.mat(0x7a5a3a), -8 - i * 0.4 - 1.6, 0.6, 236 + i * 3.2);
    b.deco(new THREE.CylinderGeometry(0.22, 0.22, 4, 5), b.mat(0x7a5a3a), -8 - i * 0.4 + 1.6, 0.6, 236 + i * 3.2);
  }
  b.plat(-11.2, 2.6, 263.5, 7, 7, WOOD, { thickness: 0.6 });
  mem(-11.2, 4.0, 263.5);
  sparkArc(-8, 2.6, 238, -11, 2.6, 258, 6);
  cp(-11.2, 4.0, 263.5);

  // memory 12 — bobbing rafts out on the water
  b.moving(-2, 3.2, 258, 7, 7, 0xa87f52, { axis: 'y', amp: 0.8, period: 4, thickness: 0.6 });
  b.moving(6,  3.6, 264, 7, 7, 0xa87f52, { axis: 'x', amp: 5, period: 6.5, phase: 0.25, thickness: 0.6 });
  b.plat(14, 4.2, 270, 8, 8, 0xb5a88c, { thickness: 4 });
  mem(14, 5.6, 270);
  cp(14, 5.6, 270);

  // memory 13 — up the headland rocks. Steps of 2.7, so a single jump clears
  // each one; nothing on the way to any memory should need the double jump.
  b.plat(20, 6.9, 262, 6, 6, 0xb5a88c);
  b.plat(24, 9.6, 254, 6, 6, 0xb5a88c);
  b.plat(20, 12.3, 247, 7, 7, 0xa89a7e);
  mem(20, 13.7, 245);
  sparkArc(14, 4.2, 270, 20, 6.9, 262, 3);
  sparkArc(20, 6.9, 262, 24, 9.6, 254, 3);
  cp(20, 12.3, 245);

  // ======================================================= 5. THE NIGHT SKY
  // A big mushroom, planted on the headland, flings you into the clouds. From
  // there the climb is a staircase: every step is a rise of 2.6 over a gap of
  // about one, which a single jump clears comfortably.
  mushroom(b, 20, 13.6, 250, { cap: 0xb07fd4, stem: 0xe8ddf2, r: 2.6, bounce: 33, aim: [16, 23.0, 262] });
  sparkArc(20, 13.6, 253, 16, 23.0, 259, 4);

  // Puffs tucked around the rim turn a flat box into something cloud-shaped.
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  const cloudify = (x, y, z, w) => {
    const n = 9, r = w / 2;
    const t = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr(-0.2, 0.2);
      t.push({
        x: x + Math.cos(a) * r * rr(0.82, 1.0),
        y: y - rr(0.5, 1.3),
        z: z + Math.sin(a) * r * rr(0.82, 1.0),
        s: rr(1.1, 2.0), ry: rr(0, 6.3),
      });
    }
    b.instanced(puffGeo, b.mat(CLOUD), t);
  };

  const sky = [
    [16, 23.0, 262, 9  ], [ 9, 25.6, 271, 8.5], [ 2, 28.2, 280, 8],
    [ 8, 30.8, 289, 8  ], [ 1, 33.4, 298, 8  ], [-7, 36.0, 307, 9],
  ];
  for (const [x, y, z, w] of sky) {
    b.plat(x, y, z, w, w, CLOUD, { thickness: 2.2 });
    cloudify(x, y, z, w);
  }
  for (let i = 0; i < sky.length - 1; i++) {
    sparkArc(sky[i][0], sky[i][1], sky[i][2], sky[i+1][0], sky[i+1][1], sky[i+1][2], 3);
  }
  cp(16, 23.0, 262);
  cp(2, 28.2, 280);

  // memory 14 — one step sideways off the third cloud
  b.plat(-8, 28.6, 280, 6, 6, CLOUD, { thickness: 1.6 });
  cloudify(-8, 28.6, 280, 6);
  mem(-8, 30.0, 280);

  // memory 15 — across two drifting clouds
  b.moving(-2, 38.6, 316, 7.5, 7.5, CLOUD, { axis: 'x', amp: 4.5, period: 7.5, thickness: 0.8 });
  b.moving( 4, 41.2, 324, 7.5, 7.5, CLOUD, { axis: 'z', amp: 3.5, period: 6, phase: 0.4, thickness: 0.8 });
  b.plat(-1, 43.8, 333, 9, 9, CLOUD, { thickness: 2.4 });
  cloudify(-1, 43.8, 333, 9);
  mem(-1, 45.2, 333);
  cp(-1, 43.8, 333);

  spaceship(b, 13, 40, 318);

  // memory 16 — the top of everything
  b.plat(-1, 46.6, 342, 7, 7, CLOUD, { thickness: 1.4 });
  cloudify(-1, 46.6, 342, 7);
  b.plat(-1, 49.4, 351, 12, 12, 0xf0f5ff, { thickness: 2.4 });
  cloudify(-1, 49.4, 351, 12);
  mem(-1, 51.3, 351);
  sparkArc(-1, 43.8, 337, -1, 49.4, 347, 4);

  // a ring of little clouds around the summit, just to look nice
  {
    const puffs = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = rr(17, 32);
      puffs.push({ x: Math.cos(a) * r - 1, y: rr(26, 52), z: Math.sin(a) * r + 330, s: rr(1.6, 4.2) });
    }
    b.instanced(new THREE.IcosahedronGeometry(1, 0), b.mat(0xe4ecff, { transparent: true, opacity: 0.5 }), puffs);
  }

  // Snap every checkpoint to just above whatever it sits on. Respawning exactly
  // level with a surface makes the swept floor test miss it and drops you
  // straight through — this removes the whole class of mistake, however
  // carelessly the numbers above were typed.
  for (const c of checkpoints) {
    let best = -Infinity;
    for (const s of b.solids) {
      if (s.mover) continue;
      if (c.x < s.min.x - 0.5 || c.x > s.max.x + 0.5) continue;
      if (c.z < s.min.z - 0.5 || c.z > s.max.z + 0.5) continue;
      if (s.max.y > c.y + 1.5) continue;
      if (s.max.y > best) best = s.max.y;
    }
    if (best > -Infinity) c.y = best + 0.2;
  }

  return {
    solids: b.solids,
    camBlockers: b.camBlockers,
    movers: b.movers,
    waters: b.waters,
    memoryAnchors,
    checkpoints,
    sparkPoints,
    group: b.group,
    update(t) { for (const m of b.movers) m.update(t); },
  };
}
