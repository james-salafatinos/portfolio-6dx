import { ConnectivityEngine } from './core/ConnectivityEngine.js';
import { SitePercolation, DistanceThreshold } from './activation/ActivationModels.js';
import { randomDistanceGeometry, squareGridGeometry, voronoiSiteGeometry } from './geometry/Geometries.js';
import { CanvasRenderer } from './rendering/CanvasRenderer.js';

const GEOMETRIES = {
  square: { label: 'Square lattice + site', parameter: 'p', build: (state) => squareGridGeometry({ size: state.gridSize, seed: state.seed }), activation: () => new SitePercolation() },
  voronoi: { label: 'Voronoi sites + site', parameter: 'p', build: (state) => voronoiSiteGeometry({ count: state.pointCount, seed: state.seed }), activation: () => new SitePercolation() },
  distance: { label: 'Random points + distance', parameter: 'r', build: (state) => randomDistanceGeometry({ count: state.pointCount, seed: state.seed, maxRadius: state.maxRadius }), activation: () => new DistanceThreshold() },
};

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.state = {
      mode: 'explore',
      geometry: 'square',
      parameter: 0.51,
      gridSize: 42,
      pointCount: 240,
      seed: 83472,
      maxRadius: 0.24,
      colorMode: 'component',
      autoRun: true,
      speed: 0.08,
      runs: 80,
    };
    this.graph = null;
    this.engine = null;
    this.renderer = null;
    this.raf = 0;
    this.lastTime = 0;
    this.chartData = null;
  }

  start() {
    this.injectStyles();
    this.container.classList.add('percolation-lab');
    this.container.innerHTML = `
      <div class="lab-shell">
        <section class="lab-stage">
          <canvas class="lab-canvas" aria-label="Percolation connectivity simulation"></canvas>
          <div class="lab-readout" aria-live="polite"></div>
        </section>
        <aside class="lab-controls">
          <div class="lab-heading">
            <h1>Percolation Lab</h1>
            <p>One connectivity engine. Different universes.</p>
          </div>
          <div class="segmented" role="group" aria-label="Mode">
            <button type="button" data-action="mode" data-mode="explore">Explore</button>
            <button type="button" data-action="mode" data-mode="experiment">Experiment</button>
          </div>
          <label>Geometry<select data-field="geometry">
            <option value="square">Square lattice + site</option>
            <option value="voronoi">Voronoi sites + site</option>
            <option value="distance">Random points + distance</option>
          </select></label>
          <label><span class="parameter-label">p</span><output data-out="parameter"></output><input data-field="parameter" type="range" min="0" max="1" step="0.001"></label>
          <label class="grid-only">Grid size<output data-out="gridSize"></output><input data-field="gridSize" type="range" min="14" max="74" step="1"></label>
          <label class="point-only">Points<output data-out="pointCount"></output><input data-field="pointCount" type="range" min="80" max="700" step="10"></label>
          <label>Seed<input data-field="seed" type="number" min="1" step="1"></label>
          <label>Color<select data-field="colorMode">
            <option value="component">Component identity</option>
            <option value="size">Component size</option>
            <option value="threshold">Activation threshold</option>
          </select></label>
          <div class="explore-tools">
            <label>Speed<output data-out="speed"></output><input data-field="speed" type="range" min="0" max="0.35" step="0.01"></label>
            <label class="toggle"><input data-field="autoRun" type="checkbox"> Auto-run</label>
          </div>
          <div class="experiment-tools">
            <label>Monte Carlo runs<output data-out="runs"></output><input data-field="runs" type="range" min="20" max="220" step="10"></label>
            <button type="button" data-action="run">Run sweep</button>
          </div>
          <button type="button" data-action="seed">New seed</button>
        </aside>
      </div>
    `;

    this.canvas = this.container.querySelector('.lab-canvas');
    this.readout = this.container.querySelector('.lab-readout');
    this.renderer = new CanvasRenderer(this.canvas);
    this.bindControls();
    this.rebuildGraph();
    this.tick(0);
  }

  resize(width, height) {
    if (!this.renderer) return;
    const controls = this.container.querySelector('.lab-controls');
    const narrow = width < 820;
    const canvasWidth = narrow ? width : Math.max(280, width - (controls?.offsetWidth || 320));
    const canvasHeight = narrow ? Math.max(320, height - (controls?.offsetHeight || 260)) : height;
    this.renderer.resize(canvasWidth, canvasHeight);
    this.render();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.container.classList.remove('percolation-lab');
    this.container.replaceChildren();
  }

  bindControls() {
    this.container.addEventListener('input', (event) => {
      const field = event.target.dataset.field;
      if (!field) return;
      this.readField(event.target, field);
      if (['geometry', 'gridSize', 'pointCount', 'seed'].includes(field)) this.rebuildGraph();
      else this.replay();
      this.syncControls();
    });

    this.container.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      if (!action) return;
      if (action === 'mode') {
        this.state.mode = event.target.dataset.mode;
        if (this.state.mode === 'experiment' && !this.chartData) this.runSweep();
      }
      if (action === 'seed') {
        this.state.seed = Math.floor(Math.random() * 999999) + 1;
        this.rebuildGraph();
      }
      if (action === 'run') this.runSweep();
      this.syncControls();
      this.render();
    });
  }

  readField(input, field) {
    if (input.type === 'checkbox') this.state[field] = input.checked;
    else if (input.type === 'number' || input.type === 'range') this.state[field] = Number(input.value);
    else this.state[field] = input.value;
  }

  rebuildGraph() {
    const definition = GEOMETRIES[this.state.geometry];
    this.graph = definition.build(this.state);
    this.engine = new ConnectivityEngine(this.graph, definition.activation(), 'top-bottom');
    this.chartData = null;
    this.replay();
    this.syncControls();
  }

  replay() {
    this.engine.replay(this.state.parameter);
    this.render();
  }

  render() {
    if (!this.graph || !this.engine?.state || !this.renderer) return;
    this.renderer.render(this.graph, this.engine.state, this.state.colorMode);
    this.renderReadout();
    if (this.state.mode === 'experiment') this.renderChart();
  }

  renderReadout() {
    const metrics = this.engine.state.metrics;
    const definition = GEOMETRIES[this.state.geometry];
    if (this.state.mode === 'experiment') {
      this.readout.innerHTML = `<strong>${definition.label}</strong><span>${this.chartData ? 'Sweep complete' : 'Run a sweep to estimate the transition curve'}</span>`;
      return;
    }
    this.readout.innerHTML = `
      <strong>${definition.label}</strong>
      <span>${definition.parameter}=${this.state.parameter.toFixed(3)} | active ${metrics.activeNodes}/${this.graph.nodes.length} | components ${metrics.componentCount}</span>
      <span>largest ${(metrics.largestShare * 100).toFixed(1)}% | susceptibility ${metrics.susceptibility.toFixed(1)} | spanning ${metrics.percolates ? 'yes' : 'no'}</span>
    `;
  }

  renderChart() {
    const ctx = this.renderer.ctx;
    const data = this.chartData;
    if (!data) return;
    const x = 28;
    const y = this.renderer.height - 148;
    const w = Math.max(220, this.renderer.width - 56);
    const h = 112;
    ctx.fillStyle = 'rgba(16, 24, 32, 0.86)';
    ctx.fillRect(x - 12, y - 22, w + 24, h + 42);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.strokeRect(x, y, w, h);
    drawLine(ctx, data, 'spanningProbability', x, y, w, h, '#f7d774', 1);
    drawLine(ctx, data, 'largestShare', x, y, w, h, '#86e1ac', 1);
    drawLine(ctx, data, 'susceptibilityScaled', x, y, w, h, '#d9896a', 1);
    ctx.fillStyle = '#e8edf2';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Monte Carlo sweep: yellow spanning, green largest, orange susceptibility', x, y - 8);
    ctx.fillStyle = '#aeb9c5';
    ctx.fillText('0', x, y + h + 16);
    ctx.fillText('1', x + w - 7, y + h + 16);
  }

  runSweep() {
    const definition = GEOMETRIES[this.state.geometry];
    const points = [];
    const steps = 32;
    const runs = this.state.runs;

    for (let step = 0; step <= steps; step++) {
      const parameter = step / steps;
      let spans = 0;
      let largest = 0;
      let susceptibility = 0;
      for (let run = 0; run < runs; run++) {
        const seed = this.state.seed + run * 7919 + step * 104729;
        const graph = definition.build({ ...this.state, seed });
        const engine = new ConnectivityEngine(graph, definition.activation(), 'top-bottom');
        const result = engine.replay(parameter);
        if (result.metrics.percolates) spans++;
        largest += result.metrics.largestShare;
        susceptibility += result.metrics.susceptibility / graph.nodes.length;
      }
      points.push({
        parameter,
        spanningProbability: spans / runs,
        largestShare: largest / runs,
        susceptibilityScaled: Math.min(1, susceptibility / runs * 8),
      });
    }
    this.chartData = points;
  }

  syncControls() {
    const definition = GEOMETRIES[this.state.geometry];
    this.container.querySelector('.parameter-label').textContent = definition.parameter;
    this.container.querySelectorAll('[data-field]').forEach((input) => {
      const value = this.state[input.dataset.field];
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value;
    });
    this.container.querySelector('[data-out="parameter"]').textContent = this.state.parameter.toFixed(3);
    this.container.querySelector('[data-out="gridSize"]').textContent = this.state.gridSize;
    this.container.querySelector('[data-out="pointCount"]').textContent = this.state.pointCount;
    this.container.querySelector('[data-out="speed"]').textContent = this.state.speed.toFixed(2);
    this.container.querySelector('[data-out="runs"]').textContent = this.state.runs;
    this.container.dataset.geometry = this.state.geometry;
    this.container.dataset.mode = this.state.mode;
    this.container.querySelectorAll('[data-action="mode"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === this.state.mode));
    });
  }

  tick(time) {
    const dt = this.lastTime ? Math.min(0.04, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    if (this.state.mode === 'explore' && this.state.autoRun && this.state.speed > 0) {
      this.state.parameter = (this.state.parameter + dt * this.state.speed) % 1;
      this.engine.replay(this.state.parameter);
      this.syncControls();
      this.render();
    }
    this.raf = requestAnimationFrame((next) => this.tick(next));
  }

  injectStyles() {
    if (document.getElementById('percolation-connectivity-lab-style')) return;
    const style = document.createElement('style');
    style.id = 'percolation-connectivity-lab-style';
    style.textContent = `
      .percolation-lab { width: 100%; height: 100%; min-height: 520px; color: #e8edf2; background: #101820; font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .percolation-lab * { box-sizing: border-box; }
      .lab-shell { display: grid; grid-template-columns: minmax(0, 1fr) 320px; width: 100%; height: 100%; }
      .lab-stage { position: relative; min-width: 0; min-height: 320px; overflow: hidden; }
      .lab-canvas { display: block; width: 100%; height: 100%; }
      .lab-readout { position: absolute; left: 14px; bottom: 14px; display: grid; gap: 3px; max-width: calc(100% - 28px); padding: 10px 12px; background: rgba(16, 24, 32, 0.82); border: 1px solid rgba(255,255,255,.16); border-radius: 6px; pointer-events: none; }
      .lab-readout strong { font-weight: 500; }
      .lab-readout span { color: #c4ced8; }
      .lab-controls { display: flex; flex-direction: column; gap: 12px; padding: 16px; overflow: auto; background: #17232d; border-left: 1px solid rgba(255,255,255,.12); }
      .lab-heading h1 { margin: 0 0 2px; font-size: 22px; line-height: 1.1; font-weight: 500; letter-spacing: 0; }
      .lab-heading p { margin: 0; color: #aeb9c5; }
      .segmented { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: #101820; border-radius: 6px; }
      button, select, input { font: inherit; }
      button, select, input[type="number"] { min-height: 34px; color: #e8edf2; background: #26323b; border: 1px solid rgba(255,255,255,.14); border-radius: 6px; }
      button { cursor: pointer; }
      button[aria-pressed="true"], button:hover { background: #3f5965; }
      label { display: grid; gap: 5px; color: #c4ced8; }
      output { float: right; color: #e8edf2; }
      input[type="range"] { width: 100%; accent-color: #86e1ac; }
      select, input[type="number"] { width: 100%; padding: 0 8px; }
      .toggle { display: flex; align-items: center; gap: 8px; }
      .experiment-tools { display: none; gap: 12px; }
      .percolation-lab[data-mode="experiment"] .experiment-tools { display: grid; }
      .percolation-lab[data-mode="experiment"] .explore-tools { display: none; }
      .point-only { display: none; }
      .percolation-lab[data-geometry="voronoi"] .point-only, .percolation-lab[data-geometry="distance"] .point-only { display: grid; }
      .percolation-lab[data-geometry="voronoi"] .grid-only, .percolation-lab[data-geometry="distance"] .grid-only { display: none; }
      @media (max-width: 820px) {
        .lab-shell { grid-template-columns: 1fr; grid-template-rows: minmax(320px, 1fr) auto; }
        .lab-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-left: 0; border-top: 1px solid rgba(255,255,255,.12); max-height: 46vh; }
        .lab-heading, .segmented { grid-column: 1 / -1; }
      }
      @media (max-width: 520px) {
        .lab-controls { grid-template-columns: 1fr; max-height: none; }
        .lab-readout { position: static; margin: 10px; max-width: none; }
      }
    `;
    document.head.appendChild(style);
  }
}

function drawLine(ctx, data, field, x, y, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((point, index) => {
    const px = x + point.parameter * w;
    const py = y + h - point[field] * h;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}
