// Tuning knobs. Everything here is safe to fiddle with.

export const CFG = {
  // --- movement feel ---
  moveSpeed:      11.5,   // top running speed (units/sec)
  accelGround:    95,
  accelAir:       58,     // generous mid-air steering; the old value made jumps feel committed
  frictionGround: 13,
  frictionAir:    1.4,
  gravity:        -34,    // gentler than real gravity — more hang time to think in
  maxFall:        -40,
  coyoteTime:     0.15,   // still jumpable this long after leaving a ledge
  jumpBuffer:     0.16,   // pressing jump this long before landing still counts
  turnSpeed:      15,     // how fast the giraffe swivels to face travel direction

  // --- jumping ---
  // You get as many jumps as you like, but each is weaker than the last. After
  // `maxJumps` the giraffe can't gain height any more and further presses just
  // ease the fall, so a bad jump turns into a slow float rather than a death.
  jumpSpeed:      15.0,   // the first one, off the ground
  jumpFalloff:    0.79,   // each subsequent jump is this fraction of the one before
  maxJumps:       4,      // jumps that still carry you upward
  flutterFall:    -5.0,   // once out of jumps, a press caps your fall at this
  glideGravity:   0.22,   // ...and holding the button falls at this fraction of gravity

  // --- player body (an upright box, for collision) ---
  radius:         0.52,
  height:         1.55,

  // --- camera ---
  camDist:        9.4,
  camHeight:      3.9,
  camLag:         7.5,
  camYawSpeed:    2.4,    // keyboard turn rate (rad/sec)
  camPitchMin:   -0.22,
  camPitchMax:    0.95,
  camMinDist:     2.2,    // when the camera has to squeeze past geometry

  // --- world ---
  voidY:         -16,     // fall past this and you respawn
  pickupRadius:   1.9,    // how close to a memory before it pops
  sparkRadius:    1.5,

  // --- bounce pads ---
  // A mushroom aims you at a specific landing spot and throws you there outright,
  // whatever speed or direction you arrived at. No timing, no run-up.
  launchMargin:   3.2,    // how far the arc peaks above its target
  launchLock:     0.42,   // steering is ignored this long after launch, so a
                          // stray thumb can't wreck a throw that was already aimed

  // --- companion firefly ---
  guideSpeed:     3.1,
  guideOrbit:     1.9,
};

// Where the giraffe starts, and every checkpoint after. Falling returns you to the
// last one you walked past, so nothing is ever lost.
export const SPAWN = { x: 0, y: 2.2, z: -6 };
