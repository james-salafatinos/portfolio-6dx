# N-Body: Velocity Verlet Integration

100 mutually-gravitating particles start from a random spherical distribution and orbit under pairwise inverse-square attraction, integrated with velocity Verlet:

1. Compute acceleration `a(t)` from the current positions.
2. Advance position: `x(t+dt) = x(t) + v(t) + 0.5 * a(t)` (dt folded into the constants).
3. Recompute acceleration `a(t+dt)` at the new position.
4. Advance velocity using the *average* of the old and new acceleration: `v(t+dt) = v(t) + 0.5 * (a(t) + a(t+dt))`.

Velocity Verlet is symplectic-ish and much more stable over long runs than plain Euler integration, at the cost of one extra acceleration evaluation per step. A small dampening factor (0.999) bleeds off energy so the cluster doesn't fly apart from close encounters, and a minimum-distance cutoff avoids force singularities when two particles nearly collide.

Rendering is a single instanced mesh (one draw call for all 100 bodies) with a small custom shader that reads per-instance offset and color.

## 6DX migration

Migrated from Portfolio 5DX. The `Game.js` physics/rendering logic is unchanged aside from the `three` import path. The 5DX version's `App.js` created an empty, control-less lil-gui panel; that dead scaffolding was dropped rather than carried over. The app shell now follows the 6DX `Experiment` lifecycle (`start`, `resize`, `destroy`) and shared vendor dependencies (`three`, `three/addons/`) instead of 5DX's per-app HTML template and `/modules` vendoring.
