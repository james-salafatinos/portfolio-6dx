import * as THREE from 'three';
import { GUI } from '/vendor/lil-gui/lil-gui.esm.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game } from './Game.js';

const VIEW_HALF = 55;
const SIZE = 42;

// Colors
const COLD = new THREE.Color(0x2b6cff); // V = 0 (right electrode)
const HOT = new THREE.Color(0xff5a3c); // V = 1 (left electrode)
const CLOSED_BOND = new THREE.Color(0x11162a); // fades into the background
const GLOW = new THREE.Color(0xdffcff); // bright current glow
const DIM_OPEN = new THREE.Color(0x1c2d55); // open bond, ~zero current (dangling)

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
    this.smoothedMaxCurrent = 0.05;
    this.controlsState = {
      p: 0.55,
      'Auto Sweep': false,
      'Fuse Mode': false,
      'Fuse Threshold': 1.2,
      Regenerate: () => this.game?.regenerate(),
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
    this.renderer.setClearColor(0x05070f);
    this.renderer.setAnimationLoop(() => this.update());
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enableZoom = true;
    this.controls.enableDamping = true;

    this.game = new Game(SIZE);
    this.buildMeshes();

    this.stats = document.createElement('div');
    this.stats.id = 'circuit-stats';
    Object.assign(this.stats.style, {
      position: 'absolute', left: '10px', bottom: '10px', zIndex: '10', padding: '10px 14px',
      background: 'rgba(5, 7, 15, 0.78)', border: '1px solid rgba(255,255,255,.15)',
      borderRadius: '6px', color: '#cfd8e6', font: '13px/1.5 monospace', whiteSpace: 'pre',
      pointerEvents: 'none',
    });
    this.container.appendChild(this.stats);

    const guiHost = document.createElement('div');
    Object.assign(guiHost.style, { position: 'absolute', top: '10px', right: '10px', zIndex: '10' });
    this.container.appendChild(guiHost);
    this.gui = new GUI({ container: guiHost, title: 'Circuit' });
    this.gui.add(this.controlsState, 'p', 0, 1, 0.01).name('p (bond prob.)').onChange((v) => this.game.setP(v));
    this.gui.add(this.controlsState, 'Auto Sweep').onChange((v) => { this.game.autoSweep = v; });
    this.gui.add(this.controlsState, 'Fuse Mode').onChange((v) => { this.game.fuseMode = v; });
    this.gui.add(this.controlsState, 'Fuse Threshold', 0.1, 3, 0.05).onChange((v) => { this.game.fuseThreshold = v; });
    this.gui.add(this.controlsState, 'Regenerate');

    this.resize(this.container.clientWidth, this.container.clientHeight);
  }

  buildMeshes() {
    const n = this.game.size;
    const toX = (c) => (c / (n - 1) - 0.5) * (VIEW_HALF * 1.7);
    const toY = (r) => (r / (n - 1) - 0.5) * (VIEW_HALF * 1.7);
    this.toX = toX;
    this.toY = toY;

    // Nodes: one point per lattice site, colored by potential.
    const nodePositions = new Float32Array(n * n * 3);
    const nodeColors = new Float32Array(n * n * 3);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = (r * n + c) * 3;
        nodePositions[i] = toX(c);
        nodePositions[i + 1] = toY(r);
        nodePositions[i + 2] = 0;
      }
    }
    const nodeGeom = new THREE.BufferGeometry();
    nodeGeom.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    nodeGeom.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));
    const nodeMat = new THREE.PointsMaterial({ size: Math.max(1.2, (VIEW_HALF * 1.7) / n * 0.6), vertexColors: true });
    this.nodePoints = new THREE.Points(nodeGeom, nodeMat);
    this.scene.add(this.nodePoints);

    // Bonds: one line segment per possible horizontal/vertical bond.
    const hCount = n * (n - 1);
    const vCount = (n - 1) * n;
    const bondCount = hCount + vCount;
    const bondPositions = new Float32Array(bondCount * 2 * 3);
    const bondColors = new Float32Array(bondCount * 2 * 3);
    let p3 = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n - 1; c++) {
        bondPositions[p3++] = toX(c); bondPositions[p3++] = toY(r); bondPositions[p3++] = -0.1;
        bondPositions[p3++] = toX(c + 1); bondPositions[p3++] = toY(r); bondPositions[p3++] = -0.1;
      }
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n; c++) {
        bondPositions[p3++] = toX(c); bondPositions[p3++] = toY(r); bondPositions[p3++] = -0.1;
        bondPositions[p3++] = toX(c); bondPositions[p3++] = toY(r + 1); bondPositions[p3++] = -0.1;
      }
    }
    const bondGeom = new THREE.BufferGeometry();
    bondGeom.setAttribute('position', new THREE.BufferAttribute(bondPositions, 3));
    bondGeom.setAttribute('color', new THREE.BufferAttribute(bondColors, 3));
    const bondMat = new THREE.LineBasicMaterial({ vertexColors: true });
    this.bondLines = new THREE.LineSegments(bondGeom, bondMat);
    this.scene.add(this.bondLines);
  }

  update() {
    if (!this.renderer || !this.camera || !this.game) return;
    this.controls?.update();
    this.game.update();
    this.syncColors();
    this.updateStats();
    this.renderer.render(this.scene, this.camera);
  }

  syncColors() {
    const game = this.game;
    const n = game.size;
    const tmp = new THREE.Color();

    const nodeColors = this.nodePoints.geometry.attributes.color.array;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const v = game.potential[game.idx(r, c)];
        tmp.copy(COLD).lerp(HOT, v);
        const i = (r * n + c) * 3;
        nodeColors[i] = tmp.r; nodeColors[i + 1] = tmp.g; nodeColors[i + 2] = tmp.b;
      }
    }
    this.nodePoints.geometry.attributes.color.needsUpdate = true;

    this.smoothedMaxCurrent = this.smoothedMaxCurrent * 0.9 + Math.max(game.maxCurrent, 0.02) * 0.1;
    const norm = this.smoothedMaxCurrent || 1;

    const bondColors = this.bondLines.geometry.attributes.color.array;
    let ci = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n - 1; c++) {
        ci = this.writeBondColor(bondColors, ci, game.isHOpen(r, c), game.hCurrent[game.hIdx(r, c)], norm, tmp);
      }
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n; c++) {
        ci = this.writeBondColor(bondColors, ci, game.isVOpen(r, c), game.vCurrent[game.vIdx(r, c)], norm, tmp);
      }
    }
    this.bondLines.geometry.attributes.color.needsUpdate = true;
  }

  writeBondColor(array, ci, open, current, norm, tmp) {
    if (!open) {
      tmp.copy(CLOSED_BOND);
    } else {
      const t = Math.min(1, Math.abs(current) / norm);
      tmp.copy(DIM_OPEN).lerp(GLOW, t);
    }
    for (let v = 0; v < 2; v++) {
      array[ci++] = tmp.r; array[ci++] = tmp.g; array[ci++] = tmp.b;
    }
    return ci;
  }

  updateStats() {
    const g = this.game;
    this.stats.textContent =
      `p:            ${g.p.toFixed(2)}\n` +
      `Conductance:  ${g.totalCurrent.toFixed(4)}\n` +
      `Percolates:   ${g.percolates ? 'YES' : 'NO'}\n` +
      `Fuse mode:    ${g.fuseMode ? 'ON' : 'off'}`;
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
