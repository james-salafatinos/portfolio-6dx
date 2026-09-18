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
    this.guiHost = null;
    this.statsEl = null;
    this.settings = null;
    this._guiThresholdCtrl = null;
    this._mq = null;
    this._onViewportChange = this._onViewportChange.bind(this);
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

    this._injectStyles();

    const guiHost = document.createElement('div');
    guiHost.className = 'mp-gui-host';
    this.guiHost = guiHost;
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

    this._mq = window.matchMedia('(max-width: 720px), (max-height: 560px)');
    this._mq.addEventListener?.('change', this._onViewportChange);
    this._onViewportChange();

    this.resize(this.container.clientWidth, this.container.clientHeight);
  }

  _injectStyles() {
    if (this.container.querySelector('#mp-gui-styles')) return;
    const style = document.createElement('style');
    style.id = 'mp-gui-styles';
    style.textContent = `
      .mp-gui-host {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 10;
        max-width: min(245px, calc(100% - 20px));
        max-height: min(92%, calc(100% - 20px));
        overflow: auto;
        box-sizing: border-box;
      }
      /* lil-gui defaults ~245px min-width — force it inside the host */
      .mp-gui-host .lil-gui {
        --name-width: 55%;
        min-width: 0 !important;
        width: 100% !important;
        max-width: 100%;
        font-size: 11px;
      }
      .mp-gui-host .lil-gui .controller.number input {
        font-variant-numeric: tabular-nums;
        max-width: 4.5em;
      }
      .mp-gui-host .lil-gui .controller.button .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Phone (~390px): keep top-right sibling DNA; fit full widgets on-screen */
      .mp-gui-host.mp-gui-mobile {
        top: 10px;
        right: 8px;
        left: auto;
        bottom: auto;
        max-width: min(168px, calc(100% - 16px));
        max-height: min(55vh, calc(100% - 24px));
      }
      .mp-gui-host.mp-gui-mobile .lil-gui {
        --name-width: 48%;
        font-size: 10px;
      }
      .mp-gui-host.mp-gui-mobile .lil-gui .controller.number input {
        max-width: 3.8em;
      }
    `;
    this.container.appendChild(style);
  }

  _onViewportChange() {
    const mobile = !!(this._mq?.matches);
    this.guiHost?.classList.toggle('mp-gui-mobile', mobile);
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
    // Also react to experiment-shell size (not only window matchMedia)
    if (this.guiHost) {
      const narrow = w <= 720 || h <= 560;
      this.guiHost.classList.toggle('mp-gui-mobile', narrow || !!(this._mq?.matches));
    }
  }

  destroy() {
    this.renderer?.setAnimationLoop(null);
    this._mq?.removeEventListener?.('change', this._onViewportChange);
    this.gui?.destroy();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.container.replaceChildren();
    this.guiHost = null;
  }
}
