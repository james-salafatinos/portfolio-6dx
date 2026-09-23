import { DataAdapter } from './DataAdapter.js';
import { Model } from './Model.js';
import { JourneyView } from './JourneyView.js';
import { ReservoirView } from './ReservoirView.js';

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.root = null;
    this.journeyCanvas = null;
    this.reservoirCanvas = null;
    this.journey = null;
    this.reservoir = null;
    this.statement = null;
    this.model = null;
    this._loading = false;
    this._onLoad = this._onLoad.bind(this);
    this._onReplay = this._onReplay.bind(this);
    this._onKey = this._onKey.bind(this);
  }

  async start() {
    const root = this.container;
    root.style.cssText =
      'position:relative;width:100%;height:100%;overflow:hidden;background:#070b12;color:#cfd8e6;';

    root.innerHTML = `
      <div class="fi-shell">
        <header class="fi-hud">
          <label class="fi-ticker-wrap">
            <span class="fi-label">Ticker</span>
            <input class="fi-ticker" type="text" maxlength="12" value="IBM" spellcheck="false" autocomplete="off" enterkeyhint="go" aria-label="Ticker symbol" />
          </label>
          <button type="button" class="fi-btn fi-load">Load</button>
          <button type="button" class="fi-btn fi-replay" disabled>Replay $1</button>
          <span class="fi-badge" hidden>Demo — not live</span>
          <span class="fi-meta" aria-live="polite"></span>
        </header>
        <section class="fi-journey" aria-label="Revenue journey">
          <canvas class="fi-journey-canvas"></canvas>
        </section>
        <section class="fi-reservoirs" aria-label="Balance sheet reservoirs">
          <canvas class="fi-reservoir-canvas"></canvas>
        </section>
      </div>
    `;

    this._injectStyles();

    this.root = root.querySelector('.fi-shell');
    this.journeyCanvas = root.querySelector('.fi-journey-canvas');
    this.reservoirCanvas = root.querySelector('.fi-reservoir-canvas');
    this.tickerInput = root.querySelector('.fi-ticker');
    this.loadBtn = root.querySelector('.fi-load');
    this.replayBtn = root.querySelector('.fi-replay');
    this.badge = root.querySelector('.fi-badge');
    this.meta = root.querySelector('.fi-meta');

    this.journey = new JourneyView(this.journeyCanvas);
    this.reservoir = new ReservoirView(this.reservoirCanvas);

    this.loadBtn.addEventListener('click', this._onLoad);
    this.replayBtn.addEventListener('click', this._onReplay);
    this.tickerInput.addEventListener('keydown', this._onKey);

    this.resize(root.clientWidth, root.clientHeight);
    await this._loadTicker(this.tickerInput.value || 'IBM');
  }

  resize(width, height) {
    if (!this.root) return;
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const hud = this.root.querySelector('.fi-hud');
    const hudH = hud ? hud.offsetHeight : 52;
    const bodyH = Math.max(1, h - hudH);
    const journeyH = Math.floor(bodyH * 0.55);
    const resH = Math.max(1, bodyH - journeyH);

    const journeySec = this.root.querySelector('.fi-journey');
    const resSec = this.root.querySelector('.fi-reservoirs');
    if (journeySec) journeySec.style.height = `${journeyH}px`;
    if (resSec) resSec.style.height = `${resH}px`;

    this.journey?.resize(w, journeyH, dpr);
    this.reservoir?.resize(w, resH, dpr);
  }

  destroy() {
    this.loadBtn?.removeEventListener('click', this._onLoad);
    this.replayBtn?.removeEventListener('click', this._onReplay);
    this.tickerInput?.removeEventListener('keydown', this._onKey);
    this.journey?.destroy();
    this.reservoir?.destroy();
    this.container.replaceChildren();
    this.journey = null;
    this.reservoir = null;
    this.root = null;
  }

  _onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._onLoad();
    }
  }

  async _onLoad() {
    if (this._loading) return;
    await this._loadTicker(this.tickerInput.value);
  }

  _onReplay() {
    if (!this.model) return;
    this.journey.play(this.model.shares);
  }

  async _loadTicker(raw) {
    this._loading = true;
    this.loadBtn.disabled = true;
    this.replayBtn.disabled = true;
    this.meta.textContent = 'Loading…';

    try {
      const statement = await DataAdapter.load(raw);
      this.statement = statement;
      this.model = Model.from(statement);

      this._applySourceBadge(statement);
      this.tickerInput.value = statement.ticker || raw;

      this.journey.setModel(this.model.shares, this.model.labels);
      this.reservoir.set(this.model.levels, this.model.labels);

      const asOf = statement.asOf ? ` · as of ${statement.asOf}` : '';
      const src = statement.source === 'live' ? 'Live' : 'Demo';
      this.meta.textContent = `${src}${asOf}`;

      this.replayBtn.disabled = false;
      // Auto-play once so the journey is obvious on first load.
      this.journey.play(this.model.shares);
    } catch (err) {
      console.error(err);
      this.meta.textContent = 'Load failed';
      this._applySourceBadge({ source: 'demo' });
    } finally {
      this._loading = false;
      this.loadBtn.disabled = false;
    }
  }

  _applySourceBadge(statement) {
    const isDemo = statement?.source !== 'live';
    this.badge.hidden = !isDemo;
    this.badge.textContent = 'Demo — not live';
    this.root?.classList.toggle('fi-demo', isDemo);
  }

  _injectStyles() {
    if (this.container.querySelector('#fi-styles')) return;
    const style = document.createElement('style');
    style.id = 'fi-styles';
    style.textContent = `
      .fi-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      }
      .fi-hud {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(10, 14, 22, 0.96);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        z-index: 2;
        flex: 0 0 auto;
      }
      .fi-ticker-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .fi-label {
        color: #8b95a8;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .fi-ticker {
        width: 5.5rem;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.16);
        background: #121826;
        color: #e8eef8;
        font: 600 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .fi-ticker:focus {
        outline: 2px solid #5ec8ff;
        outline-offset: 1px;
      }
      .fi-btn {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.16);
        background: #1a2436;
        color: #e8eef8;
        border-radius: 8px;
        padding: 8px 12px;
        font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        min-height: 36px;
        touch-action: manipulation;
      }
      .fi-btn:hover:not(:disabled) { background: #243044; }
      .fi-btn:disabled { opacity: 0.45; cursor: default; }
      .fi-btn.fi-replay {
        border-color: rgba(157, 255, 106, 0.45);
        color: #c8ffb0;
      }
      .fi-badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255, 122, 106, 0.15);
        border: 1px solid rgba(255, 122, 106, 0.45);
        color: #ffb4a8;
        font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
        letter-spacing: 0.02em;
        white-space: nowrap;
      }
      .fi-badge[hidden] { display: none !important; }
      .fi-meta {
        color: #8b95a8;
        font-size: 12px;
        margin-left: auto;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .fi-journey, .fi-reservoirs {
        position: relative;
        width: 100%;
        min-height: 0;
        flex: 0 0 auto;
        overflow: hidden;
      }
      .fi-journey { border-bottom: 1px solid rgba(255,255,255,0.06); }
      .fi-journey-canvas, .fi-reservoir-canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      /* Clear fixed site chrome (← 6DX + notes) so ticker stays tappable. */
      @media (max-width: 720px), (max-height: 560px) {
        .fi-hud {
          /* Below fixed ← 6DX + notes (top:18px, ~38px tall + shadow) */
          padding-top: 72px;
          padding-bottom: 10px;
          padding-left: 12px;
          padding-right: 12px;
        }
      }
      @media (max-width: 420px) {
        .fi-meta { width: 100%; margin-left: 0; order: 5; }
        .fi-ticker { width: 4.5rem; }
      }
    `;
    this.container.appendChild(style);
  }
}
