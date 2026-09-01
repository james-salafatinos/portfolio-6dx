class UnionFind {
    constructor(size) {
      this.parent = new Array(size).fill(0).map((_, index) => index);
      this.rank = new Array(size).fill(0);
    }
  
    find(u) {
      if (this.parent[u] === u) {
        return u;
      }
      this.parent[u] = this.find(this.parent[u]);  // Path compression
      return this.parent[u];
    }
  
    union(u, v) {
      u = this.find(u);
      v = this.find(v);
      if (u === v) {
        return;
      }
  
      // Union by rank
      if (this.rank[u] > this.rank[v]) {
        [u, v] = [v, u];
      }
      this.parent[u] = v;
      if (this.rank[u] === this.rank[v]) {
        this.rank[v]++;
      }
    }
  }
  export {UnionFind}