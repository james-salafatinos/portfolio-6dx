import * as THREE from "three";

// ---------------------------------------------------------------------------
// World layout constants  (all in "world units", camera is -aspect..aspect x -1..1)
// ---------------------------------------------------------------------------
const WORLD_H = 2.0;          // total world height
const WORLD_TOP = 1.0;        // y = 1 is top
const WORLD_BOT = -1.0;       // y = -1 is bottom

const PEG_RADIUS = 0.012;
const PARTICLE_RADIUS = 0.009;
const BUCKET_COUNT = 17;      // must be odd — one bucket per gap between pegs in bottom row + 1

// Particle state codes
// NOTE: Float32Array initialises to 0, so STATE_EMPTY must be 0
const STATE_EMPTY    = 0;     // slot is unused
const STATE_ACTIVE   = 1;     // falling, hits pegs only
const STATE_SETTLING = 2;     // in bucket zone, full physics
const STATE_FROZEN   = 3;     // part of the static stack

// Float32Array field layout per particle  (stride = 8)
const F_X  = 0;
const F_Y  = 1;
const F_VX = 2;
const F_VY = 3;
const F_STATE     = 4;
const F_FREEZE_T  = 5;  // consecutive frames below velocity ε
const F_STUCK_T   = 6;  // total frames stuck in settling
const F_BUCKET    = 7;  // assigned bucket index (set on first entry to settling)

const STRIDE = 8;
const VEL_EPS = 0.003;         // velocity threshold for freeze check
const FREEZE_FRAMES = 18;      // consecutive slow frames before freeze
const STUCK_MAX = 240;         // force-freeze after this many settling frames

// Spatial hash cell size for frozen stack
const CELL = PARTICLE_RADIUS * 2.2;

// ---------------------------------------------------------------------------
// SpatialHash — stores frozen particle positions for neighbour lookup
// ---------------------------------------------------------------------------
class SpatialHash {
  constructor() {
    this.map = new Map();
  }
  _key(cx, cy) { return (cx & 0xffff) | ((cy & 0xffff) << 16); }
  _cell(x, y)  { return [Math.floor(x / CELL), Math.floor(y / CELL)]; }

  insert(x, y) {
    const [cx, cy] = this._cell(x, y);
    const k = this._key(cx, cy);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(x, y);
  }

  // Returns array of [x,y] pairs within radius r of (px, py)
  query(px, py, r) {
    const [cx0, cy0] = this._cell(px - r, py - r);
    const [cx1, cy1] = this._cell(px + r, py + r);
    const out = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const arr = this.map.get(this._key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 2) {
          const dx = arr[i] - px, dy = arr[i+1] - py;
          if (dx*dx + dy*dy <= r*r) out.push(arr[i], arr[i+1]);
        }
      }
    }
    return out;
  }

  clear() { this.map.clear(); }
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
class Game {
  constructor(scene) {
    this.scene = scene;

    // Sim params (GUI can write these)
    this.maxHoldRate  = 30;     // particles/sec at full 3s hold
    this.gravity      = 4.0;
    this.damping      = 0.55;
    this.maxParticles = 5000;

    // Hold-to-drop state
    this._isHolding   = false;
    this._holdStart   = 0;     // performance.now() when hold began

    // Internal
    this._pegRows    = 12;
    this._pegs       = [];      // [{x,y,r}]
    this._buckets    = [];      // [{xL, xR, yFloor}]
    this._aspect     = 1;

    this._buf        = new Float32Array(this.maxParticles * STRIDE);
    this._count      = 0;
    this._frozen     = new SpatialHash();
    this._histogram  = new Int32Array(BUCKET_COUNT);
    this._histMax    = 1;

    this._spawnAccum = 0;
    this._dt         = 0;
    this._lastTime   = null;

    // Histogram height (fraction of world half-height)
    this._histZone   = 0.30;    // bottom 30% of world height for histogram bars

    this._buildLayout();
    this._initRender();
  }

  // ── called by App on window resize ───────────────────────────────────────
  onResize(camera) {
    this._aspect = camera.right;   // OrthographicCamera right = aspect ratio value
    this._buildLayout();
    this._rebuildStaticMeshes();
  }

