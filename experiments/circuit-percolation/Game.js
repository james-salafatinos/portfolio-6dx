import * as THREE from 'three';

// Random Fuse / current-flow percolation on a square lattice.
//
// Standard bond percolation only asks "is there a path?" via Union-Find.
// This asks a physically richer question: if the open bonds are wires and
// we apply a voltage across the lattice, where does current actually flow?
// The answer separates the "backbone" (current-carrying, load-bearing
// bonds) from "dangling ends" (structurally connected, but electrically
// dead) — a distinction ordinary connectivity coloring can't show.
//
// Optionally, "fuse mode" lets bonds carrying too much current permanently
// blow, so the backbone erodes and current reroutes in real time — a
// simple version of the Random Fuse Model used to study fracture and
// dielectric breakdown in disordered media.

class Game {
  constructor(size = 40) {
    this.size = size;
    this.p = 0.55;
    this.fuseMode = false;
    this.fuseThreshold = 1.2;
    this.autoSweep = false;
    this.sweepPhase = 0;

    const n = size * size;
    this.potential = new Float32Array(n);
    // Per-bond random threshold; a bond is "open" iff weight <= p.
    this.hWeight = new Float32Array(size * (size - 1)); // horizontal: (r,c)-(r,c+1)
    this.vWeight = new Float32Array((size - 1) * size); // vertical:   (r,c)-(r+1,c)
    this.hBroken = new Uint8Array(size * (size - 1));
    this.vBroken = new Uint8Array((size - 1) * size);
    this.hCurrent = new Float32Array(size * (size - 1));
    this.vCurrent = new Float32Array((size - 1) * size);

    this.totalCurrent = 0;
    this.maxCurrent = 0;
    this.percolates = false;

    this.regenerate();
  }

  idx(r, c) {
    return r * this.size + c;
  }

  hIdx(r, c) {
    return r * (this.size - 1) + c;
  } // bond (r,c)-(r,c+1)

  vIdx(r, c) {
    return r * this.size + c;
  } // bond (r,c)-(r+1,c)

  regenerate() {
    for (let i = 0; i < this.hWeight.length; i++) this.hWeight[i] = Math.random();
    for (let i = 0; i < this.vWeight.length; i++) this.vWeight[i] = Math.random();
    this.hBroken.fill(0);
    this.vBroken.fill(0);
    const n = this.size;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        // Linear initial guess speeds up convergence a lot.
        this.potential[this.idx(r, c)] = 1 - c / (n - 1);
      }
    }
  }

  setP(value) {
    this.p = value;
  }

  isHOpen(r, c) {
    const i = this.hIdx(r, c);
    return !this.hBroken[i] && this.hWeight[i] <= this.p;
  }

  isVOpen(r, c) {
    const i = this.vIdx(r, c);
    return !this.vBroken[i] && this.vWeight[i] <= this.p;
  }

  update() {
    if (this.autoSweep) {
      this.sweepPhase += 0.01;
      this.p = 0.5 + 0.45 * Math.sin(this.sweepPhase);
    }
    this.relax(4);
    this.computeCurrents();
    if (this.fuseMode) this.blowFuses();
  }

  // Gauss-Seidel relaxation of the discrete Laplace equation: each free
  // node's potential becomes the average of its open neighbors. Left
  // column is held at V=1, right column at V=0 (the two electrodes).
  relax(iterations) {
    const n = this.size;
    for (let pass = 0; pass < iterations; pass++) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (c === 0) {
            this.potential[this.idx(r, c)] = 1;
            continue;
          }
          if (c === n - 1) {
            this.potential[this.idx(r, c)] = 0;
            continue;
          }
          let sum = 0;
          let count = 0;
          if (r > 0 && this.isVOpen(r - 1, c)) {
            sum += this.potential[this.idx(r - 1, c)];
            count++;
          }
          if (r < n - 1 && this.isVOpen(r, c)) {
            sum += this.potential[this.idx(r + 1, c)];
            count++;
          }
          if (this.isHOpen(r, c - 1)) {
            sum += this.potential[this.idx(r, c - 1)];
            count++;
          }
          if (this.isHOpen(r, c)) {
            sum += this.potential[this.idx(r, c + 1)];
            count++;
          }
          if (count > 0) this.potential[this.idx(r, c)] = sum / count;
        }
      }
    }
  }

  computeCurrents() {
    const n = this.size;
    let total = 0;
    let max = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n - 1; c++) {
        const i = this.hIdx(r, c);
        const open = this.isHOpen(r, c);
        const current = open ? this.potential[this.idx(r, c)] - this.potential[this.idx(r, c + 1)] : 0;
        this.hCurrent[i] = current;
        if (Math.abs(current) > max) max = Math.abs(current);
        if (c === 0 && open) total += Math.abs(current);
      }
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n; c++) {
        const i = this.vIdx(r, c);
        const open = this.isVOpen(r, c);
        const current = open ? this.potential[this.idx(r, c)] - this.potential[this.idx(r + 1, c)] : 0;
        this.vCurrent[i] = current;
        if (Math.abs(current) > max) max = Math.abs(current);
      }
    }
    this.totalCurrent = total;
    this.maxCurrent = max;
    this.percolates = total > 1e-4;
  }

  blowFuses() {
    for (let i = 0; i < this.hCurrent.length; i++) {
      if (!this.hBroken[i] && Math.abs(this.hCurrent[i]) > this.fuseThreshold) this.hBroken[i] = 1;
    }
    for (let i = 0; i < this.vCurrent.length; i++) {
      if (!this.vBroken[i] && Math.abs(this.vCurrent[i]) > this.fuseThreshold) this.vBroken[i] = 1;
    }
  }
}

export { Game };
