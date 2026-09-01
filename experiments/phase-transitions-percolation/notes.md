# Phase Transitions, Percolation, and Union Find Coloring
## 1. The Search for Understanding

Phase transitions aren’t just for physicists—they’re for anyone who’s ever wondered when a random collection of interacting pieces snaps into an organized whole. Think of it like a jigsaw puzzle: you keep piling up pieces, and suddenly, you see the picture start to emerge. In percolation terms, we wonder: at what probability do these puzzle pieces connect to form something cohesive? And how can we model that phenomenon—say, with a dash of code, a sprinkling of math, and the timeless Union-Find data structure?

In this exploration, we’ll dive into:
- The Union-Find data structure (for connectivity)  
- The mathematics of percolation (random links, critical thresholds)  
- Molecular dynamics parallels (hint: it’s all about interactions)  
- Undirected graph networks (the scaffold behind it all)

---

## 2. Why It Matters

Percolation might look like a curiosity—until you see its reach. From predicting the point at which water seeps through the grounds of your coffee filter, to understanding the exact condition when a forest fire can spread across an entire continent—this theory underlies it all. The idea of ‘tipping points’ in networks is at the heart of physics, epidemiology, and yes, your morning brew.

Historically, percolation theory has roots in statistical mechanics, exploring how random clusters form in lattices. But in today’s era of big data and complex interactions, it’s a gem that resonates with:
- **Electrical networks** (When does a network become conducting?)
- **Molecular dynamics** (When do molecules form continuous phases?)
- **Undirected graphs** (Connectivity in social, biological, and technological networks)

---

## 3. Wrangling the Idea (and the Data)

To toy with percolation, we set up a grid—a playground of nodes. Each node might be ‘open’ or ‘closed’ depending on a random probability, kind of like flipping coins to decide if an edge is present. Then, we watch what happens: if you keep sprinkling water (increasing the probability), does a giant cluster form? It’s a lot like that moment in a crowd where small groups suddenly become one giant party.

**Project Setup**  
1. We consider a 2D lattice of nodes, each having a potential edge to its neighbors.  
2. We assign a random weight (or “potential”) to each neighbor connection.  
3. We choose a probability threshold $ p $. Any edge below this threshold is “open,” and edges above it are “closed.”  

*Visual Analogy:* Picture a sea of bubbles on the surface of your cappuccino: each bubble can join with another if the froth is “open” between them. Keep blowing air, and eventually they merge into one big foam cluster.

---

## 4. The Math Behind the Magic

So where’s the ‘moment of magic’? The phenomenon we track is the sudden emergence of a spanning cluster when edges are added randomly. Mathematically, the probability $ p $ is the star of the show.

- We track the **percolation probability** $ P(p) $, defined as:  
 $ P(p) = \text{Pr}(\text{a giant cluster spanning the system exists})$
- In many lattices, there’s a **critical threshold** $ p_c $ where the network transitions from mostly disconnected to mostly connected.

This threshold depends on:
- Lattice geometry  
- Dimensionality  
- The definition of connectivity (e.g., nearest neighbors only or longer-range interactions)

---

## 5. Modeling the System

The question is: how do we go from an equation on paper to a living, breathing digital simulation? That’s where the code takes center stage.

### Key Steps

1. **Building the Lattice**  
   We start with a grid of $\text{rows} \times \text{cols}$. For each node, we store potential edges to its neighbors.  

2. **Union-Find**  
   Using the Union-Find (Disjoint Set) structure means we can quickly unite two nodes into the same cluster and detect if they share a common ‘parent.’  

3. **Adding/Removing Edges**  
   - If a random weight $ w $ is $\leq p$, we “add” that edge.  
   - If $ w \geq p$, we “remove” that edge.  
   
4. **Visualizing**  
   Each node is rendered, colored based on its connected component’s “root.” Over time, we watch clusters merge or fracture.  

Below is a **concise snippet** illustrating our Union-Find, which underpins the connectivity checks:

```javascript
class UnionFind {
  constructor(size) {
    this.parent = new Array(size).fill(0).map((_, index) => index);
    this.rank = new Array(size).fill(0);
  }

  find(u) {
    if (this.parent[u] === u) return u;
    this.parent[u] = this.find(this.parent[u]); // Path compression
    return this.parent[u];
  }

  union(u, v) {
    u = this.find(u);
    v = this.find(v);
    if (u === v) return;

    // Union by rank
    if (this.rank[u] > this.rank[v]) [u, v] = [v, u];
    this.parent[u] = v;
    if (this.rank[u] === this.rank[v]) this.rank[v]++;
  }
}
```

Here, **path compression** flattens the structure, making subsequent union/find operations very fast.

---

## 6. Results: Patterns, Insights, and Surprises

With the simulation running, clusters form a bit like raindrops on a windshield. At first, the droplets (connected components) are small, discrete, and scattered. As the probability threshold ticks up, droplets merge—until, suddenly, they form a gigantic cluster that spans the entire system.

- **Critical Threshold:** In a 2D lattice, there’s a particular value of $ p \approx 0.50 $ where percolation occurs. Witnessing it in code is mesmerizing: the incremental changes accelerate, and the graph connectivity leaps from sparse to sprawling.  
- **Colorful Clusters:** Each connected component is assigned a random color. Visually, you see bright “islands” fusing into continents.

If you visualize it in a 3D scene (as we do with Three.js in the example code), it feels like molecular structures bonding in real-time.

---

## 7. The Legacy of the Concept

Percolation theory started as a mathematical ‘toy model,’ but it’s become a cornerstone of modern network science, statistical physics, and beyond. From how molecules transition in states of matter to how diseases might spread through a population, understanding the moment a cluster spans the system is pure gold.

- **In Molecular Dynamics**: You track particles in constant motion, measuring when they collide or bond. If the ‘bonding probability’ crosses some threshold, you get large-scale structures—akin to percolation transitions.  
- **In Undirected Graphs**: Many real-world networks (social networks, power grids) share the same property that random edges lead to abrupt connectivity leaps.  

It’s a reminder that the invisible line between chaos and structure often hinges on simple probabilities.

---

### Final Thoughts

We set out asking, ‘When does connectivity emerge?’ Through code, math, and a generous dash of curiosity, we saw that a single parameter $ p $ can hold the power to transform randomness into an ordered giant cluster. This echoes the deeper truth: hidden beneath the chaos of the everyday, simple rules can spark complex order. Percolation, for me, is that friendly nudge toward seeing the delicate balance between fracturing and unifying in every system we explore.

Percolation shows that out of randomness, order can bloom—just like seeds of possibility that only need the right conditions to flourish. If it resonates with you, imagine applying the same principle to your next puzzle, simulation, or coffee-time thought experiment. Because, just like those merging droplets, once you start adding edges, it’s only a matter of time until your world is connected in wondrous new ways.


Thanks!

---

## Controls

- **Threshold** — bond probability `p`; drag to sweep past the percolation transition (~0.5 on this lattice).
- **Auto Oscillate** — sweeps `p` back and forth automatically via `sin`, so the transition replays continuously.

## 6DX migration

Migrated from Portfolio 5DX unchanged in physics/rendering logic (`Game.js`, `UnionFind.js`, `LatticeUndirectedGraphSequential.js`); only the `three` import path and the outer app shell were adapted to the 6DX `Experiment` lifecycle (`start`, `resize`, `destroy`) and shared vendor dependencies.
