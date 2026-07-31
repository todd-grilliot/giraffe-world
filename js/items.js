// The things she's asked to fetch, as actual objects rather than glowing boxes.
//
// Built in the same language as the rest of the world: flat-shaded Lambert,
// low polygon counts, nothing bigger than about a unit across so they read at
// a distance without looming. Only one of these exists in the world at a time,
// so a few dozen extra triangles each costs nothing.
//
// Every model is centred on its group origin, because the quest system bobs
// and slowly turns whatever it's given.

import * as THREE from 'three';

const _mats = new Map();
const mat = (color) => {
  if (!_mats.has(color)) _mats.set(color, new THREE.MeshLambertMaterial({ color }));
  return _mats.get(color);
};

const box  = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
const cone = (r, h, seg, c) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(c));
const ball = (r, c, wSeg = 8, hSeg = 6) =>
  new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat(c));
const cyl  = (rt, rb, h, seg, c) =>
  new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));

const put = (m, x, y, z, rx = 0, ry = 0, rz = 0) => {
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
};

/** A sitting cat, entirely unbothered. */
function cat(colour) {
  const body = new THREE.Group();
  const fur  = colour;
  const dark = 0x3b4149;
  const pink = 0xe79aa8;

  body.add(
    put(box(0.44, 0.40, 0.36, fur), 0, 0.20, -0.02),          // haunches
    put(box(0.34, 0.34, 0.30, fur), 0, 0.44,  0.03),          // chest
    put(box(0.34, 0.29, 0.29, fur), 0, 0.72,  0.04),          // head
    // ears — four-sided cones read as proper triangles from any angle
    put(cone(0.085, 0.17, 4, fur), -0.11, 0.90, 0.04, 0, Math.PI / 4, -0.12),
    put(cone(0.085, 0.17, 4, fur),  0.11, 0.90, 0.04, 0, Math.PI / 4,  0.12),
    put(box(0.17, 0.10, 0.06, 0xf2f4f6), 0, 0.66, 0.19),      // muzzle
    put(box(0.05, 0.04, 0.04, pink),     0, 0.70, 0.21),      // nose
    // half-shut eyes: wide and flat, which is what makes it look smug
    put(box(0.07, 0.025, 0.03, dark), -0.08, 0.76, 0.19),
    put(box(0.07, 0.025, 0.03, dark),  0.08, 0.76, 0.19),
    put(box(0.10, 0.22, 0.12, fur), -0.10, 0.11, 0.17),       // front legs
    put(box(0.10, 0.22, 0.12, fur),  0.10, 0.11, 0.17),
  );

  // tail, curling round the side in four steps
  for (const [x, y, z, rz] of [[0.20, 0.06, -0.16, 0.5], [0.28, 0.14, -0.08, 0.9],
                               [0.30, 0.24, 0.02, 1.3],  [0.26, 0.32, 0.10, 1.7]]) {
    body.add(put(box(0.09, 0.14, 0.09, fur), x, y, z, 0, 0, rz));
  }

  body.position.y = -0.45;      // centre the animal on the origin it spins around
  const g = new THREE.Group();
  g.add(body);
  return g;
}

/** A picnic blanket, folded into a stack. */
function blanket(colour) {
  const g = new THREE.Group();
  const cream = 0xf3e7d0;
  const folds = [
    { y: -0.12, c: colour, ry:  0.00, w: 0.78, d: 0.56 },
    { y: -0.03, c: cream,  ry:  0.09, w: 0.72, d: 0.52 },
    { y:  0.06, c: colour, ry: -0.07, w: 0.66, d: 0.48 },
    { y:  0.14, c: cream,  ry:  0.14, w: 0.58, d: 0.42 },
  ];
  for (const f of folds) g.add(put(box(f.w, 0.09, f.d, f.c), 0, f.y, 0, 0, f.ry, 0));
  // a rolled edge along the front so it reads as cloth, not a stack of paper
  g.add(put(cyl(0.05, 0.05, 0.74, 6, colour), 0, -0.16, 0.27, 0, 0, Math.PI / 2));
  return g;
}

/** Pip's invitation: a sealed envelope. */
function envelope(colour) {
  const g = new THREE.Group();
  const ink = 0xc98a5e;
  g.add(put(box(0.68, 0.06, 0.48, colour), 0, 0, 0));
  // the flap, as a shallow V across the face
  g.add(put(box(0.40, 0.035, 0.05, ink), -0.14, 0.04,  0.00, 0,  0.62, 0));
  g.add(put(box(0.40, 0.035, 0.05, ink),  0.14, 0.04,  0.00, 0, -0.62, 0));
  // wax seal
  g.add(put(cyl(0.07, 0.07, 0.035, 8, 0xcc4b5f), 0, 0.055, 0));
  return g;
}

/** Bertrand's fig. Of consequence. */
function fig(colour) {
  const g = new THREE.Group();
  const body = ball(0.28, colour, 8, 6);
  body.scale.set(1, 0.92, 1);
  g.add(put(body, 0, -0.04, 0));
  // the shoulders of a fig taper up to the stem
  g.add(put(cone(0.19, 0.20, 8, colour), 0, 0.18, 0));
  g.add(put(cyl(0.028, 0.038, 0.14, 5, 0x6b4b32), 0, 0.31, 0));
  const leaf = box(0.20, 0.03, 0.11, 0x4a7c46);
  g.add(put(leaf, 0.11, 0.34, 0.02, 0, 0.4, 0.45));
  return g;
}

const MODELS = { cat, blanket, envelope, fig };

/**
 * Build the object for a quest item. Falls back to a plain block if the model
 * name is unknown, so a typo in the data costs a nice shape and not the favour.
 */
export function buildItem(model, colour = 0xffd166) {
  const make = MODELS[model];
  if (!make) return box(0.8, 0.6, 0.8, colour);
  const m = make(Number(colour));
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return m;
}
