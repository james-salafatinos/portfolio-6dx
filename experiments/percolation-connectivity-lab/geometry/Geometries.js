export function squareGridGeometry(config) {
  const size = Math.max(8, config.size | 0);
  const nodes = [];
  const edges = [];
  const cell = 1 / size;
  const threshold = seededRandom(config.seed);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = y * size + x;
      nodes.push({
        id,
        x: (x + 0.5) * cell,
        y: (y + 0.5) * cell,
        threshold: threshold(),
        boundary: { top: y === 0, right: x === size - 1, bottom: y === size - 1, left: x === 0 },
        shape: { type: 'rect', x: x * cell, y: y * cell, w: cell, h: cell },
      });
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = y * size + x;
      if (x < size - 1) addEdge(edges, id, id + 1, 1);
      if (y < size - 1) addEdge(edges, id, id + size, 1);
    }
  }

  return { nodes, edges, renderKind: 'grid', label: `${size} x ${size} square lattice` };
}

export function voronoiSiteGeometry(config) {
  const count = Math.max(60, config.count | 0);
  const random = seededRandom(config.seed);
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const x = 0.035 + random() * 0.93;
    const y = 0.035 + random() * 0.93;
    nodes.push({
      id: i,
      x,
      y,
      threshold: random(),
      boundary: { top: y < 0.08, right: x > 0.92, bottom: y > 0.92, left: x < 0.08 },
    });
  }

  const triangles = triangulate(nodes);
  const pairs = new Set();
  for (const tri of triangles) {
    pair(pairs, tri.a, tri.b);
    pair(pairs, tri.b, tri.c);
    pair(pairs, tri.c, tri.a);
  }

  const edges = [];
  for (const key of pairs) {
    const [a, b] = key.split(':').map(Number);
    addEdge(edges, a, b, 1);
  }

  return { nodes, edges, renderKind: 'points', label: `${count} Voronoi sites, Delaunay adjacency` };
}

export function randomDistanceGeometry(config) {
  const count = Math.max(60, config.count | 0);
  const maxRadius = Math.max(0.06, config.maxRadius);
  const random = seededRandom(config.seed);
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const x = 0.035 + random() * 0.93;
    const y = 0.035 + random() * 0.93;
    nodes.push({
      id: i,
      x,
      y,
      threshold: 0,
      boundary: { top: y < 0.08, right: x > 0.92, bottom: y > 0.92, left: x < 0.08 },
    });
  }

  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const distance = Math.hypot(dx, dy);
      if (distance <= maxRadius) addEdge(edges, i, j, distance / maxRadius);
    }
  }

  return { nodes, edges, renderKind: 'distance', label: `${count} random points, distance edges` };
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addEdge(edges, a, b, threshold) {
  edges.push({ id: edges.length, a, b, threshold });
}

function pair(pairs, a, b) {
  pairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);
}

function triangulate(points) {
  const verts = points.map((p) => ({ x: p.x, y: p.y }));
  const size = verts.length;
  verts.push({ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 0.5, y: 20 });
  let triangles = [makeTri(size, size + 1, size + 2, verts)];

  for (let i = 0; i < size; i++) {
    const p = verts[i];
    const edgeMap = new Map();
    for (const tri of triangles) {
      tri.bad = inCircumcircle(tri, p);
      if (!tri.bad) continue;
      for (const edge of [[tri.a, tri.b], [tri.b, tri.c], [tri.c, tri.a]]) {
        const key = edge[0] < edge[1] ? `${edge[0]}:${edge[1]}` : `${edge[1]}:${edge[0]}`;
        const current = edgeMap.get(key);
        if (current) current.count++;
        else edgeMap.set(key, { a: edge[0], b: edge[1], count: 1 });
      }
    }
    triangles = triangles.filter((tri) => !tri.bad);
    for (const edge of edgeMap.values()) {
      if (edge.count === 1) triangles.push(makeTri(edge.a, edge.b, i, verts));
    }
  }

  return triangles.filter((tri) => tri.a < size && tri.b < size && tri.c < size);
}

function makeTri(a, b, c, verts) {
  const cc = circumcenter(verts[a], verts[b], verts[c]);
  const r2 = cc ? squaredDistance(verts[a], cc) : Infinity;
  return { a, b, c, cc, r2, bad: false };
}

function circumcenter(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

function inCircumcircle(tri, p) {
  if (!tri.cc) return false;
  return squaredDistance(p, tri.cc) < tri.r2 - 1e-9;
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
