import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from '/vendor/lil-gui/lil-gui.esm.js';

const PATCH_LOCAL_NORMAL = new THREE.Vector3(0, 0, 1);
const EPSILON_TIME = 1e-5;
const MAX_HISTORY = 160;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatVector(v) {
  return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}

function smoothStep01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function signedAngleError(a, b) {
  return THREE.MathUtils.radToDeg(a.angleTo(b));
}

class BallState {
  constructor(position, velocity) {
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.radius = 0.075;
  }

  clone() {
    const state = new BallState(this.position, this.velocity);
    state.radius = this.radius;
    return state;
  }
}

class SphereState {
  constructor(radius) {
    this.radius = radius;
    this.quaternion = new THREE.Quaternion();
    this.patchLocalNormal = PATCH_LOCAL_NORMAL.clone();
  }
}

class CollisionPredictor {
  static positionAt(position, velocity, gravity, t) {
    return position.clone()
      .addScaledVector(velocity, t)
      .addScaledVector(gravity, 0.5 * t * t);
  }

  static velocityAt(velocity, gravity, t) {
    return velocity.clone().addScaledVector(gravity, t);
  }

  static surfaceError(position, velocity, gravity, radius, t) {
    return CollisionPredictor.positionAt(position, velocity, gravity, t).lengthSq() - radius * radius;
  }

  static nextCollision(position, velocity, gravity, radius) {
    let lowerT = EPSILON_TIME;
    let lowerF = CollisionPredictor.surfaceError(position, velocity, gravity, radius, lowerT);

    if (lowerF > 0) {
      lowerT = EPSILON_TIME * 100;
      lowerF = CollisionPredictor.surfaceError(position, velocity, gravity, radius, lowerT);
    }

    let upperT = lowerT;
    let upperF = lowerF;
    for (let i = 0; i < 220; i += 1) {
      upperT = upperT * 1.08 + 0.006;
      upperF = CollisionPredictor.surfaceError(position, velocity, gravity, radius, upperT);
      if (lowerF <= 0 && upperF >= 0) break;
      lowerT = upperT;
      lowerF = upperF;
    }

    if (!(lowerF <= 0 && upperF >= 0)) {
      throw new Error('Could not bracket the next wall collision.');
    }

    let lo = lowerT;
    let hi = upperT;
    for (let i = 0; i < 72; i += 1) {
      const mid = 0.5 * (lo + hi);
      const fMid = CollisionPredictor.surfaceError(position, velocity, gravity, radius, mid);
      if (fMid >= 0) hi = mid;
      else lo = mid;
    }

    const time = 0.5 * (lo + hi);
    const point = CollisionPredictor.positionAt(position, velocity, gravity, time);
    const velocityAtImpact = CollisionPredictor.velocityAt(velocity, gravity, time);
    return { time, point, velocityAtImpact };
  }
}

class CollisionResolver {
  static reflect(velocity, collisionPoint, restitution = 1) {
    const outwardNormal = collisionPoint.clone().normalize();
    const normalSpeed = velocity.dot(outwardNormal);
    return velocity.clone().addScaledVector(outwardNormal, -(1 + restitution) * normalSpeed);
  }
}

class SphereOrientationController {
  constructor(sphereState) {
    this.sphereState = sphereState;
    this.plan = null;
  }

  createPlan(targetNormal, flightTime, settings) {
    const startQ = this.sphereState.quaternion.clone();
    const currentPatchNormal = PATCH_LOCAL_NORMAL.clone().applyQuaternion(startQ).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(currentPatchNormal, targetNormal.clone().normalize());
    const targetQ = delta.multiply(startQ).normalize();
    const angle = startQ.angleTo(targetQ);
    const available = Math.max(0, flightTime - settings.settleTime);
    const minTime = settings.mode === 'Ideal kinematic' ? 0 : this.minimumMoveTime(angle, settings.maxAngularVelocity, settings.maxAngularAcceleration);
    const possible = !settings.rotateSphere || settings.mode === 'Ideal kinematic' || minTime <= available + 1e-6;

    this.plan = {
      startQ,
      targetQ,
      angle,
      available,
      minTime,
      flightTime,
      possible,
      rotateSphere: settings.rotateSphere,
      mode: settings.mode,
      maxAngularVelocity: settings.maxAngularVelocity,
      maxAngularAcceleration: settings.maxAngularAcceleration
    };

    return this.plan;
  }

