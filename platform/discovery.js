const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXPERIMENTS_DIR = path.join(ROOT, 'experiments');

function discoverExperiments() {
  if (!fs.existsSync(EXPERIMENTS_DIR)) return [];
  return fs.readdirSync(EXPERIMENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => {
      const dir = path.join(EXPERIMENTS_DIR, entry.name);
      const metadataPath = path.join(dir, 'experiment.json');
      if (!fs.existsSync(metadataPath)) return null;
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      return { ...metadata, folder: entry.name, dir };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findExperiment(slug) {
  return discoverExperiments().find((experiment) => experiment.slug === slug);
}

module.exports = { ROOT, EXPERIMENTS_DIR, discoverExperiments, findExperiment };
