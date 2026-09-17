import { GUI } from '/vendor/lil-gui/lil-gui.esm.js';
import { Sim } from './Sim.js';

const SPECIES_COLORS = ['#5ec8ff', '#ff7a6a', '#9dff6a'];
const SPECIES_NAMES = ['A', 'B', 'C'];
const MAX_N = 1000;
export default class Experiment {
  constructor(container) {
    this.container = container;
    this.canvas = null;
    this.ctx = null;
    this.sim = null;
    this.gui = null;
    this.hud = null;
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
    this.pourRate = 28; // particles / second while held
    this.lastTs = 0;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._frame = this._frame.bind(this);
  }

  async start() {
    const root = this.container;
    root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;background:#070b12;';

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;touch-action:none;';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.sim = new Sim({ maxN: MAX_N, width: 32, height: 48 });

    this._buildHud();
    this._buildGui();
    this._bindPointer();

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

  _buildHud() {
    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute', 'left:12px', 'top:12px', 'z-index:5',
      'padding:10px 12px', 'border-radius:8px',
      'background:rgba(8,14,24,0.72)', 'border:1px solid rgba(120,160,220,0.25)',
      'color:#cfe6ff', 'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'pointer-events:none', 'max-width:min(280px,70vw)', 'backdrop-filter:blur(6px)',
    ].join(';');
    hud.innerHTML = [
      '<div style="font-weight:700;letter-spacing:0.04em;margin-bottom:4px">LJ PARTICLE SANDBOX</div>',
      '<div id="lj-hud-stats">N 0 / ' + MAX_N + '</div>',
      '<div style="opacity:0.75;margin-top:4px">Hold / drag to pour · fat-finger OK</div>',
    ].join('');
    this.container.appendChild(hud);
    this.hud = hud;
    this.hudStats = hud.querySelector('#lj-hud-stats');
  }

  _buildGui() {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;max-height:92%;overflow:auto;';
    this.container.appendChild(host);

    const species = [0, 1, 2].map((i) => ({
      epsilon: this.sim.epsilon[i],
      sigma: this.sim.sigma[i],
      mass: this.sim.mass[i],
    }));

    this._params = {
      pourSpecies: SPECIES_NAMES[0],
      pourRate: this.pourRate,
      gravity: this.sim.gravity,
      species,
      reset: () => this.sim.reset({ width: this.sim.width, height: this.sim.height }),
    };

    const gui = new GUI({ container: host, title: 'Controls' });
    this.gui = gui;

    gui.add(this._params, 'pourSpecies', SPECIES_NAMES).name('Pour species').onChange((name) => {
      this.pourSpecies = Math.max(0, SPECIES_NAMES.indexOf(name));
    });
    gui.add(this._params, 'pourRate', 5, 80, 1).name('Pour rate').onChange((v) => {
      this.pourRate = v;
    });
    gui.add(this._params, 'gravity', 0, 8, 0.05).name('Gravity').onChange((v) => {
      this.sim.setGravity(v);
    });

    for (let i = 0; i < 3; i++) {
      const folder = gui.addFolder(`Species ${SPECIES_NAMES[i]}`);
      const p = species[i];
      folder.add(p, 'epsilon', 0.05, 3, 0.01).name('ε').onChange((v) => {
        this.sim.setSpeciesParams(i, { epsilon: v });
      });
      folder.add(p, 'sigma', 0.3, 2.5, 0.01).name('σ').onChange((v) => {
        this.sim.setSpeciesParams(i, { sigma: v });
      });
      folder.add(p, 'mass', 0.1, 4, 0.05).name('mass').onChange((v) => {
        this.sim.setSpeciesParams(i, { mass: v });
      });
      if (i === 0) folder.open();
    }

    gui.add(this._params, 'reset').name('Clear');
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
    const w = this._eventToWorld(e);
    this.pointerX = w.x;
    this.pointerY = w.y;
    // Immediate fat spawn for responsiveness
    this._spawnBurst(3);
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
    const jitter = 0.55;
    for (let k = 0; k < n; k++) {
      const ok = this.sim.spawnAt(
        this.pointerX + (Math.random() - 0.5) * jitter,
        this.pointerY + (Math.random() - 0.5) * jitter,
        this.pourSpecies,
      );
      if (!ok) break;
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
