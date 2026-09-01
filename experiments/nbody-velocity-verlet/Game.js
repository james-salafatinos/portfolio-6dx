import * as THREE from "three";

class Game {
  constructor(scene) {
    this.scene = scene;
    this.particles = null;
    this.particlePositions = [];
    this.particleVelocities = [];
    this.particleAccelerations = [];
    this.particlePreviousPositions = [];
    this.numParticles = 100;
    this.timeScale = 100000;
    this.dampening = 0.999;
    this.initParticleSpread = 2; // Define the spread of initial particles

    this.createParticles();
  }

  createParticles() {
    // Create an instanced buffer geometry
    const geometry = new THREE.InstancedBufferGeometry();
    const baseGeometry = new THREE.IcosahedronGeometry(0.05, 3); // 0.05 radius and no subdivision

    geometry.index = baseGeometry.index;
    geometry.attributes.position = baseGeometry.attributes.position;
    geometry.attributes.uv = baseGeometry.attributes.uv;

    // Instanced attributes
    const offsets = [];
    const colors = [];

    // Radial initialization of particles
    for (let i = 0; i < this.numParticles; i++) {
      const theta = Math.random() * Math.PI * 2; // Random angle in XY-plane
      const phi = Math.acos(2 * Math.random() - 1); // Random angle from pole to pole
      const radius = Math.random() * this.initParticleSpread; // Random radius within the spread

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      offsets.push(x, y, z);
      colors.push(Math.random(), Math.random(), Math.random());

      this.particlePositions.push(new THREE.Vector3(x, y, z));

      const vx = (Math.random() - 0.5) * 0; // Initial velocity x-component
      const vy = (Math.random() - 0.5) * 0; // Initial velocity y-component
      const vz = (Math.random() - 0.5) * 0; // Initial velocity z-component

      this.particleVelocities.push(new THREE.Vector3(vx, vy, vz)); // Store initial velocity
      this.particlePreviousPositions.push(new THREE.Vector3(x, y, z));
    }
    // Initialize acceleration array
    for (let i = 0; i < this.numParticles; i++) {
      this.particleAccelerations.push(new THREE.Vector3(0, 0, 0));
    }

    // Add instanced attributes to geometry
    geometry.setAttribute(
      "offset",
      new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.InstancedBufferAttribute(new Float32Array(colors), 3)
    );

    const material = new THREE.ShaderMaterial({
      vertexShader: `
            attribute vec3 offset;
            attribute vec3 color;
            varying vec3 vColor;
            void main() {
                vColor = color;
                gl_Position = projectionMatrix * modelViewMatrix * vec4( position + offset, 1.0 );
            }
        `,
      fragmentShader: `
            varying vec3 vColor;
            void main() {
                gl_FragColor = vec4( vColor, 1.0 );
            }
        `,
    });

    this.particles = new THREE.Mesh(geometry, material);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  update() {
    const offsets = this.particles.geometry.attributes.offset.array;

    // ----- 1) Compute current accelerations for all particles
    for (let i = 0; i < this.numParticles; i++) {
      this.particleAccelerations[i].copy(this.computeAcceleration(i));
    }

    // ----- 2) Update positions using half of velocity step + half accel
    for (let i = 0; i < this.numParticles; i++) {
      // x_{t+dt} = x_t + v_t + 0.5 * a_t
      // If you prefer a small dt: x_{t+dt} = x_t + v_t*dt + 0.5*a_t*dt^2
      // but we treat dt=1 for simplicity here.
      this.particlePositions[i]
        .add(this.particleVelocities[i])
        .addScaledVector(this.particleAccelerations[i], 0.5);
    }

    // ----- 3) Re-compute accelerations after moving positions
    //          because we need a_{t+dt}
    const newAccelerations = [];
    for (let i = 0; i < this.numParticles; i++) {
      newAccelerations[i] = this.computeAcceleration(i);
    }

    // ----- 4) Update velocities using average of old and new accelerations
    for (let i = 0; i < this.numParticles; i++) {
      // v_{t+dt} = v_t + 0.5 * (a_t + a_{t+dt})
      this.particleVelocities[i].addScaledVector(
        this.particleAccelerations[i].add(newAccelerations[i]),
        0.5
      );

      // Optionally apply dampening
      this.particleVelocities[i].multiplyScalar(this.dampening);

      // Remember to store newAcceleration back if you need it next frame
      this.particleAccelerations[i].copy(newAccelerations[i]);
    }

    // ----- 5) Update instanced offset attribute
    for (let i = 0; i < this.numParticles; i++) {
      const idx = i * 3;
      offsets[idx] = this.particlePositions[i].x;
      offsets[idx + 1] = this.particlePositions[i].y;
      offsets[idx + 2] = this.particlePositions[i].z;
    }

    this.particles.geometry.attributes.offset.needsUpdate = true;
  }

  computeAcceleration(index) {
    // Reusable vectors
    const forceAccumulator = new THREE.Vector3();
    const r = new THREE.Vector3();

    const position_i = this.particlePositions[index];

    // Sum the forces from all other particles
    for (let j = 0; j < this.numParticles; j++) {
      if (j === index) continue;
      const position_j = this.particlePositions[j];

      r.subVectors(position_j, position_i);

      const distanceSquared = r.lengthSq();
      // Avoid extreme forces at very small distances
      if (distanceSquared < 0.1) continue;

      // Normalized direction / distance^2
      r.normalize().multiplyScalar(1 / distanceSquared);

      forceAccumulator.add(r);
    }

    // Convert force to acceleration by dividing by timeScale
    // (like having mass=1 and dt=1 in the simplest sense)
    forceAccumulator.divideScalar(this.timeScale);

    return forceAccumulator;
  }
}

export { Game };
