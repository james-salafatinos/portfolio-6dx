import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game } from './Game.js';

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.controls = null;
    this.game = null;
  }

  async start() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';

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

    this.game = new Game(this.scene);
    this.resize(this.container.clientWidth, this.container.clientHeight);
  }

  update() {
    if (!this.renderer || !this.camera || !this.game) return;
    this.controls?.update();
    this.game.update();
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
    this.controls?.dispose();
    this.renderer?.dispose();
    this.container.replaceChildren();
  }
}
