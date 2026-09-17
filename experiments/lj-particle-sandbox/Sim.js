/**
 * SoA Lennard-Jones sandbox: continuous LJ + gravity + walls + cell list.
 * App must not mutate SoA arrays; use the public API only.
 */
export class Sim {
  /**
   * @param {{ maxN?: number, width?: number, height?: number }} [opts]
   */
  constructor(opts = {}) {
    this.maxN = opts.maxN ?? 1000;
    this.width = opts.width ?? 36;
    this.height = opts.height ?? 54;

    this.x = new Float32Array(this.maxN);
    this.y = new Float32Array(this.maxN);
    this.vx = new Float32Array(this.maxN);
    this.vy = new Float32Array(this.maxN);
    this.fx = new Float32Array(this.maxN);
    this.fy = new Float32Array(this.maxN);
    this.species = new Uint8Array(this.maxN);
    this.count = 0;

    // Three species: A (cyan), B (coral), C (lime)
    this.epsilon = new Float32Array([1.0, 1.15, 0.85]);
    this.sigma = new Float32Array([1.0, 1.35, 0.75]);
    this.mass = new Float32Array([1.0, 1.8, 0.55]);

    this.gravity = 2.2;
    this.dt = 0.004;
    this.substeps = 2;
    this.wallRestitution = 0.25;
    this.linearDrag = 0.0008;

    this._cellHeads = null;
    this._cellNext = new Int32Array(this.maxN);
    this._rebuildCutoff();
  }

  /** Clear particles; optional world size update. */
  reset(opts = {}) {
    if (opts.width != null) this.width = opts.width;
    if (opts.height != null) this.height = opts.height;
    if (opts.maxN != null && opts.maxN !== this.maxN) {
      this.maxN = opts.maxN;
      this.x = new Float32Array(this.maxN);
      this.y = new Float32Array(this.maxN);
      this.vx = new Float32Array(this.maxN);
      this.vy = new Float32Array(this.maxN);
      this.fx = new Float32Array(this.maxN);
      this.fy = new Float32Array(this.maxN);
      this.species = new Uint8Array(this.maxN);
      this._cellNext = new Int32Array(this.maxN);
    }
    this.count = 0;
    this._rebuildCutoff();
  }

  /**
   * @param {number} index 0..2
   * @param {{ epsilon?: number, sigma?: number, mass?: number }} params
   */
  setSpeciesParams(index, params = {}) {
    const i = index | 0;
    if (i < 0 || i > 2) return;
    if (params.epsilon != null) this.epsilon[i] = Math.max(0.01, params.epsilon);
    if (params.sigma != null) this.sigma[i] = Math.max(0.2, params.sigma);
    if (params.mass != null) this.mass[i] = Math.max(0.05, params.mass);
    this._rebuildCutoff();
  }

  setGravity(g) {
    this.gravity = g;
  }

  /**
   * Spawn one particle in world coords. Returns false if at capacity or OOB.
   * @param {number} x
   * @param {number} y
   * @param {number} [speciesIndex=0]
   */
  spawnAt(x, y, speciesIndex = 0) {
    if (this.count >= this.maxN) return false;
    const s = Math.max(0, Math.min(2, speciesIndex | 0));
    const rad = 0.5 * this.sigma[s];
    const px = Math.min(this.width - rad, Math.max(rad, x));
    const py = Math.min(this.height - rad, Math.max(rad, y));
    const i = this.count++;
    this.x[i] = px;
    this.y[i] = py;
    this.vx[i] = (Math.random() - 0.5) * 0.15;
    this.vy[i] = (Math.random() - 0.5) * 0.15;
    this.fx[i] = 0;
    this.fy[i] = 0;
    this.species[i] = s;
    return true;
  }

  /** Advance physics by one frame (may use internal substeps). */
  step() {
    const n = this.count;
    if (n === 0) return;
    const dt = this.dt;
    const steps = this.substeps;
    for (let s = 0; s < steps; s++) {
      this._computeForces();
      this._integrate(dt);
      this._resolveWalls();
    }
  }

  /**
   * Read-only views into SoA + params. Do not mutate returned arrays.
   */
  getState() {
    return {
      count: this.count,
      maxN: this.maxN,
      width: this.width,
      height: this.height,
      gravity: this.gravity,
      rCut: this.rCut,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      species: this.species,
      epsilon: this.epsilon,
      sigma: this.sigma,
      mass: this.mass,
    };
  }

  // --- internals ---

  _rebuildCutoff() {
    let sMax = this.sigma[0];
    for (let i = 1; i < 3; i++) if (this.sigma[i] > sMax) sMax = this.sigma[i];
    this.sigmaMax = sMax;
    this.rCut = 2.5 * sMax;
    this.rCutSq = this.rCut * this.rCut;
    this.cellSize = Math.max(this.rCut, 1e-6);
    this._ensureCells();
  }

  _ensureCells() {
    this.nCellX = Math.max(1, Math.ceil(this.width / this.cellSize));
    this.nCellY = Math.max(1, Math.ceil(this.height / this.cellSize));
    const nCells = this.nCellX * this.nCellY;
    if (!this._cellHeads || this._cellHeads.length < nCells) {
      this._cellHeads = new Int32Array(nCells);
    }
  }

