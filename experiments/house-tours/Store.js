// One localStorage document: itinerary order plus notes keyed by house id.
export const STORAGE_KEY = 'house-tours-v1';
export const MAX_PHOTOS = 8;
export const MAX_BYTES = 2 * 1024 * 1024;

export const NOTE_FIELDS = [
  { key: 'impression', label: 'Overall impression' },
  { key: 'pros', label: 'Pros' },
  { key: 'cons', label: 'Cons' },
  { key: 'mustFix', label: 'Must-fix issues' },
  { key: 'neighborhood', label: 'Neighborhood/lot' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bedrooms', label: 'Bedrooms/bathrooms' },
  { key: 'basement', label: 'Basement' },
  { key: 'commute', label: 'Commute/location' },
];

export const SCORE_FIELDS = [
  { key: 'house', label: 'House' },
  { key: 'location', label: 'Location' },
  { key: 'yard', label: 'Yard' },
  { key: 'layout', label: 'Layout' },
  { key: 'condition', label: 'Condition' },
  { key: 'value', label: 'Value' },
];

export const STATUSES = [
  { value: 'love', label: 'Love it' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'No' },
];

export const OFFERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Unsure' },
];

const TEXT_KEYS = NOTE_FIELDS.map((field) => field.key);
const SCORE_KEYS = SCORE_FIELDS.map((field) => field.key);

function seedDoc() {
  return {
    houses: [
      {
        id: 'homer',
        address: '2534 W Homer St, Chicago, IL 60647',
        time: 'Sat 12–2pm',
        price: '$875,000',
        photos: [],
      },
      {
        id: 'maple',
        address: '1210 Maple Ave, Evanston, IL 60202',
        time: 'Sun 11am–1pm',
        price: '$759,000',
        photos: [],
      },
      {
        id: 'elmwood',
        address: '418 N Elmwood Ave, Oak Park, IL 60302',
        time: 'Sun 2–4pm',
        price: '$639,000',
        photos: [],
      },
    ],
    notes: {},
  };
}

export function emptyNote() {
  const scores = {};
  for (const key of SCORE_KEYS) scores[key] = 0;
  const note = { scores, status: '', offer: '' };
  for (const key of TEXT_KEYS) note[key] = '';
  return note;
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return 0;
  return n;
}

export function sanitizeNote(note) {
  const base = emptyNote();
  const src = note && typeof note === 'object' ? note : {};
  for (const key of TEXT_KEYS) {
    if (typeof src[key] === 'string') base[key] = src[key];
  }
  const scores = src.scores && typeof src.scores === 'object' ? src.scores : {};
  for (const key of SCORE_KEYS) base.scores[key] = clampScore(scores[key]);
  if (STATUSES.some((item) => item.value === src.status)) base.status = src.status;
  if (OFFERS.some((item) => item.value === src.offer)) base.offer = src.offer;
  return base;
}

export function noteHasContent(note) {
  if (!note) return false;
  const n = sanitizeNote(note);
  if (TEXT_KEYS.some((key) => n[key].trim())) return true;
  if (n.status || n.offer) return true;
  return SCORE_KEYS.some((key) => n.scores[key] > 0);
}

export function noteFor(doc, id) {
  return sanitizeNote(doc.notes && doc.notes[id]);
}

function isJpegDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/jpeg;base64,') && !/["'<>\s]/.test(value);
}

function normalize(parsed) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.houses)) return null;
  const houses = [];
  const seen = new Set();
  for (const house of parsed.houses) {
    if (!house || typeof house !== 'object') continue;
    const id = String(house.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const photos = Array.isArray(house.photos) ? house.photos.filter(isJpegDataUrl) : [];
    houses.push({
      id,
      address: typeof house.address === 'string' ? house.address : '',
      time: typeof house.time === 'string' ? house.time : '',
      price: typeof house.price === 'string' ? house.price : '',
      photos,
    });
  }
  const notes = {};
  const src = parsed.notes && typeof parsed.notes === 'object' && !Array.isArray(parsed.notes) ? parsed.notes : {};
  for (const house of houses) {
    if (src[house.id] && noteHasContent(src[house.id])) notes[house.id] = sanitizeNote(src[house.id]);
  }
  return { houses, notes };
}

export function docBytes(doc) {
  return JSON.stringify(doc).length;
}

export function save(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return seedDoc();
  }
  if (raw == null || raw === '') {
    const seeded = seedDoc();
    save(seeded);
    return seeded;
  }
  try {
    const doc = normalize(JSON.parse(raw));
    if (!doc) {
      const seeded = seedDoc();
      save(seeded);
      return seeded;
    }
    return doc;
  } catch {
    const seeded = seedDoc();
    save(seeded);
    return seeded;
  }
}

export function photoCount(doc) {
  return doc.houses.reduce((sum, house) => sum + house.photos.length, 0);
}

function newId(doc) {
  let id = '';
  do {
    id = 'h-' + Math.random().toString(36).slice(2, 8);
  } while (doc.houses.some((house) => house.id === id));
  return id;
}

