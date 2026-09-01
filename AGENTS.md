# AGENTS.md — Portfolio 6DX

## Mission
Portfolio 6DX is a low-friction experimental playground. Optimize for working visualizations, minimal ceremony, readability, isolation, and fast iteration.

## Default behavior for visualization requests
When asked to visualize, simulate, demonstrate, or explore a concept:
1. Search existing experiments for reusable code or patterns.
2. Create a new folder under `experiments/` from `_template`.
3. Keep changes inside the new experiment unless platform changes are truly necessary.
4. Prefer browser-native JavaScript and existing shared code over adding frameworks or dependencies.
5. Include a valid `experiment.json` and concise `notes.md`.
6. Run `npm test` before finishing. Run `npm run smoke` too when a browser is available — it loads every route in real Chromium and catches runtime/module errors that an HTTP-only check misses.
7. Fix regressions before committing.

## Architecture guardrails
- `experiments/` is the default place for conversational coding.
- `platform/` and `server/` are shared infrastructure; edit them only with clear justification.
- Do not introduce React, Next.js, Vite, TypeScript, a bundler, or a database for a single experiment unless the user explicitly wants it.
- Avoid coupling experiments to one another. Reuse shared utilities only when reuse is real, not speculative.
- Experiment-specific tests are optional; platform validation and smoke tests are mandatory.

## Shared visualization dependencies
6DX exposes approved npm dependencies as browser-native ES modules through stable server paths. Prefer these over vendoring large third-party files into individual experiments.

Current shared imports:
- Three.js: `/vendor/three/build/three.module.js`
- Three.js examples: `/vendor/three/examples/jsm/...`
- lil-gui: `/vendor/lil-gui/lil-gui.esm.js`
- marked (renders each experiment's `notes.md` in the platform's notes sidebar): `/vendor/marked/marked.esm.js`

Add a new shared dependency only when it is useful across experiments or materially simplifies an experiment without introducing a build step.

## Experiment contract
Each experiment folder must contain:
- `experiment.json`
- the entry file named by `experiment.json.entry`
- `notes.md`

Required metadata fields:
- `name`
- `slug`
- `description`
- `entry`
- `type`
- `tags`

Slugs must be lowercase kebab-case and unique.

The entry module must default-export an experiment object/class compatible with the 6DX lifecycle:
- `start()` optional initialization
- `resize(width, height)` optional responsive sizing
- `destroy()` optional cleanup

## Graduation rule
If an experiment grows into a substantial application with its own backend, auth, database, workers, networking, or independent deployment lifecycle, move it to its own repository rather than expanding the 6DX core. Add it to `projects/projects.json` so 6DX remains the creative index.

## Completion standard
A task is complete when the requested behavior exists, `npm test` passes, and the final response names the files changed and what the user should look at.