  minimumMoveTime(angle, maxVelocity, maxAcceleration) {
    if (angle <= 1e-8) return 0;
    const accel = Math.max(0.01, maxAcceleration);
    const vmax = Math.max(0.01, maxVelocity);
    const triangularDistance = (vmax * vmax) / accel;
    if (angle <= triangularDistance) return 2 * Math.sqrt(angle / accel);
    return (2 * vmax / accel) + ((angle - triangularDistance) / vmax);
  }

  coveredAngleAt(t, plan) {
    if (plan.angle <= 1e-8) return 0;
    const a = Math.max(0.01, plan.maxAngularAcceleration);
    const vmax = Math.max(0.01, plan.maxAngularVelocity);
    const tAccelToVmax = vmax / a;
    const triangularDistance = (vmax * vmax) / a;

    if (plan.angle <= triangularDistance) {
      const peakTime = Math.sqrt(plan.angle / a);
      const total = 2 * peakTime;
      const x = clamp(t, 0, total);
      if (x <= peakTime) return 0.5 * a * x * x;
      const d = total - x;
      return plan.angle - 0.5 * a * d * d;
    }

    const cruiseDistance = plan.angle - triangularDistance;
    const cruiseTime = cruiseDistance / vmax;
    const total = 2 * tAccelToVmax + cruiseTime;
    const x = clamp(t, 0, total);
    if (x <= tAccelToVmax) return 0.5 * a * x * x;
    if (x <= tAccelToVmax + cruiseTime) return 0.5 * a * tAccelToVmax * tAccelToVmax + vmax * (x - tAccelToVmax);
    const d = total - x;
    return plan.angle - 0.5 * a * d * d;
  }

  orientationAt(elapsed) {
    if (!this.plan || !this.plan.rotateSphere) return this.sphereState.quaternion.clone();
    const plan = this.plan;
    if (plan.angle <= 1e-8) return plan.targetQ.clone();

    if (plan.mode === 'Ideal kinematic') {
      const t = smoothStep01(elapsed / Math.max(0.001, plan.available));
      return plan.startQ.clone().slerp(plan.targetQ, t).normalize();
    }

    const actuatorElapsed = Math.min(elapsed, plan.available);
    const covered = this.coveredAngleAt(actuatorElapsed, plan);
    const fraction = clamp(covered / plan.angle, 0, 1);
    return plan.startQ.clone().slerp(plan.targetQ, fraction).normalize();
  }

  apply(elapsed) {
    this.sphereState.quaternion.copy(this.orientationAt(elapsed));
  }
}

class Simulation {
  constructor() {
    this.settings = {
      playing: true,
      mode: 'Physical actuator',
      gravityMagnitude: 3.2,
      sphereRadius: 2.2,
      initX: 0.35,
      initY: 0.8,
      initZ: -0.45,
      initVx: 1.2,
      initVy: 0.3,
      initVz: 0.65,
      maxAngularVelocity: 7.5,
      maxAngularAcceleration: 32,
      restitution: 1,
      settleTime: 0.15,
      simulationSpeed: 1,
      showTrail: true,
      showPrediction: true,
      showHistory: true,
      rotateSphere: true
    };
    this.sphere = new SphereState(this.settings.sphereRadius);
    this.orientationController = new SphereOrientationController(this.sphere);
    this.history = [];
    this.trajectorySamples = [];
    this.diagnostics = {};
    this.reset('Sideways Launch');
  }

  get gravity() {
    return new THREE.Vector3(0, -this.settings.gravityMagnitude, 0);
  }