export function addHouse(doc, fields) {
  const address = String(fields.address || '').trim();
  if (!address) return null;
  const house = {
    id: newId(doc),
    address,
    time: String(fields.time || '').trim(),
    price: String(fields.price || '').trim(),
    photos: [],
  };
  doc.houses.push(house);
  if (!save(doc)) {
    doc.houses.pop();
    return null;
  }
  return house;
}

export function updateHouse(doc, id, fields) {
  const house = doc.houses.find((item) => item.id === id);
  if (!house) return false;
  const address = String(fields.address || '').trim();
  if (!address) return false;
  const prev = { address: house.address, time: house.time, price: house.price };
  house.address = address;
  house.time = String(fields.time || '').trim();
  house.price = String(fields.price || '').trim();
  if (!save(doc)) {
    Object.assign(house, prev);
    return false;
  }
  return true;
}

export function removeHouse(doc, id) {
  const index = doc.houses.findIndex((house) => house.id === id);
  if (index < 0) return false;
  const [removed] = doc.houses.splice(index, 1);
  const prevNote = doc.notes[id];
  delete doc.notes[id];
  if (!save(doc)) {
    doc.houses.splice(index, 0, removed);
    if (prevNote !== undefined) doc.notes[id] = prevNote;
    return false;
  }
  return true;
}

export function patchNote(doc, id, patch) {
  if (!doc.houses.some((house) => house.id === id)) return false;
  const prev = doc.notes[id];
  const cur = noteFor(doc, id);
  const next = sanitizeNote({
    ...cur,
    ...patch,
    scores: { ...cur.scores, ...(patch && patch.scores) },
  });
  if (!noteHasContent(next)) {
    if (prev === undefined) return true;
    delete doc.notes[id];
    if (!save(doc)) {
      doc.notes[id] = prev;
      return false;
    }
    return true;
  }
  doc.notes[id] = next;
  if (!save(doc)) {
    if (prev === undefined) delete doc.notes[id];
    else doc.notes[id] = prev;
    return false;
  }
  return true;
}

function fitsWithPhoto(doc, houseId, dataUrl) {
  const copy = JSON.parse(JSON.stringify(doc));
  const house = copy.houses.find((item) => item.id === houseId);
  if (!house) return false;
  house.photos.push(dataUrl);
  return docBytes(copy) <= MAX_BYTES;
}

export function commitPhoto(doc, houseId, dataUrl) {
  if (photoCount(doc) >= MAX_PHOTOS) return { ok: false, reason: 'cap' };
  if (!isJpegDataUrl(dataUrl)) return { ok: false, reason: 'read' };
  const house = doc.houses.find((item) => item.id === houseId);
  if (!house) return { ok: false, reason: 'missing' };
  if (!fitsWithPhoto(doc, houseId, dataUrl)) return { ok: false, reason: 'size' };
  house.photos.push(dataUrl);
  if (!save(doc)) {
    house.photos.pop();
    return { ok: false, reason: 'save' };
  }
  return { ok: true };
}

export function removePhoto(doc, houseId, index) {
  const house = doc.houses.find((item) => item.id === houseId);
  if (!house || index < 0 || index >= house.photos.length) return false;
  const [removed] = house.photos.splice(index, 1);
  if (!save(doc)) {
    house.photos.splice(index, 0, removed);
    return false;
  }
  return true;
}

function isImageFile(file) {
  if (!file) return false;
  const type = file.type || '';
  if (type.startsWith('image/')) return true;
  if (type && type !== 'application/octet-stream') return false;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name || '');
}

async function bitmapFrom(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(file);
  }
}

function renderJpeg(bitmap, maxEdge, quality) {
  const longest = Math.max(bitmap.width, bitmap.height) || 1;
  const scale = Math.min(1, maxEdge / longest);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function attachPhoto(doc, houseId, file) {
  if (photoCount(doc) >= MAX_PHOTOS) return { ok: false, reason: 'cap' };
  if (!isImageFile(file)) return { ok: false, reason: 'type' };
  const house = doc.houses.find((item) => item.id === houseId);
  if (!house) return { ok: false, reason: 'missing' };
  let bitmap;
  try {
    bitmap = await bitmapFrom(file);
  } catch {
    return { ok: false, reason: 'read' };
  }
  try {
    const attempts = [
      [1280, 0.7],
      [960, 0.6],
      [800, 0.5],
      [640, 0.42],
    ];
    let last = { ok: false, reason: 'size' };
    for (const [edge, quality] of attempts) {
      let dataUrl;
      try {
        dataUrl = renderJpeg(bitmap, edge, quality);
      } catch {
        return { ok: false, reason: 'read' };
      }
      last = commitPhoto(doc, houseId, dataUrl);
      if (last.ok || last.reason !== 'size') return last;
    }
    return last;
  } finally {
    bitmap.close?.();
  }
}
