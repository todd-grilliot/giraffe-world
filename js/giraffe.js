// The giraffe rig, shared by the player and by everyone else who lives here.
// Built from primitives with a procedurally drawn spot pattern, so there are no
// model files to load.

import * as THREE from 'three';

export const HIDE   = 0xe8b45c;
export const HIDE_D = 0xd39a44;
export const CREAM  = 0xf7ebd4;
export const HOOF   = 0x4a3524;
export const MANE   = 0x8a5a2c;
export const EYE    = 0x241d22;

function part(geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, matOf(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const _plainMats = new Map();
function matOf(color) {
  if (!_plainMats.has(color)) _plainMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return _plainMats.get(color);
}

function patched(geo, x, y, z, repeat = 1) {
  const m = new THREE.Mesh(geo, spotMaterial(repeat));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// One canvas of blotches, reused by every patterned part. Drawn rather than
// loaded so the whole game stays dependency-free.
const _spotMats = new Map();
let _spotTex = null;

function spotTexture() {
  if (_spotTex) return _spotTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#e8b45c';
  g.fillRect(0, 0, S, S);

  const step = 46;
  g.fillStyle = '#a9662a';
  for (let gy = -step; gy < S + step; gy += step) {
    for (let gx = -step; gx < S + step; gx += step) {
      const cx = gx + (Math.random() - 0.5) * step * 0.55;
      const cy = gy + (Math.random() - 0.5) * step * 0.55;
      const r  = step * 0.30 + Math.random() * step * 0.09;
      const n  = 5 + ((Math.random() * 3) | 0);
      for (const off of [-S, 0, S]) {   // three across, so the wrap seam is hidden
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const a  = (i / n) * Math.PI * 2;
          const rr = r * (0.72 + Math.random() * 0.5);
          const px = cx + off + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath();
        g.fill();
      }
    }
  }
  _spotTex = new THREE.CanvasTexture(c);
  _spotTex.colorSpace = THREE.SRGBColorSpace;
  _spotTex.wrapS = _spotTex.wrapT = THREE.RepeatWrapping;
  return _spotTex;
}

function spotMaterial(repeat) {
  if (!_spotMats.has(repeat)) {
    const tex = spotTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(repeat, repeat);
    _spotMats.set(repeat, new THREE.MeshLambertMaterial({ map: tex }));
  }
  return _spotMats.get(repeat);
}

function patchedFrom(geo, x, y, z) { return patched(geo, x, y, z, 1.4); }

/**
 * @param outfit  optional list of accessory names — see OUTFITS below
 */
export function buildGiraffe({ outfit = [] } = {}) {
  const root = new THREE.Group();

  // everything below `body` gets squashed and stretched together
  const body = new THREE.Group();
  root.add(body);

  // --- torso: short and round, so the neck reads as long by comparison
  body.add(patched(new THREE.CapsuleGeometry(0.30, 0.26, 4, 12), 0, 0.60, 0, 2));
  const belly = part(new THREE.CapsuleGeometry(0.23, 0.22, 3, 9), CREAM, 0, 0.56, 0.12);
  belly.scale.set(1, 0.92, 0.66);
  body.add(belly);

  // --- neck: pivots at the shoulders so it can sway as a whole
  const neck = new THREE.Group();
  neck.position.set(0, 0.78, 0.03);
  body.add(neck);
  neck.add(patched(new THREE.CylinderGeometry(0.10, 0.155, 0.80, 10), 0, 0.40, 0, 1.9));
  neck.add(part(new THREE.BoxGeometry(0.07, 0.78, 0.085), MANE, 0, 0.40, -0.108));

  // --- head, parented to the neck so it follows the sway
  const head = new THREE.Group();
  head.position.set(0, 0.845, 0.02);
  neck.add(head);

  const skull = patched(new THREE.SphereGeometry(0.17, 14, 12), 0, 0, 0, 1);
  skull.scale.set(1, 0.92, 1.05);
  head.add(skull);

  const muzzle = part(new THREE.CapsuleGeometry(0.105, 0.14, 4, 10), CREAM, 0, -0.055, 0.20);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.scale.set(1, 1, 0.86);
  head.add(muzzle);
  head.add(part(new THREE.SphereGeometry(0.026, 6, 5), 0x6b4a33, -0.052, -0.03, 0.31));
  head.add(part(new THREE.SphereGeometry(0.026, 6, 5), 0x6b4a33,  0.052, -0.03, 0.31));

  const eyeGeo = new THREE.SphereGeometry(0.062, 10, 10);
  const eyeL = part(eyeGeo, 0xffffff, -0.115, 0.075, 0.105);
  const eyeR = part(eyeGeo, 0xffffff,  0.115, 0.075, 0.105);
  eyeL.add(part(new THREE.SphereGeometry(0.038, 8, 8), EYE, -0.012, 0, 0.036));
  eyeR.add(part(new THREE.SphereGeometry(0.038, 8, 8), EYE,  0.012, 0, 0.036));
  head.add(eyeL, eyeR);

  const earGeo = new THREE.SphereGeometry(0.085, 8, 6);
  const earL = part(earGeo, HIDE_D, -0.175, 0.11, -0.02);
  const earR = part(earGeo, HIDE_D,  0.175, 0.11, -0.02);
  earL.scale.set(1.5, 0.75, 0.35); earR.scale.set(1.5, 0.75, 0.35);
  earL.rotation.z =  0.42; earR.rotation.z = -0.42;
  head.add(earL, earR);

  const osGeo = new THREE.CylinderGeometry(0.026, 0.034, 0.13, 6);
  for (const sx of [-0.062, 0.062]) {
    const os = part(osGeo, HIDE, sx, 0.215, -0.015);
    os.rotation.z = sx < 0 ? 0.16 : -0.16;
    os.add(part(new THREE.SphereGeometry(0.042, 8, 6), MANE, 0, 0.078, 0));
    head.add(os);
  }

  // --- tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.66, -0.28);
  body.add(tail);
  const t1 = part(new THREE.CylinderGeometry(0.028, 0.034, 0.34, 5), HIDE, 0, -0.15, -0.05);
  t1.rotation.x = -0.28;
  tail.add(t1, part(new THREE.SphereGeometry(0.062, 8, 6), MANE, 0, -0.32, -0.09));

  // --- legs and arms
  const legGeo = new THREE.CapsuleGeometry(0.088, 0.26, 3, 8);
  const legL = patchedFrom(legGeo, -0.145, 0.23, 0);
  const legR = patchedFrom(legGeo,  0.145, 0.23, 0);
  const armGeo = new THREE.CapsuleGeometry(0.072, 0.19, 3, 7);
  const armL = patchedFrom(armGeo, -0.33, 0.66, 0.02);
  const armR = patchedFrom(armGeo,  0.33, 0.66, 0.02);
  body.add(legL, legR, armL, armR);

  const hoofGeo = new THREE.CylinderGeometry(0.088, 0.098, 0.085, 8);
  legL.add(part(hoofGeo, HOOF, 0, -0.205, 0.012));
  legR.add(part(hoofGeo, HOOF, 0, -0.205, 0.012));
  armL.add(part(new THREE.SphereGeometry(0.076, 8, 6), HOOF, 0, -0.16, 0.01));
  armR.add(part(new THREE.SphereGeometry(0.076, 8, 6), HOOF, 0, -0.16, 0.01));

  const rig = { root, body, neck, head, tail, earL, earR, legL, legR, armL, armR };
  for (const item of outfit) OUTFITS[item]?.(rig, part);
  return rig;
}

// ---------------------------------------------------------------- outfits
// Each one hangs a few extra meshes off the rig. Keep them cheap: every giraffe
// standing in the world costs draw calls.

export const OUTFITS = {
  topHat(r, p) {
    r.head.add(p(new THREE.CylinderGeometry(0.30, 0.30, 0.035, 12), 0x241f2b, 0, 0.24, -0.01));
    r.head.add(p(new THREE.CylinderGeometry(0.185, 0.19, 0.34, 12), 0x241f2b, 0, 0.42, -0.01));
    r.head.add(p(new THREE.CylinderGeometry(0.192, 0.192, 0.07, 12), 0xc0453f, 0, 0.30, -0.01));
  },
  partyHat(r, p) {
    const c = p(new THREE.ConeGeometry(0.19, 0.46, 10), 0xff6fa5, 0, 0.44, -0.01);
    r.head.add(c);
    r.head.add(p(new THREE.SphereGeometry(0.07, 8, 6), 0xfff0a8, 0, 0.68, -0.01));
  },
  beanie(r, p) {
    const b = p(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x4a7fc4, 0, 0.10, -0.01);
    b.scale.set(1, 0.95, 1);
    r.head.add(b);
    r.head.add(p(new THREE.TorusGeometry(0.232, 0.045, 6, 14), 0x2f5f9e, 0, 0.11, -0.01).rotateX(Math.PI / 2));
    r.head.add(p(new THREE.SphereGeometry(0.085, 8, 6), 0xffd166, 0, 0.35, -0.01));
  },
  sunHat(r, p) {
    const brim = p(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 14), 0xf2e2b6, 0, 0.19, -0.01);
    r.head.add(brim);
    r.head.add(p(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2e2b6, 0, 0.19, -0.01));
    r.head.add(p(new THREE.TorusGeometry(0.2, 0.035, 6, 14), 0x7fb069, 0, 0.235, -0.01).rotateX(Math.PI / 2));
  },
  flowerCrown(r, p) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const col = [0xff8fb1, 0xfff0a0, 0xc9a7ff, 0xa7e8c1][i % 4];
      r.head.add(p(new THREE.SphereGeometry(0.062, 6, 5), col,
        Math.cos(a) * 0.2, 0.185, Math.sin(a) * 0.2 - 0.01));
    }
  },
  glasses(r, p) {
    for (const dx of [-0.115, 0.115]) {
      const l = p(new THREE.TorusGeometry(0.085, 0.019, 6, 14), 0x2b2b33, dx, 0.075, 0.15);
      r.head.add(l);
    }
    r.head.add(p(new THREE.BoxGeometry(0.06, 0.016, 0.016), 0x2b2b33, 0, 0.075, 0.15));
  },
  shades(r, p) {
    for (const dx of [-0.115, 0.115]) {
      const l = p(new THREE.SphereGeometry(0.09, 8, 6), 0x1e2430, dx, 0.075, 0.14);
      l.scale.set(1, 0.7, 0.3);
      r.head.add(l);
    }
    r.head.add(p(new THREE.BoxGeometry(0.08, 0.02, 0.02), 0x1e2430, 0, 0.085, 0.15));
  },
  scarf(r, p) {
    const s = p(new THREE.TorusGeometry(0.13, 0.06, 6, 14), 0xd8564f, 0, 0.06, 0);
    s.rotation.x = Math.PI / 2;
    r.neck.add(s);
    const tailEnd = p(new THREE.BoxGeometry(0.1, 0.34, 0.05), 0xd8564f, 0.07, -0.09, 0.09);
    tailEnd.rotation.z = -0.25;
    r.neck.add(tailEnd);
  },
  bowTie(r, p) {
    for (const dx of [-0.09, 0.09]) {
      const w = p(new THREE.ConeGeometry(0.085, 0.13, 4), 0x8e4fd0, dx, 0.05, 0.1);
      w.rotation.z = dx < 0 ? Math.PI / 2 : -Math.PI / 2;
      r.neck.add(w);
    }
    r.neck.add(p(new THREE.SphereGeometry(0.036, 6, 5), 0x6d3aa8, 0, 0.05, 0.11));
  },
  sweater(r, p) {
    const s = p(new THREE.CapsuleGeometry(0.325, 0.2, 4, 12), 0x5f8fd4, 0, 0.60, 0);
    s.scale.set(1, 0.9, 1);
    r.body.add(s);
    const stripe = p(new THREE.TorusGeometry(0.322, 0.045, 6, 16), 0xf0e6c8, 0, 0.56, 0);
    stripe.rotation.x = Math.PI / 2;
    r.body.add(stripe);
  },
  cape(r, p) {
    const c = p(new THREE.ConeGeometry(0.42, 0.72, 10, 1, true), 0xcc3f5e, 0, 0.52, -0.14);
    c.rotation.x = -0.18;
    c.material = new THREE.MeshLambertMaterial({ color: 0xcc3f5e, side: THREE.DoubleSide });
    r.body.add(c);
  },
  backpack(r, p) {
    const b = p(new THREE.BoxGeometry(0.34, 0.36, 0.2), 0x6f9e5c, 0, 0.63, -0.3);
    r.body.add(b);
    r.body.add(p(new THREE.BoxGeometry(0.28, 0.1, 0.05), 0x4f7540, 0, 0.7, -0.41));
  },
};