  rebuildPegs(rows) {
    this._pegRows = rows;
    this._buildLayout();
    this._rebuildStaticMeshes();
    this.clear();
  }

  clear() {
    this._buf.fill(0);
    this._count = 0;
    this._nextSlot = 0;
    this._frozen.clear();
    this._histogram.fill(0);
    this._histMax = 1;
    this._updateParticleMesh();
    this._updateHistogramMesh();
  }

  // ── world layout ─────────────────────────────────────────────────────────
  _buildLayout() {
    const A = this._aspect || 1;
    const rows = this._pegRows;

    // Board spans 80% of the width, centered
    const boardW = A * 1.6;
    const boardX0 = -boardW / 2;
    const boardX1 =  boardW / 2;

    // Peg zone: from y = 0.75 down to y = -0.05
    const pegTop = 0.72;
    const pegBot = -0.10;
    const rowH   = (pegTop - pegBot) / (rows - 1);
    const colSpacing = boardW / (rows + 1);

    this._pegs = [];
    for (let r = 0; r < rows; r++) {
      const y = pegTop - r * rowH;
      const cols = r + 2;
      const rowW = (cols - 1) * colSpacing;
      const xStart = -rowW / 2;
      for (let c = 0; c < cols; c++) {
        this._pegs.push({ x: xStart + c * colSpacing, y, r: PEG_RADIUS });
      }
    }

    // Bucket walls: evenly spaced across board width
    this._buckets = [];
    const bW = boardW / BUCKET_COUNT;
    const bucketTop = pegBot - 0.02;   // just below peg zone
    const bucketBot = WORLD_BOT + 0.01;
    for (let i = 0; i < BUCKET_COUNT; i++) {
      this._buckets.push({
        xL: boardX0 + i * bW,
        xR: boardX0 + (i + 1) * bW,
        yFloor: bucketBot,
        yTop: bucketTop,
      });
    }

    this._boardX0 = boardX0;
    this._boardX1 = boardX1;
    // Hard side walls — balls bounce off these so they can't drift off the
    // edge of the peg triangle and break the distribution
    this._wallLeft  = boardX0;
    this._wallRight = boardX1;
    this._bucketTop = bucketTop;
    this._bucketBot = bucketBot;
    this._colSpacing = colSpacing;
    this._bW = bW;
    this._spawnX = 0;
    this._spawnY = 0.92;
  }

  // ── Three.js objects ─────────────────────────────────────────────────────
  _initRender() {
    // Particle instanced mesh (circles via IcosahedronGeometry lod=0)
    const pgeo = new THREE.CircleGeometry(PARTICLE_RADIUS, 8);
    const pmat = new THREE.MeshBasicMaterial({ color: 0x80cfff });
    this._particleMesh = new THREE.InstancedMesh(pgeo, pmat, this.maxParticles);
    this._particleMesh.count = 0;
    this._particleMesh.frustumCulled = false;
    this.scene.add(this._particleMesh);

    this._dummy = new THREE.Object3D();

    // Peg mesh (instanced)
    const ggeo = new THREE.CircleGeometry(PEG_RADIUS, 10);
    const gmat = new THREE.MeshBasicMaterial({ color: 0x2255aa });
    this._pegMesh = new THREE.InstancedMesh(ggeo, gmat, 2000);
    this._pegMesh.frustumCulled = false;
    this.scene.add(this._pegMesh);

    // Static walls / floor lines
    this._wallLines = null;

    // Histogram bars (LineSegments)
    this._histMesh = null;

    // Normal curve (line)
    this._normalCurve = null;

    this._rebuildStaticMeshes();
  }

