const express = require('express');
const path = require('path');
const { ROOT, EXPERIMENTS_DIR, discoverExperiments, findExperiment } = require('../platform/discovery');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' }[c]));
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use('/experiments', express.static(EXPERIMENTS_DIR));
  app.use('/platform', express.static(path.join(ROOT, 'platform', 'public')));
  app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three')));
  app.use('/vendor/lil-gui', express.static(path.join(ROOT, 'node_modules', 'lil-gui', 'dist')));
  app.use('/vendor/marked', express.static(path.join(ROOT, 'node_modules', 'marked', 'lib')));
  app.use('/vendor/mathjax', express.static(path.join(ROOT, 'node_modules', 'mathjax')));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  function numField(v) {
    if (v == null || v === 'None' || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function mapFinNodeStatement(ticker, payload) {
    const incomeArr =
      payload?.statements?.income_statement ||
      payload?.income_statement ||
      null;
    const balanceArr =
      payload?.statements?.balance_sheet ||
      payload?.balance_sheet ||
      null;
    if (!Array.isArray(incomeArr) || !incomeArr.length) return null;
    if (!Array.isArray(balanceArr) || !balanceArr.length) return null;

    const incomeRaw = incomeArr[0];
    const balanceRaw = balanceArr[0];

    const revenue = numField(incomeRaw['Total Revenue']);
    const cogs = numField(incomeRaw['Cost Of Revenue']);
    const opex = numField(incomeRaw['Operating Expense']);
    const operatingIncome = numField(incomeRaw['Operating Income']);

    const cash = numField(balanceRaw['Cash And Cash Equivalents']);
    const ar = numField(balanceRaw['Accounts Receivable']);
    const inventory = numField(balanceRaw['Inventory']);
    let debt = numField(balanceRaw['Total Debt']);
    if (!debt) {
      debt =
        numField(balanceRaw['Current Debt']) +
        numField(balanceRaw['Long Term Debt']);
    }

    // Require a usable income snapshot; zero revenue is treated as missing.
    if (!revenue) return null;

    const asOf = incomeRaw.date || balanceRaw.date || payload.updated || null;

    return {
      source: 'live',
      asOf,
      ticker,
      income: { revenue, cogs, opex, operatingIncome },
      balance: { cash, ar, inventory, debt },
    };
  }

  app.get('/api/financials/:ticker', async (req, res) => {
    const ticker = String(req.params.ticker || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9.\-]/g, '');
    if (!ticker) {
      return res.status(404).json({ error: 'Missing ticker' });
    }

    const url = `https://www.fin-node.net/api/${encodeURIComponent(ticker)}.json`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const upstream = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      if (upstream.status === 404) {
        return res.status(404).json({ error: 'Ticker not found' });
      }
      if (!upstream.ok) {
        return res.status(502).json({ error: `Upstream HTTP ${upstream.status}` });
      }
      const payload = await upstream.json();
      const mapped = mapFinNodeStatement(ticker, payload);
      if (!mapped) {
        return res.status(404).json({ error: 'No financial statements for ticker' });
      }
      return res.json(mapped);
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      return res.status(502).json({
        error: aborted ? 'Upstream timeout' : 'Upstream fetch failed',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  app.get('/', (_req, res) => {
    const experiments = discoverExperiments();
    const pastelColors = ['#B5C0D0', '#CCD3CA', '#F5E8DD', '#EED3D9'];
    const cards = experiments.map((x, index) => {
      const color = pastelColors[index % pastelColors.length];
      return `<a class="card" style="--card-color:${color}" href="/x/${encodeURIComponent(x.slug)}"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.description)}</span><small>${(x.tags || []).map(escapeHtml).join(' · ')}</small></a>`;
    }).join('');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portfolio 6DX</title><link rel="stylesheet" href="/platform/styles.css"></head><body><main><header><h1>Hello.</h1><p>Portfolio 6DX — experiments, visualizations, and ideas.</p></header><section class="grid">${cards || '<p>No experiments yet.</p>'}</section></main></body></html>`);
  });

  app.get('/x/:slug', (req, res) => {
    const experiment = findExperiment(req.params.slug);
    if (!experiment) return res.status(404).send('Experiment not found');
    const entry = `/experiments/${encodeURIComponent(experiment.folder)}/${experiment.entry.split('/').map(encodeURIComponent).join('/')}`;
    const notesSrc = `/experiments/${encodeURIComponent(experiment.folder)}/notes.md`;
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(experiment.name)} · 6DX</title><link rel="stylesheet" href="/platform/styles.css"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/examples/jsm/"}}</script><script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]]},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"]}};</script><script src="/vendor/mathjax/tex-svg.js" defer></script></head><body class="experiment-page"><a class="back" href="/">← 6DX</a><button id="notes-toggle" title="Toggle notes">☰</button><div id="experiment-container"><aside id="notes-panel"><div id="notes-content">Loading notes…</div></aside><div id="experiment-root"></div></div><div id="experiment-error" hidden></div><script type="module">import { marked } from '/vendor/marked/marked.esm.js'; import Experiment from '${entry}'; const root=document.querySelector('#experiment-root'); const container=document.querySelector('#experiment-container'); const toggle=document.querySelector('#notes-toggle'); fetch('${notesSrc}').then((r) => r.text()).then((text) => { const content=document.querySelector('#notes-content'); content.innerHTML = marked.parse(text); return (window.MathJax?.startup?.promise || Promise.resolve()).then(() => window.MathJax?.typesetPromise?.([content])); }).catch(() => { document.querySelector('#notes-content').textContent = 'Notes unavailable.'; }); try { const instance=new Experiment(root); window.__experiment=instance; await instance.start?.(); const resize=()=>instance.resize?.(root.clientWidth,root.clientHeight); addEventListener('resize',resize); const panel=document.querySelector('#notes-panel'); toggle.addEventListener('click',()=>{ container.classList.toggle('notes-hidden'); panel.addEventListener('transitionend',resize,{once:true}); }); container.classList.add('notes-hidden'); resize(); } catch(error) { console.error(error); const box=document.querySelector('#experiment-error'); box.hidden=false; box.textContent='Experiment failed: '+error.message; }</script></body></html>`);
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, () => console.log(`Portfolio 6DX listening on http://localhost:${port}`));
}

module.exports = { createApp };
