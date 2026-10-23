const SUPERPOSED = 0;
const COLLAPSED = 2;
const EMPTY_STATE = 255;

function mix32(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function hash(seed, a = 0, b = 0, c = 0) {
  return mix32((seed >>> 0) ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77) ^ Math.imul(c + 1, 0xc2b2ae3d));
}

function unit(seed, a, b, c) {
  return hash(seed, a, b, c) / 0x100000000;
}

export class CPWFCModel {
  constructor(params = {}) {
    this.params = {
      L: 48,
      q: 4,
      p: 0.5,
      T: 1,
      J: 1,
      bondMode: 'quenched',
      conditioning: 'parent-only',
      contradiction: 'defect',
      boundary: 'open',
      seeds: 1,
      seed: 0x6d2b79f5,
      tMax: 4096,
      adjacency: null,
      ...params,
    };
    this.reset();
  }

  reset(overrides = {}) {
    Object.assign(this.params, overrides);
    const { L } = this.params;
    this.count = L * L;
    this.status = new Uint8Array(this.count);
    this.states = new Uint8Array(this.count).fill(EMPTY_STATE);
    this.times = new Int32Array(this.count).fill(-1);
    this.parents = new Int32Array(this.count).fill(-1);
    this.depths = new Uint32Array(this.count);
    this.defects = new Uint8Array(this.count);
    this.time = 0;
    this.collapsedCount = 0;
    this.defectCount = 0;
    this.done = false;
    this.wave = [];
    this.seedCells = [];
    this._placeSeeds();
    this.metrics = this.measure();
    return this;
  }

  _placeSeeds() {
    const { seed, seeds, q } = this.params;
    const wanted = Math.max(1, Math.min(this.count, seeds | 0));
    let cursor = hash(seed, 17);
    while (this.seedCells.length < wanted) {
      const id = cursor % this.count;
      if (this.status[id] === SUPERPOSED) {
        this.status[id] = COLLAPSED;
        this.states[id] = hash(seed, id, 91) % q;
        this.times[id] = 0;
        this.seedCells.push(id);
        this.wave.push(id);
        this.collapsedCount++;
      }
      cursor = mix32(cursor + 0x9e3779b9);
    }
  }

  neighbors(id) {
    const { L, boundary } = this.params;
    const x = id % L;
    const y = (id / L) | 0;
    const result = [];
    const add = (nx, ny) => {
      if (boundary === 'periodic') {
        nx = (nx + L) % L;
        ny = (ny + L) % L;
        result.push(ny * L + nx);
      } else if (nx >= 0 && ny >= 0 && nx < L && ny < L) {
        result.push(ny * L + nx);
      }
    };
    add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
    return result;
  }

  _bondFires(source, target, nextTime) {
    const { seed, p, bondMode } = this.params;
    if (bondMode === 'quenched') {
      const lo = Math.min(source, target);
      const hi = Math.max(source, target);
      return unit(seed ^ 0xa511e9b3, lo, hi, 0) < p;
    }
    return unit(seed ^ 0x63d83595, source, target, nextTime) < p;
  }

  _weights(target, parents) {
    const { q, T, J, conditioning, adjacency } = this.params;
    const sources = conditioning === 'full'
      ? this.neighbors(target).filter((id) => this.status[id] === COLLAPSED)
      : [parents[hash(this.params.seed, target, this.time, 31) % parents.length]];
    const weights = new Float64Array(q);
    const strict = adjacency && T <= 0.010001;
    for (let candidate = 0; candidate < q; candidate++) {
      let logWeight = 0;
      let valid = true;
      for (const source of sources) {
        const state = this.states[source];
        if (adjacency) {
          const allowed = Number(adjacency[state]?.[candidate] ?? 0);
          if (strict && !allowed) { valid = false; break; }
          logWeight += -(1 - allowed) / Math.max(T, 0.01);
        } else {
          logWeight += J * Number(candidate === state) / Math.max(T, 0.01);
        }
      }
      weights[candidate] = valid ? Math.exp(Math.max(-700, Math.min(700, logWeight))) : 0;
    }
    return { weights, sources };
  }

