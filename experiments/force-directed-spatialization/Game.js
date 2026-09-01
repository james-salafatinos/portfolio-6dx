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
    this.dampening = 0.95;
    this.initParticleSpread = 2.5;
    this.particleRadius = 0.05;
    this.cubeSize = 5;

    // ---------------------------------------------
    //  A) Add user-tweakable parameters:
    // ---------------------------------------------

    this.repulsionStrength = -.21; // For particle-particle repulsion
    this.attractionStrength = 0.58; // For spring attraction along edges
    this.wallRepulsionStrength = .01; // Repulsion from walls


    this.createParticles();
    this.createBoundingBox();

  }

  setRepulsionStrength(value) {
    this.repulsionStrength = value;
  }
  setAttractionStrength(value) {
    this.attractionStrength = value;
  }
  setWallRepulsionStrength(value) {
    this.wallRepulsionStrength = value;
  }

  createParticles() {
    const geometry = new THREE.InstancedBufferGeometry();
    const baseGeometry = new THREE.IcosahedronGeometry(this.particleRadius, 3);
    geometry.index = baseGeometry.index;
    geometry.attributes.position = baseGeometry.attributes.position;
    geometry.attributes.uv = baseGeometry.attributes.uv;

    const offsets = [];
    const colors = [];

    for (let i = 0; i < this.numParticles; i++) {
      // Random spherical placement:
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = Math.random() * this.initParticleSpread;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      offsets.push(x, y, z);
      colors.push(Math.random(), Math.random(), Math.random());

      this.particlePositions.push(new THREE.Vector3(x, y, z));
      this.particleVelocities.push(new THREE.Vector3(0, 0, 0));
      this.particlePreviousPositions.push(new THREE.Vector3(x, y, z));
    }

    for (let i = 0; i < this.numParticles; i++) {
      this.particleAccelerations.push(new THREE.Vector3(0, 0, 0));
    }

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
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position + offset, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
    });

    this.particles = new THREE.Mesh(geometry, material);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  createBoundingBox() {
    const boxGeometry = new THREE.BoxGeometry(
      this.cubeSize,
      this.cubeSize,
      this.cubeSize
    );
    const edges = new THREE.EdgesGeometry(boxGeometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    this.scene.add(line);
  }


  // ---------------------------------------------------------
  // D) Update loop (modified to update edges & forces)
  // ---------------------------------------------------------
  update() {
    const offsets = this.particles.geometry.attributes.offset.array;

    // 1) Handle collisions among particles
    this.handleParticleCollisions();

    // 2) Compute old accelerations
    for (let i = 0; i < this.numParticles; i++) {
      this.particleAccelerations[i].copy(this.computeAcceleration(i));
    }

    // 3) Update positions
    for (let i = 0; i < this.numParticles; i++) {
      const oldVel = this.particleVelocities[i].clone();
      oldVel.addScaledVector(this.particleAccelerations[i], 0.5);
      this.particlePositions[i].add(oldVel);

      // Hard-collision with walls if you want to keep it:
      this.handleCollision(i);
    }

    // 4) Recompute accelerations after positions updated
    const newAccelerations = [];
    for (let i = 0; i < this.numParticles; i++) {
      newAccelerations[i] = this.computeAcceleration(i);
    }

    // 5) Update velocities
    for (let i = 0; i < this.numParticles; i++) {
      const avgAccel = this.particleAccelerations[i]
        .clone()
        .add(newAccelerations[i])
        .multiplyScalar(0.5);

      this.particleVelocities[i].add(avgAccel);
      this.particleVelocities[i].multiplyScalar(this.dampening);

      // store for next frame
      this.particleAccelerations[i].copy(newAccelerations[i]);
    }

    // 6) Update the offset attribute for instanced geometry
    for (let i = 0; i < this.numParticles; i++) {
      const idx = i * 3;
      offsets[idx] = this.particlePositions[i].x;
      offsets[idx + 1] = this.particlePositions[i].y;
      offsets[idx + 2] = this.particlePositions[i].z;
    }
    this.particles.geometry.attributes.offset.needsUpdate = true;


  }

  // ---------------------------------------------------------
  // E) Compute total acceleration on particle i
  //    (including repulsion, attraction, and wall repulsion)
  // ---------------------------------------------------------
  computeAcceleration(index) {
    const forceAccumulator = new THREE.Vector3();
    const position_i = this.particlePositions[index];

    // 1) Repulsion from other particles
    for (let j = 0; j < this.numParticles; j++) {
      if (j === index) continue;

      const r_ij = new THREE.Vector3().subVectors(
        this.particlePositions[j],
        position_i
      );
      const distSq = r_ij.lengthSq();

      if (distSq < 0.0001) continue; // avoid singularities
      // Repulsive force ~ (repulsionStrength / dist^2)
      // direction = r_ij normalized, magnitude = 1/dist^2
      r_ij.normalize().multiplyScalar(this.repulsionStrength / distSq);
      forceAccumulator.add(r_ij);
    }

    // 2) Attraction along edges (like a spring)
    //    For each edge i-j, we pull them together
    for (let j = 0; j < this.numParticles; j++) {

      const delta = new THREE.Vector3().subVectors(
        this.particlePositions[j],
        position_i
      );
      const dist = delta.length();
      if (dist < 0.0001) continue;

      // Spring-like force: F = -k * (dist - rest_length) * direction
      // For simplicity, assume rest_length=0 => F ~ -k * dist
      // => direction = delta.normalized(), magnitude = dist
      delta.normalize();
      const k = this.attractionStrength; // "spring constant"
      // We'll just do a simple linear: F = k * dist
      delta.multiplyScalar(k * dist);

      // We want to pull *towards* j, so we add +delta
      forceAccumulator.add(delta);
    }

    // 3) Repulsion from walls (soft boundary)
    //    Think of the walls as big "charges" that repel the particles
    const halfSize = this.cubeSize / 2;
    // x-direction walls
    let distToWall = halfSize - Math.abs(position_i.x);
    if (distToWall < 0.0001) distToWall = 0.0001;
    // If close to +x wall
    if (position_i.x > 0) {
      // direction points negative x
      const strength =
        this.wallRepulsionStrength / (distToWall * distToWall);
      forceAccumulator.x -= strength;
    } else {
      // close to -x wall: direction is positive x
      const strength =
        this.wallRepulsionStrength / (distToWall * distToWall);
      forceAccumulator.x += strength;
    }
    // y-direction walls
    let distToYWall = halfSize - Math.abs(position_i.y);
    if (distToYWall < 0.0001) distToYWall = 0.0001;
    if (position_i.y > 0) {
      const strength =
        this.wallRepulsionStrength / (distToYWall * distToYWall);
      forceAccumulator.y -= strength;
    } else {
      const strength =
        this.wallRepulsionStrength / (distToYWall * distToYWall);
      forceAccumulator.y += strength;
    }
    // z-direction walls
    let distToZWall = halfSize - Math.abs(position_i.z);
    if (distToZWall < 0.0001) distToZWall = 0.0001;
    if (position_i.z > 0) {
      const strength =
        this.wallRepulsionStrength / (distToZWall * distToZWall);
      forceAccumulator.z -= strength;
    } else {
      const strength =
        this.wallRepulsionStrength / (distToZWall * distToZWall);
      forceAccumulator.z += strength;
    }

    // 4) Convert total force => acceleration
    //    "timeScale" is effectively scaling for your simulation
    forceAccumulator.divideScalar(this.timeScale);

    return forceAccumulator;
  }

  // -------------------------------------------------
  // Collision handling (unchanged from your code)
  // -------------------------------------------------
  handleCollision(i) {
    const halfSize = this.cubeSize / 2;
    const particle = this.particlePositions[i];
    const velocity = this.particleVelocities[i];

    // Hard collisions if you want to keep them
    if (particle.x > halfSize) {
      particle.x = halfSize;
      velocity.x = -Math.abs(velocity.x);
    } else if (particle.x < -halfSize) {
      particle.x = -halfSize;
      velocity.x = Math.abs(velocity.x);
    }
    if (particle.y > halfSize) {
      particle.y = halfSize;
      velocity.y = -Math.abs(velocity.y);
    } else if (particle.y < -halfSize) {
      particle.y = -halfSize;
      velocity.y = Math.abs(velocity.y);
    }
    if (particle.z > halfSize) {
      particle.z = halfSize;
      velocity.z = -Math.abs(velocity.z);
    } else if (particle.z < -halfSize) {
      particle.z = -halfSize;
      velocity.z = Math.abs(velocity.z);
    }
  }

  handleParticleCollisions() {
    // unchanged from your code
    const collisionNormal = new THREE.Vector3();
    const relativeVelocity = new THREE.Vector3();
    const e = 0.8;

    for (let i = 0; i < this.numParticles; i++) {
      for (let j = i + 1; j < this.numParticles; j++) {
        const p1 = this.particlePositions[i];
        const p2 = this.particlePositions[j];

        collisionNormal.subVectors(p2, p1);
        const distance = collisionNormal.length();

        if (distance < 2 * this.particleRadius) {
          collisionNormal.normalize();
          relativeVelocity.subVectors(
            this.particleVelocities[j],
            this.particleVelocities[i]
          );
          const velocityAlongNormal = relativeVelocity.dot(collisionNormal);

          if (velocityAlongNormal < 0) {
            const impulseMagnitude = -((1 + e) * velocityAlongNormal) / 2;
            const impulse = collisionNormal
              .clone()
              .multiplyScalar(impulseMagnitude);
            this.particleVelocities[i].add(impulse.clone().multiplyScalar(-1));
            this.particleVelocities[j].add(impulse);

            const overlap = 2 * this.particleRadius - distance;
            const separation = overlap * 0.51;
            p1.sub(collisionNormal.clone().multiplyScalar(separation));
            p2.add(collisionNormal.clone().multiplyScalar(separation));
          }
        }
      }
    }
  }
}

export { Game };
