import * as THREE from 'three';
import { GUI } from '/vendor/lil-gui/lil-gui.esm.js';
import { Game } from './Game.js';

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.game = null;
    this.gui = null;
    this.dropButton = null;
    this._onMouseUp = null;
    this._onTouchEnd = null;
  }

  async start() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.touchAction = 'none';
    this.container.style.overflow = 'hidden';
    this.container.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // Vertical range +/-1.15 (zoomed out ~15%); horizontal scaled by aspect.
    this.camera = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050a12);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setAnimationLoop(() => this.update());
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    this.container.appendChild(this.renderer.domElement);

    this.game = new Game(this.scene);

    this._initGUI();
    this._initDropButton();
    this.resize(this.container.clientWidth, this.container.clientHeight);
  }

  update() {
    if (!this.renderer || !this.camera || !this.game) return;
    this.game.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    if (!this.renderer || !this.camera) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.renderer.setSize(w, h, false);

    const aspect = w / h;
    const ZOOM = 1.15; // zoom out ~15% for more breathing room (esp. on mobile)
    this.camera.left = -aspect * ZOOM;
    this.camera.right = aspect * ZOOM;
    this.camera.top = ZOOM;
    this.camera.bottom = -ZOOM;
    this.camera.updateProjectionMatrix();

    this.game?.onResize(this.camera);
  }

  destroy() {
    this.renderer?.setAnimationLoop(null);
    this.gui?.destroy();
    this.renderer?.dispose();
    if (this._onMouseUp) window.removeEventListener('mouseup', this._onMouseUp);
    if (this._onTouchEnd) window.removeEventListener('touchend', this._onTouchEnd);
    this.container.replaceChildren();
  }

  _initGUI() {
    const guiHost = document.createElement('div');
    guiHost.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;';
    this.container.appendChild(guiHost);

    const params = {
      maxHoldRate: 30,
      gravity: 4.0,
      pegRows: 12,
      damping: 0.55,
      maxParticles: 5000,
      clear: () => this.game && this.game.clear(),
    };

    this.gui = new GUI({ container: guiHost });
    this.gui.add(params, 'maxHoldRate', 1, 100, 1).name('Max Hold Rate').onChange((v) => this.game && (this.game.maxHoldRate = v));
    this.gui.add(params, 'gravity', 0.5, 20, 0.1).name('Gravity').onChange((v) => this.game && (this.game.gravity = v));
    this.gui.add(params, 'pegRows', 4, 20, 1).name('Peg Rows').onChange((v) => this.game && this.game.rebuildPegs(v));
    this.gui.add(params, 'damping', 0.1, 0.95, 0.01).name('Damping').onChange((v) => this.game && (this.game.damping = v));
    this.gui.add(params, 'maxParticles', 500, 10000, 100).name('Max Particles').onChange((v) => this.game && (this.game.maxParticles = v));
    this.gui.add(params, 'clear').name('Clear');
  }

  _initDropButton() {
    const btn = document.createElement('button');
    btn.textContent = 'DROP BALLS';
    btn.style.cssText = `
      position: absolute;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      padding: 14px 40px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.12em;
      font-family: monospace;
      color: #a8d8ff;
      background: rgba(10, 25, 55, 0.85);
      border: 1.5px solid #2a6aaa;
      border-radius: 6px;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      box-shadow: 0 0 14px rgba(60,140,255,0.25), inset 0 0 8px rgba(60,140,255,0.05);
      transition: box-shadow 0.1s, background 0.1s, color 0.1s;
      outline: none;
    `;

    const pressStyle = () => {
      btn.style.background = 'rgba(20, 55, 120, 0.95)';
      btn.style.color = '#d0eeff';
      btn.style.boxShadow = '0 0 28px rgba(60,160,255,0.55), inset 0 0 12px rgba(60,160,255,0.15)';
    };
    const releaseStyle = () => {
      btn.style.background = 'rgba(10, 25, 55, 0.85)';
      btn.style.color = '#a8d8ff';
      btn.style.boxShadow = '0 0 14px rgba(60,140,255,0.25), inset 0 0 8px rgba(60,140,255,0.05)';
    };

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pressStyle();
      this.game && this.game.startHold();
    });
    this._onMouseUp = () => {
      releaseStyle();
      this.game && this.game.stopHold();
    };
    window.addEventListener('mouseup', this._onMouseUp);

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      pressStyle();
      this.game && this.game.startHold();
    }, { passive: false });
    btn.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this._onTouchEnd = () => {
      releaseStyle();
      this.game && this.game.stopHold();
    };
    window.addEventListener('touchend', this._onTouchEnd);

    this.container.appendChild(btn);
    this.dropButton = btn;
  }
}
