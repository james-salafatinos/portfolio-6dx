# Plinko / Galton Board — Normal Distribution Emergence

Demonstrates the Central Limit Theorem: particles dropped through a staggered peg grid naturally form a normal (bell-curve) distribution in the buckets below.

## Physics
- All particle data in a flat Float32Array (stride 8: x, y, vx, vy, state, freeze_timer, stuck_timer, bucket)
- Euler integration with 3 substeps per frame for stability
- Three states: Active (peg collisions) → Settling (bucket physics) → Frozen (static stack)
- Spatial hash for efficient frozen-stack collision queries

## Rendering
- Three.js WebGL (three.module.js) — matches Phase Transitions project style
- Instanced mesh for particles (single draw call)
- Instanced mesh for pegs
- Histogram bars rebuilt every 8 frames with cool→warm vertex colors
- Ghost normal curve overlay as CLT reference

## Controls (lil-gui)
- Drop Rate (particles/sec)
- Gravity
- Peg Rows
- Damping
- Max Particles
- Clear button

Press and hold **DROP BALLS** (mouse or touch) to release particles; the drop rate ramps up over 3 seconds of holding.

## Tests

`plinko.test.js` is a standalone, dependency-free test of the physics logic (spatial hash, gravity, peg/wall collisions, freeze/stuck timers, bucket assignment). It stubs Three.js so it can run under plain Node without a browser:

```
node experiments/plinko-galton-board/plinko.test.js
```

It's optional and not wired into `npm test` — see `AGENTS.md` on experiment-specific tests.

## 6DX migration

Migrated from Portfolio 5DX. `Game.js` physics/rendering is unchanged aside from the `three` import path; `plinko.test.js` needed no changes since it reads `Game.js` from disk as text. The app shell now follows the 6DX `Experiment` lifecycle (`start`, `resize`, `destroy`) and shared vendor dependencies instead of 5DX's per-app HTML template.
