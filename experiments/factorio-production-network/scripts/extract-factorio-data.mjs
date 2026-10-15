import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const sourceRoot = path.resolve(process.argv[2] || '');
const outputPath = path.resolve(process.argv[3] || 'data/factorio-base-2.0.77.json');

if (!sourceRoot || !fs.existsSync(path.join(sourceRoot, 'base', 'info.json'))) {
  console.error('Usage: node extract-factorio-data.mjs <factorio-data-root> [output.json]');
  process.exit(1);
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === ']' && next === ']') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '-' && next === '-') {
      if (source.slice(i + 2, i + 4) === '[[') {
        blockComment = true;
        i += 3;
      } else {
        lineComment = true;
        i += 1;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function prototypeTables(source, acceptedTypes) {
  const stack = [];
  const results = [];
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === ']' && next === ']') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '-' && next === '-') {
      if (source.slice(i + 2, i + 4) === '[[') {
        blockComment = true;
        i += 3;
      } else {
        lineComment = true;
        i += 1;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') {
      stack.push(i);
      continue;
    }
    if (char === '}') {
      stack.pop();
      continue;
    }
    if (source.startsWith('type', i) && !/[\w_]/.test(source[i - 1] || '')) {
      const match = source.slice(i).match(/^type\s*=\s*(["'])([^"']+)\1/);
      if (match && acceptedTypes.has(match[2]) && stack.length) {
        const start = stack.at(-1);
        const end = matchingBrace(source, start);
        if (end !== -1 && !results.some((record) => record.start === start)) {
          results.push({ type: match[2], start, block: source.slice(start, end + 1) });
        }
      }
    }
  }
  return results;
}

function skipSpaceAndComments(source, start) {
  let i = start;
  while (i < source.length) {
    if (/\s|,/.test(source[i])) {
      i += 1;
    } else if (source.slice(i, i + 2) === '--') {
      const newline = source.indexOf('\n', i + 2);
      i = newline === -1 ? source.length : newline + 1;
    } else {
      break;
    }
  }
  return i;
}

function readValue(source, start) {
  let i = start;
  let quote = null;
  let lineComment = false;
  let curly = 0;
  let square = 0;
  let round = 0;
  for (; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '-' && next === '-') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') curly += 1;
    else if (char === '}') {
      if (curly === 0 && square === 0 && round === 0) break;
      curly -= 1;
    } else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === ',' && curly === 0 && square === 0 && round === 0) break;
  }
  return { raw: source.slice(start, i).trim(), end: i };
}

function fields(tableExpression) {
  const source = tableExpression.trim().replace(/^\{/, '').replace(/\}$/, '');
  const result = {};
  let i = 0;
  while (i < source.length) {
    i = skipSpaceAndComments(source, i);
    const key = source.slice(i).match(/^([A-Za-z_][\w]*)\s*=/);
    if (!key) {
      i += 1;
      continue;
    }
    i += key[0].length;
    const value = readValue(source, i);
    result[key[1]] = value.raw;
    i = value.end + 1;
  }
  return result;
}

function stringValue(raw) {
  if (!raw) return null;
  const match = raw.trim().match(/^(["'])(.*?)\1$/s);
  return match ? match[2].replace(/\\([\\"'])/g, '$1') : null;
}

function numberValue(raw, fallback = null) {
  if (!raw) return fallback;
  const expression = raw.trim();
  if (!/^[\d.eE+\-*/()\s]+$/.test(expression)) return fallback;
  try {
    const value = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function booleanValue(raw, fallback = false) {
  if (!raw) return fallback;
  return raw.trim() === 'true';
}

function directChildTables(expression) {
  const result = [];
  const source = expression.trim();
  let quote = null;
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') {
      depth += 1;
      if (depth === 2) {
        const end = matchingBrace(source, i);
        if (end !== -1) {
          result.push(source.slice(i, end + 1));
          i = end;
          depth = 1;
        }
      }
    } else if (char === '}') {
      depth -= 1;
    }
  }
  return result;
}

function stringList(expression) {
  if (!expression) return [];
  return [...expression.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function components(expression) {
  if (!expression) return [];
  return directChildTables(expression).map((entry) => {
    const value = fields(entry);
    const min = numberValue(value.amount_min);
    const max = numberValue(value.amount_max);
    const amount = numberValue(value.amount, min !== null && max !== null ? (min + max) / 2 : null);
    return {
      type: stringValue(value.type) || 'item',
      name: stringValue(value.name),
      amount,
      probability: numberValue(value.probability, 1)
    };
  }).filter((entry) => entry.name && entry.amount !== null);
}

function humanize(value) {
  return value.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

const info = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'base', 'info.json'), 'utf8'));
const recipeSource = fs.readFileSync(path.join(sourceRoot, 'base', 'prototypes', 'recipe.lua'), 'utf8');
const entitySource = fs.readFileSync(path.join(sourceRoot, 'base', 'prototypes', 'entity', 'entities.lua'), 'utf8');
const itemSource = fs.readFileSync(path.join(sourceRoot, 'base', 'prototypes', 'item.lua'), 'utf8');

const recipes = prototypeTables(recipeSource, new Set(['recipe'])).map(({ block }) => {
  const value = fields(block);
  const name = stringValue(value.name);
  if (!name || booleanValue(value.parameter) || booleanValue(value.hidden)) return null;
  return {
    id: name,
    name: humanize(name),
    category: stringValue(value.category) || 'crafting',
    time: numberValue(value.energy_required, 0.5),
    enabled: booleanValue(value.enabled, true),
    ingredients: components(value.ingredients),
    products: components(value.results)
  };
}).filter((recipe) => recipe && recipe.ingredients.length && recipe.products.length)
  .sort((a, b) => a.id.localeCompare(b.id));

const machineTypes = new Set(['assembling-machine', 'furnace', 'rocket-silo']);
const machines = prototypeTables(entitySource, machineTypes).map(({ type, block }) => {
  const value = fields(block);
  const id = stringValue(value.name);
  const categories = stringList(value.crafting_categories);
  if (!id || !categories.length) return null;
  const energy = fields(value.energy_source || '{}');
  return {
    id,
    name: humanize(id),
    prototypeType: type,
    categories,
    craftingSpeed: numberValue(value.crafting_speed, 1),
    energy: {
      type: stringValue(energy.type) || 'unknown',
      fuelCategories: stringList(energy.fuel_categories)
    }
  };
}).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));

function energyValue(raw) {
  const text = stringValue(raw);
  const match = text?.match(/^([\d.]+)([kMGT]?J)$/);
  if (!match) return null;
  const multiplier = { J: 1, kJ: 1e3, MJ: 1e6, GJ: 1e9, TJ: 1e12 }[match[2]];
  return Number(match[1]) * multiplier;
}

const fuels = prototypeTables(itemSource, new Set(['item'])).map(({ block }) => {
  const value = fields(block);
  const id = stringValue(value.name);
  const category = stringValue(value.fuel_category);
  const joules = energyValue(value.fuel_value);
  if (!id || !category || joules === null) return null;
  return { id, name: humanize(id), category, joules };
}).filter(Boolean).sort((a, b) => a.joules - b.joules);

const itemKinds = new Map();
for (const recipe of recipes) {
  for (const component of [...recipe.ingredients, ...recipe.products]) {
    itemKinds.set(component.name, component.type);
  }
}
const items = [...itemKinds].map(([id, type]) => ({ id, name: humanize(id), type }))
  .sort((a, b) => a.id.localeCompare(b.id));

const dataset = {
  schemaVersion: 1,
  game: 'Factorio',
  scope: 'base-game',
  version: info.version,
  generatedAt: new Date().toISOString(),
  source: {
    repository: 'https://github.com/wube/factorio-data',
    tag: info.version,
    recipeFile: 'base/prototypes/recipe.lua',
    machineFile: 'base/prototypes/entity/entities.lua',
    fuelFile: 'base/prototypes/item.lua'
  },
  exclusions: [
    'Space Age, Quality, Elevated Rails, and Recycler mod prototypes',
    'hidden/editor recipes and parameter recipes',
    'automatically generated barrel fill/empty logistics recipes',
    'mining, pumping, electricity generation, and hand crafting operators'
  ],
  items,
  recipes,
  machines,
  fuels
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Wrote ${recipes.length} recipes, ${items.length} items/fluids, ${machines.length} machines, and ${fuels.length} fuels to ${outputPath}`);
