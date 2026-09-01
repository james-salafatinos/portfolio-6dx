const TWO_PI = Math.PI * 2;

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 1;
    this.height = 1;
  }

  resize(width, height) {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.floor(this.width * scale);
    this.canvas.height = Math.floor(this.height * scale);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  render(graph, state, colorMode) {
    const ctx = this.ctx;
    const box = this.bounds();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, this.width, this.height);
    drawBoundary(ctx, box);

    if (graph.renderKind !== 'grid') this.drawEdges(graph, state, box);
    if (graph.renderKind === 'grid') this.drawGrid(graph, state, box, colorMode);
    else this.drawPoints(graph, state, box, colorMode);
  }

  drawGrid(graph, state, box, colorMode) {
    const ctx = this.ctx;
    for (const node of graph.nodes) {
      const active = state.uf.isActive(node.id);
      const shape = node.shape;
      const x = box.x + shape.x * box.w;
      const y = box.y + shape.y * box.h;
      const w = Math.max(1, shape.w * box.w);
      const h = Math.max(1, shape.h * box.h);
      ctx.fillStyle = active ? nodeColor(node, state, colorMode) : '#26323b';
      ctx.fillRect(x, y, w + 0.25, h + 0.25);
    }
  }

  drawEdges(graph, state, box) {
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    for (const edge of graph.edges) {
      const active = state.activeEdges[edge.id] === 1;
      if (!active && graph.renderKind === 'distance') continue;
      const a = graph.nodes[edge.a];
      const b = graph.nodes[edge.b];
      ctx.strokeStyle = active ? 'rgba(134, 225, 172, 0.58)' : 'rgba(210, 220, 230, 0.12)';
      ctx.beginPath();
      ctx.moveTo(box.x + a.x * box.w, box.y + a.y * box.h);
      ctx.lineTo(box.x + b.x * box.w, box.y + b.y * box.h);
      ctx.stroke();
    }
  }

  drawPoints(graph, state, box, colorMode) {
    const ctx = this.ctx;
    const radius = graph.nodes.length > 320 ? 3 : 4.5;
    for (const node of graph.nodes) {
      const active = state.uf.isActive(node.id);
      const x = box.x + node.x * box.w;
      const y = box.y + node.y * box.h;
      ctx.fillStyle = active ? nodeColor(node, state, colorMode) : '#3d4651';
      ctx.beginPath();
      ctx.arc(x, y, active ? radius + 0.75 : radius, 0, TWO_PI);
      ctx.fill();
      if (state.spanningRoot !== null && active && state.uf.find(node.id) === state.spanningRoot) {
        ctx.strokeStyle = '#f7d774';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  bounds() {
    const pad = Math.max(16, Math.min(this.width, this.height) * 0.04);
    const side = Math.max(1, Math.min(this.width - pad * 2, this.height - pad * 2));
    return { x: (this.width - side) / 2, y: (this.height - side) / 2, w: side, h: side };
  }
}

function drawBoundary(ctx, box) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = 'rgba(247, 215, 116, 0.72)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x + box.w, box.y);
  ctx.moveTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();
}

function nodeColor(node, state, mode) {
  const meta = state.uf.componentMeta(node.id);
  if (state.spanningRoot !== null && state.uf.find(node.id) === state.spanningRoot) return '#f7d774';
  if (mode === 'size') {
    const t = Math.min(1, Math.sqrt(meta.size / Math.max(1, state.metrics.largest)));
    return mix('#4f6d7a', '#86e1ac', t);
  }
  if (mode === 'threshold') return mix('#4f6d7a', '#d9896a', node.threshold ?? state.parameter);
  return hsl(meta.colorSeed * 137.508);
}

function hsl(hue) {
  return `hsl(${hue % 360} 68% 58%)`;
}

function mix(a, b, t) {
  const aa = hex(a);
  const bb = hex(b);
  const c = aa.map((v, i) => Math.round(v + (bb[i] - v) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

function hex(value) {
  return [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
}
