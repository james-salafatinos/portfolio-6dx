const test = require('node:test');
const assert = require('node:assert/strict');

async function Model() { return import('../experiments/causal-percolative-wfc/Model.mjs'); }

test('CP-WFC is bitwise reproducible for identical parameters', async () => {
  const { CPWFCModel } = await Model();
  const params = { L: 32, p: 0.53, T: 0.7, q: 5, seed: 123456789 };
  const a = new CPWFCModel(params); a.run();
  const b = new CPWFCModel(params); b.run();
  assert.deepEqual(a.states, b.states);
  assert.deepEqual(a.times, b.times);
  assert.deepEqual(a.parents, b.parents);
});

test('quenched endpoint cases: p=0 dies at seed and p=1 fills', async () => {
  const { CPWFCModel } = await Model();
  const closed = new CPWFCModel({ L: 20, p: 0, seed: 7 }); closed.run();
  const open = new CPWFCModel({ L: 20, p: 1, seed: 7 }); open.run();
  assert.equal(closed.collapsedCount, 1);
  assert.equal(open.collapsedCount, 400);
  assert.equal(open.metrics.spanning, true);
});

test('low-temperature ferromagnetic parent collapse is monochrome', async () => {
  const { CPWFCModel } = await Model();
  const model = new CPWFCModel({ L: 24, p: 1, T: 0.01, J: 1, q: 4, seed: 81 }); model.run();
  const used = new Set(model.states);
  assert.equal(used.size, 1);
});

test('spanning response brackets the square-lattice critical region', async () => {
  const { CPWFCModel } = await Model();
  const probability = (p) => {
    let spans = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const model = new CPWFCModel({ L: 28, p, seed: seed * 104729 }); model.run();
      spans += Number(model.metrics.spanning);
    }
    return spans / 40;
  };
  assert.ok(probability(0.42) < probability(0.58));
});
