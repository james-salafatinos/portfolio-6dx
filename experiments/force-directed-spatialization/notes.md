
# Naive Force-Directed Spatialization

Have you ever marveled at those mesmerizing network diagrams where nodes seem to dance into position, revealing the underlying structure of relationships? At the heart of these visualizations often lies a family of algorithms known as **force-directed spatialization**. Today, we'll dive into the mechanics, mathematics, and code behind these algorithms, focusing on implementing a naive force-directed layout using **Fruchterman-Reingold** principles. Along the way, we'll explore key enhancements inspired by tools like **ForceAtlas2** and discuss their modern applications in platforms like **Gephi**.

## Why Do We Care About Force-Directed Layouts?

Visualizing complex graphs isn't just about aesthetics—it's about **clarity**. A force-directed layout transforms raw adjacency data into intuitive spatial forms, revealing clusters, central nodes, and peripheral structures. Historically, these methods trace back to physics analogies, where edges act as springs and nodes as repelling charges. This duality elegantly balances attraction and repulsion, producing layouts that "just feel right."

Modern applications are diverse:
- Social network analysis (e.g., detecting influencer hubs).
- Biological pathways (e.g., protein-protein interaction networks).
- Knowledge graphs (e.g., linking concepts in large datasets).

With tools like Gephi and libraries like D3.js, force-directed layouts have become a mainstay in data visualization.

---

## Building the Model: From Physics to Code  

Force-directed layouts simulate physical systems. Here's the key intuition:
- **Edges are springs**: They pull connected nodes closer.
- **Nodes repel each other**: Like charged particles, they resist crowding.
- **Walls repel nodes**: A soft boundary ensures the graph doesn't explode into infinity.

The resulting system is iteratively solved, updating positions until equilibrium (or our patience) is reached.

Mathematically, the net force $\vec{F}$ on a node $i$ is:

$\vec{F}_i = \sum_j (\vec{F}_\text{repulsion,j} + \vec{F}_\text{spring,j} + \vec{F}_\text{boundary})$

Each component adheres to simple rules:
- **Repulsion**: $F_{\text{repulsion}} \sim \frac{k_{\text{rep}}}{r^2}$ (inverse-square law).
- **Spring attraction**: $F_{\text{spring}} \sim k_{\text{spring}} \cdot d$ (linear with distance $d$).
- **Boundary repulsion**: $F_{\text{boundary}} \sim \frac{k_{\text{wall}}}{d^2}$ (soft repulsion near walls).

---

### Code Implementation: Naive Force-Directed Layout  

Let’s jump into the code. We'll leverage **THREE.js** for 3D rendering and physics-inspired math to compute forces. Here’s the skeleton:

```javascript
class Game {
  constructor(scene) {
    this.scene = scene;
    this.numParticles = 150;
    this.particlePositions = [];
    this.particleVelocities = [];
    this.repulsionStrength = 0.5;
    this.attractionStrength = 0.01;
    this.wallRepulsionStrength = 0.01;

    this.initParticles();
    this.initEdges();
  }

  initParticles() {
    for (let i = 0; i < this.numParticles; i++) {
      const position = new THREE.Vector3(
        Math.random() * 10 - 5,
        Math.random() * 10 - 5,
        Math.random() * 10 - 5
      );
      this.particlePositions.push(position);
      this.particleVelocities.push(new THREE.Vector3(0, 0, 0));
    }
  }

  computeForces() {
    // Repulsion between particles
    for (let i = 0; i < this.numParticles; i++) {
      for (let j = i + 1; j < this.numParticles; j++) {
        const delta = this.particlePositions[j].clone().sub(this.particlePositions[i]);
        const distanceSquared = delta.lengthSq();
        if (distanceSquared < 0.0001) continue; // Avoid singularities

        delta.normalize().multiplyScalar(this.repulsionStrength / distanceSquared);
        this.particleVelocities[i].add(delta.clone().negate());
        this.particleVelocities[j].add(delta);
      }
    }

    // Spring attraction along edges (simplified example)
    for (const edge of this.edges) {
      const delta = this.particlePositions[edge[1]].clone().sub(this.particlePositions[edge[0]]);
      const force = delta.multiplyScalar(this.attractionStrength);
      this.particleVelocities[edge[0]].add(force);
      this.particleVelocities[edge[1]].add(force.negate());
    }
  }

  updatePositions() {
    for (let i = 0; i < this.numParticles; i++) {
      this.particlePositions[i].add(this.particleVelocities[i]);
      this.particleVelocities[i].multiplyScalar(0.95); // Dampening
    }
  }
}
```

---

## Results and Insights  

Running this naive model, patterns emerge:
1. **Clusters form naturally**: Connected nodes gravitate together.
2. **Centrality becomes visual**: Highly connected nodes sit at the heart of their neighborhoods.
3. **Dynamism reveals structure**: Watching the graph evolve offers insights into its topology.

Fine-tuning parameters like `repulsionStrength` and `attractionStrength` unlock a spectrum of layouts, from tightly packed clusters to sprawling networks.

---

## Enhancements: Borrowing from ForceAtlas2  

While naive force-directed models are enlightening, tools like ForceAtlas2 in Gephi introduce sophisticated refinements:
- **Adaptive repulsion**: Balancing forces dynamically for better convergence.
- **Gravity wells**: Stabilizing peripheral nodes to prevent drift.
- **GPU acceleration**: Speeding up calculations for massive graphs.

These features highlight the interplay between algorithmic elegance and computational pragmatism.

---

## Reflections and Future Directions  

Force-directed spatialization isn’t just an algorithm—it’s a lens into the structure of complexity. From graph theory to physics and interactive visualization, it bridges disciplines and invites exploration. What’s next? Incorporating **real-time interactivity**, simulating **temporal networks**, or even delving into **quantum-inspired layouts**.

So, the next time you see a network visualization, remember the invisible dance of forces behind the scenes—a harmonious blend of math, physics, and code.


---

## 6DX migration

Migrated from Portfolio 5DX. `Game.js` physics/rendering is unchanged aside from the `three` import path. Worth noting: despite the notes above describing "edges," the actual implementation has no graph structure at all — every particle attracts toward every other particle (not just neighbors), which is what makes this genuinely "naive." The app shell now follows the 6DX `Experiment` lifecycle (`start`, `resize`, `destroy`) and shared vendor dependencies instead of 5DX's per-app HTML template.