  _drawState(target, parents, nextTime) {
    const { weights, sources } = this._weights(target, parents);
    let total = 0;
    for (const weight of weights) total += weight;
    let defect = false;
    if (!(total > 0) || !Number.isFinite(total)) {
      defect = true;
      if (this.params.contradiction === 'floor') {
        weights.fill(1);
        total = weights.length;
      } else {
        const votes = new Uint16Array(this.params.q);
        for (const source of sources) votes[this.states[source]]++;
        let best = 0;
        for (let state = 1; state < votes.length; state++) if (votes[state] > votes[best]) best = state;
        return { state: best, defect };
      }
    }
    let draw = unit(this.params.seed ^ 0x94d049bb, target, nextTime, 47) * total;
    for (let state = 0; state < weights.length; state++) {
      draw -= weights[state];
      if (draw <= 0) return { state, defect };
    }
    return { state: weights.length - 1, defect };
  }

  step() {
    if (this.done) return [];
    const nextTime = this.time + 1;
    if (nextTime > this.params.tMax) {
      this.done = true;
      return [];
    }
    const sources = this.params.bondMode === 'quenched'
      ? this.wave
      : Array.from({ length: this.count }, (_, id) => id).filter((id) => this.status[id] === COLLAPSED);
    const candidates = new Map();
    let frontierBonds = 0;
    for (const source of sources) {
      for (const target of this.neighbors(source)) {
        if (this.status[target] !== SUPERPOSED) continue;
        frontierBonds++;
        if (!this._bondFires(source, target, nextTime)) continue;
        const list = candidates.get(target);
        if (list) list.push(source);
        else candidates.set(target, [source]);
      }
    }
    if (!frontierBonds || !candidates.size) {
      if (this.params.bondMode === 'quenched' || !frontierBonds) this.done = true;
      this.time = nextTime;
      this.wave = [];
      this.metrics = this.measure();
      return [];
    }
    const nextWave = [...candidates.keys()].sort((a, b) => a - b);
    for (const target of nextWave) {
      const parents = candidates.get(target);
      const selected = parents[hash(this.params.seed, target, nextTime, 59) % parents.length];
      const draw = this._drawState(target, parents, nextTime);
      this.status[target] = COLLAPSED;
      this.states[target] = draw.state;
      this.times[target] = nextTime;
      this.parents[target] = selected;
      this.depths[target] = this.depths[selected] + 1;
      this.defects[target] = Number(draw.defect);
      this.defectCount += Number(draw.defect);
      this.collapsedCount++;
    }
    this.time = nextTime;
    this.wave = nextWave;
    if (this.collapsedCount === this.count) this.done = true;
    this.metrics = this.measure();
    return nextWave;
  }

  run(maxSteps = this.params.tMax) {
    let steps = 0;
    while (!this.done && steps < maxSteps) { this.step(); steps++; }
    return this.metrics;
  }

  measure() {
    const { L } = this.params;
    let maxDepth = 0;
    let differing = 0;
    let compared = 0;
    let left = false, right = false, top = false, bottom = false;
    const frontTimes = new Int32Array(L).fill(-1);
    for (let id = 0; id < this.count; id++) {
      if (this.status[id] !== COLLAPSED) continue;
      const x = id % L;
      const y = (id / L) | 0;
      if (x === 0) left = true;
      if (x === L - 1) right = true;
      if (y === 0) top = true;
      if (y === L - 1) bottom = true;
      if (this.times[id] > frontTimes[x]) frontTimes[x] = this.times[id];
      if (this.depths[id] > maxDepth) maxDepth = this.depths[id];
      if (x + 1 < L && this.status[id + 1] === COLLAPSED) { compared++; differing += Number(this.states[id] !== this.states[id + 1]); }
      if (y + 1 < L && this.status[id + L] === COLLAPSED) { compared++; differing += Number(this.states[id] !== this.states[id + L]); }
    }
    const values = [...frontTimes].filter((value) => value >= 0);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const roughness = values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) : 0;
    return {
      collapsedFraction: this.collapsedCount / this.count,
      spanning: (left && right) || (top && bottom),
      domainWallDensity: compared ? differing / compared : 0,
      contradictionRate: this.collapsedCount ? this.defectCount / this.collapsedCount : 0,
      maxDepth,
      roughness,
      time: this.time,
      collapsed: this.collapsedCount,
      frontier: this.wave.length,
      done: this.done,
    };
  }

  snapshot() {
    return {
      params: { ...this.params, adjacency: this.params.adjacency || undefined },
      metrics: { ...this.metrics },
      history: Array.from({ length: this.count }, (_, id) => this.status[id] === COLLAPSED ? {
        id, state: this.states[id], time: this.times[id], parent: this.parents[id], defect: Boolean(this.defects[id]),
      } : null).filter(Boolean),
    };
  }
}

export { COLLAPSED, EMPTY_STATE, SUPERPOSED, hash, unit };
