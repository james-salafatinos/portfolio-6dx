export class UnionFind {
  constructor(nodes, boundaries) {
    this.count = nodes.length;
    this.parent = new Int32Array(this.count);
    this.rank = new Int8Array(this.count);
    this.size = new Int32Array(this.count);
    this.active = new Uint8Array(this.count);
    this.meta = new Array(this.count);

    for (let i = 0; i < this.count; i++) {
      const node = nodes[i];
      const flags = boundaries.flagsFor(node);
      this.parent[i] = i;
      this.size[i] = 1;
      this.meta[i] = {
        size: 1,
        colorSeed: i,
        touchesTop: Boolean(flags & boundaries.TOP),
        touchesRight: Boolean(flags & boundaries.RIGHT),
        touchesBottom: Boolean(flags & boundaries.BOTTOM),
        touchesLeft: Boolean(flags & boundaries.LEFT),
        minX: node.x,
        maxX: node.x,
        minY: node.y,
        maxY: node.y,
      };
    }
  }

  find(id) {
    let root = id;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[id] !== id) {
      const next = this.parent[id];
      this.parent[id] = root;
      id = next;
    }
    return root;
  }

  setActive(id) {
    this.active[id] = 1;
  }

  isActive(id) {
    return this.active[id] === 1;
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return { merged: false, root: rootA, absorbed: rootB };

    if (this.rank[rootA] > this.rank[rootB]) {
      const tmp = rootA;
      rootA = rootB;
      rootB = tmp;
    }

    this.parent[rootA] = rootB;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootB]++;
    this.size[rootB] += this.size[rootA];
    this.meta[rootB] = mergeMetadata(this.meta[rootA], this.meta[rootB]);
    return { merged: true, root: rootB, absorbed: rootA };
  }

  componentSize(id) {
    return this.meta[this.find(id)].size;
  }

  componentMeta(id) {
    return this.meta[this.find(id)];
  }
}

function mergeMetadata(a, b) {
  const keepA = a.size > b.size || (a.size === b.size && a.colorSeed < b.colorSeed);
  return {
    size: a.size + b.size,
    colorSeed: keepA ? a.colorSeed : b.colorSeed,
    touchesTop: a.touchesTop || b.touchesTop,
    touchesRight: a.touchesRight || b.touchesRight,
    touchesBottom: a.touchesBottom || b.touchesBottom,
    touchesLeft: a.touchesLeft || b.touchesLeft,
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
