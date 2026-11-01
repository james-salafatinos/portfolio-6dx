import * as THREE from '/vendor/three/build/three.module.js';
import { ARTWORKS, SOURCE_PAGE } from './Artworks.js';
import { COLOR_DATA } from './ColorData.js';

const STYLE_ID = 'chicago-collage-salon-styles';
const LAYOUTS = ['salon', 'spiral', 'globe', 'ribbon', 'color-map'];
const LAYOUT_LABELS = { salon: 'Salon', spiral: 'Spiral', globe: 'Globe', ribbon: 'Ribbon', 'color-map': 'Color map' };
const COLOR_FAMILIES = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Neutral', 'Dark', 'Light'];
const CARD_WIDTH = 240;
const CARD_HEIGHT = 320;
const ATLAS_COLUMNS = 20;
const ATLAS_ROWS = Math.ceil(ARTWORKS.length / ATLAS_COLUMNS);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutQuart = (value) => 1 - Math.pow(1 - value, 4);

function target(position, scale = 1) {
  return { position, scale };
}

function creditedArtist(artist) {
  return /^unknown(?: artist)?$/i.test(artist) ? 'Uncredited at source' : artist;
}

export default class ChicagoCollageSalon {
  constructor(container) {
    this.container = container;
    this.cards = ARTWORKS.map((artwork, index) => ({ artwork, color: COLOR_DATA[index], index, position: new THREE.Vector3(), scale: 1 }));
    this.filteredCards = [...this.cards];
    this.orderMode = 'source';
    this.authorQuery = '';
    this.colorFilter = 'all';
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
          <span class="ccs-kicker">A digital cut-and-paste room</span>
          <div class="ccs-title"><strong>Chicago Collage Salon</strong><span>${ARTWORKS.length} scraps · one rearrangeable room</span></div>
          <a class="ccs-source" href="${SOURCE_PAGE}" target="_blank" rel="noopener noreferrer">Source ledger ↗</a>
        </header>
        <nav class="ccs-layouts" aria-label="Exhibition arrangements and camera controls">
          <span>Rehang the room</span>
          ${LAYOUTS.map((name, index) => `<button type="button" data-layout="${name}" data-key="${index + 1}">${LAYOUT_LABELS[name]}</button>`).join('')}
          <hr>
          <span>Wander</span>
          <button type="button" data-camera="overview">Whole wall</button>
          <button type="button" data-camera="closer">Lean in +</button>
          <button type="button" data-camera="farther">Step back −</button>
        </nav>
        <button class="ccs-analysis-toggle" type="button" aria-expanded="false">Rummage the archive</button>
        <section class="ccs-analysis" aria-label="Collection analysis" aria-hidden="true">
          <div class="ccs-analysis-head"><span>Curator's worktable</span><button type="button" data-analysis-close aria-label="Close analysis">×</button></div>
          <label>Find a maker<input type="search" data-analysis="artist" list="ccs-artists" placeholder="Name or handle…"></label>
          <datalist id="ccs-artists"></datalist>
          <label>Shuffle the wall<select data-analysis="sort"><option value="source">Source order</option><option value="color">Color spectrum</option><option value="author">Maker A–Z</option></select></label>
          <label>Pull a color pile<select data-analysis="color"><option value="all">Every color</option>${COLOR_FAMILIES.map((family) => `<option value="${family}">${family}</option>`).join('')}</select></label>
          <div class="ccs-color-key">${COLOR_FAMILIES.slice(0, 8).map((family) => `<button type="button" data-color-chip="${family}" style="--chip:${family.toLowerCase()}">${family}</button>`).join('')}</div>
          <button class="ccs-analysis-reset" type="button" data-analysis-reset>Put everything back</button>
          <p><b data-analysis-count>${ARTWORKS.length}</b> works on the table · The color map gathers kindred palettes.</p>
        </section>
        <figure class="ccs-focus-card" aria-hidden="true">
          <div class="ccs-focus-image"><img alt=""></div>
          <figcaption><strong></strong><small></small></figcaption>
        </figure>
        <aside class="ccs-inspector" aria-label="Selected artwork plaque" aria-hidden="true">
          <button class="ccs-close" type="button" aria-label="Return to all works">×</button>
          <p class="ccs-inspector-eyebrow"></p>
          <h2></h2>
          <dl><div><dt>Work</dt><dd data-field="number"></dd></div><div><dt>Original</dt><dd data-field="dimensions"></dd></div><div><dt>Palette</dt><dd class="ccs-palette" data-field="color"><i></i><span></span></dd></div></dl>
          <div class="ccs-inspector-actions">
            <button type="button" data-step="-1">← Previous</button>
            <button type="button" data-camera="overview">Whole wall</button>
            <button type="button" data-step="1">Next →</button>
            <a target="_blank" rel="noopener noreferrer">Original ↗</a>
          </div>
        </aside>
        <footer class="ccs-footer">
          <div class="ccs-status" aria-live="polite"><b>Salon</b> arrangement · ${ARTWORKS.length} works</div>
          <button class="ccs-drift" type="button" aria-pressed="false">Wander: off</button>
          <div class="ccs-hint">Drag the room · pinch to lean in · tap a scrap to hold it up</div>
        </footer>
      </main>`;

    this.root = this.container.querySelector('.ccs-root');
    this.webglStage = this.container.querySelector('.ccs-webgl');
    this.focusCard = this.container.querySelector('.ccs-focus-card');
    this.inspector = this.container.querySelector('.ccs-inspector');
    this.status = this.container.querySelector('.ccs-status');
    this.driftButton = this.container.querySelector('.ccs-drift');
    this.analysisPanel = this.container.querySelector('.ccs-analysis');
    this.container.querySelector('#ccs-artists').append(...[...new Set(ARTWORKS.map((artwork) => creditedArtist(artwork.artist)))].sort().map((artist) => {
      const option = document.createElement('option');
      option.value = artist;
      return option;
    }));
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
    const visible = this.filteredCards;
    const count = visible.length;
    const targets = this.cards.map((card) => target(card.position.clone(), 0));
    visible.forEach((card, index) => {
      if (name === 'salon') {
        const columns = this.compact ? 10 : 20;
        const rows = Math.max(1, Math.ceil(count / columns));
        const column = index % columns;
        const row = Math.floor(index / columns);
        const spacingX = this.compact ? 260 : 272;
        const spacingY = this.compact ? 340 : 350;
        const x = (column - (columns - 1) / 2) * spacingX + (row % 2 ? 28 : -14);
        const y = ((rows - 1) / 2 - row) * spacingY;
        targets[card.index] = target(new THREE.Vector3(x, y, ((card.index * 37) % 180) - 90), this.compact ? .74 : .86);
        return;
      }
      if (name === 'spiral') {
        const angle = index * .29 + .2;
        const radiusX = this.compact ? 1100 : 3000;
        const radiusZ = this.compact ? 2500 : 3000;
        targets[card.index] = target(new THREE.Vector3(Math.sin(angle) * radiusX, (index - (count - 1) / 2) * 28, Math.cos(angle) * radiusZ), .72);
        return;
      }
      if (name === 'globe') {
        const phi = count === 1 ? Math.PI / 2 : Math.acos(-1 + (2 * index) / (count - 1));
        const theta = Math.sqrt(Math.max(1, count) * Math.PI) * phi;
        const radius = 4200;
        const xScale = this.compact ? .43 : 1;
        targets[card.index] = target(new THREE.Vector3(radius * xScale * Math.cos(theta) * Math.sin(phi), radius * Math.sin(theta) * Math.sin(phi), radius * .78 * Math.cos(phi)), .64);
        return;
      }
      if (name === 'color-map') {
        const xScale = this.compact ? 1450 : 4700;
        const yScale = this.compact ? 5000 : 3300;
        targets[card.index] = target(new THREE.Vector3(card.color.x * xScale, card.color.y * yScale, (card.color.lightness - .5) * 650), this.compact ? .66 : .72);
        return;
      }
      const bands = 5;
      const band = index % bands;
      const station = Math.floor(index / bands);
      const stations = Math.max(1, Math.ceil(count / bands));
      const progress = station / Math.max(1, stations - 1);
      const spanX = this.compact ? 3400 : 12000;
      const waveY = this.compact ? 2600 : 2100;
      targets[card.index] = target(new THREE.Vector3(
        (progress - .5) * spanX,
        Math.sin(progress * Math.PI * 3.2) * waveY + (band - 2) * (this.compact ? 230 : 280),
        Math.cos(progress * Math.PI * 4.4) * (this.compact ? 1200 : 1700) + (band - 2) * 70,
      ), .64);
    });
    return targets;
  }

  layoutDistance(name) {
    if (this.compact) return { salon: 16500, spiral: 16500, globe: 13500, ribbon: 12500, 'color-map': 14500 }[name];
    return { salon: 9000, spiral: 13500, globe: 10500, ribbon: 10800, 'color-map': 9600 }[name];
  }

  applyAnalysis({ switchToSalon = false } = {}) {
    const query = this.authorQuery.trim().toLocaleLowerCase();
    const familyOrder = new Map(COLOR_FAMILIES.map((family, index) => [family, index]));
    this.filteredCards = this.cards.filter((card) => {
      const artistMatches = !query || creditedArtist(card.artwork.artist).toLocaleLowerCase().includes(query);
      const colorMatches = this.colorFilter === 'all' || card.color.family === this.colorFilter;
      return artistMatches && colorMatches;
    });
    if (this.orderMode === 'author') {
      this.filteredCards.sort((first, second) => creditedArtist(first.artwork.artist).localeCompare(creditedArtist(second.artwork.artist)) || first.index - second.index);
    } else if (this.orderMode === 'color') {
      this.filteredCards.sort((first, second) => (familyOrder.get(first.color.family) - familyOrder.get(second.color.family)) || first.color.hue - second.color.hue || first.color.lightness - second.color.lightness);
    } else {
      this.filteredCards.sort((first, second) => first.index - second.index);
    }
    this.container.querySelector('[data-analysis-count]').textContent = this.filteredCards.length;
    this.setLayout(switchToSalon ? 'salon' : this.layout);
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
    this.status.innerHTML = `<b>${LAYOUT_LABELS[name]}</b> arrangement · ${this.filteredCards.length} works`;
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
    this.root.classList.add('is-inspecting');
    this.analysisPanel.classList.remove('is-open');
    this.analysisPanel.setAttribute('aria-hidden', 'true');
    this.container.querySelector('.ccs-analysis-toggle').setAttribute('aria-expanded', 'false');
    const { artwork } = card;
    const artist = creditedArtist(artwork.artist);
    this.cameraTargetGoal.copy(card.position);
    this.distanceGoal = this.compact ? 820 : 670;
    this.yaw = 0;
    this.pitch = 0;
    const focusImage = this.focusCard.querySelector('img');
    focusImage.src = artwork.file;
    focusImage.alt = `Collage work by ${artwork.artist}`;
    this.focusCard.querySelector('strong').textContent = artist;
    this.focusCard.querySelector('small').textContent = `${String(artwork.index + 1).padStart(3, '0')} / ${ARTWORKS.length} · ${artwork.width} × ${artwork.height} · ${card.color.family}`;
    this.focusCard.classList.add('is-open');
    this.focusCard.setAttribute('aria-hidden', 'false');
    this.inspector.querySelector('.ccs-inspector-eyebrow').textContent = artwork.collection;
    this.inspector.querySelector('h2').textContent = artist;
    this.inspector.querySelector('[data-field="number"]').textContent = `${String(artwork.index + 1).padStart(3, '0')} / ${ARTWORKS.length}`;
    this.inspector.querySelector('[data-field="dimensions"]').textContent = `${artwork.width} × ${artwork.height}px`;
    const palette = this.inspector.querySelector('[data-field="color"]');
    palette.querySelector('i').style.background = card.color.hex;
    palette.querySelector('span').textContent = card.color.family;
    this.inspector.querySelector('a').href = artwork.source;
    this.inspector.classList.add('is-open');
    this.inspector.setAttribute('aria-hidden', 'false');
    this.status.innerHTML = `<b>Inspecting ${String(artwork.index + 1).padStart(3, '0')}</b> · ${artist} · scroll to move closer`;
    this.syncInstances();
  }

  stepArtwork(delta) {
    const sequence = this.filteredCards.length ? this.filteredCards : this.cards;
    const current = this.selected ? sequence.indexOf(this.selected) : (delta > 0 ? -1 : 0);
    this.selectArtwork(sequence[(current + delta + sequence.length) % sequence.length]);
  }

  leaveInspection(returnToOverview = true) {
    this.root?.classList.remove('is-inspecting');
    this.focusCard?.classList.remove('is-open');
    this.focusCard?.setAttribute('aria-hidden', 'true');
    this.inspector?.classList.remove('is-open');
    this.inspector?.setAttribute('aria-hidden', 'true');
    this.selected = null;
    if (this.focusAttribute) this.syncInstances();
    if (returnToOverview) {
      this.cameraTargetGoal.set(0, 0, 0);
      this.distanceGoal = this.layoutDistance(this.layout);
      this.status.innerHTML = `<b>${LAYOUT_LABELS[this.layout]}</b> arrangement · ${this.filteredCards.length} works`;
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
      if (event.key >= '1' && event.key <= '5') this.setLayout(LAYOUTS[Number(event.key) - 1]);
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
    const analysisToggle = this.container.querySelector('.ccs-analysis-toggle');
    const setAnalysisOpen = (open) => {
      this.analysisPanel.classList.toggle('is-open', open);
      this.analysisPanel.setAttribute('aria-hidden', String(!open));
      analysisToggle.setAttribute('aria-expanded', String(open));
    };
    analysisToggle.addEventListener('click', () => setAnalysisOpen(!this.analysisPanel.classList.contains('is-open')));
    this.container.querySelector('[data-analysis-close]').addEventListener('click', () => setAnalysisOpen(false));
    const artistInput = this.container.querySelector('[data-analysis="artist"]');
    let searchTimer = 0;
    artistInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.authorQuery = artistInput.value;
        this.applyAnalysis();
      }, 140);
    });
    this.container.querySelector('[data-analysis="sort"]').addEventListener('change', (event) => {
      this.orderMode = event.target.value;
      this.applyAnalysis({ switchToSalon: true });
    });
    const colorSelect = this.container.querySelector('[data-analysis="color"]');
    colorSelect.addEventListener('change', () => {
      this.colorFilter = colorSelect.value;
      this.container.querySelectorAll('[data-color-chip]').forEach((button) => button.classList.toggle('is-active', button.dataset.colorChip === this.colorFilter));
      this.applyAnalysis();
    });
    this.container.querySelectorAll('[data-color-chip]').forEach((button) => button.addEventListener('click', () => {
      this.colorFilter = this.colorFilter === button.dataset.colorChip ? 'all' : button.dataset.colorChip;
      colorSelect.value = this.colorFilter;
      this.container.querySelectorAll('[data-color-chip]').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.colorChip === this.colorFilter));
      this.applyAnalysis();
    }));
    this.container.querySelector('[data-analysis-reset]').addEventListener('click', () => {
      this.orderMode = 'source';
      this.authorQuery = '';
      this.colorFilter = 'all';
      artistInput.value = '';
      colorSelect.value = 'all';
      this.container.querySelector('[data-analysis="sort"]').value = 'source';
      this.container.querySelectorAll('[data-color-chip]').forEach((button) => button.classList.remove('is-active'));
      this.applyAnalysis({ switchToSalon: true });
    });
    this.container.querySelectorAll('[data-camera="overview"]').forEach((button) => button.addEventListener('click', () => this.leaveInspection(true)));
    this.container.querySelector('[data-camera="closer"]').addEventListener('click', () => this.zoom(.62));
    this.container.querySelector('[data-camera="farther"]').addEventListener('click', () => this.zoom(1.62));
    this.container.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => this.stepArtwork(Number(button.dataset.step))));
    this.container.querySelector('.ccs-close').addEventListener('click', () => this.leaveInspection(true));
    this.driftButton.addEventListener('click', () => {
      this.drift = !this.drift;
      this.driftButton.setAttribute('aria-pressed', String(this.drift));
      this.driftButton.textContent = `Wander: ${this.drift ? 'on' : 'off'}`;
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
      const focusScale = clamp((this.compact ? 820 : 670) / this.distance, .82, this.compact ? 1.12 : 1.18);
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
