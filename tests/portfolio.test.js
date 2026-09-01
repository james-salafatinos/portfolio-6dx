const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/server');
const { discoverExperiments } = require('../platform/discovery');

test('discovers core experiments', () => {
  const experiments = discoverExperiments();
  assert.ok(experiments.length > 0);
  assert.ok(experiments.some((x) => x.slug === 'voronoi-percolation'));
});

test('server boots and serves home, health, dependencies, and every experiment', async (t) => {
  const server = createApp().listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);

  const home = await fetch(base);
  assert.equal(home.status, 200);

  const three = await fetch(`${base}/vendor/three/build/three.module.js`);
  assert.equal(three.status, 200);

  const gui = await fetch(`${base}/vendor/lil-gui/lil-gui.esm.js`);
  assert.equal(gui.status, 200);

  for (const x of discoverExperiments()) {
    const res = await fetch(`${base}/x/${x.slug}`);
    assert.equal(res.status, 200, x.slug);

    const entry = await fetch(`${base}/experiments/${encodeURIComponent(x.folder)}/${x.entry}`);
    assert.equal(entry.status, 200, `${x.slug} entry`);
  }
});
