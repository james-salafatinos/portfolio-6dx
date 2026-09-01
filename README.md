# Portfolio 6DX

Portfolio 6DX is a low-friction laboratory for visualizations and experiments, designed for conversational and agent-driven coding.

## Start

```bash
npm install
npm start
```

Open `http://localhost:8080`.

## Add an experiment

1. Copy `experiments/_template` to `experiments/<your-slug>`.
2. Edit `experiment.json`.
3. Build the idea in `App.js` (split into additional files only when useful).
4. Add short conceptual notes in `notes.md`.
5. Run `npm test`. Run `npm run smoke` too if a browser is available — it loads the homepage and every experiment in real Chromium and fails on console errors, page errors, or a failed module import (things an HTTP-only check can miss).

The server discovers experiments automatically from `experiment.json`; no route registration is required.

## Philosophy

Experiments should be cheap to create, isolated from each other, and understandable by an agent with minimal context. Shared platform code should stay boring. Large products or services with their own backend, auth, database, or deployment lifecycle should graduate to a separate repository and be linked from `projects/projects.json`.