  _rebuildStaticMeshes() {
    // Pegs
    const d = this._dummy;
    this._pegMesh.count = this._pegs.length;
    for (let i = 0; i < this._pegs.length; i++) {
      d.position.set(this._pegs[i].x, this._pegs[i].y, 0);
      d.updateMatrix();
      this._pegMesh.setMatrixAt(i, d.matrix);
    }
    this._pegMesh.instanceMatrix.needsUpdate = true;

    // Bucket walls
    if (this._wallLines) this.scene.remove(this._wallLines);
    const wallVerts = [];
    for (let i = 0; i <= BUCKET_COUNT; i++) {
      const x = this._boardX0 + i * this._bW;
      wallVerts.push(x, this._bucketTop, 0, x, this._bucketBot, 0);
    }
    // bottom floor
    wallVerts.push(this._boardX0, this._bucketBot, 0, this._boardX1, this._bucketBot, 0);
    // Side walls — full-height barriers from the top of the board to the floor
    wallVerts.push(this._wallLeft,  WORLD_TOP, 0, this._wallLeft,  this._bucketBot, 0);
    wallVerts.push(this._wallRight, WORLD_TOP, 0, this._wallRight, this._bucketBot, 0);
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute("position", new THREE.Float32BufferAttribute(wallVerts, 3));
    this._wallLines = new THREE.LineSegments(wgeo, new THREE.LineBasicMaterial({ color: 0x1a3a6a }));
    this.scene.add(this._wallLines);

    this._updateHistogramMesh();
    this._updateNormalCurve();
  }

