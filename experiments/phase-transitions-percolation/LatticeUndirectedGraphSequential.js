import * as THREE from "three";

class LatticeUndirectedGraphSequential {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.size = rows * cols;
    this.edgeSet = new Set(); // Using a Set for actual edges
    this.potentialEdgeMap = new Map(); // Using a Map for potential edges

    this.initializePotentialLatticeEdges();
  }

  // Create a unique key for an edge
  createEdgeKey(from, to) {
    return Math.min(from, to) + "_" + Math.max(from, to);
  }

  // Function to set potential between two nodes
  setPotential = (from, to) => {
    const edgeKey = this.createEdgeKey(from, to);
    const potential = Math.random();
    this.potentialEdgeMap.set(edgeKey, potential);
  };

  // Initialize the graph with potential lattice edges
  initializePotentialLatticeEdges() {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const currentNode = row * this.cols + col;

        // North neighbor
        if (row > 0) {
          this.setPotential(currentNode, (row - 1) * this.cols + col);
        }

        // South neighbor
        if (row < this.rows - 1) {
          this.setPotential(currentNode, (row + 1) * this.cols + col);
        }

        // East neighbor
        if (col < this.cols - 1) {
          this.setPotential(currentNode, row * this.cols + (col + 1));
        }

        // West neighbor
        if (col > 0) {
          this.setPotential(currentNode, row * this.cols + (col - 1));
        }
      }
    }
  }

  // Add an edge between nodes `from` and `to`
  addEdge(from, to) {
    if (from >= this.size || to >= this.size) {
      console.error("Invalid node index");
      return;
    }

    const edgeKey = this.createEdgeKey(from, to);
    if (!this.edgeSet.has(edgeKey)) {
      this.edgeSet.add(edgeKey);
    }
  }

  // Remove an edge between nodes `from` and `to`
  removeEdge(from, to) {
    const edgeKey = this.createEdgeKey(from, to);
    if (this.edgeSet.has(edgeKey)) {
      this.edgeSet.delete(edgeKey);
    } else {
      console.error("Edge not found");
    }
  }

  // Get the edge list
  getEdgeList() {
    const edgeList = [];
    for (const edgeKey of this.edgeSet) {
      const [from, to] = edgeKey.split("_").map(Number);
      const weight = this.potentialEdgeMap.get(edgeKey) || 1; // Use the potential as weight
      edgeList.push({ from, to, weight });
    }
    return edgeList;
  }

  // Print the graph for debugging purposes
  printGraph() {
    console.log("Edge List:");
    for (const edge of this.getEdgeList()) {
      console.log(`(${edge.from}, ${edge.to}, ${edge.weight})`);
    }
  }
  randomlyAddEdge(threshold) {
    const addedEdges = [];
    for (const [edgeKey, weight] of this.potentialEdgeMap.entries()) {
      if (!this.edgeSet.has(edgeKey) && weight <= threshold) {
        this.addEdgeFromKey(edgeKey);
        addedEdges.push(this.edgeFromKey(edgeKey));
      }
    }
    return addedEdges.length ? addedEdges : null;
  }
  addEdgeFromKey(edgeKey) {
    this.edgeSet.add(edgeKey);
  }
  edgeFromKey(edgeKey) {
    const [from, to] = edgeKey.split("_").map(Number);
    const weight = this.potentialEdgeMap.get(edgeKey) || 1;
    return { from, to, weight };
  }

  randomlyRemoveEdge(threshold) {
    const removedEdges = [];

    // Loop through all keys of edges that have been added
    for (const edgeKey of this.edgeSet) {
      const weight = this.potentialEdgeMap.get(edgeKey);

      // Check if the weight of the edge is below or equal to the threshold
      if (weight >= threshold) {
        // Remove the edge
        this.edgeSet.delete(edgeKey);

        // Get the 'from' and 'to' nodes from the edge key
        const [from, to] = edgeKey.split("_").map(Number);

        // Add to the list of removed edges
        removedEdges.push({ from, to, weight });
      }
    }

    return removedEdges.length > 0 ? removedEdges : null; // Return null if no edges were removed
  }
}

export { LatticeUndirectedGraphSequential };
