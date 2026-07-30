// Tuning knobs. Everything here is safe to fiddle with.

export const CFG = {
  // --- movement feel ---
  moveSpeed:      11.5,   // top running speed (units/sec)
  accelGround:    78,
  accelAir:       34,
  frictionGround: 12,
  frictionAir:    1.4,
  gravity:        -38,
  jumpSpeed:      15.2,
  doubleJumpSpeed:13.4,
  maxFall:        -46,
  coyoteTime:     0.12,   // still jumpable this long after leaving a ledge
  jumpBuffer:     0.14,   // pressing jump this long before landing still counts
  turnSpeed:      13,     // how fast the giraffe swivels to face travel direction

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
  pickupRadius:   1.7,    // how close to a memory before it pops
  sparkRadius:    1.35,

  // --- companion firefly ---
  guideSpeed:     3.1,
  guideOrbit:     1.9,
};

// Where the giraffe starts, and every checkpoint after. Falling returns you to the
// last one you walked past, so nothing is ever lost.
export const SPAWN = { x: 0, y: 2.2, z: -6 };
