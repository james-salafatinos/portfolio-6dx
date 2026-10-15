export class NetworkView {
  constructor(canvas, network, callbacks = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.nodes = network.nodes.map((node) => ({ ...node, vx: 0, vy: 0, radius: this.radiusFor(node) }));
    this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges = network.edges.map((edge) => ({ ...edge, source: this.nodeById.get(edge.from), target: this.nodeById.get(edge.to) }))
      .filter((edge) => edge.source && edge.target);
    this.callbacks = callbacks;
    this.adjacency = new Map();
    this.selectedId = null;
    this.hoveredId = null;
    this.focused = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.width = 1;
    this.height = 1;
    this.drag = null;
    this.palette = {};
    this.animationFrame = null;
    this.topLabels = new Set(this.nodes.filter((node) => node.kind !== 'recipe')
      .sort((a, b) => b.demand - a.demand).slice(0, 18).map((node) => node.id));

    for (const edge of this.edges) {
      this.#addNeighbor(edge.from, edge.to);
      this.#addNeighbor(edge.to, edge.from);
    }
    this.runLayout();
    this.bindEvents();
  }

  #addNeighbor(from, to) {
    if (!this.adjacency.has(from)) this.adjacency.set(from, new Set());
    this.adjacency.get(from).add(to);
  }

  radiusFor(node) {
    if (node.kind === 'machine') return 7 + Math.log2(node.demand + 1) * 0.7;
    if (node.kind === 'recipe') return 3.2;
    return 4.2 + Math.log2(node.demand + 1) * 1.8;
  }

  runLayout() {
    const iterations = 260;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const cooling = 1 - iteration / iterations;
      for (const node of this.nodes) {
        node.vx += (node.targetX - node.x) * 0.0028;
        node.vy += -node.y * 0.00016;
      }

      for (let left = 0; left < this.nodes.length; left += 1) {
        const a = this.nodes[left];
        for (let right = left + 1; right < this.nodes.length; right += 1) {
          const b = this.nodes[right];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < 1) {
            dx = 1;
            dy = 0.5;
            distanceSquared = 1.25;
          }
          if (distanceSquared > 26000) continue;
          const distance = Math.sqrt(distanceSquared);
          const force = Math.min(1.8, 150 / distanceSquared) * cooling;
          const fx = dx / distance * force;
          const fy = dy / distance * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      for (const edge of this.edges) {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const targetDistance = edge.kind === 'operator' ? 95 : edge.kind === 'energy' ? 125 : 55;
        const strength = edge.kind === 'operator' ? 0.0012 : 0.003;
        const force = (distance - targetDistance) * strength * cooling;
        const fx = dx / distance * force;
        const fy = dy / distance * force;
        edge.source.vx += fx;
        edge.source.vy += fy;
        edge.target.vx -= fx;
        edge.target.vy -= fy;
      }

      for (const node of this.nodes) {
        node.vx *= 0.79;
        node.vy *= 0.79;
        node.x += node.vx;
        node.y += node.vy;
      }
    }
  }

  bindEvents() {
    this.onWheel = (event) => {
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const worldBefore = this.screenToWorld(x, y);
      const factor = Math.exp(-event.deltaY * 0.0012);
      this.scale = Math.max(0.16, Math.min(4, this.scale * factor));
      this.offsetX = x - worldBefore.x * this.scale;
      this.offsetY = y - worldBefore.y * this.scale;
      this.draw();
    };
    this.onPointerDown = (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, offsetX: this.offsetX, offsetY: this.offsetY, moved: false };
    };
    this.onPointerMove = (event) => {
      if (this.drag) {
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
        this.offsetX = this.drag.offsetX + dx;
        this.offsetY = this.drag.offsetY + dy;
        this.draw();
        return;
      }
      const node = this.hitTest(event);
      const id = node?.id || null;
      if (id !== this.hoveredId) {
        this.hoveredId = id;
        this.canvas.classList.toggle('is-over-node', Boolean(node));
        this.callbacks.onHover?.(node);
        this.draw();
      }
    };
    this.onPointerUp = (event) => {
      const wasMoved = this.drag?.moved;
      this.drag = null;
      if (!wasMoved) {
        const node = this.hitTest(event);
        this.select(node?.id || null);
        this.callbacks.onSelect?.(node || null);
      }
    };
    this.onPointerLeave = () => {
      if (!this.drag) {
        this.hoveredId = null;
        this.callbacks.onHover?.(null);
        this.draw();
      }
    };
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  select(id) {
    this.selectedId = id;
    if (!id) {
      this.focused = null;
    } else {
      this.focused = new Set([id, ...(this.adjacency.get(id) || [])]);
    }
    this.draw();
  }

  focus(id) {
    const node = this.nodeById.get(id);
    if (!node) return;
    this.select(id);
    this.scale = Math.max(this.scale, 1.25);
    this.offsetX = this.width / 2 - node.x * this.scale;
    this.offsetY = this.height / 2 - node.y * this.scale;
    this.draw();
  }

  fit() {
    const minX = Math.min(...this.nodes.map((node) => node.x - node.radius));
    const maxX = Math.max(...this.nodes.map((node) => node.x + node.radius));
    const minY = Math.min(...this.nodes.map((node) => node.y - node.radius));
    const maxY = Math.max(...this.nodes.map((node) => node.y + node.radius));
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    this.scale = Math.max(0.16, Math.min(1.4, Math.min((this.width - 70) / graphWidth, (this.height - 70) / graphHeight)));
    this.offsetX = this.width / 2 - (minX + maxX) / 2 * this.scale;
    this.offsetY = this.height / 2 - (minY + maxY) / 2 * this.scale;
    this.draw();
  }

  resize(width, height) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fit();
  }

  resolvePalette() {
    const style = getComputedStyle(this.canvas.closest('.factorio-atlas'));
    this.palette = {
      background: style.getPropertyValue('--factorio-bg').trim(),
      line: style.getPropertyValue('--factorio-line').trim(),
      text: style.getPropertyValue('--factorio-text').trim(),
      muted: style.getPropertyValue('--factorio-muted').trim(),
      item: style.getPropertyValue('--factorio-blue').trim(),
      recipe: style.getPropertyValue('--factorio-orange').trim(),
      machine: style.getPropertyValue('--factorio-green').trim(),
      fuel: style.getPropertyValue('--factorio-yellow').trim(),
      fluid: '#8c7ac8'
    };
  }

  draw() {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = requestAnimationFrame(() => this.#drawNow());
  }

  #drawNow() {
    if (!this.width || !this.height) return;
    if (!this.palette.text) this.resolvePalette();
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.save();
    context.translate(this.offsetX, this.offsetY);
    context.scale(this.scale, this.scale);

    for (const edge of this.edges) {
      const highlighted = !this.focused || (this.focused.has(edge.from) && this.focused.has(edge.to));
      context.globalAlpha = highlighted ? (this.focused ? 0.8 : edge.kind === 'operator' ? 0.035 : 0.13) : 0.012;
      context.strokeStyle = edge.kind === 'energy' ? this.palette.fuel : edge.kind === 'operator' ? this.palette.machine : this.palette.line;
      context.lineWidth = (highlighted && this.focused ? 1.25 : 0.65) / this.scale;
      if (edge.kind === 'operator' || edge.kind === 'energy') context.setLineDash([3 / this.scale, 4 / this.scale]);
      else context.setLineDash([]);
      context.beginPath();
      context.moveTo(edge.source.x, edge.source.y);
      context.lineTo(edge.target.x, edge.target.y);
      context.stroke();
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const unitX = dx / distance;
      const unitY = dy / distance;
      const tipX = edge.target.x - unitX * (edge.target.radius + 1.5 / this.scale);
      const tipY = edge.target.y - unitY * (edge.target.radius + 1.5 / this.scale);
      const arrowLength = (highlighted && this.focused ? 5 : 3.2) / this.scale;
      const arrowWidth = arrowLength * 0.55;
      context.fillStyle = context.strokeStyle;
      context.beginPath();
      context.moveTo(tipX, tipY);
      context.lineTo(tipX - unitX * arrowLength - unitY * arrowWidth, tipY - unitY * arrowLength + unitX * arrowWidth);
      context.lineTo(tipX - unitX * arrowLength + unitY * arrowWidth, tipY - unitY * arrowLength - unitX * arrowWidth);
      context.closePath();
      context.fill();
    }
    context.setLineDash([]);

    const hovered = this.nodeById.get(this.hoveredId);
    const selected = this.nodeById.get(this.selectedId);
    const orderedNodes = this.nodes.filter((node) => node !== hovered && node !== selected);
    if (selected) orderedNodes.push(selected);
    if (hovered && hovered !== selected) orderedNodes.push(hovered);

    for (const node of orderedNodes) {
      const active = !this.focused || this.focused.has(node.id);
      const emphasized = node.id === this.selectedId || node.id === this.hoveredId;
      const color = this.palette[node.kind] || this.palette.item;
      context.globalAlpha = active ? 0.92 : 0.08;
      context.fillStyle = color;
      context.strokeStyle = emphasized ? this.palette.text : color;
      context.lineWidth = (emphasized ? 2.2 : 0.8) / this.scale;
      context.beginPath();
      if (node.kind === 'recipe') {
        const radius = node.radius * (emphasized ? 1.7 : 1);
        context.rect(node.x - radius, node.y - radius, radius * 2, radius * 2);
      } else if (node.kind === 'machine') {
        const radius = node.radius * (emphasized ? 1.35 : 1);
        for (let side = 0; side < 6; side += 1) {
          const angle = Math.PI / 3 * side;
          const x = node.x + Math.cos(angle) * radius;
          const y = node.y + Math.sin(angle) * radius;
          if (side === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.closePath();
      } else {
        context.arc(node.x, node.y, node.radius * (emphasized ? 1.35 : 1), 0, Math.PI * 2);
      }
      context.fill();
      context.stroke();
    }

    context.globalAlpha = 1;
    const labelNodes = this.nodes.filter((node) => {
      if (node.id === this.selectedId || node.id === this.hoveredId) return true;
      if (this.focused?.has(node.id) && node.kind !== 'recipe') return true;
      return !this.focused && this.topLabels.has(node.id) && this.scale >= 0.32;
    }).sort((a, b) => {
      const aPriority = a.id === this.hoveredId ? 3 : a.id === this.selectedId ? 2 : 0;
      const bPriority = b.id === this.hoveredId ? 3 : b.id === this.selectedId ? 2 : 0;
      return bPriority - aPriority || b.demand - a.demand;
    });
    context.font = `${Math.max(10, 11 / this.scale)}px Inter, system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    const labelBoxes = [];
    for (const node of labelNodes) {
      const y = node.y - node.radius - 3 / this.scale;
      const width = context.measureText(node.label).width;
      const height = 13 / this.scale;
      const box = { left: node.x - width / 2 - 3 / this.scale, right: node.x + width / 2 + 3 / this.scale, top: y - height, bottom: y + 2 / this.scale };
      const important = node.id === this.selectedId || node.id === this.hoveredId;
      const overlaps = labelBoxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      if (overlaps && !important) continue;
      labelBoxes.push(box);
      context.lineWidth = 3 / this.scale;
      context.strokeStyle = this.palette.background;
      context.strokeText(node.label, node.x, y);
      context.fillStyle = this.palette.text;
      context.fillText(node.label, node.x, y);
    }
    context.restore();
  }

  screenToWorld(x, y) {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
  }

  hitTest(event) {
    const rect = this.canvas.getBoundingClientRect();
    const point = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    let closest = null;
    let closestDistance = Infinity;
    for (const node of this.nodes) {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      const hitRadius = Math.max(node.radius + 4 / this.scale, 8 / this.scale);
      if (distance <= hitRadius && distance < closestDistance) {
        closest = node;
        closestDistance = distance;
      }
    }
    return closest;
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }
}
