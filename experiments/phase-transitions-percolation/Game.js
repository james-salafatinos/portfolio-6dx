import * as THREE from "three";
import { UnionFind } from "./UnionFind.js";
import { LatticeUndirectedGraphSequential } from "./LatticeUndirectedGraphSequential.js";

// Constants and Magic Numbers
const INIT_SIZE = 100;
const COLOR_STRING_LENGTH = 6;
const COLOR_BASE = 16;
const COLOR_LETTERS = "0123456789ABCDEF";
const SCALE_FACTOR = 0.2;
const BOX_DIMENSION = 0.12;
const EDGE_LINE_COLOR = 0xffffff;

class Game {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.size = INIT_SIZE;
    this.timeElapsed = 0;
    this.oscillationState = 0;
    this.probabilityThreshold = 0.5;
    this.autoOscillate = false; // Default: Oscillation disabled

    this.init();
  }

  setProbabilityThreshold(value) {
    this.probabilityThreshold = value;
  }

  setAutoOscillate(value) {
    this.autoOscillate = value;
  }

  updateOscillation() {
    this.oscillationState += 0.01;
    if (this.oscillationState >= 2 * Math.PI) {
      this.oscillationState = 0;
    }
    this.probabilityThreshold = 0.5 + 0.5 * Math.sin(this.oscillationState);
  }

  init() {
    this.graph = new LatticeUndirectedGraphSequential(this.size, this.size);
    this.uf = new UnionFind(this.size * this.size);
    this.initializeUnionFind();
    this.visualize();
  }

  initializeUnionFind() {
    for (const edge of this.graph.getEdgeList()) {
      this.uf.union(edge.from, edge.to);
    }
    this.rootToColor = this.generateColors();
  }

  getRandomColor() {
    let color = "0x";
    for (let i = 0; i < COLOR_STRING_LENGTH; i++) {
      color += COLOR_LETTERS[Math.floor(Math.random() * COLOR_BASE)];
    }
    return Number(color);
  }

  generateColors(existingRootToColor) {
    const rootToColor = existingRootToColor || new Map();
    for (let i = 0; i < this.uf.parent.length; i++) {
      const root = this.uf.find(i);
      rootToColor.set(root, rootToColor.get(root) || this.getRandomColor());
    }
    return rootToColor;
  }

  mapColors(rootToColor) {
    const colors = new Float32Array(this.graph.size * 3);
    let colorIdx = 0;
    for (let i = 0; i < this.uf.parent.length; i++) {
      const root = this.uf.find(i);
      const colorObject = new THREE.Color(rootToColor.get(root));
      colors.set([colorObject.r, colorObject.g, colorObject.b], colorIdx);
      colorIdx += 3;
    }
    return colors;
  }

  updateOscillation() {
    this.oscillationState += 0.01;
    if (this.oscillationState >= 2 * Math.PI) {
      this.oscillationState = 0;
    }
    this.probabilityThreshold = 0.5 + 0.5 * Math.sin(this.oscillationState);
    // console.log(this.probabilityThreshold);
  }
  generateVertices() {
    const vertices = new Float32Array(this.graph.size * 3);
    let vertexIdx = 0;
    const halfWidth = ((this.size - 1) * SCALE_FACTOR) / 2;
    const halfHeight = ((this.size - 1) * SCALE_FACTOR) / 2;
    for (let i = 0; i < Math.sqrt(this.graph.size); i++) {
      for (let j = 0; j < Math.sqrt(this.graph.size); j++) {
        vertices.set(
          [i * SCALE_FACTOR - halfWidth, 0, j * SCALE_FACTOR - halfHeight],
          vertexIdx
        );
        vertexIdx += 3;
      }
    }
    return vertices;
  }

  generateEdges(vertices) {
    const edges = new Float32Array(this.graph.getEdgeList().length * 6);
    let edgeIdx = 0;
    for (const { from: fromIdx, to: toIdx } of this.graph.getEdgeList()) {
      const [x1, y1, z1] = vertices.slice(fromIdx * 3, fromIdx * 3 + 3);
      const [x2, y2, z2] = vertices.slice(toIdx * 3, toIdx * 3 + 3);
      edges.set([x1, y1, z1, x2, y2, z2], edgeIdx);
      edgeIdx += 6;
    }
    return edges;
  }

  visualize() {
    const vertices = this.generateVertices();
    const edges = this.generateEdges(vertices);
    // const colors = this.generateColors();
    const colors = this.mapColors(this.rootToColor);
    this.createVertexMesh(vertices, colors);
    this.createEdgeLines(edges);
  }

  createVertexMesh(vertices, colors) {
    const geometry = new THREE.InstancedBufferGeometry();

    // Create a BoxBufferGeometry manually
    const baseGeometry = new THREE.BufferGeometry();

    // Define the vertices of the cube
    const positions = new Float32Array([
      -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1,
      -1, 1, 1,
    ]);

    // Define the indices for the faces of the cube
    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2, 4,
      5, 1, 4, 1, 0, 3, 2, 6, 3, 6, 7,
    ]);

    // Scale the vertices to the desired box dimensions
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.applyMatrix4(
      new THREE.Matrix4().makeScale(
        BOX_DIMENSION / 2,
        BOX_DIMENSION / 2,
        BOX_DIMENSION / 2
      )
    );

    // Set the attributes and indices for the geometry
    baseGeometry.setAttribute("position", positionAttribute);
    baseGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Set the attributes for the instanced geometry
    geometry.index = baseGeometry.index;
    geometry.attributes.position = baseGeometry.attributes.position;
    geometry.setAttribute(
      "instancePosition",
      new THREE.InstancedBufferAttribute(vertices, 3)
    );
    geometry.setAttribute(
      "instanceColor",
      new THREE.InstancedBufferAttribute(colors, 3)
    );

    const material = this.createShaderMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
  }

  createEdgeLines(edges) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(edges, 3));
    const material = new THREE.LineBasicMaterial({ color: EDGE_LINE_COLOR });
    const lineSegments = new THREE.LineSegments(geometry, material);
    this.scene.add(lineSegments);
  }

  createShaderMaterial() {
    return new THREE.ShaderMaterial({
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
  }

  addEdgeWithProbability() {
    let edgeAdded = false;
    const addedEdges = this.graph.randomlyAddEdge(this.probabilityThreshold);

    if (addedEdges) {
      edgeAdded = true;
      for (const edge of addedEdges) {
        this.uf.union(edge.from, edge.to);
      }
      this.rootToColor = this.generateColors(this.rootToColor);
    }

    return edgeAdded;
  }

  removeEdgeWithProbability() {
    let edgeRemoved = false;
    const removedEdges = this.graph.randomlyRemoveEdge(
      this.probabilityThreshold
    );

    if (removedEdges) {
      edgeRemoved = true;

      // Reinitialize UnionFind
      this.uf = new UnionFind(this.size * this.size);
      for (const edge of this.graph.getEdgeList()) {
        this.uf.union(edge.from, edge.to);
      }

      // Regenerate Colors
      this.rootToColor = this.generateColors(this.rootToColor);
    }

    return edgeRemoved;
  }

  update(time) {
    this.timeElapsed += time;

    // Apply oscillation if enabled
    if (this.autoOscillate) {
      this.updateOscillation();
    }

    const edgeAdded = this.addEdgeWithProbability();
    const edgeRemoved = this.removeEdgeWithProbability();

    if (edgeAdded || edgeRemoved) {
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
      }
      this.visualize();
    }
  }
}

export { Game };
