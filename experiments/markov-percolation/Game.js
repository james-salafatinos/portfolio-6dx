import * as THREE from 'three';
import { Grid } from './Grid.js';
import { Walker } from './Walker.js';

// Visual DNA aligned with phase-transitions-percolation
const INIT_SIZE = 100;
const SCALE_FACTOR = 0.2;
const BOX_DIMENSION = 0.12;
const PC_SITE = 0.5927;
const STEPS_PER_FRAME = 3;

const COL_CLOSED = new THREE.Color(0x0a0a0a);
const COL_OPEN = new THREE.Color(0x1a3a6e);
const COL_HEAT_LO = new THREE.Color(0x2b6cff);
const COL_HEAT_MID = new THREE.Color(0xffcc33);
const COL_HEAT_HI = new THREE.Color(0xff3a2a);
const COL_WALKER = 0xffee55;

class Game {
  constructor(scene) {
    this.scene = scene;
    this.size = INIT_SIZE;
    this.timeElapsed = 0;
    this.oscillationState = 0;
    this.probabilityThreshold = 0.45;
    this.autoOscillate = false;
    this.stepsPerFrame = STEPS_PER_FRAME;

    this.grid = new Grid(this.size);
    this.walker = new Walker();
    this.siteMesh = null;
    this.walkerMesh = null;
    this.instanceColorAttr = null;
    this.half = ((this.size - 1) * SCALE_FACTOR) / 2;
    this._tmpColor = new THREE.Color();
    this._maxVisitSmooth = 1;

    this.grid.setP(this.probabilityThreshold);
    this.init();
  }

  setProbabilityThreshold(value) {
    this.probabilityThreshold = value;
    this.grid.setP(value);
    // If walker sits on a site that closed, respawn
    if (!this.grid.isOpen(this.walker.i, this.walker.j)) {
      this.respawnWalker();
    }
    this.syncSiteColors();
  }

  setAutoOscillate(value) {
    this.autoOscillate = value;
  }

  setStepsPerFrame(value) {
    this.stepsPerFrame = Math.max(1, value | 0);
  }

  respawnWalker() {
    this.walker.drop(this.grid);
    this._maxVisitSmooth = 1;
    this.syncSiteColors();
    this.syncWalkerMesh();
  }

  reshuffleLattice() {
    this.grid.reshuffle();
    this.grid.setP(this.probabilityThreshold);
    this.respawnWalker();
  }

  updateOscillation() {
    this.oscillationState += 0.008;
    if (this.oscillationState >= 2 * Math.PI) this.oscillationState = 0;
    // Sweep around pc so trapped ↔ roam is readable
    this.probabilityThreshold = PC_SITE + 0.25 * Math.sin(this.oscillationState);
    this.probabilityThreshold = Math.max(0.05, Math.min(0.95, this.probabilityThreshold));
    this.grid.setP(this.probabilityThreshold);
    if (!this.grid.isOpen(this.walker.i, this.walker.j)) {
      this.walker.drop(this.grid);
      this._maxVisitSmooth = 1;
    }
  }

  init() {
    this.buildSiteMesh();
    this.buildWalkerMesh();
    this.respawnWalker();
  }

  worldPos(i, j, y = 0) {
    return [
      i * SCALE_FACTOR - this.half,
      y,
      j * SCALE_FACTOR - this.half,
    ];
  }

  buildSiteMesh() {
    const n = this.size;
    const count = n * n;
    const vertices = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    let vi = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const [x, y, z] = this.worldPos(i, j, 0);
        vertices[vi] = x;
        vertices[vi + 1] = y;
        vertices[vi + 2] = z;
        vi += 3;
      }
    }

    // Seed open/closed colors
    for (let k = 0; k < count; k++) {
      const c = this.grid.isOpenIdx(k) ? COL_OPEN : COL_CLOSED;
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }

    const geometry = new THREE.InstancedBufferGeometry();
    const baseGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
      -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    ]);
    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
      4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2,
      4, 5, 1, 4, 1, 0, 3, 2, 6, 3, 6, 7,
    ]);
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.applyMatrix4(
      new THREE.Matrix4().makeScale(
        BOX_DIMENSION / 2,
        BOX_DIMENSION / 2,
        BOX_DIMENSION / 2
      )
    );
    baseGeometry.setAttribute('position', positionAttribute);
    baseGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    geometry.index = baseGeometry.index;
    geometry.attributes.position = baseGeometry.attributes.position;
    geometry.setAttribute(
      'instancePosition',
      new THREE.InstancedBufferAttribute(vertices, 3)
    );
    this.instanceColorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.instanceColorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('instanceColor', this.instanceColorAttr);

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 instancePosition;
        attribute vec3 instanceColor;
        varying vec3 vColor;
        void main() {
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(instancePosition + position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });

    this.siteMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.siteMesh);
  }

  buildWalkerMesh() {
    const geo = new THREE.SphereGeometry(BOX_DIMENSION * 1.35, 12, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: COL_WALKER,
      emissive: COL_WALKER,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.1,
    });
    this.walkerMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.walkerMesh);
  }

  heatColor(visits, maxV, out) {
    if (visits <= 0) {
      out.copy(COL_OPEN);
      return out;
    }
    const t = Math.min(1, Math.log1p(visits) / Math.log1p(Math.max(1, maxV)));
    if (t < 0.5) {
      out.copy(COL_HEAT_LO).lerp(COL_HEAT_MID, t * 2);
    } else {
      out.copy(COL_HEAT_MID).lerp(COL_HEAT_HI, (t - 0.5) * 2);
    }
    return out;
  }

  syncSiteColors() {
    if (!this.instanceColorAttr) return;
    const colors = this.instanceColorAttr.array;
    const visits = this.walker.getVisitCounts();
    const count = this.size * this.size;
    let maxV = 1;
    if (visits) {
      for (let k = 0; k < count; k++) {
        if (visits[k] > maxV) maxV = visits[k];
      }
    }
    this._maxVisitSmooth = this._maxVisitSmooth * 0.92 + maxV * 0.08;

    const tmp = this._tmpColor;
    for (let k = 0; k < count; k++) {
      if (!this.grid.isOpenIdx(k)) {
        tmp.copy(COL_CLOSED);
      } else {
        const v = visits ? visits[k] : 0;
        this.heatColor(v, this._maxVisitSmooth, tmp);
      }
      colors[k * 3] = tmp.r;
      colors[k * 3 + 1] = tmp.g;
      colors[k * 3 + 2] = tmp.b;
    }
    this.instanceColorAttr.needsUpdate = true;
  }

  syncWalkerMesh() {
    if (!this.walkerMesh) return;
    const [x, , z] = this.worldPos(this.walker.i, this.walker.j, 0);
    this.walkerMesh.position.set(x, BOX_DIMENSION * 1.2, z);
  }

  getStats() {
    const p = this.probabilityThreshold;
    let status = 'exploring';
    if (this.walker.trapped) status = 'trapped';
    else if (p < PC_SITE - 0.04) status = 'localized';
    else if (p > PC_SITE + 0.04) status = 'roaming';
    else status = 'near pc';

    return {
      p,
      pc: PC_SITE,
      unique: this.walker.uniqueCount,
      msd: this.walker.msd,
      steps: this.walker.steps,
      trapped: this.walker.trapped,
      status,
    };
  }

  update(_dt) {
    if (this.autoOscillate) this.updateOscillation();

    for (let s = 0; s < this.stepsPerFrame; s++) {
      this.walker.step(this.grid);
    }
    this.syncSiteColors();
    this.syncWalkerMesh();
  }
}

export { Game, PC_SITE };