  reset(preset = null) {
    if (preset) this.applyPreset(preset);
    this.settings.sphereRadius = Math.max(0.6, this.settings.sphereRadius);
    this.sphere = new SphereState(this.settings.sphereRadius);
    this.orientationController = new SphereOrientationController(this.sphere);
    this.bounceCount = 0;
    this.elapsedInFlight = 0;
    this.history = [];
    this.ball = new BallState(
      new THREE.Vector3(this.settings.initX, this.settings.initY, this.settings.initZ),
      new THREE.Vector3(this.settings.initVx, this.settings.initVy, this.settings.initVz)
    );
    this.clampInitialBall();
    this.flightStartPosition = this.ball.position.clone();
    this.flightStartVelocity = this.ball.velocity.clone();
    this.initialEnergy = this.energyAt(this.ball.position, this.ball.velocity);
    this.scheduleNextCollision();
  }

  applyPreset(name) {
    const r = this.settings.sphereRadius;
    if (name === 'Center Drop') {
      Object.assign(this.settings, { initX: 0, initY: r * 0.72, initZ: 0, initVx: 0, initVy: 0, initVz: 0 });
    } else if (name === 'Off-Center Drop') {
      Object.assign(this.settings, { initX: -r * 0.38, initY: r * 0.52, initZ: r * 0.25, initVx: 0, initVy: 0, initVz: 0 });
    } else if (name === 'Sideways Launch') {
      Object.assign(this.settings, { initX: r * 0.16, initY: r * 0.36, initZ: -r * 0.2, initVx: 1.2, initVy: 0.3, initVz: 0.65 });
    } else if (name === 'Random') {
      this.randomizeInitialState();
    }
  }

