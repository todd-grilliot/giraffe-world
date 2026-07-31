// The favours. Five of them, one per zone, and a zone stays shut until the one
// before it is finished — so nothing can be quietly missed and then discovered
// as a problem at the very end.
//
// A quest walks through four states:
//
//   NEW    nobody has asked yet          talking gives `offer`
//   ACTIVE asked, thing not in hand      talking gives `nudge`; the item exists
//   CARRY  thing in hand, take it back   talking to the right giraffe gives the pay-off
//   DONE   finished                      talking gives `idle`
//
// `deliver` skips the world item — she's handed it in conversation and carries
// it straight to somebody else, so it goes NEW -> CARRY on the offer.

import * as THREE from 'three';
import { buildItem } from './items.js';

export const NEW = 'new', ACTIVE = 'active', CARRY = 'carry', DONE = 'done';
// Sage's favour has one more beat after the talking: she tells you to look up,
// and finding Luna yourself is what finishes the game.
export const GAZE = 'gaze';

// The order zones are walked in, and how far up the map each one reaches.
// A gate sits just before the next zone's ground starts.
export const ZONES = [
  { id: 'meadow', name: 'the meadow', gate: 54 },
  { id: 'creek',  name: 'the creek',  gate: 127 },
  { id: 'woods',  name: 'the woods',  gate: 176 },
  { id: 'coast',  name: 'the coast',  gate: 258 },
  { id: 'sky',    name: 'the sky',    gate: Infinity },
];

const PICKUP_RADIUS = 2.4;

export class Quests {
  constructor(scene, people, saved) {
    this.scene = scene;
    this.list = [];
    this.byId = new Map();
    this.byGiver = new Map();
    this.byReceiver = new Map();
    this.carrying = null;        // the quest whose thing she's holding
    this._t = 0;

    for (const p of people) {
      if (!p.quest) continue;
      const q = {
        ...p.quest,
        giver: p.name,
        zone: p.zone,
        state: NEW,
        line: 0,
        giverPos: new THREE.Vector3(p.at[0], p.at[1], p.at[2]),
        mesh: null,
      };
      this.list.push(q);
      this.byId.set(q.id, q);
      this.byGiver.set(p.name, q);
      if (q.kind === 'deliver' && q.to) this.byReceiver.set(q.to, q);
    }

    // Where each quest-giver stands, so the guide light can point at them.
    this.people = new Map(people.map(p => [p.name, new THREE.Vector3(p.at[0], p.at[1], p.at[2])]));

    for (const id of (saved?.done || [])) {
      const q = this.byId.get(id);
      if (q) q.state = DONE;
    }
  }

  // ------------------------------------------------------------- state

  /** Quests in zone order, so "the current one" is the first unfinished. */
  currentQuest() {
    for (const z of ZONES) {
      const q = this.list.find(x => x.zone === z.id);
      if (q && q.state !== DONE) return q;
    }
    return null;
  }

  allDone() { return this.list.every(q => q.state === DONE); }

  doneIds() { return this.list.filter(q => q.state === DONE).map(q => q.id); }

  /**
   * True if she's allowed past the gate at the end of `zone`.
   *
   * A delivery counts as cleared the moment it's in hand, because its target
   * lives in the *next* zone — Pip is at the creek and Clementine is up in the
   * woods, so holding the gate shut until the invitation arrives would lock the
   * game solid. Nothing gets skipped by this: she still has to hand it over,
   * and the gate after that one is a fetch she can't finish without doing so.
   */
  zoneCleared(zoneId) {
    const q = this.list.find(x => x.zone === zoneId);
    if (!q) return true;
    if (q.state === DONE) return true;
    return q.kind === 'deliver' && q.state === CARRY;
  }

  /**
   * The gate she's standing at, if any, and who to blame — or null when the
   * way ahead is open. Gates are checked in order so the first shut one wins.
   */
  gateFor(z) {
    for (const zone of ZONES) {
      if (z < zone.gate) return null;              // still behind this gate
      if (!this.zoneCleared(zone.id)) {
        const q = this.list.find(x => x.zone === zone.id);
        return { z: zone.gate, quest: q, zone };
      }
    }
    return null;
  }

  // ------------------------------------------------------------- dialogue

  /**
   * Which list a giraffe should be reading from right now. Receiving a delivery
   * outranks a giraffe's own favour — Clementine takes Pip's invitation before
   * she thinks to mention her cat.
   */
  scriptFor(person) {
    // `receive` belongs to the giraffe being handed the thing, not to the quest.
    const incoming = this.byReceiver.get(person.name);
    if (incoming && incoming.state === CARRY && person.receive?.length) {
      return { lines: person.receive, quest: incoming, role: 'receive' };
    }

    const q = this.byGiver.get(person.name);
    if (q) {
      if (q.state === NEW && q.offer?.length) return { lines: q.offer, quest: q, role: 'offer' };
      if (q.state === ACTIVE) {
        // a `talk` favour has no object, so its second half is the pay-off
        if (q.kind === 'talk' && q.done?.length) return { lines: q.done, quest: q, role: 'done' };
        if (q.nudge?.length) return { lines: q.nudge, quest: q, role: 'nudge' };
      }
      if (q.state === CARRY && q.kind !== 'deliver' && q.done?.length) {
        return { lines: q.done, quest: q, role: 'done' };
      }
    }

    const idle = (q && q.state === DONE ? person.idle : null) || person.lines || person.idle;
    return idle?.length ? { lines: idle, quest: null, role: 'idle' } : null;
  }

