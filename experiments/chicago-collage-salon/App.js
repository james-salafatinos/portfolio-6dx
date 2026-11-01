import * as THREE from '/vendor/three/build/three.module.js';
import { ARTWORKS, SOURCE_PAGE } from './Artworks.js';

const STYLE_ID = 'chicago-collage-salon-styles';
const LAYOUTS = ['salon', 'spiral', 'globe', 'ribbon'];
const CARD_WIDTH = 240;
const CARD_HEIGHT = 320;
const ATLAS_COLUMNS = 20;
const ATLAS_ROWS = Math.ceil(ARTWORKS.length / ATLAS_COLUMNS);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutQuart = (value) => 1 - Math.pow(1 - value, 4);

function target(position, scale = 1) {
  return { position, scale };
}

export default class ChicagoCollageSalon {
  constructor(container) {
    this.container = container;
    this.cards = ARTWORKS.map((artwork, index) => ({ artwork, index, position: new THREE.Vector3(), scale: 1 }));
    this.layout = 'salon';
    this.transition = null;
    this.pointers = new Map();
    this.drag = null;
    this.pinchDistance = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.distance = 9000;
    this.distanceGoal = 9000;
    this.cameraTarget = new THREE.Vector3();
    this.cameraTargetGoal = new THREE.Vector3();
    this.drift = false;
    this.lastDrift = performance.now();
    this.selected = null;
    this.dead = false;
    this.raf = 0;
    this.handlers = {};
  }

  start() {
    this.installStyles();
    this.renderShell();
    this.setupScene();
    this.createGalleryMesh();
    this.bind();
    this.resize(this.container.clientWidth, this.container.clientHeight);
    this.setLayout('salon', true);
    this.raf = requestAnimationFrame((time) => this.update(time));
  }

  installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = '/experiments/chicago-collage-salon/styles.css';
    document.head.appendChild(link);
  }

  renderShell() {
    this.container.innerHTML = `
      <main class="ccs-root" aria-label="Interactive three-dimensional collage exhibition">
        <div class="ccs-webgl" aria-label="Spatial gallery of ${ARTWORKS.length} collage works"></div>
        <div class="ccs-vignette" aria-hidden="true"></div>
        <header class="ccs-masthead">
          <span class="ccs-kicker">Digital salon / 2026</span>
          <div class="ccs-title"><strong>Chicago Collage Salon</strong><span>${ARTWORKS.length} works · one rearrangeable room</span></div>
          <a class="ccs-source" href="${SOURCE_PAGE}" target="_blank" rel="noopener noreferrer">Source ↗</a>
        </header>
        <nav class="ccs-layouts" aria-label="Exhibition arrangements and camera controls">
          <span>Rearrange room</span>
          ${LAYOUTS.map((name, index) => `<button type="button" data-layout="${name}" data-key="${index + 1}">${name}</button>`).join('')}
          <hr>
          <span>Move through it</span>
          <button type="button" data-camera="overview">All works</button>
          <button type="button" data-camera="closer">Closer +</button>
          <button type="button" data-camera="farther">Further −</button>
        </nav>
        <figure class="ccs-focus-card" aria-hidden="true">
          <div class="ccs-focus-image"><img alt=""></div>
          <figcaption><strong></strong><small></small></figcaption>
        </figure>
        <aside class="ccs-inspector" aria-label="Selected artwork plaque" aria-hidden="true">
          <button class="ccs-close" type="button" aria-label="Return to all works">×</button>
          <p class="ccs-inspector-eyebrow"></p>
          <h2></h2>
          <dl><div><dt>Work</dt><dd data-field="number"></dd></div><div><dt>Original</dt><dd data-field="dimensions"></dd></div></dl>
          <div class="ccs-inspector-actions">
            <button type="button" data-step="-1">← Previous</button>
            <button type="button" data-camera="overview">All works</button>
            <button type="button" data-step="1">Next →</button>
            <a target="_blank" rel="noopener noreferrer">Original ↗</a>
          </div>
        </aside>
        <footer class="ccs-footer">
          <div class="ccs-status" aria-live="polite"><b>Salon</b> arrangement · ${ARTWORKS.length} works</div>
          <button class="ccs-drift" type="button" aria-pressed="false">Drift: off</button>
          <div class="ccs-hint">Drag to orbit · scroll/pinch to zoom · select a work to inspect</div>
        </footer>
      </main>`;

    this.root = this.container.querySelector('.ccs-root');
    this.webglStage = this.container.querySelector('.ccs-webgl');
    this.focusCard = this.container.querySelector('.ccs-focus-card');
    this.inspector = this.container.querySelector('.ccs-inspector');
    this.status = this.container.querySelector('.ccs-status');
    this.driftButton = this.container.querySelector('.ccs-drift');
  }

  setupScene() {
    this.camera = new THREE.PerspectiveCamera(43, 1, 1, 40000);
    this.camera.position.set(0, 0, this.distance);
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.webglStage.appendChild(this.renderer.domElement);

    const positions = [];
    for (let index = 0; index < 900; index += 1) {
      const angle = index * 2.399963;
      const radius = 700 + ((index * 83) % 3100);
      positions.push(Math.cos(angle) * radius, (((index * 47) % 2600) - 1300), Math.sin(angle) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd8ff3e, size: 4, transparent: true, opacity: .25, sizeAttenuation: true }));
    this.scene.add(this.dust);

    const ringGeometry = new THREE.TorusGeometry(1220, 2, 5, 160);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff4d8f, transparent: true, opacity: .18, wireframe: true });
    this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
    this.ring.rotation.x = Math.PI * .5;
    this.scene.add(this.ring);
  }

  createGalleryMesh() {
    const base = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    geometry.instanceCount = this.cards.length;
    this.positionData = new Float32Array(this.cards.length * 3);
    this.scaleData = new Float32Array(this.cards.length);
    const uvData = new Float32Array(this.cards.length * 4);
    const focusData = new Float32Array(this.cards.length);
    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positionData, 3);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.scaleData, 1);
    this.focusAttribute = new THREE.InstancedBufferAttribute(focusData, 1);
    geometry.setAttribute('instancePosition', this.positionAttribute);
    geometry.setAttribute('instanceScale', this.scaleAttribute);
    geometry.setAttribute('instanceUv', new THREE.InstancedBufferAttribute(uvData, 4));
    geometry.setAttribute('instanceFocus', this.focusAttribute);

    this.cards.forEach((card, index) => {
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      uvData[index * 4] = column / ATLAS_COLUMNS;
      uvData[index * 4 + 1] = 1 - ((row + 1) / ATLAS_ROWS);
      uvData[index * 4 + 2] = 1 / ATLAS_COLUMNS;
      uvData[index * 4 + 3] = 1 / ATLAS_ROWS;
    });

    const placeholder = new THREE.DataTexture(new Uint8Array([28, 27, 25, 255]), 1, 1);
    placeholder.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: placeholder } },
      vertexShader: `
        attribute vec3 instancePosition;
        attribute float instanceScale;
        attribute vec4 instanceUv;
        attribute float instanceFocus;
        varying vec2 vAtlasUv;
        varying vec2 vCardUv;
        varying float vFocus;
        void main() {
          vAtlasUv = instanceUv.xy + uv * instanceUv.zw;
          vCardUv = uv;
          vFocus = instanceFocus;
          vec4 center = modelViewMatrix * vec4(instancePosition, 1.0);
          vec3 billboardPosition = center.xyz + vec3(position.xy * instanceScale, 0.0);
          gl_Position = projectionMatrix * vec4(billboardPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D atlas;
        varying vec2 vAtlasUv;
        varying vec2 vCardUv;
        varying float vFocus;
        void main() {
          vec4 color = texture2D(atlas, vAtlasUv);
          float edge = step(vCardUv.x, .018) + step(1.0 - vCardUv.x, .018) + step(vCardUv.y, .014) + step(1.0 - vCardUv.y, .014);
          if (vFocus > .5 && edge > 0.0) color = vec4(.847, 1.0, .243, 1.0);
          gl_FragColor = color;
        }
      `,
    });
    this.galleryGeometry = geometry;
    this.galleryMaterial = material;
    this.galleryMesh = new THREE.Mesh(geometry, material);
    this.galleryMesh.frustumCulled = false;
    this.scene.add(this.galleryMesh);
    base.dispose();

    new THREE.TextureLoader().load(
      '/experiments/chicago-collage-salon/images/chicago-collage-atlas.jpg',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        this.galleryMaterial.uniforms.atlas.value.dispose();
        this.galleryMaterial.uniforms.atlas.value = texture;
      },
      undefined,
      () => { this.status.innerHTML = '<b>Atlas unavailable</b> · reload to retry'; },
    );
  }

  targetsFor(name) {
    const count = this.cards.length;
    return this.cards.map((_, index) => {
      if (name === 'salon') {
        const columns = this.compact ? 10 : 20;
        const rows = Math.ceil(count / columns);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const spacingX = this.compact ? 260 : 272;
        const spacingY = this.compact ? 340 : 350;
        const x = (column - (columns - 1) / 2) * spacingX + (row % 2 ? 28 : -14);
        const y = ((rows - 1) / 2 - row) * spacingY;
        const z = ((index * 37) % 180) - 90;
        return target(new THREE.Vector3(x, y, z), this.compact ? .74 : .86);
      }
      if (name === 'spiral') {
        const angle = index * .29 + .2;
        const radiusX = this.compact ? 1100 : 3000;
        const radiusZ = this.compact ? 2500 : 3000;
        return target(new THREE.Vector3(Math.sin(angle) * radiusX, (index - (count - 1) / 2) * 28, Math.cos(angle) * radiusZ), .72);
      }
      if (name === 'globe') {
        const phi = Math.acos(-1 + (2 * index) / (count - 1));
        const theta = Math.sqrt(count * Math.PI) * phi;
        const radius = 4200;
        const xScale = this.compact ? .43 : 1;
        return target(new THREE.Vector3(radius * xScale * Math.cos(theta) * Math.sin(phi), radius * Math.sin(theta) * Math.sin(phi), radius * .78 * Math.cos(phi)), .64);
      }
      const bands = 5;
      const band = index % bands;
      const station = Math.floor(index / bands);
      const stations = Math.ceil(count / bands);
      const progress = station / Math.max(1, stations - 1);
      const spanX = this.compact ? 3400 : 12000;
      const waveY = this.compact ? 2600 : 2100;
      return target(new THREE.Vector3(
        (progress - .5) * spanX,
        Math.sin(progress * Math.PI * 3.2) * waveY + (band - 2) * (this.compact ? 230 : 280),
        Math.cos(progress * Math.PI * 4.4) * (this.compact ? 1200 : 1700) + (band - 2) * 70,
      ), .64);
    });
  }

  layoutDistance(name) {
    if (this.compact) return { salon: 16500, spiral: 16500, globe: 13500, ribbon: 12500 }[name];
    return { salon: 9000, spiral: 13500, globe: 10500, ribbon: 10800 }[name];
  }

  setLayout(name, immediate = false) {
    if (!LAYOUTS.includes(name)) return;
    this.layout = name;
    this.leaveInspection(false);
    this.cameraTargetGoal.set(0, 0, 0);
    this.distanceGoal = this.layoutDistance(name);
    const targets = this.targetsFor(name);
    const startTime = performance.now();
    if (immediate) {
      this.cards.forEach((card, index) => {
        card.position.copy(targets[index].position);
        card.scale = targets[index].scale;
      });
      this.transition = null;
      this.syncInstances();
    } else {
      this.transition = this.cards.map((card, index) => ({
        card,
        fromPosition: card.position.clone(),
        fromScale: card.scale,
        to: targets[index],
        start: startTime + ((index * 11) % this.cards.length) * 10,
        duration: 950 + (index % 6) * 75,
      }));
    }
    this.container.querySelectorAll('[data-layout]').forEach((button) => button.classList.toggle('is-active', button.dataset.layout === name));
    this.status.innerHTML = `<b>${name[0].toUpperCase()}${name.slice(1)}</b> arrangement · ${ARTWORKS.length} works`;
    this.lastDrift = startTime;
  }

  syncInstances() {
    this.cards.forEach((card, index) => {
      this.positionData[index * 3] = card.position.x;
      this.positionData[index * 3 + 1] = card.position.y;
      this.positionData[index * 3 + 2] = card.position.z;
      this.scaleData[index] = card.scale;
      this.focusAttribute.array[index] = this.selected?.index === index ? 1 : 0;
    });
    this.positionAttribute.needsUpdate = true;
    this.scaleAttribute.needsUpdate = true;
    this.focusAttribute.needsUpdate = true;
  }

  selectArtwork(card) {
    this.selected = card;
    const { artwork } = card;
    this.cameraTargetGoal.copy(card.position);
    this.distanceGoal = this.compact ? 820 : 670;
    this.yaw = 0;
    this.pitch = 0;
    const focusImage = this.focusCard.querySelector('img');
    focusImage.src = artwork.file;
    focusImage.alt = `Collage work by ${artwork.artist}`;
    this.focusCard.querySelector('strong').textContent = artwork.artist;
    this.focusCard.querySelector('small').textContent = `${String(artwork.index + 1).padStart(3, '0')} / ${ARTWORKS.length} · ${artwork.width} × ${artwork.height}`;
    this.focusCard.classList.add('is-open');
    this.focusCard.setAttribute('aria-hidden', 'false');
    this.inspector.querySelector('.ccs-inspector-eyebrow').textContent = artwork.collection;
    this.inspector.querySelector('h2').textContent = artwork.artist;
    this.inspector.querySelector('[data-field="number"]').textContent = `${String(artwork.index + 1).padStart(3, '0')} / ${ARTWORKS.length}`;
    this.inspector.querySelector('[data-field="dimensions"]').textContent = `${artwork.width} × ${artwork.height}px`;
    this.inspector.querySelector('a').href = artwork.source;
    this.inspector.classList.add('is-open');
    this.inspector.setAttribute('aria-hidden', 'false');
    this.status.innerHTML = `<b>Inspecting ${String(artwork.index + 1).padStart(3, '0')}</b> · ${artwork.artist} · scroll to move closer`;
    this.syncInstances();
  }

  stepArtwork(delta) {
    const current = this.selected?.index ?? (delta > 0 ? -1 : 0);
    this.selectArtwork(this.cards[(current + delta + this.cards.length) % this.cards.length]);
  }

  leaveInspection(returnToOverview = true) {
    this.focusCard?.classList.remove('is-open');
    this.focusCard?.setAttribute('aria-hidden', 'true');
    this.inspector?.classList.remove('is-open');
    this.inspector?.setAttribute('aria-hidden', 'true');
    this.selected = null;
    if (this.focusAttribute) this.syncInstances();
    if (returnToOverview) {
      this.cameraTargetGoal.set(0, 0, 0);
      this.distanceGoal = this.layoutDistance(this.layout);
      this.status.innerHTML = `<b>${this.layout[0].toUpperCase()}${this.layout.slice(1)}</b> arrangement · ${ARTWORKS.length} works`;
    }
  }

  zoom(multiplier) {
    const max = Math.max(28000, this.layoutDistance(this.layout) * 1.7);
    this.distanceGoal = clamp(this.distanceGoal * multiplier, 420, max);
  }

  pickArtwork(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    let best = null;
    let bestDepth = Infinity;
    this.cards.forEach((card) => {
      const view = card.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
      const depth = -view.z;
      if (depth <= 1) return;
      const projected = card.position.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1) return;
      const centerX = rect.left + (projected.x + 1) * rect.width * .5;
      const centerY = rect.top + (1 - projected.y) * rect.height * .5;
      const pixelsPerWorld = rect.height / (2 * depth * Math.tan(fov * .5));
      const halfWidth = CARD_WIDTH * card.scale * pixelsPerWorld * .5;
      const halfHeight = CARD_HEIGHT * card.scale * pixelsPerWorld * .5;
      if (Math.abs(clientX - centerX) <= halfWidth && Math.abs(clientY - centerY) <= halfHeight && depth < bestDepth) {
        best = card;
        bestDepth = depth;
      }
    });
    return best;
  }

  bind() {
    const stage = this.renderer.domElement;
    this.handlers.pointerdown = (event) => {
      if (event.target.closest('.ccs-inspector, .ccs-layouts, .ccs-masthead, .ccs-footer, .ccs-focus-card')) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture(event.pointerId);
      if (this.pointers.size === 1) {
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
        this.suppressClick = false;
        this.root.classList.add('is-dragging');
      } else if (this.pointers.size === 2) {
        const [first, second] = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(second.x - first.x, second.y - first.y);
        this.drag = null;
        this.suppressClick = true;
      }
    };
    this.handlers.pointermove = (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        const [first, second] = [...this.pointers.values()];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        if (this.pinchDistance > 0 && distance > 0) this.zoom(this.pinchDistance / distance);
        this.pinchDistance = distance;
        return;
      }
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.yaw -= dx * .0046;
      this.pitch = clamp(this.pitch + dy * .0037, -.78, .78);
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 7) this.suppressClick = true;
    };
    this.handlers.pointerup = (event) => {
      const shouldPick = this.drag?.id === event.pointerId && !this.suppressClick;
      this.pointers.delete(event.pointerId);
      if (shouldPick) {
        const card = this.pickArtwork(event.clientX, event.clientY);
        if (card) this.selectArtwork(card);
      }
      if (this.drag?.id === event.pointerId) this.drag = null;
      if (this.pointers.size < 2) this.pinchDistance = 0;
      this.root.classList.remove('is-dragging');
      requestAnimationFrame(() => { this.suppressClick = false; });
    };
    this.handlers.wheel = (event) => {
      if (event.target.closest('.ccs-inspector')) return;
      event.preventDefault();
      this.zoom(Math.exp(event.deltaY * .00135));
    };
    this.handlers.keydown = (event) => {
      if (event.key >= '1' && event.key <= '4') this.setLayout(LAYOUTS[Number(event.key) - 1]);
      if (event.key === 'ArrowLeft') this.selected ? this.stepArtwork(-1) : this.yaw += .12;
      if (event.key === 'ArrowRight') this.selected ? this.stepArtwork(1) : this.yaw -= .12;
      if (event.key === 'ArrowUp') this.pitch = clamp(this.pitch - .08, -.78, .78);
      if (event.key === 'ArrowDown') this.pitch = clamp(this.pitch + .08, -.78, .78);
      if (event.key === '+' || event.key === '=') this.zoom(.62);
      if (event.key === '-' || event.key === '_') this.zoom(1.62);
      if (event.key === 'Escape' || event.key === '0') this.leaveInspection(true);
    };

    stage.addEventListener('pointerdown', this.handlers.pointerdown);
    stage.addEventListener('pointermove', this.handlers.pointermove);
    stage.addEventListener('pointerup', this.handlers.pointerup);
    stage.addEventListener('pointercancel', this.handlers.pointerup);
    stage.addEventListener('wheel', this.handlers.wheel, { passive: false });
    addEventListener('keydown', this.handlers.keydown);
    this.container.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => this.setLayout(button.dataset.layout)));
    this.container.querySelectorAll('[data-camera="overview"]').forEach((button) => button.addEventListener('click', () => this.leaveInspection(true)));
    this.container.querySelector('[data-camera="closer"]').addEventListener('click', () => this.zoom(.62));
    this.container.querySelector('[data-camera="farther"]').addEventListener('click', () => this.zoom(1.62));
    this.container.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => this.stepArtwork(Number(button.dataset.step))));
    this.container.querySelector('.ccs-close').addEventListener('click', () => this.leaveInspection(true));
    this.driftButton.addEventListener('click', () => {
      this.drift = !this.drift;
      this.driftButton.setAttribute('aria-pressed', String(this.drift));
      this.driftButton.textContent = `Drift: ${this.drift ? 'on' : 'off'}`;
      this.lastDrift = performance.now();
    });
  }

  updateTransition(time) {
    if (!this.transition) return;
    let complete = true;
    this.transition.forEach((move) => {
      const raw = clamp((time - move.start) / move.duration, 0, 1);
      const progress = easeOutQuart(raw);
      move.card.position.lerpVectors(move.fromPosition, move.to.position, progress);
      move.card.scale = THREE.MathUtils.lerp(move.fromScale, move.to.scale, progress);
      if (raw < 1) complete = false;
    });
    this.syncInstances();
    if (complete) this.transition = null;
  }

  update(time) {
    if (this.dead) return;
    const frameDelta = Math.min(120, time - (this.lastFrame ?? time));
    this.updateTransition(time);
    if (this.drift && !this.drag && !this.selected) {
      this.yaw -= .00022 * frameDelta;
      if (time - this.lastDrift > 11000) this.setLayout(LAYOUTS[(LAYOUTS.indexOf(this.layout) + 1) % LAYOUTS.length]);
    }
    this.lastFrame = time;
    if (this.selected) this.cameraTargetGoal.copy(this.selected.position);
    const cameraEase = 1 - Math.exp(-frameDelta * .0038);
    this.distance += (this.distanceGoal - this.distance) * cameraEase;
    this.cameraTarget.lerp(this.cameraTargetGoal, cameraEase);
    if (Math.abs(this.distanceGoal - this.distance) < .1) this.distance = this.distanceGoal;
    if (this.cameraTarget.distanceToSquared(this.cameraTargetGoal) < .01) this.cameraTarget.copy(this.cameraTargetGoal);

    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(this.yaw) * cosPitch * this.distance,
      this.cameraTarget.y + Math.sin(this.pitch) * this.distance,
      this.cameraTarget.z + Math.cos(this.yaw) * cosPitch * this.distance,
    );
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld();
    if (this.selected) {
      const focusScale = clamp((this.compact ? 820 : 670) / this.distance, .76, 1.45);
      this.root.style.setProperty('--focus-scale', focusScale.toFixed(3));
    }
    this.dust.rotation.y = time * .000025;
    this.ring.position.copy(this.cameraTarget);
    this.ring.rotation.z = time * .000035;
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame((nextTime) => this.update(nextTime));
  }

  resize(width, height) {
    if (!this.camera) return;
    const safeWidth = Math.max(1, this.root?.clientWidth || width);
    const safeHeight = Math.max(1, this.root?.clientHeight || height);
    const compact = safeWidth < 600;
    const firstResize = this.compact === undefined;
    const breakpointChanged = !firstResize && this.compact !== compact;
    this.compact = compact;
    if (firstResize || breakpointChanged) {
      this.distance = this.layoutDistance(this.layout);
      this.distanceGoal = this.distance;
    }
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
    if (breakpointChanged && this.cards.length) this.setLayout(this.layout, true);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.handlers.keydown);
    const stage = this.renderer?.domElement;
    stage?.removeEventListener('pointerdown', this.handlers.pointerdown);
    stage?.removeEventListener('pointermove', this.handlers.pointermove);
    stage?.removeEventListener('pointerup', this.handlers.pointerup);
    stage?.removeEventListener('pointercancel', this.handlers.pointerup);
    stage?.removeEventListener('wheel', this.handlers.wheel);
    this.scene?.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
    this.galleryMaterial?.uniforms.atlas.value?.dispose?.();
    this.renderer?.dispose();
    this.container.replaceChildren();
  }
}
