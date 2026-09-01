import * as THREE from '/vendor/three/build/three.module.js';
import { GUI } from '/vendor/lil-gui/lil-gui.esm.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';
import { Game } from './Game.js';

const VIEW_HALF = 50;

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.controls = null;
    this.game = null;
    this.gui = null;
    this.stats = null;
    this.controlsState = {
      p: 0.5,
      N: 200,
      Motion: 'Random Walk',
      'Walk Speed': 1.0,
      Speed: 1.0,
      Play: true,
      Regenerate: () => this.game?.regenerate(),
      'Show Voronoi': true,
      'Show Delaunay': true,
      'Show Points': true,
    };
  }

  async start() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-VIEW_HALF, VIEW_HALF, VIEW_HALF, -VIEW_HALF, 0.1, 1000);
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0a0e1a);
    this.renderer.setAnimationLoop(() => this.update());
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enableZoom = true;
    this.controls.enableDamping = true;

    this.stats = document.createElement('div');
    this.stats.id = 'percolation-stats';
    Object.assign(this.stats.style, {
      position: 'absolute', left: '10px', bottom: '10px', zIndex: '10', padding: '10px 14px',
      background: 'rgba(10, 14, 26, 0.78)', border: '1px solid rgba(255,255,255,.15)',
      borderRadius: '6px', color: '#cfd8e6', font: '13px/1.5 monospace', whiteSpace: 'pre',
      pointerEvents: 'none'
    });
    this.container.appendChild(this.stats);

    const guiHost = document.createElement('div');
    Object.assign(guiHost.style, { position: 'absolute', top: '10px', right: '10px', zIndex: '10' });
    this.container.appendChild(guiHost);
    this.gui = new GUI({ container: guiHost });
    this.gui.add(this.controlsState, 'p', 0, 1, 0.01).name('p (threshold)');
    this.gui.add(this.controlsState, 'N', 20, 2000, 1).name('N (sites)').onFinishChange(() => this.game?.reinit());
    this.gui.add(this.controlsState, 'Motion', ['Lissajous', 'Random Walk']).name('Motion Mode');
    this.gui.add(this.controlsState, 'Walk Speed', 0.1, 10, 0.1);
    this.gui.add(this.controlsState, 'Speed', 0.1, 5, 0.1);
    this.gui.add(this.controlsState, 'Play').name('Play / Pause');
    this.gui.add(this.controlsState, 'Regenerate');
    this.gui.add(this.controlsState, 'Show Voronoi');
    this.gui.add(this.controlsState, 'Show Delaunay');
    this.gui.add(this.controlsState, 'Show Points');

    this.game = new Game(this.scene, this.controlsState);
  }

  update() {
    if (!this.renderer || !this.camera || !this.game) return;
    this.controls?.update();
    this.game.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    if (!this.renderer || !this.camera) return;
    const safeHeight = Math.max(1, height);
    const aspect = Math.max(1, width) / safeHeight;
    this.renderer.setSize(Math.max(1, width), safeHeight, false);
    this.camera.left = -VIEW_HALF * aspect;
    this.camera.right = VIEW_HALF * aspect;
    this.camera.top = VIEW_HALF;
    this.camera.bottom = -VIEW_HALF;
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