  // ── Histogram & normal curve ──────────────────────────────────────────────
  _updateHistogramMesh() {
    if (this._histMesh) this.scene.remove(this._histMesh);
    if (this._histMax < 1) this._histMax = 1;

    const maxBarH = Math.abs(this._bucketTop - this._bucketBot) * 0.92;
    const verts = [];
    const colors = [];

    for (let i = 0; i < BUCKET_COUNT; i++) {
      const t  = this._histogram[i] / this._histMax;       // 0..1
      const h  = t * maxBarH;
      const xL = this._boardX0 + i * this._bW + 0.002;
      const xR = this._boardX0 + (i + 1) * this._bW - 0.002;
      const yB = this._bucketBot + 0.005;
      const yT = yB + h;

      // Cool-to-warm: blue → cyan → green → yellow → red
      const r = Math.min(1, t * 2);
      const g = t < 0.5 ? t * 2 : 2 - t * 2;
      const b = Math.max(0, 1 - t * 2);

      // Two triangles per bar
      verts.push(
        xL, yB, 0,  xR, yB, 0,  xR, yT, 0,
        xL, yB, 0,  xR, yT, 0,  xL, yT, 0
      );
      for (let v = 0; v < 6; v++) colors.push(r, g, b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color",    new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 });
    this._histMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this._histMesh);
  }

  _updateNormalCurve() {
    if (this._normalCurve) this.scene.remove(this._normalCurve);

    const N  = 120;
    const mu = BUCKET_COUNT / 2;
    const sigma = Math.sqrt(BUCKET_COUNT / 4);  // CLT variance for n Bernoulli
    const maxBarH = Math.abs(this._bucketTop - this._bucketBot) * 0.92;
    const verts = [];

    for (let i = 0; i <= N; i++) {
      const b = (i / N) * BUCKET_COUNT;   // bucket index float
      const z = (b - mu) / sigma;
      const pdf = Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
      // Normalise peak to 1 → match histogram height
      const peakPdf = 1 / (sigma * Math.sqrt(2 * Math.PI));
      const y = this._bucketBot + 0.005 + (pdf / peakPdf) * maxBarH;
      const x = this._boardX0 + b * this._bW;
      verts.push(x, y, 0.01);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    this._normalCurve = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.45, transparent: true }));
    this.scene.add(this._normalCurve);
  }

  // ── hold-to-drop controls ─────────────────────────────────────────────────
  startHold() {
    if (this._isHolding) return;
    this._isHolding = true;
    this._holdStart = performance.now();
    // Immediately drop one ball on the initial tap
    this._spawn();
  }

  stopHold() {
    this._isHolding = false;
    this._spawnAccum = 0;
  }

  // ── spawn ─────────────────────────────────────────────────────────────────
  _spawn() {
    // Find a free slot: scan for any non-frozen slot
    // We keep a cursor and wrap; most slots recycle quickly
    if (this._nextSlot === undefined) this._nextSlot = 0;
    const start = this._nextSlot;
    let slot = -1;
    for (let i = 0; i < this.maxParticles; i++) {
      const idx = (start + i) % this.maxParticles;
      if (this._buf[idx * STRIDE + F_STATE] !== STATE_FROZEN) {
        // unoccupied (0 = STATE_ACTIVE but uninitialized y will be 0 — treat as available)
        // More precisely: any slot that isn't frozen is either active/settling or never used
        // We only truly overwrite a slot if it's NOT frozen and NOT active/settling
        const st = this._buf[idx * STRIDE + F_STATE];
        if (st === STATE_EMPTY) {
          slot = idx;
          this._nextSlot = idx + 1;
          break;
        }
      }
    }
    if (slot === -1) return; // all slots in use

    const o = slot * STRIDE;
    this._buf[o + F_X]       = this._spawnX + (Math.random() - 0.5) * 0.04;
    this._buf[o + F_Y]       = this._spawnY;
    this._buf[o + F_VX]      = (Math.random() - 0.5) * 0.05;
    this._buf[o + F_VY]      = 0;
    this._buf[o + F_STATE]   = STATE_ACTIVE;
    this._buf[o + F_FREEZE_T]= 0;
    this._buf[o + F_STUCK_T] = 0;
    this._buf[o + F_BUCKET]  = -1;
    this._count++;
  }

  // ── simulation step ──────────────────────────────────────────────────────
  _step(dt) {
    const buf = this._buf;
    const g   = this.gravity;
    const dmp = this.damping;

    for (let i = 0; i < this.maxParticles; i++) {
      const o = i * STRIDE;
      const state = buf[o + F_STATE];
      if (state === STATE_FROZEN || state === STATE_EMPTY) continue;

      let x  = buf[o + F_X];
      let y  = buf[o + F_Y];
      let vx = buf[o + F_VX];
      let vy = buf[o + F_VY];

      // Gravity
      vy -= g * dt;

      // Euler position integration
      x += vx * dt;
      y += vy * dt;

      // ── ACTIVE: collide with pegs ──
      if (state === STATE_ACTIVE) {
        for (let p = 0; p < this._pegs.length; p++) {
          const pg = this._pegs[p];
          const dx = x - pg.x, dy = y - pg.y;
          const dist2 = dx*dx + dy*dy;
          const minD  = pg.r + PARTICLE_RADIUS;
          if (dist2 < minD * minD && dist2 > 1e-12) {
            const dist = Math.sqrt(dist2);
            const nx = dx / dist, ny = dy / dist;
            // Push out
            x = pg.x + nx * minD * 1.02;
            y = pg.y + ny * minD * 1.02;
            // Reflect velocity
            const dot = vx * nx + vy * ny;
            vx = (vx - 2 * dot * nx) * dmp;
            vy = (vy - 2 * dot * ny) * dmp;
            // Small random nudge
            vx += (Math.random() - 0.5) * 0.04;
          }
        }

        // Hard side walls — keep balls inside the peg grid
        if (x < this._wallLeft + PARTICLE_RADIUS)  { x = this._wallLeft + PARTICLE_RADIUS;  vx = Math.abs(vx) * 0.4; }
        if (x > this._wallRight - PARTICLE_RADIUS) { x = this._wallRight - PARTICLE_RADIUS; vx = -Math.abs(vx) * 0.4; }

        // Transition to SETTLING when entering bucket zone
        if (y < this._bucketTop) {
          buf[o + F_STATE] = STATE_SETTLING;
          // Assign bucket
          const bi = Math.floor((x - this._boardX0) / this._bW);
          buf[o + F_BUCKET] = Math.max(0, Math.min(BUCKET_COUNT - 1, bi));
        }
      }

      // ── SETTLING: bucket walls + floor + frozen stack ──
      if (buf[o + F_STATE] === STATE_SETTLING) {
        const bi  = buf[o + F_BUCKET];
        const bkt = this._buckets[bi];
        if (!bkt) { buf[o + F_STATE] = STATE_FROZEN; continue; }

        const wallL = bkt.xL + PARTICLE_RADIUS;
        const wallR = bkt.xR - PARTICLE_RADIUS;
        const floor = bkt.yFloor + PARTICLE_RADIUS;

        // Wall collisions
        if (x < wallL) { x = wallL; vx = Math.abs(vx) * 0.3; }
        if (x > wallR) { x = wallR; vx = -Math.abs(vx) * 0.3; }
        // Floor
        if (y < floor) { y = floor; vy = Math.abs(vy) * 0.25; vx *= 0.8; }

        // Frozen stack collisions (spatial hash)
        const checkR = PARTICLE_RADIUS * 2 + CELL;
        const near   = this._frozen.query(x, y, checkR);
        for (let n = 0; n < near.length; n += 2) {
          const fx = near[n], fy = near[n+1];
          const dx = x - fx, dy = y - fy;
          const d2 = dx*dx + dy*dy;
          const minD = PARTICLE_RADIUS * 2;
          if (d2 < minD * minD && d2 > 1e-12) {
            const d  = Math.sqrt(d2);
            const nx = dx/d, ny = dy/d;
            x = fx + nx * minD * 1.01;
            y = fy + ny * minD * 1.01;
            const dot = vx*nx + vy*ny;
            if (dot < 0) {
              vx = (vx - 2*dot*nx) * 0.2;
              vy = (vy - 2*dot*ny) * 0.2;
            }
          }
        }

        // Re-clamp after stack collisions
        if (x < wallL) { x = wallL; vx = Math.abs(vx) * 0.2; }
        if (x > wallR) { x = wallR; vx = -Math.abs(vx) * 0.2; }

        const speed2 = vx*vx + vy*vy;
        buf[o + F_STUCK_T]++;

        if (speed2 < VEL_EPS * VEL_EPS) {
          buf[o + F_FREEZE_T]++;
          if (buf[o + F_FREEZE_T] >= FREEZE_FRAMES || buf[o + F_STUCK_T] >= STUCK_MAX) {
            // Freeze this particle
            buf[o + F_STATE] = STATE_FROZEN;
            this._frozen.insert(x, y);
            this._histogram[bi]++;
            if (this._histogram[bi] > this._histMax) this._histMax = this._histogram[bi];
            vx = 0; vy = 0;
          }
        } else {
          buf[o + F_FREEZE_T] = 0;
          if (buf[o + F_STUCK_T] >= STUCK_MAX) {
            buf[o + F_STATE] = STATE_FROZEN;
            this._frozen.insert(x, y);
            this._histogram[bi]++;
            if (this._histogram[bi] > this._histMax) this._histMax = this._histogram[bi];
            vx = 0; vy = 0;
          }
        }
      }

      buf[o + F_X]  = x;
      buf[o + F_Y]  = y;
      buf[o + F_VX] = vx;
      buf[o + F_VY] = vy;
    }
  }

  // ── upload live particles to instanced mesh ───────────────────────────────
  _updateParticleMesh() {
    const d = this._dummy;
    let idx = 0;
    for (let i = 0; i < this.maxParticles; i++) {
      const o = i * STRIDE;
      const state = this._buf[o + F_STATE];
      if (state === STATE_ACTIVE || state === STATE_SETTLING) {
        d.position.set(this._buf[o + F_X], this._buf[o + F_Y], 0.005);
        d.updateMatrix();
        this._particleMesh.setMatrixAt(idx, d.matrix);
        idx++;
      }
    }
    this._particleMesh.count = idx;
    this._particleMesh.instanceMatrix.needsUpdate = true;
  }

  // ── main loop ────────────────────────────────────────────────────────────
  update() {
    const now = performance.now() / 1000;
    if (this._lastTime === null) { this._lastTime = now; return; }
    const dt = Math.min(now - this._lastTime, 0.033);  // cap at 33ms
    this._lastTime = now;

    // Spawn — only while button is held, rate accelerates over 3s
    if (this._isHolding) {
      const holdSec = Math.min((performance.now() - this._holdStart) / 1000, 3.0);
      // Ease-in: starts at ~2/s, reaches maxHoldRate at 3s
      // t goes 0→1 over holdSec 0→3, rate = mix(2, maxHoldRate, t^2)
      const t = holdSec / 3.0;
      const currentRate = 2 + (this.maxHoldRate - 2) * t * t;
      this._spawnAccum += currentRate * dt;
      while (this._spawnAccum >= 1) {
        this._spawn();
        this._spawnAccum -= 1;
      }
    }

    // Physics — sub-step for stability
    const SUBSTEPS = 3;
    const subDt = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this._step(subDt);

    // Update render (particles every frame, histogram every 8 frames)
    this._updateParticleMesh();
    this._frame = (this._frame || 0) + 1;
    if (this._frame % 8 === 0) {
      this._updateHistogramMesh();
    }
  }
}

export { Game };
