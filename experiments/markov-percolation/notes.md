# Markov Percolation

**Random walk meets site percolation.** One walker hops on open 4-neighbors of a square lattice. Occupation probability $p$ sets which sites are open.

## What to watch (≈10s on phone)

- **Below $p_c\approx 0.59$:** open clusters are finite → walker **traps / localizes**. Unique sites stall; MSD stays small.
- **Above $p_c$:** a giant cluster appears → walker **roams / explores**. Heat trail spreads; unique + MSD climb.

Square **site** percolation critical point: $p_c \approx 0.5927$ (marker on the $p$ slider).

## Random walk vs percolation

| | Random walk alone | + Percolation |
|---|---|---|
| Space | Fully open lattice | Open/closed by $p$ |
| Motion | Diffuses forever | Only on open von Neumann neighbors |
| Transition | None | Localization ↔ exploration at $p_c$ |

This PoC has **no Union-Find** — contrast with *Phase Transitions & Percolation*, which colors bond clusters. Here the signal is the walker’s heat map and MSD.

## Controls

- **p (pc≈0.59)** — site occupation; drag across criticality
- **Auto Oscillate** — sweeps $p$ around $p_c$
- **Drop / Respawn** — new walker (clears heat)
- **Reshuffle** — new random lattice potentials
- Orbit / pinch-zoom the Three.js view (same setup language as Phase Transitions & Percolation)
