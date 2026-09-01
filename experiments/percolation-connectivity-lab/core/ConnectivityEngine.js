import { UnionFind } from './UnionFind.js';

export const BOUNDARIES = {
  TOP: 1,
  RIGHT: 2,
  BOTTOM: 4,
  LEFT: 8,
  flagsFor(node) {
    let flags = 0;
    if (node.boundary?.top) flags |= this.TOP;
    if (node.boundary?.right) flags |= this.RIGHT;
    if (node.boundary?.bottom) flags |= this.BOTTOM;
    if (node.boundary?.left) flags |= this.LEFT;
    return flags;
  },
};

export class ConnectivityEngine {
  constructor(graph, activationModel, boundaryMode = 'top-bottom') {
    this.graph = graph;
    this.activationModel = activationModel;
    this.boundaryMode = boundaryMode;
    this.nodeEdges = buildNodeEdges(graph.nodes.length, graph.edges);
    this.nodeOrder = activationModel.nodeOrder(graph);
    this.edgeOrder = activationModel.edgeOrder(graph);
    this.state = null;
    this.replay(0);
  }

  replay(parameter) {
    const uf = new UnionFind(this.graph.nodes, BOUNDARIES);
    const activeEdges = new Uint8Array(this.graph.edges.length);
    const events = [];

    for (const id of this.nodeOrder) {
      const node = this.graph.nodes[id];
      if (node.threshold > parameter) break;
      uf.setActive(id);
      events.push({ type: 'node-activated', id });
      for (const edgeId of this.nodeEdges[id]) {
        const edge = this.graph.edges[edgeId];
        const other = edge.a === id ? edge.b : edge.a;
        if (!uf.isActive(other)) continue;
        activeEdges[edgeId] = 1;
        const result = uf.union(id, other);
        if (result.merged) events.push({ type: 'components-merged', root: result.root, absorbed: result.absorbed });
      }
    }

    for (const edgeId of this.edgeOrder) {
      const edge = this.graph.edges[edgeId];
      if (edge.threshold > parameter) break;
      activeEdges[edgeId] = 1;
      if (!uf.isActive(edge.a)) uf.setActive(edge.a);
      if (!uf.isActive(edge.b)) uf.setActive(edge.b);
      const result = uf.union(edge.a, edge.b);
      events.push({ type: 'edge-activated', id: edgeId });
      if (result.merged) events.push({ type: 'components-merged', root: result.root, absorbed: result.absorbed });
    }

    const metrics = summarize(this.graph.nodes, uf, activeEdges, this.boundaryMode);
    const spanningRoot = findSpanningRoot(this.graph.nodes, uf, this.boundaryMode);
    if (spanningRoot !== null) events.push({ type: 'spanning-cluster-created', root: spanningRoot });

    this.state = { parameter, uf, activeEdges, metrics, events, spanningRoot };
    return this.state;
  }
}

export function summarize(nodes, uf, activeEdges, boundaryMode) {
  const components = new Map();
  let activeNodes = 0;
  let largest = 0;
  let largestRoot = null;
  let spanningRoot = null;

  for (let i = 0; i < nodes.length; i++) {
    if (!uf.isActive(i)) continue;
    activeNodes++;
    const root = uf.find(i);
    if (!components.has(root)) {
      const meta = uf.meta[root];
      components.set(root, meta.size);
      if (meta.size > largest) {
        largest = meta.size;
        largestRoot = root;
      }
      if (spans(meta, boundaryMode)) spanningRoot = root;
    }
  }

  let numerator = 0;
  let denominator = 0;
  for (const [root, size] of components) {
    if (root === largestRoot) continue;
    numerator += size * size;
    denominator += size;
  }

  let activeEdgeCount = 0;
  for (const edge of activeEdges) if (edge) activeEdgeCount++;

  return {
    activeNodes,
    activeEdges: activeEdgeCount,
    componentCount: components.size,
    largest,
    largestShare: nodes.length ? largest / nodes.length : 0,
    susceptibility: denominator ? numerator / denominator : 0,
    percolates: spanningRoot !== null,
  };
}

function buildNodeEdges(size, edges) {
  const nodeEdges = Array.from({ length: size }, () => []);
  for (const edge of edges) {
    nodeEdges[edge.a].push(edge.id);
    nodeEdges[edge.b].push(edge.id);
  }
  return nodeEdges;
}

function findSpanningRoot(nodes, uf, boundaryMode) {
  const seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    if (!uf.isActive(i)) continue;
    const root = uf.find(i);
    if (seen.has(root)) continue;
    seen.add(root);
    if (spans(uf.meta[root], boundaryMode)) return root;
  }
  return null;
}

function spans(meta, mode) {
  if (mode === 'left-right') return meta.touchesLeft && meta.touchesRight;
  return meta.touchesTop && meta.touchesBottom;
}
