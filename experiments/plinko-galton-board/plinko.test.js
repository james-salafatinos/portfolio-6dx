// ---------------------------------------------------------------------------
// plinko.test.js — plain Node.js test runner (no framework, no real Three.js)
//
// Game.js is an ES module that does `import * as THREE ...` and only exports
// `Game`. We can't `import` it under plain CommonJS Node, and we need access
// to the module-private `SpatialHash` + constants. So we read the source as
// text, strip the THREE import, replace the `export` with a `return {...}`,
// and evaluate it via `new Function('THREE', src)` with a stubbed THREE.
//
// Run:  node 'src/public/Plinko - Galton Board/plinko.test.js'
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

// ── Minimal THREE stub ─────────────────────────────────────────────────────
// Game.js only uses a handful of THREE constructors, all for rendering. None
// of them affect physics, so they can be inert shells. The only behaviour the
// sim code relies on is `instanceMatrix.needsUpdate` and `Object3D.position`.
function makeTHREEStub() {
  class Inert {
    constructor() {}
  }
  class InstancedMesh {
    constructor(geo, mat, capacity) {
      this.geometry = geo;
      this.material = mat;
      this.capacity = capacity;
      this.count = 0;
      this.frustumCulled = true;
      this.instanceMatrix = { needsUpdate: false };
    }
    setMatrixAt() {}
  }
  class Object3D {
    constructor() {
      this.position = { set() {} };
      this.matrix = {};
    }
    updateMatrix() {}
  }
  class BufferGeometry {
    setAttribute() {}
  }
  return {
    CircleGeometry: Inert,
    MeshBasicMaterial: Inert,
    LineBasicMaterial: Inert,
    Float32BufferAttribute: Inert,
    InstancedMesh,
    Object3D,
    BufferGeometry,
    LineSegments: Inert,
    Mesh: Inert,
    Line: Inert,
    Color: Inert,
  };
}

// ── Scene stub ──────────────────────────────────────────────────────────────
function makeSceneStub() {
  return {
    objects: [],
    add(o) { this.objects.push(o); },
    remove(o) {
      const i = this.objects.indexOf(o);
      if (i >= 0) this.objects.splice(i, 1);
    },
  };
}

// ── Load Game.js internals ───────────────────────────────────────────────────
function loadModule() {
  const src = fs.readFileSync(path.join(__dirname, "Game.js"), "utf8")
    // remove the ESM THREE import (THREE is injected as a function arg instead)
    .replace(/import \* as THREE from "[^"]*";/, "")
    // expose Game + the module-private SpatialHash and all constants we test
    .replace(
      /export \{ Game \};?/,
      "return { Game, SpatialHash, STATE_EMPTY, STATE_ACTIVE, STATE_SETTLING, " +
      "STATE_FROZEN, STRIDE, F_X, F_Y, F_VX, F_VY, F_STATE, F_FREEZE_T, " +
      "F_STUCK_T, F_BUCKET, FREEZE_FRAMES, STUCK_MAX, VEL_EPS, PARTICLE_RADIUS, " +
      "PEG_RADIUS, BUCKET_COUNT };"
    );

  const factory = new Function("THREE", src);
  return factory(makeTHREEStub());
}

const M = loadModule();
const {
  Game, SpatialHash,
  STATE_EMPTY, STATE_ACTIVE, STATE_SETTLING, STATE_FROZEN,
  STRIDE, F_X, F_Y, F_VX, F_VY, F_STATE, F_FREEZE_T, F_STUCK_T, F_BUCKET,
  FREEZE_FRAMES, STUCK_MAX, VEL_EPS, PARTICLE_RADIUS, BUCKET_COUNT,
} = M;

// ── Tiny test harness ────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}
function approx(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, err: e });
    console.log(`  FAIL ${name}\n         ${e.message}`);
  }
}

// Helpers to read/write a particle slot's fields
const get = (g, slot, F) => g._buf[slot * STRIDE + F];
const set = (g, slot, F, v) => { g._buf[slot * STRIDE + F] = v; };
function writeParticle(g, slot, { x, y, vx = 0, vy = 0, state, bucket = -1 }) {
  set(g, slot, F_X, x);
  set(g, slot, F_Y, y);
  set(g, slot, F_VX, vx);
  set(g, slot, F_VY, vy);
  set(g, slot, F_STATE, state);
  set(g, slot, F_FREEZE_T, 0);
  set(g, slot, F_STUCK_T, 0);
  set(g, slot, F_BUCKET, bucket);
}
function newGame() {
  return new Game(makeSceneStub());
}

console.log("Plinko / Galton Board — test suite\n");

