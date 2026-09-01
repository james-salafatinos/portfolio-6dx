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

  app.get('/health', (_req, res) => res.json({ ok: true }));
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
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(experiment.name)} · 6DX</title><link rel="stylesheet" href="/platform/styles.css"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/examples/jsm/"}}</script></head><body class="experiment-page"><a class="back" href="/">← 6DX</a><button id="notes-toggle" title="Toggle notes">☰</button><div id="experiment-container"><aside id="notes-panel"><div id="notes-content">Loading notes…</div></aside><div id="experiment-root"></div></div><div id="experiment-error" hidden></div><script type="module">import { marked } from '/vendor/marked/marked.esm.js'; import Experiment from '${entry}'; const root=document.querySelector('#experiment-root'); const container=document.querySelector('#experiment-container'); const toggle=document.querySelector('#notes-toggle'); fetch('${notesSrc}').then((r) => r.text()).then((text) => { document.querySelector('#notes-content').innerHTML = marked.parse(text); }).catch(() => { document.querySelector('#notes-content').textContent = 'Notes unavailable.'; }); try { const instance=new Experiment(root); window.__experiment=instance; await instance.start?.(); const resize=()=>instance.resize?.(root.clientWidth,root.clientHeight); addEventListener('resize',resize); const panel=document.querySelector('#notes-panel'); toggle.addEventListener('click',()=>{ container.classList.toggle('notes-hidden'); panel.addEventListener('transitionend',resize,{once:true}); }); container.classList.add('notes-hidden'); resize(); } catch(error) { console.error(error); const box=document.querySelector('#experiment-error'); box.hidden=false; box.textContent='Experiment failed: '+error.message; }</script></body></html>`);
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, () => console.log(`Portfolio 6DX listening on http://localhost:${port}`));
}

module.exports = { createApp };
