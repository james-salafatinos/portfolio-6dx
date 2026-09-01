# Circuit Percolation

The other two percolation experiments in 6DX (Voronoi Percolation, Phase Transitions & Percolation) both answer the same question with Union-Find: *is there a path?* This one asks a different, physically richer question: *if the open bonds are wires, where does the current actually go?*

## The setup

Take a square lattice of $N \times N$ nodes. Each of the $\sim 2N^2$ bonds gets an i.i.d. random threshold $u \in [0,1]$; a bond is **open** (a 1&nbsp;Ω wire) iff $u \le p$, otherwise it's an open circuit. Clamp the left column of nodes to $V=1$ and the right column to $V=0$ — two electrodes with a battery between them.

Every open node must obey Kirchhoff's current law: the current in equals the current out. For a uniform-resistance grid this reduces to the discrete Laplace equation — each free node's potential is just the average of the potentials of its **open** neighbors:

$$V_{i} = \frac{1}{\deg_{\text{open}}(i)} \sum_{j \sim i,\ \text{open}} V_j$$

The simulation solves this every frame with Gauss–Seidel relaxation (a handful of sweeps per frame, continuously — you can watch the potential field settle in real time whenever you drag the slider). Once the potentials converge, the current on each open bond is simply $I_{ij} = V_i - V_j$.

## Why this is more interesting than plain connectivity

Below the percolation threshold, nothing connects the two electrodes, so **no current flows at all** — total conductance is exactly zero even though plenty of small open clusters exist. Right at and above threshold, something Union-Find can't show becomes visible:

- **Backbone**: the subset of the open cluster that actually carries current — these bonds glow.
- **Dangling ends**: bonds that are structurally part of the same connected, percolating cluster, but lead nowhere (dead ends, or loops off the main path) — they stay dark, because in steady state their two endpoints settle to nearly the same potential and no current flows through them.

Ordinary site/bond percolation coloring treats the whole cluster as one blob. Solving the actual circuit splits it into "structural" and "functional" — the backbone is usually a much sparser, more fractal-looking skeleton than the full cluster.

## Fuse mode — a random fuse model

Flip on **Fuse Mode** and any bond whose current exceeds the fuse threshold permanently blows (becomes an open circuit, independent of `p`). This is a small version of the **Random Fuse Model**, used in statistical physics to study fracture and dielectric breakdown in disordered media: load concentrates on the backbone, the backbone burns out where it's most loaded, current reroutes through what's left, and that rerouted path takes the next load spike. Watch a percolating lattice slowly sever itself into disconnected pieces, entirely from its own current distribution — an avalanche of failures triggered by its own success at conducting.

## Controls

- **p (bond prob.)** — bond-opening probability; sweep across the percolation threshold (~0.5 on this lattice).
- **Auto Sweep** — oscillates `p` automatically so the transition replays continuously.
- **Fuse Mode / Fuse Threshold** — enable cascading bond failure and tune how much current a bond can carry before it blows.
- **Regenerate** — redraw all bond thresholds and reset any blown fuses.

The stats panel reports total conductance (current entering the left electrode) and whether the lattice currently percolates.

## Implementation note

This is an original design for 6DX, not a migration — a from-scratch combination of bond percolation with a Gauss–Seidel circuit solver and an optional random-fuse cascading-failure mode, rendered as a colored point/line lattice in Three.js.