  randomizeInitialState() {
    const r = this.settings.sphereRadius * 0.65;
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
    const pos = dir.multiplyScalar(r * Math.cbrt(Math.random()));
    const speed = 0.8 + Math.random() * 2.0;
    const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed);
    Object.assign(this.settings, {
      initX: pos.x,
      initY: pos.y,
      initZ: pos.z,
      initVx: vel.x,
      initVy: vel.y,
      initVz: vel.z
    });
  }

  clampInitialBall() {
    const maxRadius = this.settings.sphereRadius * 0.86;
    if (this.ball.position.length() > maxRadius) this.ball.position.setLength(maxRadius);
  }

  scheduleNextCollision() {
    this.sphere.radius = this.settings.sphereRadius;
    const prediction = CollisionPredictor.nextCollision(
      this.flightStartPosition,
      this.flightStartVelocity,
      this.gravity,
      this.sphere.radius
    );
    this.nextCollisionTime = prediction.time;
    this.nextCollisionPoint = prediction.point;
    this.predictedIncomingVelocity = prediction.velocityAtImpact;
    this.orientationPlan = this.orientationController.createPlan(
      this.nextCollisionPoint.clone().normalize(),
      this.nextCollisionTime,
      this.settings
    );
    this.rebuildTrajectorySamples();
    this.updateDiagnostics();
  }

  rebuildTrajectorySamples() {
    this.trajectorySamples = [];
    const count = 96;
    for (let i = 0; i <= count; i += 1) {
      const t = (i / count) * this.nextCollisionTime;
      this.trajectorySamples.push(CollisionPredictor.positionAt(this.flightStartPosition, this.flightStartVelocity, this.gravity, t));
    }
  }

  update(dt) {
    if (!this.settings.playing) {
      this.orientationController.apply(this.elapsedInFlight);
      this.updateBallFromAnalyticState();
      this.updateDiagnostics();
      return;
    }

    let remaining = Math.min(0.06, dt) * this.settings.simulationSpeed;
    while (remaining > 0) {
      const step = Math.min(remaining, this.nextCollisionTime - this.elapsedInFlight);
      this.elapsedInFlight += step;
      remaining -= step;
      if (this.nextCollisionTime - this.elapsedInFlight <= 1e-7) this.resolveCollision();
    }

    this.orientationController.apply(this.elapsedInFlight);
    this.updateBallFromAnalyticState();
    this.updateDiagnostics();
  }

  updateBallFromAnalyticState() {
    this.ball.position.copy(CollisionPredictor.positionAt(this.flightStartPosition, this.flightStartVelocity, this.gravity, this.elapsedInFlight));
    this.ball.velocity.copy(CollisionPredictor.velocityAt(this.flightStartVelocity, this.gravity, this.elapsedInFlight));
  }

  resolveCollision() {
    const worldImpact = this.nextCollisionPoint.clone().setLength(this.sphere.radius);
    const incoming = this.predictedIncomingVelocity.clone();
    this.orientationController.apply(this.nextCollisionTime);
    const localImpact = worldImpact.clone().applyQuaternion(this.sphere.quaternion.clone().invert()).normalize();
    const patchError = signedAngleError(localImpact, PATCH_LOCAL_NORMAL);
    const predictionError = Math.abs(worldImpact.length() - this.sphere.radius);

    this.history.push({
      point: worldImpact.clone(),
      localImpact,
      patchError,
      predictionError,
      success: this.orientationPlan.possible && patchError < 0.2
    });
    if (this.history.length > MAX_HISTORY) this.history.shift();

    const reflected = CollisionResolver.reflect(incoming, worldImpact, this.settings.restitution);
    this.ball.position.copy(worldImpact);
    this.ball.velocity.copy(reflected);
    this.flightStartPosition = worldImpact;
    this.flightStartVelocity = reflected;
    this.elapsedInFlight = 0;
    this.bounceCount += 1;
    this.scheduleNextCollision();
  }

  stepCollision() {
    this.settings.playing = false;
    this.elapsedInFlight = this.nextCollisionTime;
    this.resolveCollision();
  }

  energyAt(position, velocity) {
    return 0.5 * velocity.lengthSq() + this.settings.gravityMagnitude * position.y;
  }

  updateDiagnostics() {
    const currentEnergy = this.energyAt(this.ball.position, this.ball.velocity);
    const last = this.history[this.history.length - 1];
    const plan = this.orientationPlan;
    const currentPatchWorld = PATCH_LOCAL_NORMAL.clone().applyQuaternion(this.sphere.quaternion).normalize();
    const targetNormal = this.nextCollisionPoint.clone().normalize();
    const currentPatchError = signedAngleError(currentPatchWorld, targetNormal);
    this.diagnostics = {
      bounceCount: this.bounceCount,
      flightTime: this.nextCollisionTime,
      timeToImpact: Math.max(0, this.nextCollisionTime - this.elapsedInFlight),
      nextCollision: this.nextCollisionPoint.clone(),
      requiredRotationDeg: THREE.MathUtils.radToDeg(plan?.angle ?? 0),
      availableRotationTime: plan?.available ?? 0,
      minimumRequiredTime: plan?.minTime ?? 0,
      stoppedBeforeCollision: !!plan?.possible,
      impossible: !!plan && !plan.possible,
      patchErrorAtImpact: last?.patchError ?? 0,
      currentTargetPatchError: currentPatchError,
      energy: currentEnergy,
      energyDrift: currentEnergy - this.initialEnergy,
      collisionPredictionError: last?.predictionError ?? 0,
      localImpactError: last?.patchError ?? 0
    };
  }
}

