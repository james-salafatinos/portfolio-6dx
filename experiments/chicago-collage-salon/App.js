import * as THREE from '/vendor/three/build/three.module.js';
import { CSS3DObject, CSS3DRenderer } from '/vendor/three/examples/jsm/renderers/CSS3DRenderer.js';
import { ARTWORKS, SOURCE_PAGE } from './Artworks.js';

const STYLE_ID = 'chicago-collage-salon-styles';
const LAYOUTS = ['salon', 'spiral', 'globe', 'ribbon'];
const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutQuart = (value) => 1 - Math.pow(1 - value, 4);

function pose(position, rotation = new THREE.Euler(), scale = 1) {
  const helper = new THREE.Object3D();
  helper.position.copy(position);
  helper.rotation.copy(rotation);
  helper.scale.setScalar(scale);
  return { position: helper.position.clone(), quaternion: helper.quaternion.clone(), scale: helper.scale.clone() };
}

export default class ChicagoCollageSalon {
  constructor(container) {
    this.container = container;
    this.objects = [];
    this.layout = 'salon';
    this.transition = null;
    this.drag = null;
    this.yaw = 0;
    this.pitch = 0;
    this.distance = 9000;
    this.distanceGoal = 9000;
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
    this.createArtworks();
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
        <div class="ccs-webgl" aria-hidden="true"></div>
        <div class="ccs-css3d"></div>
        <div class="ccs-vignette" aria-hidden="true"></div>
        <header class="ccs-masthead">
          <span class="ccs-kicker">Digital salon / 2026</span>
          <div class="ccs-title"><strong>Chicago Collage Salon</strong><span>${ARTWORKS.length} works · one rearrangeable room</span></div>
          <a class="ccs-source" href="${SOURCE_PAGE}" target="_blank" rel="noopener noreferrer">Source ↗</a>
        </header>
        <nav class="ccs-layouts" aria-label="Exhibition arrangements">
          <span>Rearrange room</span>
          ${LAYOUTS.map((name, index) => `<button type="button" data-layout="${name}" data-key="${index + 1}">${name}</button>`).join('')}
        </nav>
        <aside class="ccs-inspector" aria-label="Selected artwork" aria-hidden="true">
          <button class="ccs-close" type="button" aria-label="Close artwork details">×</button>
          <div class="ccs-inspector-image"><img alt=""></div>
          <div class="ccs-inspector-copy">
            <p></p><h2></h2>
            <dl><div><dt>Work</dt><dd data-field="number"></dd></div><div><dt>Original</dt><dd data-field="dimensions"></dd></div></dl>
            <a target="_blank" rel="noopener noreferrer">View source image ↗</a>
          </div>
        </aside>
        <footer class="ccs-footer">
          <div class="ccs-status" aria-live="polite"><b>Salon</b> arrangement · ${ARTWORKS.length} works</div>
          <button class="ccs-drift" type="button" aria-pressed="false">Drift: off</button>
          <div class="ccs-hint">Drag to orbit · wheel to travel · 1–4 to rearrange</div>
        </footer>
      </main>`;

    this.root = this.container.querySelector('.ccs-root');
    this.cssStage = this.container.querySelector('.ccs-css3d');
    this.webglStage = this.container.querySelector('.ccs-webgl');
    this.inspector = this.container.querySelector('.ccs-inspector');
    this.status = this.container.querySelector('.ccs-status');
    this.driftButton = this.container.querySelector('.ccs-drift');
  }

  setupScene() {
    this.camera = new THREE.PerspectiveCamera(43, 1, 1, 40000);
    this.camera.position.set(0, 0, this.distance);
    this.scene = new THREE.Scene();
    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.domElement.setAttribute('aria-hidden', 'true');
    this.cssStage.appendChild(this.cssRenderer.domElement);

    this.webglScene = new THREE.Scene();
    this.webglRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.webglRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.webglStage.appendChild(this.webglRenderer.domElement);

    const positions = [];
    for (let i = 0; i < 900; i += 1) {
      const angle = i * 2.399963;
      const radius = 700 + ((i * 83) % 3100);
      positions.push(Math.cos(angle) * radius, (((i * 47) % 2600) - 1300), Math.sin(angle) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd8ff3e, size: 4, transparent: true, opacity: .32, sizeAttenuation: true }));
    this.webglScene.add(this.dust);

    const ringGeometry = new THREE.TorusGeometry(1220, 2, 5, 160);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff4d8f, transparent: true, opacity: .18, wireframe: true });
    this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
    this.ring.rotation.x = Math.PI * .5;
    this.webglScene.add(this.ring);
  }

  createArtworks() {
    ARTWORKS.forEach((artwork) => {
      const landscape = artwork.width >= artwork.height;
      const ratio = artwork.width / artwork.height;
      const width = landscape ? 286 : Math.max(172, Math.round(286 * ratio));
      const imageHeight = landscape ? Math.max(166, Math.round(286 / ratio)) : 292;
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'ccs-artwork';
      element.dataset.number = String(artwork.index + 1).padStart(2, '0');
      element.setAttribute('aria-label', `Work ${artwork.index + 1}, by ${artwork.artist}`);
      element.style.width = `${width}px`;
      element.style.height = `${imageHeight + 34}px`;

      const image = document.createElement('img');
      image.src = artwork.thumbnail;
      image.alt = `Collage work by ${artwork.artist}`;
      image.loading = 'eager';
      image.decoding = 'async';
      const caption = document.createElement('span');
      const artist = document.createElement('i');
      artist.textContent = artwork.artist;
      const size = document.createElement('b');
      size.textContent = landscape ? 'LANDSCAPE' : 'PORTRAIT';
      caption.append(artist, size);
      element.append(image, caption);

      const object = new CSS3DObject(element);
      object.userData = { artwork, element };
      this.scene.add(object);
      this.objects.push(object);

      element.addEventListener('click', () => {
        if (!this.suppressClick) this.selectArtwork(object);
      });
    });
  }

  targetsFor(name) {
    const count = this.objects.length;
    return this.objects.map((_, index) => {
      if (name === 'salon') {
        const columns = this.compact ? 10 : 20;
        const rows = Math.ceil(count / columns);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = (column - (columns - 1) / 2) * (this.compact ? 315 : 330) + (this.compact ? 0 : (row % 2 ? 44 : -22));
        const y = ((rows - 1) / 2 - row) * (this.compact ? 325 : 335);
        const z = ((index * 37) % 180) - 90;
        return pose(new THREE.Vector3(x, y, z), new THREE.Euler(0, 0, ((index % columns) - (columns - 1) / 2) * .004), this.compact ? .72 : .82);
      }

      if (name === 'spiral') {
        const angle = index * .29 + .2;
        const radiusX = this.compact ? 1100 : 3000;
        const radiusZ = this.compact ? 2500 : 3000;
        const position = new THREE.Vector3(Math.sin(angle) * radiusX, (index - (count - 1) / 2) * 28, Math.cos(angle) * radiusZ);
        return pose(position, new THREE.Euler(0, Math.sin(angle) * .13, index % 2 ? .025 : -.025), .7);
      }

      if (name === 'globe') {
        const phi = Math.acos(-1 + (2 * index) / (count - 1));
        const theta = Math.sqrt(count * Math.PI) * phi;
        const radius = 4200;
        const xScale = this.compact ? .43 : 1;
        const position = new THREE.Vector3(radius * xScale * Math.cos(theta) * Math.sin(phi), radius * Math.sin(theta) * Math.sin(phi), radius * .78 * Math.cos(phi));
        return pose(position, new THREE.Euler(-position.y / radius * .1, position.x / (radius * xScale) * .14, 0), .62);
      }

      const bands = 5;
      const band = index % bands;
      const station = Math.floor(index / bands);
      const stations = Math.ceil(count / bands);
      const progress = station / Math.max(1, stations - 1);
      const spanX = this.compact ? 3400 : 12000;
      const waveY = this.compact ? 2600 : 2100;
      const x = (progress - .5) * spanX;
      const y = Math.sin(progress * Math.PI * 3.2) * waveY + (band - 2) * (this.compact ? 230 : 280);
      const z = Math.cos(progress * Math.PI * 4.4) * (this.compact ? 1200 : 1700) + (band - 2) * 70;
      const position = new THREE.Vector3(x, y, z);
      const nextProgress = Math.min(1, progress + .01);
      const tangent = new THREE.Vector3(
        (nextProgress - .5) * spanX,
        Math.sin(nextProgress * Math.PI * 3.2) * waveY + (band - 2) * (this.compact ? 230 : 280),
        Math.cos(nextProgress * Math.PI * 4.4) * (this.compact ? 1200 : 1700) + (band - 2) * 70,
      ).sub(position);
      return pose(position, new THREE.Euler(0, Math.atan2(-tangent.z, tangent.x) * .08, Math.atan2(tangent.y, tangent.x) * .36), .62);
    });
  }

  layoutDistance(name) {
    if (this.compact) return { salon: 16500, spiral: 16500, globe: 13500, ribbon: 12500 }[name];
    return { salon: 9000, spiral: 13500, globe: 10500, ribbon: 10800 }[name];
  }

  setLayout(name, immediate = false) {
    if (!LAYOUTS.includes(name)) return;
    this.layout = name;
    this.distanceGoal = this.layoutDistance(name);
    const targets = this.targetsFor(name);
    const startTime = performance.now();
    this.transition = this.objects.map((object, index) => ({
      object,
      from: { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() },
      to: targets[index],
      start: startTime + (immediate ? 0 : ((index * 11) % this.objects.length) * 17),
      duration: immediate ? 1 : 1250 + (index % 6) * 95,
    }));
    this.container.querySelectorAll('[data-layout]').forEach((button) => button.classList.toggle('is-active', button.dataset.layout === name));
    this.status.innerHTML = `<b>${name[0].toUpperCase()}${name.slice(1)}</b> arrangement · ${ARTWORKS.length} works`;
    this.lastDrift = startTime;
  }

  selectArtwork(object) {
    this.selected?.userData.element.classList.remove('is-selected');
    this.selected = object;
    object.userData.element.classList.add('is-selected');
    const { artwork } = object.userData;
    const image = this.inspector.querySelector('img');
    image.src = artwork.file;
    image.alt = `Collage work by ${artwork.artist}`;
    this.inspector.querySelector('p').textContent = artwork.collection;
    this.inspector.querySelector('h2').textContent = artwork.artist;
    this.inspector.querySelector('[data-field="number"]').textContent = `${String(artwork.index + 1).padStart(2, '0')} / ${ARTWORKS.length}`;
    this.inspector.querySelector('[data-field="dimensions"]').textContent = `${artwork.width} × ${artwork.height}px`;
    const link = this.inspector.querySelector('a');
    link.href = artwork.source;
    this.inspector.classList.add('is-open');
    this.inspector.setAttribute('aria-hidden', 'false');
  }

  closeInspector() {
    this.inspector.classList.remove('is-open');
    this.inspector.setAttribute('aria-hidden', 'true');
    this.selected?.userData.element.classList.remove('is-selected');
    this.selected = null;
  }

  bind() {
    const stage = this.cssRenderer.domElement;
    this.handlers.pointerdown = (event) => {
      if (event.target.closest('.ccs-inspector, .ccs-layouts, .ccs-masthead, .ccs-footer')) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
      this.suppressClick = false;
      stage.setPointerCapture(event.pointerId);
      this.root.classList.add('is-dragging');
    };
    this.handlers.pointermove = (event) => {
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
      if (this.drag?.id === event.pointerId) {
        this.drag = null;
        this.root.classList.remove('is-dragging');
        requestAnimationFrame(() => { this.suppressClick = false; });
      }
    };
    this.handlers.wheel = (event) => {
      if (event.target.closest('.ccs-inspector')) return;
      event.preventDefault();
      this.distanceGoal = clamp(this.distanceGoal + event.deltaY * 4.2, 1800, 28000);
    };
    this.handlers.keydown = (event) => {
      if (event.key >= '1' && event.key <= '4') this.setLayout(LAYOUTS[Number(event.key) - 1]);
      if (event.key === 'ArrowLeft') this.yaw += .12;
      if (event.key === 'ArrowRight') this.yaw -= .12;
      if (event.key === 'ArrowUp') this.pitch = clamp(this.pitch - .08, -.78, .78);
      if (event.key === 'ArrowDown') this.pitch = clamp(this.pitch + .08, -.78, .78);
      if (event.key === 'Escape') this.closeInspector();
    };

    stage.addEventListener('pointerdown', this.handlers.pointerdown);
    stage.addEventListener('pointermove', this.handlers.pointermove);
    stage.addEventListener('pointerup', this.handlers.pointerup);
    stage.addEventListener('pointercancel', this.handlers.pointerup);
    stage.addEventListener('wheel', this.handlers.wheel, { passive: false });
    addEventListener('keydown', this.handlers.keydown);
    this.container.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => this.setLayout(button.dataset.layout)));
    this.container.querySelector('.ccs-close').addEventListener('click', () => this.closeInspector());
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
      move.object.position.lerpVectors(move.from.position, move.to.position, progress);
      move.object.quaternion.slerpQuaternions(move.from.quaternion, move.to.quaternion, progress);
      move.object.scale.lerpVectors(move.from.scale, move.to.scale, progress);
      if (raw < 1) complete = false;
    });
    if (complete) this.transition = null;
  }

  update(time) {
    if (this.dead) return;
    this.updateTransition(time);
    if (this.drift && !this.drag) {
      this.yaw -= .00022 * Math.min(34, time - (this.lastFrame || time));
      if (time - this.lastDrift > 11000) this.setLayout(LAYOUTS[(LAYOUTS.indexOf(this.layout) + 1) % LAYOUTS.length]);
    }
    this.lastFrame = time;
    this.distance += (this.distanceGoal - this.distance) * .055;

    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * cosPitch * this.distance,
      Math.sin(this.pitch) * this.distance,
      Math.cos(this.yaw) * cosPitch * this.distance,
    );
    this.camera.lookAt(0, 0, 0);
    this.dust.rotation.y = time * .000025;
    this.ring.rotation.z = time * .000035;
    this.webglRenderer.render(this.webglScene, this.camera);
    this.cssRenderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame((nextTime) => this.update(nextTime));
  }

  resize(width, height) {
    if (!this.camera) return;
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const compact = safeWidth < 600;
    const firstResize = this.compact === undefined;
    const breakpointChanged = this.compact !== undefined && this.compact !== compact;
    this.compact = compact;
    if (firstResize || breakpointChanged) {
      this.distance = this.layoutDistance(this.layout);
      this.distanceGoal = this.distance;
    }
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.cssRenderer.setSize(safeWidth, safeHeight);
    this.webglRenderer.setSize(safeWidth, safeHeight, false);
    if (breakpointChanged && this.objects.length) this.setLayout(this.layout, true);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.handlers.keydown);
    const stage = this.cssRenderer?.domElement;
    stage?.removeEventListener('pointerdown', this.handlers.pointerdown);
    stage?.removeEventListener('pointermove', this.handlers.pointermove);
    stage?.removeEventListener('pointerup', this.handlers.pointerup);
    stage?.removeEventListener('pointercancel', this.handlers.pointerup);
    stage?.removeEventListener('wheel', this.handlers.wheel);
    this.webglScene?.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
    this.webglRenderer?.dispose();
    this.container.replaceChildren();
  }
}
