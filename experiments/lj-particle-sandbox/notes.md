# LJ Particle Sandbox

Continuous 2D **Lennard-Jones** particles — not cellular automata sand. Hold/drag to pour; tune ε, σ, and mass per species.

## Potential

$$V(r)=4\varepsilon\left[\left(\frac{\sigma}{r}\right)^{12}-\left(\frac{\sigma}{r}\right)^{6}\right]$$

Repulsive $r^{-12}$ core + attractive $r^{-6}$ well. Force cutoff at $r_\mathrm{cut}=2.5\,\sigma_\max$. Soft-core clamp at $r<0.5\sigma$ keeps close contacts stable on phones.

## Mixing (Lorentz–Berthelot)

$$\sigma_{ij}=\tfrac12(\sigma_i+\sigma_j),\quad \varepsilon_{ij}=\sqrt{\varepsilon_i\varepsilon_j}$$

Three species share one box; cross interactions use these rules. Gravity and wall bounces finish the “sandbox” feel.

## Tips

- Raise ε → stickier clusters; lower ε → more gas-like.
- Larger σ → bigger effective size (fewer fit before the N cap).
- Mass changes inertia under the same force.
- Cap ~1000 particles for phone-smooth cell-list steps.