class Renderer {
  constructor(container, simulation) {
    this.container = container;
    this.simulation = simulation;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08090d);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    this.camera.position.set(4.4, 3.2, 5.8);
    this.clock = new THREE.Clock();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
    this.container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 18;
    this.createSceneObjects();
  }

  createSceneObjects() {
    this.scene.add(new THREE.HemisphereLight(0x9fb7ff, 0x08090d, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 5, 3);
    this.scene.add(key);

    const grid = new THREE.GridHelper(7, 14, 0x263042, 0x151b26);
    grid.position.y = -2.22;
    this.scene.add(grid);

    this.sphereGroup = new THREE.Group();
    this.scene.add(this.sphereGroup);

    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x78a8ff,
        transparent: true,
        opacity: 0.18,
        roughness: 0.18,
        metalness: 0,
        transmission: 0.2,
        depthWrite: false
      })
    );
    this.sphereGroup.add(this.shell);

    this.wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1.002, 28, 14)),
      new THREE.LineBasicMaterial({ color: 0x8bc6ff, transparent: true, opacity: 0.42 })
    );
    this.sphereGroup.add(this.wire);

    this.patch = new THREE.Mesh(
      new THREE.CircleGeometry(0.23, 64),
      new THREE.MeshBasicMaterial({ color: 0xff2f45, side: THREE.DoubleSide, transparent: true, opacity: 0.96 })
    );
    this.patch.position.copy(PATCH_LOCAL_NORMAL);
    this.patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), PATCH_LOCAL_NORMAL);
    this.sphereGroup.add(this.patch);

    this.axisGroup = new THREE.Group();
    this.axisGroup.add(this.makeAxis(0xff5a5a, new THREE.Vector3(1, 0, 0)));
    this.axisGroup.add(this.makeAxis(0x7cff8a, new THREE.Vector3(0, 1, 0)));
    this.axisGroup.add(this.makeAxis(0x6ca8ff, new THREE.Vector3(0, 0, 1)));
    this.axisGroup.scale.setScalar(0.45);
    this.sphereGroup.add(this.axisGroup);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0xfff3a8, emissive: 0x3a2600, roughness: 0.35 })
    );
    this.scene.add(this.ball);

    this.impactMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 18, 10),
      new THREE.MeshBasicMaterial({ color: 0x40f7ff })
    );
    this.scene.add(this.impactMarker);

    this.ghostPatch = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
    );
    this.scene.add(this.ghostPatch);

    this.centerLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffe66d, transparent: true, opacity: 0.75 })
    );
    this.scene.add(this.centerLine);

    this.trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x70d8ff, transparent: true, opacity: 0.8 })
    );
    this.scene.add(this.trail);

    this.historyGroup = new THREE.Group();
    this.scene.add(this.historyGroup);
  }

  makeAxis(color, direction) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color });
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.58, 8), material);
    cylinder.position.y = 0.29;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 12), material);
    cone.position.y = 0.64;
    group.add(cylinder, cone);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    return group;
  }

  update() {
    const dt = this.clock.getDelta();
    this.simulation.update(dt);
    const radius = this.simulation.sphere.radius;
    this.sphereGroup.scale.setScalar(radius);
    this.sphereGroup.quaternion.copy(this.simulation.sphere.quaternion);
    this.patch.scale.setScalar(Math.max(0.7, radius * 0.32));
    this.patch.position.copy(PATCH_LOCAL_NORMAL.clone().multiplyScalar(1.004));
    this.ball.scale.setScalar(this.simulation.ball.radius);
    this.ball.position.copy(this.simulation.ball.position);

    this.impactMarker.visible = this.simulation.settings.showPrediction;
    this.ghostPatch.visible = this.simulation.settings.showPrediction;
    this.centerLine.visible = this.simulation.settings.showPrediction;
    this.impactMarker.material.color.set(this.simulation.diagnostics.impossible ? 0xff2438 : 0x40f7ff);
    this.impactMarker.position.copy(this.simulation.nextCollisionPoint);
    this.ghostPatch.position.copy(this.simulation.nextCollisionPoint.clone().multiplyScalar(1.002));
    this.ghostPatch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.simulation.nextCollisionPoint.clone().normalize());
    this.updateLine(this.centerLine, [new THREE.Vector3(), this.simulation.nextCollisionPoint]);
    this.updateLine(this.trail, this.simulation.trajectorySamples);
    this.trail.visible = this.simulation.settings.showTrail;
    this.syncHistory();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateLine(line, points) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  syncHistory() {
    this.historyGroup.visible = this.simulation.settings.showHistory;
    while (this.historyGroup.children.length < this.simulation.history.length) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      this.historyGroup.add(dot);
    }
    while (this.historyGroup.children.length > this.simulation.history.length) {
      const child = this.historyGroup.children.pop();
      child.geometry.dispose();
      child.material.dispose();
    }
    this.simulation.history.forEach((hit, index) => {
      const dot = this.historyGroup.children[index];
      dot.position.copy(hit.point);
      dot.material.color.set(hit.success ? 0x9dffb0 : 0xff4050);
    });
  }

  resize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    this.controls.dispose();
    this.renderer.dispose();
  }
}

