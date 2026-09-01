# Percolation Connectivity Lab

## Idea
Different geometries and physical stories compile down to one active graph. The lab uses a single Union-Find based connectivity engine with component metadata to reveal when local activations produce global spanning clusters.

## Controls / behavior
Explore mode lets you switch between square site percolation, Voronoi-style site percolation, and random geometric distance percolation. Dragging the parameter backward deterministically rebuilds and replays the graph, which keeps Union-Find fast while supporting reversible sliders.

Experiment mode runs a compact Monte Carlo sweep across many seeds and plots spanning probability, largest-component share, and susceptibility.

## Implementation notes
The Union-Find core is adapted from `experiments/voronoi-percolation/Game.js`: path compression plus rank/size merging, extended here with active-node tracking, component metadata, boundary flags, and stable component identity for coloring.
