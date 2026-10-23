import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CPWFCModel, COLLAPSED } from './Model.mjs';

const COLORS = ['#6ee7ff', '#ffcc66', '#ff6f91', '#b28dff', '#71e79f', '#ff8f5c', '#7aa5ff', '#e6ef75'];

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.params = { L: 48, q: 4, p: 0.5, T: 0.65, J: 1, bondMode: 'quenched', conditioning: 'parent-only', boundary: 'open', seeds: 1, seed: 1, tMax: 4096 };
    this.playing = true;
    this.speed = 10;
    this.showEdges = true;
    this.scrubTime = Infinity;
    this.lastStepAt = 0;
    this.raf = 0;
    this.sweepToken = 0;
  }

  start() {
    this.injectStyles();
    this.container.classList.add('cpwfc');
    this.container.innerHTML = `
      <div class="cp-shell">
        <main class="cp-stage">
          <div class="cp-viewport" aria-label="Three-dimensional causal collapse history"></div>
          <div class="cp-overlay">
            <div><span>collapsed</span><strong data-metric="collapsedFraction">0%</strong></div>
            <div><span>span</span><strong data-metric="spanning">no</strong></div>
            <div><span>depth</span><strong data-metric="maxDepth">0</strong></div>
            <div><span>walls</span><strong data-metric="domainWallDensity">0</strong></div>
          </div>
          <div class="cp-time"><span>t = <output data-out="time">0</output></span><input data-field="scrub" type="range" min="0" max="1" value="1" step="1" aria-label="History time"></div>
        </main>
        <aside class="cp-controls">
          <header><h1>CP-WFC</h1><p>Causal percolation × Markov collapse</p></header>
          <div class="cp-actions">
            <button data-action="play" class="primary">Pause</button>
            <button data-action="step">Step</button>
            <button data-action="reset">Reset</button>
            <button data-action="reseed">Reseed</button>
          </div>
          <label>Bond probability <output data-out="p"></output><input data-field="p" type="range" min="0" max="1" step="0.005"></label>
          <label>Kernel temperature <output data-out="T"></output><input data-field="T" type="range" min="0.01" max="3" step="0.01"></label>
          <label>States <output data-out="q"></output><input data-field="q" type="range" min="2" max="8" step="1"></label>
          <label>Lattice size <output data-out="L"></output><input data-field="L" type="range" min="16" max="96" step="8"></label>
          <div class="cp-two">
            <label>Bonds<select data-field="bondMode"><option value="quenched">Quenched</option><option value="annealed">Annealed</option></select></label>
            <label>Conditioning<select data-field="conditioning"><option value="parent-only">Parent only</option><option value="full">Full neighbors</option></select></label>
            <label>Coupling<select data-field="J"><option value="1">Ferro +1</option><option value="-1">Antiferro −1</option></select></label>
            <label>Boundary<select data-field="boundary"><option value="open">Open</option><option value="periodic">Periodic</option></select></label>
          </div>
          <label class="cp-check"><input data-field="showEdges" type="checkbox" checked> Show causal parent edges</label>
          <label>Steps / second <output data-out="speed"></output><input data-field="speed" type="range" min="1" max="30" step="1"></label>
          <section class="cp-sweep">
            <div><strong>Phase map</strong><span>collapsed fraction over (p, T)</span></div>
            <canvas width="240" height="116" aria-label="Phase diagram heatmap"></canvas>
            <button data-action="sweep">Run p × T sweep</button>
            <small>Click a tile to load its parameters.</small>
          </section>
          <details><summary>Export</summary><div class="cp-actions"><button data-action="json">JSON</button><button data-action="csv">CSV</button><button data-action="png">PNG</button></div></details>
        </aside>
      </div>`;
    this.setupThree();
    this.bind();
    this.reset();
    this.raf = requestAnimationFrame((time) => this.tick(time));
  }

  setupThree() {
    this.viewport = this.container.querySelector('.cp-viewport');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071018);
    this.scene.fog = new THREE.FogExp2(0x071018, 0.018);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.set(42, 44, 54);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.viewport.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 9, 0);
    this.scene.add(new THREE.HemisphereLight(0xb7e8ff, 0x18202a, 2.1));
    const grid = new THREE.GridHelper(52, 26, 0x335568, 0x182b36);
    grid.position.y = -0.25;
    this.scene.add(grid);
    const planeGeometry = new THREE.PlaneGeometry(51, 51);
    const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x132630, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
    this.basePlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.basePlane.rotation.x = -Math.PI / 2;
    this.basePlane.position.y = -0.18;
    this.scene.add(this.basePlane);
  }

  bind() {
    this.container.addEventListener('input', (event) => {
      const field = event.target.dataset.field;
      if (!field) return;
      if (field === 'scrub') { this.scrubTime = Number(event.target.value); this.renderHistory(); return; }
      if (field === 'showEdges') { this.showEdges = event.target.checked; this.renderHistory(); return; }
      if (field === 'speed') { this.speed = Number(event.target.value); this.sync(); return; }
      this.params[field] = ['p', 'T', 'J', 'q', 'L'].includes(field) ? Number(event.target.value) : event.target.value;
      this.reset();
    });
    this.container.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      if (!action) return;
      if (action === 'play') this.playing = !this.playing;
      if (action === 'step') { this.playing = false; this.model.step(); this.scrubTime = Infinity; this.renderHistory(); }
      if (action === 'reset') this.reset();
      if (action === 'reseed') { this.params.seed = (Math.random() * 0xffffffff) >>> 0; this.reset(); }
      if (action === 'sweep') this.runSweep();
      if (action === 'json') this.download('cp-wfc.json', JSON.stringify(this.model.snapshot(), null, 2), 'application/json');
      if (action === 'csv') this.exportCsv();
      if (action === 'png') this.downloadUrl('cp-wfc.png', this.renderer.domElement.toDataURL('image/png'));
      this.sync();
    });
    this.container.querySelector('.cp-sweep canvas').addEventListener('click', (event) => this.pickSweep(event));
  }

  reset() {
    this.sweepToken++;
    this.model = new CPWFCModel(this.params);
    this.playing = true;
    this.scrubTime = Infinity;
    this.renderHistory();
    this.sync();
  }

  tick(time) {
    if (this.playing && !this.model.done && time - this.lastStepAt >= 1000 / this.speed) {
      this.model.step();
      this.lastStepAt = time;
      this.scrubTime = Infinity;
      this.renderHistory();
    }
    if (this.model.done) this.playing = false;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.sync();
    this.raf = requestAnimationFrame((next) => this.tick(next));
  }

  renderHistory() {
    this.pointCloud?.geometry.dispose(); this.pointCloud?.material.dispose();
    this.edgeLines?.geometry.dispose(); this.edgeLines?.material.dispose();
    if (this.pointCloud) this.scene.remove(this.pointCloud);
    if (this.edgeLines) this.scene.remove(this.edgeLines);
    const L = this.model.params.L;
    const scale = 50 / Math.max(1, L - 1);
    const dz = Math.min(0.72, 24 / Math.max(20, this.model.metrics.maxDepth || 20));
    const cutoff = Number.isFinite(this.scrubTime) ? this.scrubTime : this.model.time;
    const positions = [];
    const colors = [];
    const edgePositions = [];
    const color = new THREE.Color();
    for (let id = 0; id < this.model.count; id++) {
      if (this.model.status[id] !== COLLAPSED || this.model.times[id] > cutoff) continue;
      const x = (id % L - (L - 1) / 2) * scale;
      const z = (((id / L) | 0) - (L - 1) / 2) * scale;
      const y = this.model.times[id] * dz;
      positions.push(x, y, z);
      color.set(COLORS[this.model.states[id] % COLORS.length]);
      if (this.model.defects[id]) color.set('#ffffff');
      colors.push(color.r, color.g, color.b);
      const parent = this.model.parents[id];
      if (parent >= 0 && this.model.times[parent] <= cutoff) {
        edgePositions.push(x, y, z,
          (parent % L - (L - 1) / 2) * scale,
          this.model.times[parent] * dz,
          (((parent / L) | 0) - (L - 1) / 2) * scale);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: Math.max(0.15, scale * 0.48), vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.96 });
    this.pointCloud = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloud);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x78aabc, transparent: true, opacity: this.showEdges ? 0.19 : 0 });
    this.edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    this.scene.add(this.edgeLines);
    const scrub = this.container.querySelector('[data-field="scrub"]');
    scrub.max = Math.max(1, this.model.time);
    scrub.value = Math.min(cutoff, this.model.time);
  }

  sync() {
    this.container.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.dataset.field;
      if (field === 'scrub') return;
      if (field === 'showEdges') input.checked = this.showEdges;
      else if (field === 'speed') input.value = this.speed;
      else input.value = this.params[field];
    });
    for (const key of ['p', 'T', 'q', 'L']) this.container.querySelector(`[data-out="${key}"]`).textContent = key === 'p' ? `${this.params.p.toFixed(3)}  (pc=.500)` : this.params[key];
    this.container.querySelector('[data-out="speed"]').textContent = this.speed;
    this.container.querySelector('[data-out="time"]').textContent = Number.isFinite(this.scrubTime) ? this.scrubTime : this.model.time;
    const m = this.model.metrics;
    this.container.querySelector('[data-metric="collapsedFraction"]').textContent = `${(m.collapsedFraction * 100).toFixed(1)}%`;
    this.container.querySelector('[data-metric="spanning"]').textContent = m.spanning ? 'yes' : 'no';
    this.container.querySelector('[data-metric="maxDepth"]').textContent = m.maxDepth;
    this.container.querySelector('[data-metric="domainWallDensity"]').textContent = m.domainWallDensity.toFixed(3);
    const play = this.container.querySelector('[data-action="play"]');
    play.textContent = this.model.done ? 'Complete' : this.playing ? 'Pause' : 'Play';
    play.disabled = this.model.done;
  }

  async runSweep() {
    const canvas = this.container.querySelector('.cp-sweep canvas');
    const button = this.container.querySelector('[data-action="sweep"]');
    const ctx = canvas.getContext('2d');
    const ps = Array.from({ length: 13 }, (_, i) => 0.2 + i * 0.05);
    const ts = [0.05, 0.12, 0.25, 0.5, 0.9, 1.5, 2.4];
    const values = Array.from({ length: ts.length }, () => Array(ps.length).fill(0));
    const token = ++this.sweepToken;
    button.disabled = true; button.textContent = 'Sweeping…';
    for (let row = 0; row < ts.length; row++) {
      for (let col = 0; col < ps.length; col++) {
        let sum = 0;
        for (let run = 0; run < 3; run++) {
          const model = new CPWFCModel({ ...this.params, L: 24, p: ps[col], T: ts[row], seed: (this.params.seed + row * 1009 + col * 9176 + run * 7919) >>> 0, bondMode: 'quenched' });
          model.run(); sum += model.metrics.collapsedFraction;
        }
        values[row][col] = sum / 3;
      }
      if (token !== this.sweepToken) return;
      this.drawSweep(ctx, values, ps, ts, row + 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    this.sweep = { ps, ts, values };
    button.disabled = false; button.textContent = 'Run p × T sweep';
  }

  drawSweep(ctx, values, ps, ts, rows = ts.length) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const left = 24, top = 8, plotW = w - 30, plotH = h - 25;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#08131a'; ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) for (let c = 0; c < ps.length; c++) {
      const value = values[r][c];
      ctx.fillStyle = `hsl(${205 - value * 165} 78% ${13 + value * 48}%)`;
      ctx.fillRect(left + c * plotW / ps.length, top + r * plotH / ts.length, plotW / ps.length + 0.5, plotH / ts.length + 0.5);
    }
    ctx.fillStyle = '#a8bac5'; ctx.font = '10px system-ui'; ctx.fillText('T', 5, 14); ctx.fillText('0.2', left, h - 3); ctx.fillText('p', w - 7, h - 3); ctx.fillText('0.8', w - 24, h - 3);
  }

  pickSweep(event) {
    if (!this.sweep) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * event.currentTarget.width;
    const y = (event.clientY - rect.top) / rect.height * event.currentTarget.height;
    const col = Math.floor((x - 24) / (event.currentTarget.width - 30) * this.sweep.ps.length);
    const row = Math.floor((y - 8) / (event.currentTarget.height - 25) * this.sweep.ts.length);
    if (this.sweep.ps[col] == null || this.sweep.ts[row] == null) return;
    this.params.p = this.sweep.ps[col]; this.params.T = this.sweep.ts[row]; this.reset();
  }

  exportCsv() {
    const lines = ['id,x,y,time,parent,state,defect'];
    const L = this.model.params.L;
    for (const item of this.model.snapshot().history) lines.push(`${item.id},${item.id % L},${(item.id / L) | 0},${item.time},${item.parent},${item.state},${Number(item.defect)}`);
    this.download('cp-wfc.csv', lines.join('\n'), 'text/csv');
  }

  download(name, content, type) { this.downloadUrl(name, URL.createObjectURL(new Blob([content], { type })), true); }
  downloadUrl(name, url, revoke = false) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); if (revoke) setTimeout(() => URL.revokeObjectURL(url), 1000); }

  resize(width, height) {
    if (!this.renderer) return;
    const narrow = width < 820;
    const controls = this.container.querySelector('.cp-controls');
    const w = narrow ? width : Math.max(260, width - (controls?.offsetWidth || 300));
    const h = narrow ? Math.max(360, height - (controls?.offsetHeight || 300)) : height;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  destroy() {
    cancelAnimationFrame(this.raf); this.sweepToken++;
    this.controls?.dispose(); this.renderer?.dispose();
    this.container.classList.remove('cpwfc'); this.container.replaceChildren();
  }

  injectStyles() {
    if (document.getElementById('cpwfc-style')) return;
    const link = document.createElement('link'); link.id = 'cpwfc-style'; link.rel = 'stylesheet'; link.href = '/experiments/causal-percolative-wfc/styles.css'; document.head.appendChild(link);
  }
}
