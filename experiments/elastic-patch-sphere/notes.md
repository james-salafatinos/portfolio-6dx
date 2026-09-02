# Elastic Patch Sphere

This experiment tests whether a deterministic ball under uniform gravity can have its next impact on a spherical wall predicted immediately after each bounce, letting the shell rotate so the same material patch is under the next collision.

The physics is event based. Each flight solves for the next positive root of `|p0 + v0 t + 0.5 g t^2| = R`, then the ball is drawn from the analytic parabola until that event. Collisions reflect velocity across the spherical surface normal and do not receive momentum from the visual shell.

The restitution control adds optional energy loss at each wall impact. `1.0` is the original perfectly elastic case; lower values reduce the normal component of outgoing velocity and make the diagnostic energy change intentionally negative over time.

Use **Ideal kinematic** mode to see the mathematical trick. Use **Physical actuator** mode to test angular velocity, angular acceleration, and settle-time limits. The important validation metric is the patch-coordinate collision error: world impact points should vary, while successful local impact directions stay aligned with the fixed patch normal.
