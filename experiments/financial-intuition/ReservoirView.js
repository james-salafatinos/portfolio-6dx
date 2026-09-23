/**
 * Bottom panel: four vertical reservoirs — cash, AR, inventory, debt.
 */

const COLORS = {
  bg: '#070b12',
  tank: '#121826',
  stroke: 'rgba(255,255,255,0.14)',
  text: '#cfd8e6',
  muted: '#8b95a8',
  cash: '#5ec8ff',
  ar: '#c9a0ff',
  inventory: '#ffd166',
  debt: '#ff7a6a',
};

const ORDER = [
  { key: 'cash', title: 'Cash', color: COLORS.cash },
  { key: 'ar', title: 'AR', color: COLORS.ar },
  { key: 'inventory', title: 'Inventory', color: COLORS.inventory },
  { key: 'debt', title: 'Debt', color: COLORS.debt },
];

export class ReservoirView {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.levels = { cash: 0.06, ar: 0.06, inventory: 0.06, debt: 0.06 };
    this.labels = null;
  }

  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(1, cssW | 0);
    this.cssH = Math.max(1, cssH | 0);
    this.dpr = Math.min(dpr || 1, 2);
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.draw();
  }

  /**
   * @param {{cash:number,ar:number,inventory:number,debt:number}} levels 0–1 heights
   * @param {object} [labels]
   */
  set(levels, labels) {
    this.levels = { ...this.levels, ...levels };
    if (labels) this.labels = labels;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { cssW: w, cssH: h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 ${Math.max(11, Math.min(13, w * 0.032))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Balance sheet reservoirs (relative)', 12, 16);

    const padX = 12;
    const padTop = 28;
    const padBot = 14;
    const gap = Math.max(8, w * 0.02);
    const n = ORDER.length;
    const tankW = (w - padX * 2 - gap * (n - 1)) / n;
    const tankH = h - padTop - padBot;

    ORDER.forEach((spec, i) => {
      const x = padX + i * (tankW + gap);
      const y = padTop;
      const level = Math.max(0, Math.min(1, this.levels[spec.key] ?? 0));
      this._drawTank(x, y, tankW, tankH, level, spec);
    });
  }

  _drawTank(x, y, tw, th, level, spec) {
    const ctx = this.ctx;
    const r = 8;
    const labelH = 32;
    const bodyH = th - labelH;
    const bodyY = y;

    // tank body
    ctx.beginPath();
    this._roundRect(x, bodyY, tw, bodyH, r);
    ctx.fillStyle = COLORS.tank;
    ctx.fill();
    ctx.strokeStyle = COLORS.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    // liquid
    const fillH = bodyH * level;
    const fy = bodyY + bodyH - fillH;
    ctx.save();
    ctx.beginPath();
    this._roundRect(x + 1, bodyY + 1, tw - 2, bodyH - 2, r - 1);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, fy, 0, bodyY + bodyH);
    grad.addColorStop(0, spec.color);
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, fy, tw, fillH);
    ctx.globalAlpha = 1;
    // surface highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x, fy, tw, 2);
    ctx.restore();

    // title + value under tank
    ctx.textAlign = 'center';
    ctx.fillStyle = spec.color;
    ctx.font = `600 ${Math.max(10, Math.min(12, tw * 0.18))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(spec.title, x + tw / 2, y + bodyH + 14);

    const money = this.labels?.[spec.key] || '';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `${Math.max(9, Math.min(11, tw * 0.15))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(String(money).slice(0, 12), x + tw / 2, y + bodyH + 28);
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  destroy() {
    this.ctx = null;
  }
}
