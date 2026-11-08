import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default class Experiment {
  constructor(container) {
    this.container = container;
  }

  start() {
    this.container.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111827);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(4, 3, 5);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
    this.renderer.domElement.setAttribute('aria-label', 'Spinning cube with red X, green Y and blue Z world axes');
    this.container.appendChild(this.renderer.domElement);

    this.geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    this.material = new THREE.MeshStandardMaterial({ color: 0x8b9cff, roughness: 0.4, metalness: 0.15 });
    this.cube = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.cube);
    this.axes = new THREE.AxesHelper(3);
    this.scene.add(this.axes);
    this.scene.add(new THREE.HemisphereLight(0xe0e7ff, 0x334155, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    this.scene.add(light);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 15;
    this.controls.enablePan = false;

    const legend = document.createElement('div');
    legend.style.cssText = 'position:absolute;left:18px;bottom:18px;color:#dbeafe;font:14px system-ui;pointer-events:none;line-height:1.7;';
    legend.innerHTML = '<strong>Spinning cube</strong><br><span style="color:#ff7676">X</span> · <span style="color:#7ee787">Y</span> · <span style="color:#79b8ff">Z</span> world axes<br>Drag to orbit · scroll or pinch to zoom';
    this.container.appendChild(legend);
    this.resize(this.container.clientWidth, this.container.clientHeight);
    this.previousTime = null;
    this.renderer.setAnimationLoop((time) => {
      const delta = this.previousTime === null ? 0 : Math.min((time - this.previousTime) / 1000, 0.1);
      this.previousTime = time;
      this.cube.rotation.x += delta * 0.35;
      this.cube.rotation.y += delta * 0.6;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize(width, height) {
    if (!this.renderer) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  destroy() {
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.geometry?.dispose();
    this.material?.dispose();
    this.axes?.dispose();
    this.renderer?.dispose();
    this.container.replaceChildren();
  }
}
