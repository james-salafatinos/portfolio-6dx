/**
 * Top panel: Revenue → COGS / OpEx / Residual. Animates a $1 particle on play(shares).
 */

const COLORS = {
  bg: '#0a0e16',
  panel: '#121826',
  stroke: 'rgba(255,255,255,0.12)',
  text: '#cfd8e6',
  muted: '#8b95a8',
  revenue: '#5ec8ff',
  cogs: '#ff7a6a',
  opex: '#ffb86a',
  residual: '#9dff6a',
  particle: '#ffffff',
};

export class JourneyView {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.shares = { cogsShare: 0.4, opexShare: 0.25, residualShare: 0.35 };
    this.labels = null;
    this.particle = null; // { t, pathIndex, x, y } or null
    this.raf = 0;
    this._frame = this._frame.bind(this);
    this._paths = [];
  }

  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(1, cssW | 0);
    this.cssH = Math.max(1, cssH | 0);
    this.dpr = Math.min(dpr || 1, 2);
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this._layout();
    this.draw();
  }

  setModel(shares, labels) {
    this.shares = { ...shares };
    this.labels = labels;
    this._layout();
    this.draw();
  }

  /**
   * Animate $1 from Revenue through the three branches (parallel paths by share).
   * @param {{cogsShare:number,opexShare:number,residualShare:number}} shares
   */
  play(shares) {
    if (shares) this.shares = { ...shares };
    this._layout();
    cancelAnimationFrame(this.raf);
    // One particle travels Revenue → residual path by default weight, but we run
    // three pulses sequentially so each branch is visible: COGS, OpEx, Residual.
    this._queue = ['cogs', 'opex', 'residual'].filter((k) => {
      const s = this.shares[`${k}Share`] ?? this.shares[k];
      return (s ?? 0) > 0.002;
    });
    if (!this._queue.length) this._queue = ['residual'];
    this._startNextPulse();
  }

  _startNextPulse() {
    const key = this._queue.shift();
    if (!key) {
      this.particle = null;
      this.draw();
      return;
    }
    const path = this._paths.find((p) => p.key === key) || this._paths[0];
    this.particle = {
      key,
      t0: performance.now(),
      duration: 900,
      x0: path.x0,
      y0: path.y0,
      x1: path.x1,
      y1: path.y1,
    };
    this.raf = requestAnimationFrame(this._frame);
  }

  _frame(now) {
    if (!this.particle) return;
    const u = Math.min(1, (now - this.particle.t0) / this.particle.duration);
    const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    this.particle.x = this.particle.x0 + (this.particle.x1 - this.particle.x0) * ease;
    this.particle.y = this.particle.y0 + (this.particle.y1 - this.particle.y0) * ease;
    this.draw();
    if (u < 1) {
      this.raf = requestAnimationFrame(this._frame);
    } else {
      // brief dwell then next branch
      setTimeout(() => this._startNextPulse(), 180);
    }
  }

  _layout() {
    const w = this.cssW;
    const h = this.cssH;
    const pad = Math.max(10, Math.min(18, w * 0.04));
    const boxW = Math.min(120, w * 0.22);
    const boxH = Math.min(56, h * 0.28);
    const leftX = pad;
    const rightX = w - pad - boxW;
    const midY = h * 0.52;
    const topY = h * 0.22;
    const botY = h * 0.78;

    const rev = { x: leftX, y: midY - boxH / 2, w: boxW, h: boxH };
    const targets = [
      { key: 'cogs', title: 'COGS', share: this.shares.cogsShare, color: COLORS.cogs, y: topY - boxH / 2 },
      { key: 'opex', title: 'OpEx', share: this.shares.opexShare, color: COLORS.opex, y: midY - boxH / 2 },
      { key: 'residual', title: 'Residual', share: this.shares.residualShare, color: COLORS.residual, y: botY - boxH / 2 },
    ];

    this._rev = rev;
    this._targets = targets.map((t) => ({
      ...t,
      x: rightX,
      w: boxW,
      h: boxH,
    }));

    this._paths = this._targets.map((t) => ({
      key: t.key,
      x0: rev.x + rev.w,
      y0: rev.y + rev.h / 2,
      x1: t.x,
      y1: t.y + t.h / 2,
      color: t.color,
    }));
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { cssW: w, cssH: h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // title strip (compact on phone so boxes keep height)
    const narrow = w < 420;
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 ${narrow ? 10 : Math.max(11, Math.min(13, w * 0.032))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(narrow ? '$1 journey' : 'Revenue → where $1 goes', 12, narrow ? 12 : 16);
    if (this.labels?.revenue) {
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.text;
      ctx.fillText(`Rev ${this.labels.revenue}`, w - 12, narrow ? 12 : 16);
    }

    // flow curves
    for (const p of this._paths) {
      const share = this.shares[`${p.key}Share`] ?? 0;
      ctx.beginPath();
      ctx.moveTo(p.x0, p.y0);
      const cx = (p.x0 + p.x1) / 2;
      ctx.bezierCurveTo(cx, p.y0, cx, p.y1, p.x1, p.y1);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.25 + share * 0.65;
      ctx.lineWidth = 2 + share * 10;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // revenue box
    this._drawBox(this._rev, 'Revenue', this.labels?.revenue || '$1', COLORS.revenue);

    // target boxes
    for (const t of this._targets) {
      const pct = `${((t.share || 0) * 100).toFixed(1)}%`;
      const sub =
        t.key === 'residual'
          ? '≠ cash pocket'
          : this.labels?.[t.key]?.split(' · ')[0] || '';
      this._drawBox(t, `${t.title}  ${pct}`, sub, t.color);
    }

    // particle
    if (this.particle) {
      const { x, y } = this.particle;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.particle;
      ctx.shadowColor = 'rgba(255,255,255,0.55)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a0e16';
      ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$1', x, y + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
  }

  _drawBox(box, title, subtitle, accent) {
    const ctx = this.ctx;
    const r = 10;
    ctx.beginPath();
    this._roundRect(box.x, box.y, box.w, box.h, r);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = `600 ${Math.max(10, Math.min(12, box.w * 0.12))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, box.x + box.w / 2, box.y + box.h * 0.4);

    ctx.fillStyle = COLORS.muted;
    ctx.font = `${Math.max(9, Math.min(11, box.w * 0.1))}px ui-sans-serif, system-ui, sans-serif`;
    const sub = String(subtitle || '').slice(0, 22);
    ctx.fillText(sub, box.x + box.w / 2, box.y + box.h * 0.72);
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
    cancelAnimationFrame(this.raf);
    this.particle = null;
    this.ctx = null;
  }
}