// 1. SpatialHash insert + query
test("SpatialHash insert + query finds nearby points and excludes far ones", () => {
  const h = new SpatialHash();
  h.insert(0.10, 0.20);
  h.insert(0.105, 0.205);   // very close neighbour
  h.insert(5.0, 5.0);       // far away

  const near = h.query(0.10, 0.20, 0.02);
  check(near.length === 4, `expected 2 points (4 numbers), got ${near.length / 2}`);
  // returned as flat [x,y,x,y]
  check(approx(near[0], 0.10) || approx(near[2], 0.10), "expected first point present");

  const empty = h.query(-9, -9, 0.02);
  check(empty.length === 0, "expected no points far away");

  h.clear();
  check(h.query(0.10, 0.20, 0.02).length === 0, "clear() should empty the hash");
});

// 2. Particle spawns with STATE_ACTIVE and correct initial position
test("_spawn creates a STATE_ACTIVE particle at the spawn point", () => {
  const g = newGame();
  g._spawn();
  check(g._count === 1, `expected count 1, got ${g._count}`);
  // first free slot is 0
  check(get(g, 0, F_STATE) === STATE_ACTIVE, "state should be STATE_ACTIVE");
  check(approx(get(g, 0, F_Y), g._spawnY), `y should equal spawnY (${g._spawnY})`);
  // x jitter is ±0.02 around spawnX
  check(Math.abs(get(g, 0, F_X) - g._spawnX) <= 0.02 + 1e-9, "x within jitter range");
  check(get(g, 0, F_BUCKET) === -1, "bucket should be unassigned (-1)");
});

// 3. Gravity applies (vy decreases each step)
test("_step applies gravity so vy decreases", () => {
  const g = newGame();
  writeParticle(g, 0, { x: 0, y: 0.92, vx: 0, vy: 0, state: STATE_ACTIVE });
  const vy0 = get(g, 0, F_VY);
  g._step(0.016);
  const vy1 = get(g, 0, F_VY);
  check(vy1 < vy0, `vy should decrease (${vy0} -> ${vy1})`);
  // buffer is Float32Array, so allow float32 rounding slack
  check(approx(vy1, -g.gravity * 0.016, 1e-5), "vy should equal -g*dt after one step");
});

// 4. Position integration (x and y change each step)
test("_step integrates position (x and y change)", () => {
  const g = newGame();
  writeParticle(g, 0, { x: 0, y: 0.92, vx: 0.1, vy: 0, state: STATE_ACTIVE });
  const x0 = get(g, 0, F_X), y0 = get(g, 0, F_Y);
  g._step(0.016);
  check(get(g, 0, F_X) > x0, "x should increase given positive vx");
  check(get(g, 0, F_Y) < y0, "y should decrease as gravity pulls it down");
});

// 5. Peg collision pushes particle outside peg radius
test("_step pushes an overlapping particle outside the peg radius", () => {
  const g = newGame();
  g.gravity = 0; // isolate the collision response
  const peg = g._pegs[0];
  const minD = peg.r + PARTICLE_RADIUS;
  // place the particle nearly on top of the peg (overlapping)
  writeParticle(g, 0, { x: peg.x + 0.001, y: peg.y, vx: 0, vy: 0, state: STATE_ACTIVE });
  g._step(0.016);
  const dx = get(g, 0, F_X) - peg.x;
  const dy = get(g, 0, F_Y) - peg.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  check(dist >= minD - 1e-9, `distance ${dist} should be >= minD ${minD}`);
});

// 6. Bucket assignment for left / center / right positions
test("bucket assignment maps left/center/right to first/middle/last bucket", () => {
  const cases = [
    { x: g => g._boardX0 + 0.001, expect: 0 },
    { x: () => 0, expect: Math.floor(BUCKET_COUNT / 2) },
    { x: g => g._boardX1 - 0.001, expect: BUCKET_COUNT - 1 },
  ];
  for (const c of cases) {
    const g = newGame();
    g.gravity = 0;
    const x = c.x(g);
    // start just below the bucket-zone entry so the ACTIVE->SETTLING
    // transition fires this step and assigns a bucket
    writeParticle(g, 0, { x, y: g._bucketTop - 0.01, vx: 0, vy: 0, state: STATE_ACTIVE });
    g._step(0.016);
    check(get(g, 0, F_STATE) === STATE_SETTLING, "should transition to SETTLING");
    check(get(g, 0, F_BUCKET) === c.expect,
      `x=${x.toFixed(4)} expected bucket ${c.expect}, got ${get(g, 0, F_BUCKET)}`);
  }
});

