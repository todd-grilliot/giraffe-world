// World sanity check. If you move platforms or reorder the memories, run this
// to confirm every lantern is still reachable and nothing needs a jump the giraffe
// can't make.
//
// Open the game, then in the browser console:
//
//   const t = await import('./tools/check-world.js'); console.log(t.check());
//
// It models the real jump arc from the numbers in config.js, so its answers
// track whatever you set there.

import { CFG } from '../js/config.js';

const G = -CFG.gravity;

/**
 * Horizontal distance still available at the moment you fall back past a height
 * `rise` above where you took off. Negative means that height is unreachable.
 */
function runLimit(rise, useDouble) {
  const v0 = CFG.jumpSpeed, v1 = CFG.doubleJumpSpeed, s = CFG.moveSpeed;
  if (!useDouble) {
    const d = v0 * v0 - 2 * G * rise;
    return d < 0 ? -1 : s * (v0 + Math.sqrt(d)) / G;
  }
  const apex1 = v0 * v0 / (2 * G), t1 = v0 / G;
  const d = v1 * v1 - 2 * G * (rise - apex1);
  return d < 0 ? -1 : s * (t1 + (v1 + Math.sqrt(d)) / G);
}

const MARGIN = 0.92;   // never assume a jump landing on the very last pixel

export function check(world = window.__sw?.world) {
  if (!world) throw new Error('no world — open the game first');

  // A moving platform counts as anywhere along its travel.
  const nodes = world.solids.map((s, i) => {
    const mn = s.min.clone(), mx = s.max.clone();
    if (s.mover) { const a = Math.abs(s.mover.amp), ax = s.mover.axis; mn[ax] -= a; mx[ax] += a; }
    return { i, mn, mx, top: s.max.y, bounce: s.bounce || 0 };
  });

  const gap = (a, b) => Math.hypot(
    Math.max(0, Math.max(a.mn.x - b.mx.x, b.mn.x - a.mx.x)),
    Math.max(0, Math.max(a.mn.z - b.mx.z, b.mn.z - a.mx.z)));

  // 0 = a single jump clears it, 1 = needs the double, Infinity = impossible
  const cost = (a, b) => {
    const g = gap(a, b), rise = b.top - a.top;
    if (a.bounce) {
      const apex = (a.bounce * a.bounce) / (2 * G);
      return (rise <= apex - 1 && g <= 12) ? 0 : Infinity;
    }
    const one = runLimit(rise, false);
    if (one >= 0 && g <= one * MARGIN) return 0;
    const two = runLimit(rise, true);
    if (two >= 0 && g <= two * MARGIN) return 1;
    return Infinity;
  };

  const edges = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++)
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const c = cost(nodes[i], nodes[j]);
      if (c < Infinity) edges[i].push([j, c]);
    }

  const supportOf = (p) => {
    let best = -1, bt = -Infinity;
    for (const n of nodes) {
      if (p.x < n.mn.x - 0.6 || p.x > n.mx.x + 0.6) continue;
      if (p.z < n.mn.z - 0.6 || p.z > n.mx.z + 0.6) continue;
      const d = p.y - n.top;
      if (d < -0.25 || d > 3.2) continue;
      if (n.top > bt) { bt = n.top; best = n.i; }
    }
    return best;
  };

  // cheapest route measured by its single hardest jump, then by hop count
  const route = (from, to) => {
    const key = (hardest, hops) => hardest * 1e6 + hops;
    const dist = new Map([[from, key(0, 0)]]), prev = new Map([[from, -1]]);
    const queue = [[key(0, 0), from]];
    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [d, at] = queue.shift();
      if (d > (dist.get(at) ?? Infinity)) continue;
      if (at === to) break;
      for (const [nb, w] of edges[at]) {
        const nd = key(Math.max(Math.floor(d / 1e6), w), (d % 1e6) + 1);
        if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); prev.set(nb, at); queue.push([nd, nb]); }
      }
    }
    if (!prev.has(to)) return null;
    const d = dist.get(to);
    return { hardest: Math.floor(d / 1e6), hops: d % 1e6 };
  };

  const lines = [], problems = [];
  let from = supportOf({ x: 0, y: 0, z: -6 });

  world.memoryAnchors.forEach((a, k) => {
    const to = supportOf(a);
    const n = k + 1;
    if (to < 0) { problems.push(`#${n} has no platform under it`); lines.push(`#${n}: NO PLATFORM`); return; }
    const r = route(from, to);
    if (!r) { problems.push(`#${n} is unreachable`); lines.push(`#${n}: UNREACHABLE`); return; }
    if (r.hardest > 0) problems.push(`#${n} needs a double jump`);
    lines.push(`#${String(n).padStart(2)}: ${String(r.hops).padStart(2)} hops, hardest = ${r.hardest ? 'DOUBLE JUMP' : 'single jump'}`);
    from = to;
  });

  for (let k = 0; k < world.checkpoints.length; k++) {
    const c = world.checkpoints[k];
    if (supportOf(c) < 0) problems.push(`checkpoint ${k} is floating`);
  }

  return [
    ...lines, '',
    `single jump: rise ${runLimit(0, false).toFixed(1)} run at ground level, max rise ${(CFG.jumpSpeed ** 2 / (2 * G)).toFixed(2)}`,
    problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'No problems. Every memory is reachable with single jumps.',
  ].join('\n');
}
