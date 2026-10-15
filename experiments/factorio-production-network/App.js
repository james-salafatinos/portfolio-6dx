import { ProductionGraph } from './ProductionGraph.js';
import { NetworkView } from './NetworkView.js';

const NS = 'http://www.w3.org/2000/svg';

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.dataset = null;
    this.graph = null;
    this.networkView = null;
    this.selectedItem = 'iron-plate';
    this.mode = 'network';
    this.resizeObserver = null;
    this.stylesheet = null;
  }

  async start() {
    this.stylesheet = document.createElement('link');
    this.stylesheet.rel = 'stylesheet';
    this.stylesheet.href = '/experiments/factorio-production-network/styles.css';
    document.head.append(this.stylesheet);

    const response = await fetch('/experiments/factorio-production-network/data/factorio-base-2.0.77.json');
    if (!response.ok) throw new Error(`Could not load Factorio data (${response.status})`);
    this.dataset = await response.json();
    this.graph = new ProductionGraph(this.dataset);
    this.renderShell();
    this.bindEvents();
    this.networkView = new NetworkView(this.networkCanvas, this.graph.fullNetwork(), {
      onSelect: (node) => this.handleNetworkSelection(node),
      onHover: (node) => this.handleNetworkHover(node)
    });
    this.renderOverviewSummary();
    this.resizeObserver = new ResizeObserver(() => this.resizeGraph());
    this.resizeObserver.observe(this.graphSurface);
    this.resizeGraph();
  }

  renderShell() {
    const ranking = this.graph.demandRanking().slice(0, 12);
    const options = this.dataset.items.map((item) => `<option value="${item.name}" data-id="${item.id}"></option>`).join('');
    this.container.innerHTML = `
      <main class="factorio-atlas">
        <header class="atlas-header">
          <div>
            <p class="eyebrow">Base game · complete production graph</p>
            <h1>Factorio production atlas</h1>
          </div>
          <div class="version-chip">Factorio ${this.dataset.version}</div>
        </header>
        <section class="atlas-body">
          <aside class="atlas-sidebar">
            <label class="search-label" for="factorio-item-search">Find a material</label>
            <input id="factorio-item-search" class="item-search" list="factorio-item-options" placeholder="Search ${this.dataset.items.length} materials" autocomplete="off">
            <datalist id="factorio-item-options">${options}</datalist>
            <div class="coverage" aria-label="Dataset coverage">
              <div><strong>${this.dataset.items.length}</strong><span>materials</span></div>
              <div><strong>${this.dataset.recipes.length}</strong><span>recipes</span></div>
              <div><strong>${this.dataset.machines.length}</strong><span>machines</span></div>
            </div>
            <section class="selection-summary" aria-live="polite"></section>
            <section class="ranking-section">
              <div class="section-heading">
                <h2>Most reused inputs</h2>
                <span>recipe count</span>
              </div>
              <ol class="demand-ranking">
                ${ranking.map((item) => `
                  <li>
                    <button type="button" data-item-id="${item.id}">
                      <span>${item.name}</span><strong>${item.recipeCount}</strong>
                    </button>
                  </li>`).join('')}
              </ol>
              <p class="ranking-note">Node size follows direct recipe reuse. This is structural demand, before production rates.</p>
            </section>
          </aside>
          <section class="graph-panel" aria-label="Factorio production network">
            <div class="graph-toolbar">
              <div class="view-controls" role="group" aria-label="Graph view">
                <button type="button" class="view-button is-active" data-view="network">Full network</button>
                <button type="button" class="view-button" data-view="neighborhood">Neighborhood</button>
                <button type="button" class="fit-button">Fit graph</button>
              </div>
              <div class="legend" aria-label="Node types">
                <span><i class="legend-item"></i>material</span>
                <span><i class="legend-recipe"></i>recipe</span>
                <span><i class="legend-machine"></i>machine</span>
                <span><i class="legend-fuel"></i>fuel</span>
              </div>
              <p class="graph-status"></p>
            </div>
            <div class="graph-surface">
              <canvas class="network-canvas" role="img" aria-label="Interactive directed network of Factorio materials, recipes, machines, and fuels. Drag to pan, use the mouse wheel to zoom, and click a node to inspect its immediate connections."></canvas>
              <svg class="production-svg is-hidden" role="img" aria-labelledby="production-title production-description">
                <title id="production-title">Factorio production neighborhood</title>
                <desc id="production-description">Inputs flow through recipes into the selected material and its direct consumers. Machines and fuel compatibility are shown as supporting edges.</desc>
              </svg>
              <p class="interaction-hint">Drag to pan · wheel to zoom · click to isolate</p>
            </div>
          </section>
        </section>
      </main>`;
    this.search = this.container.querySelector('.item-search');
    this.summary = this.container.querySelector('.selection-summary');
    this.graphPanel = this.container.querySelector('.graph-panel');
    this.graphSurface = this.container.querySelector('.graph-surface');
    this.networkCanvas = this.container.querySelector('.network-canvas');
    this.svg = this.container.querySelector('.production-svg');
    this.graphStatus = this.container.querySelector('.graph-status');
    this.fitButton = this.container.querySelector('.fit-button');
  }

  bindEvents() {
    this.search.addEventListener('change', () => {
      const query = this.search.value.trim().toLowerCase();
      const item = this.dataset.items.find((candidate) => candidate.name.toLowerCase() === query || candidate.id === query);
      if (item) this.selectItem(item.id, true);
    });
    this.container.querySelector('.demand-ranking').addEventListener('click', (event) => {
      const button = event.target.closest('[data-item-id]');
      if (button) this.selectItem(button.dataset.itemId, true);
    });
    this.container.querySelector('.view-controls').addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) this.setMode(viewButton.dataset.view);
      if (event.target.closest('.fit-button')) this.networkView?.fit();
    });
    this.svg.addEventListener('click', (event) => {
      const node = event.target.closest('[data-kind="item"], [data-kind="fluid"], [data-kind="fuel"]');
      if (node && this.graph.items.has(node.dataset.ref)) this.selectItem(node.dataset.ref, false);
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.container.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === mode));
    this.networkCanvas.classList.toggle('is-hidden', mode !== 'network');
    this.svg.classList.toggle('is-hidden', mode !== 'neighborhood');
    this.fitButton.hidden = mode !== 'network';
    this.container.querySelector('.interaction-hint').hidden = mode !== 'network';
    if (mode === 'network') {
      this.graphStatus.textContent = `${this.networkView.nodes.length} nodes · ${this.networkView.edges.length} directed links`;
      this.resizeGraph();
    } else {
      if (!this.graph.items.has(this.selectedItem)) this.selectedItem = 'iron-plate';
      this.drawNeighborhood();
    }
  }

  handleNetworkSelection(node) {
    if (!node) {
      this.search.value = '';
      this.renderOverviewSummary();
      return;
    }
    if (node.kind === 'item' || node.kind === 'fluid' || node.kind === 'fuel') {
      this.selectItem(node.ref, false);
      return;
    }
    if (node.kind === 'recipe') {
      const recipe = this.graph.recipes.get(node.ref);
      const machines = recipe ? this.graph.machinesFor(recipe) : [];
      this.summary.innerHTML = `
        <p class="eyebrow">Selected recipe</p>
        <h2>${node.label}</h2>
        <dl>
          <div><dt>Category</dt><dd>${recipe?.category || '—'}</dd></div>
          <div><dt>Craft time</dt><dd>${recipe?.time || '—'} seconds</dd></div>
          <div><dt>Machines</dt><dd>${machines.length}</dd></div>
        </dl>`;
    } else if (node.kind === 'machine') {
      const machine = this.graph.machines.get(node.ref);
      const recipeCount = this.dataset.recipes.filter((recipe) => machine?.categories.includes(recipe.category)).length;
      this.summary.innerHTML = `
        <p class="eyebrow">Selected machine</p>
        <h2>${node.label}</h2>
        <dl>
          <div><dt>Crafting speed</dt><dd>${machine?.craftingSpeed || '—'}×</dd></div>
          <div><dt>Energy</dt><dd>${machine?.energy.type || '—'}</dd></div>
          <div><dt>Eligible recipes</dt><dd>${recipeCount}</dd></div>
        </dl>`;
    }
  }

  handleNetworkHover(node) {
    if (this.mode !== 'network') return;
    this.graphStatus.textContent = node
      ? `${node.label} · ${node.kind}${node.demand ? ` · ${node.demand} connections` : ''}`
      : `${this.networkView.nodes.length} nodes · ${this.networkView.edges.length} directed links`;
  }

  renderOverviewSummary() {
    const rawCount = this.dataset.items.filter((item) => !(this.graph.producers.get(item.id) || []).length).length;
    this.summary.innerHTML = `
      <p class="eyebrow">Network overview</p>
      <h2>${this.dataset.items.length + this.dataset.recipes.length + this.dataset.machines.length} connected nodes</h2>
      <p class="summary-copy">Large material nodes feed the most distinct recipes. Select one to reveal its immediate production neighborhood.</p>
      <dl>
        <div><dt>Raw inputs</dt><dd>${rawCount}</dd></div>
        <div><dt>Fuel types</dt><dd>${this.dataset.fuels.length}</dd></div>
        <div><dt>Recipe categories</dt><dd>${new Set(this.dataset.recipes.map((recipe) => recipe.category)).size}</dd></div>
      </dl>`;
    if (this.networkView) this.graphStatus.textContent = `${this.networkView.nodes.length} nodes · ${this.networkView.edges.length} directed links`;
  }

  selectItem(itemId, focusNetwork) {
    const item = this.graph.items.get(itemId);
    if (!item) return;
    this.selectedItem = item.id;
    this.search.value = item.name;
    const producers = this.graph.producers.get(item.id) || [];
    const consumers = this.graph.consumers.get(item.id) || [];
    const ranking = this.graph.demandRanking();
    const rank = ranking.findIndex((candidate) => candidate.id === item.id) + 1;
    this.summary.innerHTML = `
      <p class="eyebrow">Selected ${item.type}</p>
      <h2>${item.name}</h2>
      <dl>
        <div><dt>Produced by</dt><dd>${producers.length} recipe${producers.length === 1 ? '' : 's'}</dd></div>
        <div><dt>Consumed by</dt><dd>${consumers.length} recipe${consumers.length === 1 ? '' : 's'}</dd></div>
        <div><dt>Reuse rank</dt><dd>${rank || '—'}</dd></div>
        <div><dt>Internal ID</dt><dd><code>${item.id}</code></dd></div>
      </dl>`;
    if (this.mode === 'network') {
      if (focusNetwork) this.networkView?.focus(`item:${item.id}`);
      else this.networkView?.select(`item:${item.id}`);
    } else {
      this.drawNeighborhood();
    }
  }

  drawNeighborhood() {
    if (!this.graph || !this.svg || this.mode !== 'neighborhood') return;
    const view = this.graph.neighborhood(this.selectedItem);
    const width = Math.max(760, this.graphSurface.clientWidth || 760);
    const height = Math.max(580, this.graphSurface.clientHeight || 580);
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.replaceChildren(this.svg.querySelector('title'), this.svg.querySelector('desc'));
    this.graphStatus.textContent = view.hiddenConsumerCount
      ? `${view.consumerCount} consuming recipes · showing 10`
      : `${view.consumerCount} consuming recipe${view.consumerCount === 1 ? '' : 's'}`;

    const defs = svgElement('defs');
    const marker = svgElement('marker', { id: 'factorio-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z' }));
    defs.append(marker);
    this.svg.append(defs);

    const margin = 32;
    const columns = [margin + 62, width * 0.27, width * 0.49, width * 0.70, width - margin - 62];
    const byLayer = new Map();
    for (const node of view.nodes) {
      if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
      byLayer.get(node.layer).push(node);
    }
    const positions = new Map();
    for (let layer = 0; layer <= 4; layer += 1) {
      const nodes = byLayer.get(layer) || [];
      const available = height - 110;
      const gap = Math.min(64, available / Math.max(1, nodes.length));
      const start = 66 + Math.max(0, (available - gap * (nodes.length - 1)) / 2);
      nodes.forEach((node, index) => positions.set(node.id, { x: columns[layer], y: start + index * gap }));
    }

    const edgeLayer = svgElement('g', { class: 'edge-layer' });
    for (const edge of view.edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) continue;
      const bend = Math.max(28, Math.abs(to.x - from.x) * 0.45);
      const path = svgElement('path', {
        d: `M ${from.x + 62} ${from.y} C ${from.x + 62 + bend} ${from.y}, ${to.x - 62 - bend} ${to.y}, ${to.x - 62} ${to.y}`,
        class: `edge edge-${edge.type}`,
        'marker-end': 'url(#factorio-arrow)'
      });
      edgeLayer.append(path);
      if (edge.amount !== null) {
        const label = svgElement('text', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 5, class: 'edge-label' });
        label.textContent = `×${Number(edge.amount.toFixed(3))}`;
        edgeLayer.append(label);
      }
    }
    this.svg.append(edgeLayer);

    const nodeLayer = svgElement('g', { class: 'node-layer' });
    for (const node of view.nodes) {
      const position = positions.get(node.id);
      const group = svgElement('g', {
        class: `graph-node node-${node.kind}${node.selected ? ' is-selected' : ''}`,
        transform: `translate(${position.x}, ${position.y})`,
        'data-kind': node.kind,
        'data-ref': node.ref
      });
      group.append(svgElement('rect', { x: '-62', y: '-21', width: '124', height: '42', rx: node.kind === 'recipe' ? '4' : '15' }));
      const label = svgElement('text', { y: node.detail ? '-2' : '4', 'text-anchor': 'middle' });
      label.textContent = node.label.length > 19 ? `${node.label.slice(0, 18)}…` : node.label;
      group.append(label);
      if (node.detail) {
        const detail = svgElement('text', { y: '13', 'text-anchor': 'middle', class: 'node-detail' });
        detail.textContent = node.detail;
        group.append(detail);
      }
      nodeLayer.append(group);
    }
    this.svg.append(nodeLayer);
  }

  resizeGraph() {
    if (!this.graphSurface) return;
    const width = this.graphSurface.clientWidth;
    const height = this.graphSurface.clientHeight;
    if (this.mode === 'network') this.networkView?.resize(width, height);
    else this.drawNeighborhood();
  }

  resize() {
    this.resizeGraph();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.networkView?.destroy();
    this.stylesheet?.remove();
    this.container.replaceChildren();
  }
}
