import { GUI } from '/vendor/lil-gui/lil-gui.esm.js';
import { Sim } from './Sim.js';

const SPECIES_COLORS = ['#5ec8ff', '#ff7a6a', '#9dff6a'];
const SPECIES_NAMES = ['A', 'B', 'C'];
const MAX_N = 1000;

function roundParam(v, step = 0.01) {
  const inv = 1 / step;
  return Math.round(Number(v) * inv) / inv;
}

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.canvas = null;
    this.ctx = null;
    this.sim = null;
    this.gui = null;
    this.guiHost = null;
    this.hud = null;
    this.hint = null;
    this.speciesBar = null;
    this.speciesButtons = [];
    this.raf = 0;
    this.running = false;
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;

    this.pourSpecies = 0;
    this.pouring = false;
    this.pointerX = 0;
    this.pointerY = 0;
    this.pourAcc = 0;
    this._pourSeq = 0;
    this.pourRate = 12; // particles / second while held (sparse → sand-like)
    this.lastTs = 0;
    this._mq = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._frame = this._frame.bind(this);
    this._onViewportChange = this._onViewportChange.bind(this);
  }

  async start() {
    const root = this.container;
    root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;background:#070b12;';

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;touch-action:none;';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.sim = new Sim({ maxN: MAX_N, width: 32, height: 48 });

    this._injectStyles();
    this._buildHud();
    this._buildHint();
    this._buildSpeciesBar();
    this._buildGui();
    this._bindPointer();

    this._mq = window.matchMedia('(max-width: 720px), (max-height: 560px)');
    this._mq.addEventListener?.('change', this._onViewportChange);
    this._onViewportChange();

    this.resize(root.clientWidth, root.clientHeight);
    this.running = true;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this._frame);
  }

  resize(width, height) {
    if (!this.canvas) return;
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    this.cssW = w;
    this.cssH = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // World bounds stay fixed; canvas stretch maps sim → screen. App never mutates SoA.
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this._mq?.removeEventListener?.('change', this._onViewportChange);
    this.gui?.destroy();
    this.canvas?.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.container.replaceChildren();
    this.sim = null;
    this.ctx = null;
    this.canvas = null;
  }

  _injectStyles() {
    if (this.container.querySelector('#lj-sandbox-styles')) return;
    const style = document.createElement('style');
    style.id = 'lj-sandbox-styles';
    style.textContent = `
      .lj-gui-host {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 10;
        max-height: min(92%, calc(100% - 20px));
        max-width: min(260px, 42vw);
        overflow: auto;
        border-radius: 10px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.35);
      }
      .lj-gui-host .lil-gui {
        --background-color: rgba(10,16,26,0.92);
        --widget-color: #1a2436;
        --focus-color: #5ec8ff;
        --number-color: #cfe6ff;
        --name-width: 55%;
        font-size: 11px;
        min-width: 200px;
        max-width: 100%;
      }
      .lj-gui-host .lil-gui .controller.number input {
        font-variant-numeric: tabular-nums;
        max-width: 5.5em;
      }
      /* Mobile: stay top-right — never cover the canvas floor / ground. */
      .lj-gui-host.lj-gui-mobile {
        top: 10px;
        right: 8px;
        left: auto;
        bottom: auto;
        max-width: min(210px, 48vw);
        max-height: min(52vh, calc(100% - 24px));
        border-radius: 10px;
        border: 1px solid rgba(120,160,220,0.22);
        background: rgba(8,12,20,0.92);
        backdrop-filter: blur(10px);
        transform: none;
      }
      .lj-gui-host.lj-gui-mobile .lil-gui {
        min-width: 0;
        width: 100%;
        --name-width: 50%;
        font-size: 10px;
      }
      .lj-species-bar {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 6;
        display: flex;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 999px;
        background: rgba(8,14,24,0.78);
        border: 1px solid rgba(120,160,220,0.28);
        backdrop-filter: blur(6px);
        pointer-events: auto;
      }
      .lj-species-btn {
        appearance: none;
        border: 2px solid transparent;
        border-radius: 999px;
        min-width: 44px;
        height: 34px;
        padding: 0 12px;
        font: 700 13px/1 ui-sans-serif, system-ui, sans-serif;
        letter-spacing: 0.04em;
        cursor: pointer;
        color: #061018;
        opacity: 0.55;
        transform: scale(0.96);
        transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s, border-color 0.15s;
      }
      .lj-species-btn[data-active="1"] {
        opacity: 1;
        transform: scale(1.06);
        border-color: #fff;
        box-shadow: 0 0 0 2px rgba(255,255,255,0.25), 0 0 16px rgba(255,255,255,0.2);
      }
      .lj-hint {
        position: absolute;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        z-index: 5;
        max-width: min(420px, calc(100% - 24px));
        padding: 10px 14px;
        border-radius: 10px;
        background: rgba(8,14,24,0.7);
        border: 1px solid rgba(120,160,220,0.28);
        color: #d7ebff;
        font: 13px/1.35 ui-sans-serif, system-ui, sans-serif;
        text-align: center;
        pointer-events: none;
        backdrop-filter: blur(6px);
      }
      /* Hint stays low but does not sit under a bottom sheet. */
      .lj-hint.lj-hint-raised {
        bottom: 18px;
      }
      @media (max-width: 720px), (max-height: 560px) {
        /* Under HUD on the left — clear of top-right Controls and the floor */
        .lj-species-bar {
          top: 96px;
          bottom: auto;
          left: 12px;
          right: auto;
          transform: none;
        }
        .lj-hud { max-width: min(280px, calc(100% - 230px)) !important; }
      }
    `;
    this.container.appendChild(style);
  }

  _buildHud() {
    const hud = document.createElement('div');
    hud.className = 'lj-hud';
    hud.style.cssText = [
      'position:absolute', 'left:12px', 'top:12px', 'z-index:5',
      'padding:10px 12px', 'border-radius:8px',
      'background:rgba(8,14,24,0.78)', 'border:1px solid rgba(120,160,220,0.28)',
      'color:#cfe6ff', 'font:12px/1.4 ui-sans-serif,system-ui,sans-serif',
      'pointer-events:none', 'max-width:min(340px,72vw)', 'backdrop-filter:blur(6px)',
    ].join(';');
    hud.innerHTML = [
      '<div style="font-weight:700;letter-spacing:0.03em;font-size:14px;color:#f0f7ff">LJ Particle Sandbox</div>',
      '<div style="opacity:0.9;margin-top:3px;font-size:12px">Pour multi-species Lennard-Jones particles — soft-matter sand with live ε / σ / mass.</div>',
      '<div id="lj-hud-stats" style="margin-top:6px;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:0.9">N 0 / ' + MAX_N + '</div>',
    ].join('');
    this.container.appendChild(hud);
    this.hud = hud;
    this.hudStats = hud.querySelector('#lj-hud-stats');
  }

  _buildHint() {
    const hint = document.createElement('div');
    hint.className = 'lj-hint';
    hint.textContent = 'Touch and hold or drag on the open canvas to pour.';
    this.container.appendChild(hint);
    this.hint = hint;
  }

  _buildSpeciesBar() {
    const bar = document.createElement('div');
    bar.className = 'lj-species-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Pour species');
    this.speciesButtons = SPECIES_NAMES.map((name, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lj-species-btn';
      btn.textContent = name;
      btn.style.background = SPECIES_COLORS[i];
      btn.title = `Pour species ${name}`;
      btn.setAttribute('aria-pressed', i === this.pourSpecies ? 'true' : 'false');
      btn.dataset.active = i === this.pourSpecies ? '1' : '0';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._setPourSpecies(i);
      });
      bar.appendChild(btn);
      return btn;
    });
    this.container.appendChild(bar);
    this.speciesBar = bar;
  }

  _setPourSpecies(index) {
    const i = Math.max(0, Math.min(2, index | 0));
    this.pourSpecies = i;
    if (this._params) this._params.pourSpecies = SPECIES_NAMES[i];
    this.speciesButtons.forEach((btn, j) => {
      const on = j === i;
      btn.dataset.active = on ? '1' : '0';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this._pourSpeciesCtrl?.updateDisplay?.();
  }

  _buildGui() {
    const host = document.createElement('div');
    host.className = 'lj-gui-host';
    this.container.appendChild(host);
    this.guiHost = host;

    const species = [0, 1, 2].map((i) => ({
      epsilon: roundParam(this.sim.epsilon[i], 0.01),
      sigma: roundParam(this.sim.sigma[i], 0.01),
      mass: roundParam(this.sim.mass[i], 0.05),
    }));

    this._params = {
      pourSpecies: SPECIES_NAMES[this.pourSpecies],
      pourRate: this.pourRate,
      gravity: roundParam(this.sim.gravity, 0.05),
      species,
      reset: () => this.sim.reset({ width: this.sim.width, height: this.sim.height }),
    };

    const gui = new GUI({ container: host, title: 'Controls' });
    this.gui = gui;

    this._pourSpeciesCtrl = gui.add(this._params, 'pourSpecies', SPECIES_NAMES).name('Pour species').onChange((name) => {
      this._setPourSpecies(Math.max(0, SPECIES_NAMES.indexOf(name)));
    });
    this._pourSpeciesCtrl.domElement.title = 'Which species is poured on touch / drag';

    gui.add(this._params, 'pourRate', 5, 80, 1).name('Pour rate').onChange((v) => {
      this.pourRate = v;
    });
    gui.add(this._params, 'gravity', 0, 8, 0.05).name('Gravity').onChange((v) => {
      this.sim.setGravity(v);
    });

    const gloss = [
      { key: 'epsilon', label: 'ε well', tip: 'ε (epsilon): attraction well depth — higher sticks more', step: 0.01, min: 0.05, max: 3 },
      { key: 'sigma', label: 'σ size', tip: 'σ (sigma): effective particle diameter', step: 0.01, min: 0.3, max: 2.5 },
      { key: 'mass', label: 'mass', tip: 'Inertia under the same forces', step: 0.05, min: 0.1, max: 4 },
    ];

    for (let i = 0; i < 3; i++) {
      const folder = gui.addFolder(`Species ${SPECIES_NAMES[i]}`);
      const p = species[i];
      for (const g of gloss) {
        const ctrl = folder.add(p, g.key, g.min, g.max, g.step).name(g.label).onChange((v) => {
          const clipped = roundParam(v, g.step);
          p[g.key] = clipped;
          this.sim.setSpeciesParams(i, { [g.key]: clipped });
        });
        ctrl.domElement.title = g.tip;
        // Compact display: avoid Float32 long tails if lil-gui re-reads
        const input = ctrl.domElement.querySelector('input');
        if (input) {
          input.setAttribute('inputmode', 'decimal');
          input.title = g.tip;
        }
      }
      if (i === 0) folder.open();
    }

    gui.add(this._params, 'reset').name('Clear');
  }

  _onViewportChange() {
    const mobile = !!(this._mq && this._mq.matches);
    this.guiHost?.classList.toggle('lj-gui-mobile', mobile);
    this.hint?.classList.toggle('lj-hint-raised', mobile);
  }

  _bindPointer() {
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
  }

  _eventToWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const v = (e.clientY - rect.top) / Math.max(rect.height, 1);
    const state = this.sim.getState();
    return {
      x: u * state.width,
      y: v * state.height,
    };
  }

  _onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    this.pouring = true;
    this._pourSeq = 0;
    const w = this._eventToWorld(e);
    this.pointerX = w.x;
    this.pointerY = w.y;
    // Immediate spawn for responsiveness (single; burst uses spacing)
    this._spawnBurst(1);
  }

  _onPointerMove(e) {
    if (!this.pouring) return;
    const w = this._eventToWorld(e);
    this.pointerX = w.x;
    this.pointerY = w.y;
  }

  _onPointerUp() {
    this.pouring = false;
    this.pourAcc = 0;
  }

  _spawnBurst(n) {
    // Wide lattice nozzle + skip-on-overlap: births stay ≥ ~σ apart so the
    // soft-core does not inject hot gas, while hold-to-pour still rains.
    const state = this.sim.getState();
    const sigma = state.sigma[this.pourSpecies] || 1;
    const spacing = Math.max(1.08 * sigma, 0.9);
    const minDistSq = spacing * spacing * 0.92;
    const cols = 9;
    let placed = 0;
    let attempts = 0;
    const maxAttempts = Math.max(32, n * 24);
    const x = state.x;
    const y = state.y;
    while (placed < n && attempts < maxAttempts) {
      attempts++;
      this._pourSeq = (this._pourSeq | 0) + 1;
      const seq = this._pourSeq;
      const col = (seq % cols) - ((cols - 1) / 2);
      const layer = Math.floor(seq / cols) % 4;
      const px = this.pointerX + col * spacing;
      const py = this.pointerY - layer * spacing * 0.65;
      let clear = true;
      const count = this.sim.count;
      for (let i = 0; i < count; i++) {
        const dx = x[i] - px;
        const dy = y[i] - py;
        if (dx * dx + dy * dy < minDistSq) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      if (!this.sim.spawnAt(px, py, this.pourSpecies)) break;
      placed++;
    }
  }

  _frame(ts) {
    if (!this.running) return;
    const dtSec = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    if (this.pouring) {
      this.pourAcc += this.pourRate * dtSec;
      const n = this.pourAcc | 0;
      if (n > 0) {
        this.pourAcc -= n;
        this._spawnBurst(n);
      }
    }

    this.sim.step();
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  }

  _draw() {
    const ctx = this.ctx;
    const state = this.sim.getState();
    const dpr = this.dpr;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const sx = cw / state.width;
    const sy = ch / state.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, cw, ch);

    // Soft vignette wall frame
    ctx.strokeStyle = 'rgba(90,140,200,0.35)';
    ctx.lineWidth = Math.max(2, 2 * dpr);
    ctx.strokeRect(1.5 * dpr, 1.5 * dpr, cw - 3 * dpr, ch - 3 * dpr);

    const n = state.count;
    const x = state.x;
    const y = state.y;
    const sp = state.species;
    const sigma = state.sigma;

    for (let i = 0; i < n; i++) {
      const s = sp[i];
      const r = 0.5 * sigma[s] * sx;
      ctx.beginPath();
      ctx.fillStyle = SPECIES_COLORS[s];
      ctx.arc(x[i] * sx, y[i] * sy, Math.max(1.2 * dpr, r * 0.92), 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.hudStats) {
      this.hudStats.textContent = `N ${n} / ${state.maxN} · g ${state.gravity.toFixed(2)} · pour ${SPECIES_NAMES[this.pourSpecies]}`;
    }
  }
}
