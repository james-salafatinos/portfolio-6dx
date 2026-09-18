import * as THREE from 'three';
import { GUI } from '/vendor/lil-gui/lil-gui.esm.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game, PC_SITE } from './Game.js';

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.controls = null;
    this.game = null;
    this.gui = null;
    this.statsEl = null;
    this.settings = null;
    this._guiThresholdCtrl = null;
  }

  async start() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';

    // Same scene DNA as phase-transitions-percolation
    this.camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
    this.camera.position.set(3, 5, 8);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directional = new THREE.DirectionalLight(0xffffff, 1.5);
    directional.position.set(4, 2, 0);
    this.scene.add(directional);
    this.scene.add(new THREE.AxesHelper(1));
    const grid = new THREE.GridHelper(10, 10, 0x303030);
    grid.material.opacity = 0.8;
    grid.material.transparent = true;
    this.scene.add(grid);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000);
    this.renderer.setAnimationLoop(() => this.update());
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 50;

    const guiHost = document.createElement('div');
    Object.assign(guiHost.style, {
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: '10',
      maxWidth: 'min(220px, 46vw)',
    });
    this.container.appendChild(guiHost);
    this.gui = new GUI({ container: guiHost, title: 'Markov' });

    this.game = new Game(this.scene);

    this.settings = {
      probabilityThreshold: this.game.probabilityThreshold,
      autoOscillate: false,
      stepsPerFrame: 3,
      'Drop / Respawn': () => this.game.respawnWalker(),
      Reshuffle: () => this.game.reshuffleLattice(),
    };

    this._guiThresholdCtrl = this.gui
      .add(this.settings, 'probabilityThreshold', 0, 1, 0.01)
      .name(`p  (pc≈${PC_SITE.toFixed(2)})`)
      .onChange((value) => {
        if (!this.settings.autoOscillate) this.game.setProbabilityThreshold(value);
      });
    this.gui.add(this.settings, 'autoOscillate').name('Auto Oscillate').onChange((value) => {
      this.game.setAutoOscillate(value);
    });
    this.gui.add(this.settings, 'stepsPerFrame', 1, 12, 1).name('Steps / frame').onChange((v) => {
      this.game.setStepsPerFrame(v);
    });
    this.gui.add(this.settings, 'Drop / Respawn');
    this.gui.add(this.settings, 'Reshuffle');

    this.statsEl = document.createElement('div');
    Object.assign(this.statsEl.style, {
      position: 'absolute',
      left: '10px',
      bottom: '10px',
      zIndex: '10',
      padding: '10px 14px',
      background: 'rgba(0, 0, 0, 0.78)',
      border: '1px solid rgba(255,255,255,.15)',
      borderRadius: '6px',
      color: '#cfd8e6',
      font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      maxWidth: 'min(320px, 70vw)',
    });
    this.container.appendChild(this.statsEl);

    this.resize(this.container.clientWidth, this.container.clientHeight);
  }

  update() {
    if (!this.renderer || !this.camera || !this.game) return;
    this.controls?.update();
    this.game.update();

    // Keep GUI slider in sync when auto-oscillating
    if (this.settings?.autoOscillate && this._guiThresholdCtrl) {
      this.settings.probabilityThreshold = this.game.probabilityThreshold;
      this._guiThresholdCtrl.updateDisplay();
    }

    const s = this.game.getStats();
    this.statsEl.textContent =
      `p:        ${s.p.toFixed(3)}   pc≈${s.pc.toFixed(4)}\n` +
      `status:   ${s.status}\n` +
      `unique:   ${s.unique}\n` +
      `MSD:      ${s.msd.toFixed(1)}\n` +
      `steps:    ${s.steps}`;

    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    if (!this.renderer || !this.camera) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    this.renderer?.setAnimationLoop(null);
    this.gui?.destroy();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.container.replaceChildren();
  }
}