  /**
   * Move a conversation along one line. Returns the text to show, or '' when
   * they've finished what they had to say — which is also when the favour
   * changes state, so the pay-off can't be skipped by walking off early.
   */
  say(person, cursor, onCue) {
    const script = this.scriptFor(person);
    if (!script) return { text: '', key: null };

    const key = `${person.name}:${script.role}:${script.quest?.id ?? ''}`;
    const i = cursor.key === key ? cursor.i : 0;

    if (i >= script.lines.length) {
      this._finish(script);
      return { text: '', key: null };
    }

    const text = script.lines[i];
    // A line can carry a cue — Sage's song is the one that does. Scoped to the
    // asking, or the same index in her pay-off would fire it a second time.
    if (script.role === 'offer' && script.quest?.cueAt === i) {
      onCue?.(script.quest.cue || script.quest.id);
    }
    return { text, key, i, last: i === script.lines.length - 1, script };
  }

  /** Called when a script runs out: hand the favour on to its next state. */
  _finish(script) {
    const q = script.quest;
    if (!q) return;

    if (script.role === 'offer') {
      if (q.kind === 'deliver') { q.state = CARRY; this.carrying = q; this._showHeld(q); }
      else if (q.kind === 'talk') { q.state = ACTIVE; }
      else { q.state = ACTIVE; this._spawnItem(q); }
      return;
    }
    if (script.role === 'done' || script.role === 'receive') {
      // ...unless she's just been told to look up, in which case the favour
      // isn't finished until she actually does.
      q.state = q.stargaze ? GAZE : DONE;
      if (this.carrying === q) { this.carrying = null; this._hideHeld(); }
      this._despawnItem(q);
    }
  }

  // ------------------------------------------------------------- the object

  _spawnItem(q) {
    if (q.mesh || !q.item?.at) return;
    const colour = Number(q.item.colour ?? 0xffd166);
    const g = new THREE.Group();
    // A warm halo rather than the item's own colour: a grey cat sitting in a
    // green tree disappears otherwise. Only ever one of these in the world at
    // a time, so the light is affordable and worth it.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.24, depthWrite: false }),
    );
    g.add(buildItem(q.item.model, colour), halo, new THREE.PointLight(0xffe9a8, 1.5, 9, 2));
    g.position.set(q.item.at[0], q.item.at[1], q.item.at[2]);
    this.scene.add(g);
    q.mesh = g;
    q.meshHome = g.position.clone();
  }

  _despawnItem(q) {
    if (!q.mesh) return;
    this.scene.remove(q.mesh);
    q.mesh.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    q.mesh = null;
  }

  /** Walk into the thing to pick it up. Returns the quest if one was taken. */
  checkPickup(playerPos) {
    for (const q of this.list) {
      if (q.state !== ACTIVE || !q.mesh) continue;
      if (q.mesh.position.distanceTo(playerPos) < PICKUP_RADIUS) {
        q.state = CARRY;
        this.carrying = q;
        this._despawnItem(q);
        this._showHeld(q);
        return q;
      }
    }
    return null;
  }

  /**
   * Whatever she's carrying, bobbing over her head. It's the only inventory
   * there is, and it's the only place Pip's envelope is ever seen — a delivery
   * is handed over in conversation, so it never sits in the world.
   */
  _showHeld(q) {
    this._hideHeld();
    if (!q?.item) return;
    this.held = buildItem(q.item.model, Number(q.item.colour ?? 0xffd166));
    this.held.scale.setScalar(0.8);
    this.scene.add(this.held);
  }

  _hideHeld() {
    if (!this.held) return;
    this.scene.remove(this.held);
    this.held.traverse(o => { o.geometry?.dispose?.(); });
    this.held = null;
  }

  update(dt, playerPos) {
    this._t += dt;
    for (const q of this.list) {
      if (!q.mesh) continue;
      q.mesh.position.y = q.meshHome.y + Math.sin(this._t * 1.9) * 0.18;
      q.mesh.rotation.y += dt * 1.1;
    }
    if (this.held && playerPos) {
      this.held.position.set(
        playerPos.x,
        playerPos.y + 2.25 + Math.sin(this._t * 2.6) * 0.08,
        playerPos.z,
      );
      this.held.rotation.y += dt * 0.9;
    }
  }

  // ------------------------------------------------------------- guidance

  /**
   * What she's doing and where it is, for the HUD line and the guide light.
   * Always answerable — being lost should not be possible.
   */
  objective() {
    const q = this.currentQuest();
    if (!q) return null;

    if (q.state === NEW) {
      return { text: `Go and see ${q.giver}`, at: this.people.get(q.giver) };
    }
    if (q.state === ACTIVE) {
      if (q.kind === 'talk') return { text: q.task, at: this.people.get(q.giver) };
      return { text: q.task, at: q.mesh ? q.mesh.position : this.people.get(q.giver) };
    }
    if (q.state === CARRY) {
      const to = q.kind === 'deliver' ? q.to : q.giver;
      const label = q.item?.label ? `Take the ${q.item.label} to ${to}` : `Go back to ${to}`;
      return { text: label, at: this.people.get(to) };
    }
    if (q.state === GAZE) {
      return { text: q.gaze || 'Look up', at: this.lookAt || this.people.get(q.giver) };
    }
    return null;
  }

  /** The favour waiting on her to look up, if there is one. */
  stargazing() {
    return this.list.find(q => q.state === GAZE) || null;
  }

  /** She found her. */
  finishStargaze() {
    const q = this.stargazing();
    if (!q) return null;
    q.state = DONE;
    return q;
  }
}