class Diagnostics {
  constructor(container, simulation) {
    this.simulation = simulation;
    this.el = document.createElement('div');
    this.el.className = 'patch-diagnostics';
    container.appendChild(this.el);
  }

  update() {
    const d = this.simulation.diagnostics;
    this.el.innerHTML = `
      <strong>${d.impossible ? 'INTERCEPTION IMPOSSIBLE' : 'Patch interception scheduled'}</strong>
      <span>Bounce #: ${d.bounceCount}</span>
      <span>Flight time: ${d.flightTime.toFixed(3)} s</span>
      <span>Time to impact: ${d.timeToImpact.toFixed(3)} s</span>
      <span>Next collision: ${formatVector(d.nextCollision)}</span>
      <span>Required sphere rotation: ${d.requiredRotationDeg.toFixed(2)} deg</span>
      <span>Available rotation time: ${d.availableRotationTime.toFixed(3)} s</span>
      <span>Minimum required time: ${d.minimumRequiredTime.toFixed(3)} s</span>
      <span>Sphere stopped before collision: ${d.stoppedBeforeCollision ? 'YES' : 'NO'}</span>
      <span>Patch error at impact: ${d.patchErrorAtImpact.toFixed(4)} deg</span>
      <span>Live patch-to-target error: ${d.currentTargetPatchError.toFixed(3)} deg</span>
      <span>Ball energy: ${d.energy.toFixed(6)}</span>
      <span>Energy change from reset: ${d.energyDrift.toExponential(2)}</span>
      <span>Collision prediction error: ${d.collisionPredictionError.toExponential(2)}</span>
      <span>Patch-coordinate collision error: ${d.localImpactError.toFixed(4)} deg</span>
    `;
  }
}

class ControlGUI {
  constructor(simulation) {
    this.simulation = simulation;
    this.controllers = [];
    this.gui = new GUI({ title: 'Elastic patch sphere' });
    this.gui.domElement.classList.add('patch-gui');
    this.build();
  }

  track(controller) {
    this.controllers.push(controller);
    return controller;
  }

  resetWithRefresh(preset = null) {
    this.simulation.reset(preset);
    this.controllers.forEach((controller) => controller.updateDisplay());
  }

