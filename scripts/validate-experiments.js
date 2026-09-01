const fs = require('fs');
const path = require('path');
const { discoverExperiments } = require('../platform/discovery');

const required = ['name','slug','description','entry','type','tags'];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const experiments = discoverExperiments();
const slugs = new Set();
const errors = [];

for (const x of experiments) {
  for (const key of required) if (x[key] === undefined || x[key] === '') errors.push(`${x.folder}: missing ${key}`);
  if (!slugPattern.test(x.slug || '')) errors.push(`${x.folder}: invalid slug ${x.slug}`);
  if (slugs.has(x.slug)) errors.push(`${x.folder}: duplicate slug ${x.slug}`); else slugs.add(x.slug);
  if (!Array.isArray(x.tags)) errors.push(`${x.folder}: tags must be an array`);
  if (!fs.existsSync(path.join(x.dir, x.entry || ''))) errors.push(`${x.folder}: entry file not found: ${x.entry}`);
  if (!fs.existsSync(path.join(x.dir, 'notes.md'))) errors.push(`${x.folder}: notes.md missing`);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${experiments.length} experiment(s) validated`);