// 7. Freeze logic: STATE_SETTLING -> STATE_FROZEN after FREEZE_FRAMES slow frames
test("settling particle freezes after FREEZE_FRAMES slow frames", () => {
  const g = newGame();
  g.gravity = 0; // zero velocity stays below VEL_EPS every frame
  const bi = Math.floor(BUCKET_COUNT / 2);
  const bkt = g._buckets[bi];
  const xMid = (bkt.xL + bkt.xR) / 2;
  // park it in mid-air inside the bucket, not touching walls/floor
  writeParticle(g, 0, { x: xMid, y: g._bucketTop - 0.2, vx: 0, vy: 0, state: STATE_SETTLING, bucket: bi });

  for (let i = 0; i < FREEZE_FRAMES - 1; i++) g._step(0.016);
  check(get(g, 0, F_STATE) === STATE_SETTLING, "should still be settling before threshold");
  g._step(0.016); // the FREEZE_FRAMES-th slow frame
  check(get(g, 0, F_STATE) === STATE_FROZEN, "should be frozen at FREEZE_FRAMES");
  check(get(g, 0, F_VX) === 0 && get(g, 0, F_VY) === 0, "velocity zeroed on freeze");
});

// 8. Stuck timer force-freezes after STUCK_MAX frames (even while still moving)
test("stuck particle force-freezes after STUCK_MAX frames", () => {
  const g = newGame();
  g.gravity = 4; // keeps it bouncing on the floor so speed stays above VEL_EPS
  const bi = Math.floor(BUCKET_COUNT / 2);
  const bkt = g._buckets[bi];
  const xMid = (bkt.xL + bkt.xR) / 2;
  const floor = bkt.yFloor + PARTICLE_RADIUS;
  writeParticle(g, 0, { x: xMid, y: floor, vx: 0, vy: 0, state: STATE_SETTLING, bucket: bi });

  let frozenAt = -1;
  for (let i = 1; i <= STUCK_MAX + 5; i++) {
    g._step(0.016);
    if (get(g, 0, F_STATE) === STATE_FROZEN) { frozenAt = i; break; }
  }
  check(frozenAt !== -1, "particle should eventually force-freeze");
  check(frozenAt <= STUCK_MAX, `should freeze by STUCK_MAX (${STUCK_MAX}), froze at ${frozenAt}`);
  // sanity: it was the stuck timer, not the slow-freeze path
  check(get(g, 0, F_STUCK_T) >= STUCK_MAX || frozenAt >= STUCK_MAX,
    "stuck timer should have driven the freeze");
});

// 9. Histogram increments on freeze
test("histogram increments for the bucket when a particle freezes", () => {
  const g = newGame();
  g.gravity = 0;
  const bi = 4;
  const bkt = g._buckets[bi];
  const xMid = (bkt.xL + bkt.xR) / 2;
  check(g._histogram[bi] === 0, "histogram starts at 0 for the bucket");
  writeParticle(g, 0, { x: xMid, y: g._bucketTop - 0.2, vx: 0, vy: 0, state: STATE_SETTLING, bucket: bi });
  for (let i = 0; i < FREEZE_FRAMES; i++) g._step(0.016);
  check(get(g, 0, F_STATE) === STATE_FROZEN, "particle should be frozen");
  check(g._histogram[bi] === 1, `histogram[${bi}] should be 1, got ${g._histogram[bi]}`);
  check(g._histMax >= 1, "histMax should be at least 1");
});

// 10. startHold / stopHold toggle _isHolding
test("startHold / stopHold toggle the holding flag", () => {
  const g = newGame();
  check(g._isHolding === false, "starts not holding");
  g.startHold();
  check(g._isHolding === true, "startHold sets holding true");
  check(g._count === 1, "startHold drops one ball immediately");
  g.stopHold();
  check(g._isHolding === false, "stopHold sets holding false");
  check(g._spawnAccum === 0, "stopHold resets spawn accumulator");
});

// 11. clear() resets buffer, histogram, nextSlot
test("clear() resets buffer, histogram and nextSlot", () => {
  const g = newGame();
  // create some state: a frozen particle + histogram entry + advanced cursor
  writeParticle(g, 0, { x: 0.1, y: -0.5, vx: 1, vy: 1, state: STATE_FROZEN, bucket: 3 });
  g._histogram[3] = 7;
  g._histMax = 7;
  g._nextSlot = 42;
  g._count = 5;
  g._frozen.insert(0.1, -0.5);

  g.clear();

  let allZero = true;
  for (let i = 0; i < g._buf.length; i++) if (g._buf[i] !== 0) { allZero = false; break; }
  check(allZero, "buffer should be all zeros after clear");
  check(g._count === 0, "count reset to 0");
  check(g._nextSlot === 0, "nextSlot reset to 0");
  check(g._histMax === 1, "histMax reset to 1");
  let histZero = true;
  for (let i = 0; i < BUCKET_COUNT; i++) if (g._histogram[i] !== 0) { histZero = false; break; }
  check(histZero, "histogram cleared");
  check(g._frozen.query(0.1, -0.5, 0.05).length === 0, "frozen spatial hash cleared");
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  process.exit(1);
}