  build() {
    const s = this.simulation.settings;
    const reset = () => this.resetWithRefresh();
    this.track(this.gui.add(s, 'playing').name('Play / pause'));
    this.gui.add({ reset: () => this.resetWithRefresh() }, 'reset').name('Reset');
    this.gui.add({ step: () => this.simulation.stepCollision() }, 'step').name('Single-step collision');
    this.track(this.gui.add(s, 'mode', ['Ideal kinematic', 'Physical actuator']).name('Mode').onChange(reset));
    this.track(this.gui.add(s, 'gravityMagnitude', 0.05, 12, 0.05).name('Gravity').onChange(reset));
    this.track(this.gui.add(s, 'sphereRadius', 0.8, 4.5, 0.05).name('Sphere radius').onFinishChange(reset));
    const initial = this.gui.addFolder('Initial state');
    this.track(initial.add(s, 'initX', -3, 3, 0.01).name('Ball X').onFinishChange(reset));
    this.track(initial.add(s, 'initY', -3, 3, 0.01).name('Ball Y').onFinishChange(reset));
    this.track(initial.add(s, 'initZ', -3, 3, 0.01).name('Ball Z').onFinishChange(reset));
    this.track(initial.add(s, 'initVx', -4, 4, 0.01).name('Velocity X').onFinishChange(reset));
    this.track(initial.add(s, 'initVy', -4, 4, 0.01).name('Velocity Y').onFinishChange(reset));
    this.track(initial.add(s, 'initVz', -4, 4, 0.01).name('Velocity Z').onFinishChange(reset));
    initial.add({ randomize: () => this.resetWithRefresh('Random') }, 'randomize').name('Randomize initial state');
    const presets = { 'Center Drop': () => this.resetWithRefresh('Center Drop'), 'Off-Center Drop': () => this.resetWithRefresh('Off-Center Drop'), 'Sideways Launch': () => this.resetWithRefresh('Sideways Launch'), Random: () => this.resetWithRefresh('Random') };
    const presetFolder = this.gui.addFolder('Presets');
    Object.entries(presets).forEach(([name, action]) => presetFolder.add({ action }, 'action').name(name));
    const actuator = this.gui.addFolder('Actuator');
    this.track(actuator.add(s, 'maxAngularVelocity', 0.1, 30, 0.1).name('Max angular velocity').onChange(reset));
    this.track(actuator.add(s, 'maxAngularAcceleration', 0.5, 120, 0.5).name('Max angular acceleration').onChange(reset));
    this.track(actuator.add(s, 'settleTime', 0, 0.7, 0.01).name('Settle time').onChange(reset));
    const physics = this.gui.addFolder('Physics');
    this.track(physics.add(s, 'restitution', 0.05, 1, 0.01).name('Restitution'));
    this.track(this.gui.add(s, 'simulationSpeed', 0.05, 4, 0.05).name('Simulation speed'));
    const view = this.gui.addFolder('View');
    this.track(view.add(s, 'showTrail').name('Trajectory trail'));
    this.track(view.add(s, 'showPrediction').name('Predicted collision'));
    this.track(view.add(s, 'showHistory').name('Historical impact points'));
    this.track(view.add(s, 'rotateSphere').name('Sphere rotation').onChange(reset));
  }

  destroy() {
    this.gui.destroy();
  }
}

export default class Experiment {
  constructor(container) {
    this.container = container;
  }

  async start() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.classList.add('elastic-patch-sphere');
    this.injectStyles();
    this.simulation = new Simulation();
    this.renderer = new Renderer(this.container, this.simulation);
    this.diagnostics = new Diagnostics(this.container, this.simulation);
    this.gui = new ControlGUI(this.simulation);
    this.renderer.renderer.setAnimationLoop(() => {
      this.renderer.update();
      this.diagnostics.update();
    });
  }

  injectStyles() {
    this.style = document.createElement('style');
    this.style.textContent = `
      .elastic-patch-sphere { overflow: hidden; background: #08090d; }
      .patch-diagnostics {
        position: absolute;
        left: 12px;
        bottom: 12px;
        display: grid;
        gap: 3px;
        max-width: min(390px, calc(100% - 24px));
        padding: 10px 12px;
        border: 1px solid rgba(160, 190, 255, 0.22);
        border-radius: 8px;
        background: rgba(7, 10, 16, 0.72);
        color: #dbe7ff;
        font: 12px/1.35 ui-monospace, SFMono-Regular, Consolas, monospace;
        pointer-events: none;
      }
      .patch-diagnostics strong { color: #ffffff; font-size: 13px; }
      .patch-gui { position: absolute; right: 10px; top: 10px; }
      @media (max-width: 760px) {
        .patch-diagnostics { font-size: 10px; max-height: 38%; overflow: hidden; }
        .patch-gui { transform: scale(0.84); transform-origin: top right; }
      }
    `;
    document.head.appendChild(this.style);
  }

  resize(width, height) {
    this.renderer?.resize(width, height);
  }

  destroy() {
    this.renderer?.renderer.setAnimationLoop(null);
    this.gui?.destroy();
    this.renderer?.destroy();
    this.style?.remove();
    this.container.replaceChildren();
  }
}
