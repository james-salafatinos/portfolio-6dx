# Causal Percolative Wave Function Collapse

A collapse front grows through a square bond-percolation lattice. Height is discrete collapse time, color is the Markov state, and faint lines connect each cell to its selected causal parent. This is a model of causally conditioned stochastic growth—not a physical quantum simulation.

## What to try

- Hold **T** low and use **ferromagnetic** coupling: each connected cluster becomes a coherent color domain.
- Move **p** through $p_c = 0.5$: quenched square-lattice bond percolation changes from finite clusters to a likely spanning history.
- Raise **T**: parent influence weakens and domain-wall density approaches $1 - 1/q$.
- Switch to **annealed** bonds: failed frontier bonds retry, so the lattice eventually fills and the sharp spanning transition disappears.
- Scrub the time bar to replay the causally ordered history, or show parent edges to inspect the DAG.
- Run the small $(p,T)$ sweep and click a heatmap tile to load that parameter pair.

## Implementation

The v0.1 experiment is a deterministic CPU reference and Three.js renderer. Counter-based 32-bit hashes key every bond, parent choice, and state draw, so identical parameters and seed produce identical buffers. Quenched bonds hash the unordered endpoint pair once; annealed bonds include the step number. The model supports parent-only and full-neighbor conditioning, open or periodic boundaries, JSON/CSV history export, and PNG capture.

The heatmap shows mean terminal collapsed fraction over three $24\times24$ runs per tile. It is deliberately small enough to run interactively; it is not a substitute for a finite-size-scaling study.
