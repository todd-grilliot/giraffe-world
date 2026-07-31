// Boots everything and runs the loop.

import * as THREE from 'three';
import { CFG, SPAWN } from './config.js';
import { buildWorld, paletteAt } from './world.js';
import { Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { Memories, Sparks, Companion } from './memories.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { Music } from './music.js';
import { Celebration } from './celebration.js';
import { NPCs } from './npcs.js';
import * as Save from './save.js';

const canvas = document.getElementById('scene');

boot().catch((err) => {
  console.error(err);
  document.getElementById('loading-text').textContent =
    'Something went wrong loading the world. ' + (err?.message || '');
});

async function boot() {
  // ------------------------------------------------------------ data
  const [res, musicRes, npcRes] = await Promise.all([
    fetch('data/game.json', { cache: 'no-cache' }),
    fetch('data/music.json', { cache: 'no-cache' }).catch(() => null),
    fetch('data/npcs.json',  { cache: 'no-cache' }).catch(() => null),
  ]);
  if (!res.ok) throw new Error(`couldn't read game.json (${res.status})`);
  const data = await res.json();
  data.count = Math.max(1, data.count | 0) || 16;

  // Music is a nice-to-have: if the manifest is missing the game still runs.
  let musicData = null;
  try { if (musicRes && musicRes.ok) musicData = await musicRes.json(); } catch {}
  let npcData = null;
  try { if (npcRes && npcRes.ok) npcData = await npcRes.json(); } catch {}
  if (npcData) { data.npcPrompt = npcData.prompt; data.npcPromptTouch = npcData.promptTouch; }

  // ------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd2e8f4, 34, 150);

  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);

  // ------------------------------------------------------------ lights
  const hemi = new THREE.HemisphereLight(0xd2ecff, 0x74945e, 0.85);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4dd, 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  const SH = 44;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  // stars, faded in as the world turns to night
  const stars = makeStars();
  scene.add(stars);

  // ------------------------------------------------------------ world
  const world     = buildWorld(scene);
  const player    = new Player(scene, world);
  const chase     = new ChaseCamera(camera, world);
  chase.yaw = Math.PI;   // the world unrolls toward +Z, so start looking that way
  const input     = new Input(canvas);
  const memories  = new Memories(scene, world.memoryAnchors, data.count);
  const sparks    = new Sparks(scene, world.sparkPoints);
  const companion = new Companion(scene);
  const sound     = new Sound();
  const music     = musicData ? new Music(musicData, (t) => ui.nowPlaying(t.title)) : null;
  let celebration = null;   // built on demand — costs nothing until she finishes

  // ------------------------------------------------------------ state
  const state = Save.load();
  const found = new Set(state.found);
  found.forEach(i => memories.setFound(i, true));
  sparks.setTaken(state.sparks || []);
  if (state.spawn) player.spawnPoint.set(state.spawn.x, state.spawn.y, state.spawn.z);
  player.pos.copy(player.spawnPoint);

  const persist = () => Save.save({
    found: [...found],
    sparks: sparks.points.map((p, i) => p.taken ? i : -1).filter(i => i >= 0),
    spawn: { x: player.spawnPoint.x, y: player.spawnPoint.y, z: player.spawnPoint.z },
    unlocked: state.unlocked,
    finaleSeen: state.finaleSeen,
  });

  let running = false;
  let pendingFinale = false;
  let finaleJustClosed = false;
  let talkingTo = null;
  let talkTapped = false;
  document.getElementById('talk-btn').addEventListener('click', () => { talkTapped = true; });

  const ui = new UI(data, {
    getFound: () => found,
    onStart() {
      sound.init();
      music?.start();          // this click is the gesture that unlocks audio
      running = true;
      input.enabled = true;
    },
    onClose() {
      if (pendingFinale && !ui.isBlocking()) {
        pendingFinale = false;
        state.finaleSeen = true;
        persist();
        sound.finale();
        setTimeout(() => ui.showFinale(), 450);
      } else if (finaleJustClosed) {
        finaleJustClosed = false;
        // Shadow maps are the most expensive thing on screen and there is no
        // stable frustum to fit once she's crossing the whole map — drop them
        // and spend the budget on the trail and the wreckage instead.
        renderer.shadowMap.enabled = false;
        sun.position.set(120, 260, -80);
        sun.target.position.set(0, 0, 180);
        sun.target.updateMatrixWorld();
        sun.color.set(0xffffff);
        sun.intensity = 1.25;
        // flat, bright light from every side, so the giraffe never reads as a
        // dark speck against a bright sky
        ambient.intensity = 0.95;
        hemi.intensity = 0.9;
        hemi.color.set(0xffffff);
        hemi.groundColor.set(0xbcc6e8);
        stars.visible = false;
        celebration.start();
        sound.finale();
        music?.playFirst();
      }
    },
    onFinaleClosed() { finaleJustClosed = true; },
    onUnlock() { state.unlocked = true; persist(); },
    onReset() { Save.clear(); location.reload(); },
    onSoundToggle() {
      sound.init();
      const on = !sound.on;
      sound.setEnabled(on);
      music?.setEnabled(on);
      return on;
    },
  });

  const npcs = new NPCs(scene, world, npcData);
  celebration = new Celebration(scene, camera, world, player, ui, npcs, sound);

  // handy from the browser console when tweaking the world
  window.__sw = { player, chase, world, memories, sparks, input, ui, sound, music,
                  celebration, npcs, renderer, scene, camera };

  ui.setCount(found.size);
  player.aura.setPower(found.size / data.count);
  ui.setSparks(sparks.taken);
  ui.hideLoading();
  // Bind the on-screen stick regardless — it costs nothing on a machine that
  // never fires a touch event, and touch detection is not reliable enough to
  // risk leaving someone on a tablet with no way to move.
  input.bindTouch(
    document.getElementById('stick'),
    document.getElementById('stick-nub'),
    document.getElementById('touch-jump'),
  );
  ui.showHUD(input.isTouch);
  if (!input.isTouch) {
    addEventListener('touchstart', () => {
      document.getElementById('touch').classList.remove('hidden');
    }, { once: true, passive: true });
  }

  if (state.unlocked) ui.showTitle();
  else ui.showGate();

  // ------------------------------------------------------------ loop
  const pal   = paletteAt(0);
  const basis = { fx: 0, fz: 0, rx: 0, rz: 0 };
  let last = performance.now() / 1000;
  let t = 0;

  addEventListener('resize', onResize);
  onResize();

  function onResize() {
    // Guard the degenerate case: a browser can report a 0-sized viewport while
    // the page is still laying out, and a NaN aspect ratio poisons the camera
    // matrix permanently — every later frame renders an empty screen.
    const w = Math.max(1, innerWidth || 0), h = Math.max(1, innerHeight || 0);
    const aspect = w / h;
    camera.aspect = aspect;

    // A fixed vertical FOV on a portrait phone leaves a horizontal view barely a
    // third as wide as on a laptop — you end up walking down a corridor. Widen
    // the lens and step the camera back as the screen gets taller.
    const tall = THREE.MathUtils.clamp((1.4 - aspect) / (1.4 - 0.45), 0, 1);
    camera.fov = THREE.MathUtils.lerp(58, 76, tall);
    chase.distScale = THREE.MathUtils.lerp(1, 1.45, tall);
    camera.updateProjectionMatrix();

    // Phones are fill-rate bound long before they're draw-call bound, and a
    // retina phone renders four times the pixels for very little visible gain
    // on geometry this simple. Cap harder on touch screens.
    const cap = input.isTouch ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    renderer.setSize(w, h, false);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now() / 1000;
  });

  renderer.setAnimationLoop(() => tick());
  window.__sw.tick = tick;   // lets a test harness step the world without rAF

  function tick(fixedDt) {
    const now = performance.now() / 1000;
    const dt = fixedDt ?? Math.min(now - last, 1 / 30);
    last = now;
    t += dt;

    const blocked = ui.isBlocking() || !running;

    world.update(t);

    // Once she's flying, the platformer stops: no collision, no pickups, no
    // chase camera. The celebration drives everything.
    if (celebration.active) {
      if (!ui.isBlocking()) {
        celebration.update(dt, input);
        npcs.update(dt, t, celebration.pos, true, null);
        player.aura.update(dt, t, celebration.pos);
      }
      input.takeLook(dt);
      renderer.render(scene, camera);
      return;
    }

    if (!blocked) {
      chase.basis(basis);
      const move = input.sample(basis);
      const look = input.takeLook(dt);
      player.update(dt, move);
      chase.update(dt, player, look, true);

      handleEvents();
      checkPickups();
      checkCheckpoints();
      npcs.update(dt, t, player.pos, false, talkingTo);
      handleTalking();
    } else {
      // keep the camera alive so the world still breathes behind a modal
      chase.update(dt, player, { x: 0, y: 0 }, false);
      input.takeLook(dt);
      input.sample(basis);
    }

    player.aura.update(dt, t, player.pos);
    memories.update(dt, t, player.pos);
    sparks.update(dt, t);
    companion.update(dt, t, player, memories.next());

    updateSky(dt);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------ helpers

  function handleEvents() {
    const e = player.events;
    if (e.bounced)       sound.bounce();
    else if (e.jumped)   sound.jump(e.jumpIndex);
    else if (e.fluttered) sound.flutter();
    if (e.landed)        sound.land();
    if (e.respawned) {
      sound.splash();
      ui.toast('Back to solid ground.');
    }
  }

  function checkPickups() {
    const hit = memories.checkPickup(player.pos);
    if (hit) {
      memories.setFound(hit.index, true);
      found.add(hit.index);
      persist();
      ui.setCount(found.size);
      sound.memory();
      player.aura.setPower(found.size / data.count);
      if (found.size === data.count && !state.finaleSeen) {
        pendingFinale = true;
        state.finaleSeen = true;
        persist();
        sound.finale();
        setTimeout(() => { pendingFinale = false; ui.showFinale(); }, 900);
      }
    }

    const si = sparks.checkPickup(player.pos);
    if (si >= 0 && sparks.take(si)) {
      ui.setSparks(sparks.taken);
      sound.spark();
      if (sparks.taken % 25 === 0) persist();
    }
  }

  /**
   * Walk up to one of the others and a prompt appears; press E (or the on-screen
   * button) to hear their next line. Walking off ends the conversation.
   */
  const speechAt = new THREE.Vector3();
  function handleTalking() {
    const pressed = input.takeTalk() || talkTapped;
    talkTapped = false;

    // Once a conversation has started, hold onto it until she's properly walked
    // away — a wider radius than the one that starts it, so drifting a step
    // doesn't cut somebody off mid-sentence.
    const holding = talkingTo && !talkingTo.dead
      && talkingTo.pos.distanceTo(player.pos) < 9.0 ? talkingTo : null;
    const near = holding || npcs.nearest(player.pos, false);

    if (!near) {
      if (talkingTo) { ui.hideSpeech(); talkingTo = null; }
      ui.hideTalkPrompt();
      return;
    }

    if (talkingTo !== near) ui.showTalkPrompt(input.isTouch);

    if (pressed) {
      // first press shows what they're on; after that it moves them along
      const line = talkingTo === near
        ? npcs.advance(near, found.size)
        : npcs.current(near, found.size);
      if (line) {
        talkingTo = near;
        ui.hideTalkPrompt();
        ui.showSpeech(near.name, line);
        sound.talk();
      }
    }

    if (talkingTo === near) {
      speechAt.set(near.pos.x, near.pos.y + 2.35, near.pos.z);
      ui.placeSpeech(speechAt, camera);
    }
  }

  function checkCheckpoints() {
    if (!player.grounded) return;
    for (const c of world.checkpoints) {
      if (c.distanceToSquared(player.pos) < 49 && player.spawnPoint.distanceToSquared(c) > 1) {
        player.spawnPoint.copy(c);
        persist();
        break;
      }
    }
  }

  function updateSky(dt) {
    paletteAt(player.pos.z, pal);
    scene.fog.color.copy(pal.fog);
    scene.fog.near = pal.fogNear;
    scene.fog.far  = pal.fogFar;
    renderer.setClearColor(pal.sky);
    hemi.color.copy(pal.hemiSky);
    hemi.groundColor.copy(pal.hemiGnd);
    hemi.intensity = 0.85 - pal.night * 0.35;
    ambient.intensity = pal.amb;
    sun.color.copy(pal.sun);
    sun.intensity = pal.sunI;

    // keep the shadow frustum wrapped around the giraffe
    sun.position.set(player.pos.x + 32, player.pos.y + 54, player.pos.z - 26);
    sun.target.position.copy(player.pos);
    sun.target.updateMatrixWorld();

    stars.material.opacity = pal.night * 0.95;
    stars.visible = pal.night > 0.02;
    stars.position.set(player.pos.x, 0, player.pos.z);
    stars.rotation.y += dt * 0.004;
  }
}

function makeStars() {
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // upper hemisphere only
    const u = Math.random(), v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(v * 0.92);
    const r = 300 + Math.random() * 120;
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) + 40;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2.1, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