  _buildCellList() {
    this._ensureCells();
    const heads = this._cellHeads;
    const next = this._cellNext;
    const nCells = this.nCellX * this.nCellY;
    for (let c = 0; c < nCells; c++) heads[c] = -1;
    const inv = 1 / this.cellSize;
    const ncx = this.nCellX;
    const ncy = this.nCellY;
    const n = this.count;
    const x = this.x;
    const y = this.y;
    for (let i = 0; i < n; i++) {
      let cx = (x[i] * inv) | 0;
      let cy = (y[i] * inv) | 0;
      if (cx < 0) cx = 0;
      else if (cx >= ncx) cx = ncx - 1;
      if (cy < 0) cy = 0;
      else if (cy >= ncy) cy = ncy - 1;
      const c = cx + cy * ncx;
      next[i] = heads[c];
      heads[c] = i;
    }
  }

  _computeForces() {
    const n = this.count;
    const fx = this.fx;
    const fy = this.fy;
    for (let i = 0; i < n; i++) {
      fx[i] = 0;
      fy[i] = 0;
    }

    this._buildCellList();

    const x = this.x;
    const y = this.y;
    const sp = this.species;
    const eps = this.epsilon;
    const sig = this.sigma;
    const heads = this._cellHeads;
    const next = this._cellNext;
    const ncx = this.nCellX;
    const ncy = this.nCellY;
    const rCutSq = this.rCutSq;
    const g = this.gravity;

    // Pairwise LJ via cell list (neighbor cells + self, i < j)
    for (let cy = 0; cy < ncy; cy++) {
      for (let cx = 0; cx < ncx; cx++) {
        const c0 = cx + cy * ncx;
        for (let dcy = -1; dcy <= 1; dcy++) {
          const ny = cy + dcy;
          if (ny < 0 || ny >= ncy) continue;
          for (let dcx = -1; dcx <= 1; dcx++) {
            const nx = cx + dcx;
            if (nx < 0 || nx >= ncx) continue;
            // Visit each unordered pair once: only when neighbor cell id >= c0
            const c1 = nx + ny * ncx;
            if (c1 < c0) continue;

            let i = heads[c0];
            while (i !== -1) {
              let j = heads[c1];
              while (j !== -1) {
                if (c0 === c1 && j <= i) {
                  j = next[j];
                  continue;
                }
                const si = sp[i];
                const sj = sp[j];
                // Lorentz–Berthelot
                const sigma = 0.5 * (sig[si] + sig[sj]);
                const epsilon = Math.sqrt(eps[si] * eps[sj]);

                let dx = x[j] - x[i];
                let dy = y[j] - y[i];
                let r2 = dx * dx + dy * dy;
                if (r2 > rCutSq || r2 < 1e-12) {
                  j = next[j];
                  continue;
                }

                // Soft-core clamp: r < 0.5 σ
                const rMin = 0.5 * sigma;
                const rMinSq = rMin * rMin;
                if (r2 < rMinSq) {
                  const r = Math.sqrt(r2);
                  const scale = rMin / Math.max(r, 1e-9);
                  dx *= scale;
                  dy *= scale;
                  r2 = rMinSq;
                }

                const invR2 = 1 / r2;
                const sig2 = sigma * sigma;
                const sr2 = sig2 * invR2;
                const sr6 = sr2 * sr2 * sr2;
                const sr12 = sr6 * sr6;
                // F_on_i = (dV/dr) * r_hat = 24ε (sr6 - 2 sr12) * dr / r^2
                // (repels when close, attracts near the well)
                const fPair = 24 * epsilon * (sr6 - 2 * sr12) * invR2;
                const fxPair = fPair * dx;
                const fyPair = fPair * dy;
                fx[i] += fxPair;
                fy[i] += fyPair;
                fx[j] -= fxPair;
                fy[j] -= fyPair;

                j = next[j];
              }
              i = next[i];
            }
          }
        }
      }
    }

    // Gravity (down = +y in world; canvas will flip)
    for (let i = 0; i < n; i++) {
      fy[i] += this.mass[sp[i]] * g;
    }
  }

  _integrate(dt) {
    const n = this.count;
    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const fx = this.fx;
    const fy = this.fy;
    const sp = this.species;
    const mass = this.mass;
    const drag = 1 - this.linearDrag;
    // Velocity Verlet: half-kick, drift, (forces refreshed externally between), half-kick
    // Here forces are current; we kick fully with current forces then drift
    // (symplectic Euler / leapfrog-style for speed):
    for (let i = 0; i < n; i++) {
      const invM = 1 / mass[sp[i]];
      vx[i] = (vx[i] + fx[i] * invM * dt) * drag;
      vy[i] = (vy[i] + fy[i] * invM * dt) * drag;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
    }
  }

  _resolveWalls() {
    const n = this.count;
    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const sp = this.species;
    const sig = this.sigma;
    const w = this.width;
    const h = this.height;
    const e = this.wallRestitution;

    for (let i = 0; i < n; i++) {
      const r = 0.5 * sig[sp[i]];
      if (x[i] < r) {
        x[i] = r;
        if (vx[i] < 0) vx[i] *= -e;
      } else if (x[i] > w - r) {
        x[i] = w - r;
        if (vx[i] > 0) vx[i] *= -e;
      }
      if (y[i] < r) {
        y[i] = r;
        if (vy[i] < 0) vy[i] *= -e;
      } else if (y[i] > h - r) {
        y[i] = h - r;
        if (vy[i] > 0) vy[i] *= -e;
      }
    }
  }
}

export default Sim;
