export class SitePercolation {
  nodeOrder(graph) {
    return graph.nodes.map((node) => node.id).sort((a, b) => graph.nodes[a].threshold - graph.nodes[b].threshold);
  }

  edgeOrder() {
    return [];
  }
}

export class DistanceThreshold {
  nodeOrder() {
    return [];
  }

  edgeOrder(graph) {
    return graph.edges.map((edge) => edge.id).sort((a, b) => graph.edges[a].threshold - graph.edges[b].threshold);
  }
}
