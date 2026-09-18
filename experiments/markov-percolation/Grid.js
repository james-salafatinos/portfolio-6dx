/**
 * 2D site percolation lattice.
 * Each site has a fixed uniform random potential U; open iff U < p.
 * Walker moves on open 4-neighbors only (von Neumann).
 */
export class Grid {
  constructor(size = 100) {
    this.size = size;
    this.p = 0.45;
    this.potentials = new Float32Array(size * size);
    this._reshuffle();
  }

  get n() {
    return this.size;
  }

  _reshuffle() {
    const n = this.size * this.size;
    for (let i = 0; i < n; i++) this.potentials[i] = Math.random();
  }

  /** New random potentials (keeps current p). */
  reshuffle() {
    this._reshuffle();
  }

  reset(p) {
    if (typeof p === 'number') this.p = p;
    this._reshuffle();
  }

  setP(p) {
    this.p = Math.max(0, Math.min(1, p));
  }

  idx(i, j) {
    return i * this.size + j;
  }

  isOpen(i, j) {
    const n = this.size;
    if (i < 0 || j < 0 || i >= n || j >= n) return false;
    return this.potentials[this.idx(i, j)] < this.p;
  }

  isOpenIdx(flat) {
    return this.potentials[flat] < this.p;
  }

  /** Open von Neumann neighbors of (i,j). */
  openNeighbors(i, j) {
    const out = [];
    if (this.isOpen(i - 1, j)) out.push([i - 1, j]);
    if (this.isOpen(i + 1, j)) out.push([i + 1, j]);
    if (this.isOpen(i, j - 1)) out.push([i, j - 1]);
    if (this.isOpen(i, j + 1)) out.push([i, j + 1]);
    return out;
  }

  /** Flat list of open site [i,j] pairs (for drop / paint). */
  getOpenSites() {
    const n = this.size;
    const sites = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (this.isOpen(i, j)) sites.push([i, j]);
      }
    }
    return sites;
  }

  getSites() {
    return this.potentials;
  }
}
