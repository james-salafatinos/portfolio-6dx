/**
 * Single Markov random walker on open 4-neighbors of a Grid.
 */
export class Walker {
  constructor() {
    this.i = 0;
    this.j = 0;
    this.i0 = 0;
    this.j0 = 0;
    this.visits = null;
    this._unique = 0;
    this.steps = 0;
    this.trapped = false;
    this._gridSize = 0;
  }

  reset() {
    this.visits = null;
    this._unique = 0;
    this.steps = 0;
    this.trapped = false;
    this.i = this.j = this.i0 = this.j0 = 0;
  }

  _ensureVisits(grid) {
    const n = grid.size;
    if (!this.visits || this._gridSize !== n) {
      this.visits = new Uint32Array(n * n);
      this._gridSize = n;
      this._unique = 0;
    }
  }

  _mark(grid) {
    const k = grid.idx(this.i, this.j);
    if (this.visits[k] === 0) this._unique++;
    this.visits[k]++;
  }

  /** Drop on (i,j) or a random open site. Clears visit history. */
  drop(grid, i, j) {
    this._ensureVisits(grid);
    this.visits.fill(0);
    this._unique = 0;
    this.steps = 0;
    this.trapped = false;

    if (typeof i === 'number' && typeof j === 'number' && grid.isOpen(i, j)) {
      this.i = i;
      this.j = j;
    } else {
      const open = grid.getOpenSites();
      if (open.length === 0) {
        this.i = 0;
        this.j = 0;
        this.trapped = true;
        this.i0 = this.i;
        this.j0 = this.j;
        return;
      }
      const pick = open[(Math.random() * open.length) | 0];
      this.i = pick[0];
      this.j = pick[1];
    }
    this.i0 = this.i;
    this.j0 = this.j;
    this._mark(grid);
  }

  step(grid) {
    if (!this.visits) this.drop(grid);
    const nbrs = grid.openNeighbors(this.i, this.j);
    if (nbrs.length === 0) {
      this.trapped = true;
      return false;
    }
    this.trapped = false;
    const pick = nbrs[(Math.random() * nbrs.length) | 0];
    this.i = pick[0];
    this.j = pick[1];
    this.steps++;
    this._mark(grid);
    return true;
  }

  getPos() {
    return { i: this.i, j: this.j };
  }

  getVisitCounts() {
    return this.visits;
  }

  get uniqueCount() {
    return this._unique;
  }

  /** Mean squared displacement from drop site (lattice units). */
  get msd() {
    const di = this.i - this.i0;
    const dj = this.j - this.j0;
    return di * di + dj * dj;
  }
}
