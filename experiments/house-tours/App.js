import {
  MAX_PHOTOS,
  NOTE_FIELDS,
  SCORE_FIELDS,
  STATUSES,
  OFFERS,
  load,
  addHouse,
  updateHouse,
  removeHouse,
  patchNote,
  attachPhoto,
  removePhoto,
  noteFor,
  noteHasContent,
  photoCount,
} from './Store.js';

const FLASH = {
  cap: 'Photo skipped. 8 is the maximum, so this browser does not fill up.',
  size: 'Photo skipped. That would push saved notes past about 2MB.',
  type: 'Photo skipped. Choose an image from the camera or library.',
  read: 'Photo skipped. That image could not be read.',
  missing: 'That stop is no longer on the tour.',
  save: 'Could not save. Browser storage may be full.',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function safeSrc(url) {
  if (typeof url !== 'string' || !url.startsWith('data:image/jpeg;base64,')) return '';
  if (/["'<>\s]/.test(url)) return '';
  return url;
}

function parseRoute() {
  let path = (location.hash || '').replace(/^#/, '');
  if (!path || path === '/') return { name: 'home' };
  if (!path.startsWith('/')) path = `/${path}`;
  const match = path.match(/^\/note\/([^/]+)\/?$/);
  if (!match) return { name: 'home' };
  try {
    return { name: 'note', id: decodeURIComponent(match[1]) };
  } catch {
    return { name: 'note', id: match[1] };
  }
}

function statusLabel(value) {
  const hit = STATUSES.find((item) => item.value === value);
  return hit ? hit.label : '—';
}

function offerLabel(value) {
  const hit = OFFERS.find((item) => item.value === value);
  return hit ? hit.label : '—';
}

function scoreLine(note) {
  const parts = [];
  for (const field of SCORE_FIELDS) {
    const n = note.scores[field.key];
    const always = field.key === 'house' || field.key === 'value';
    if (always || n > 0) parts.push(`${field.label} ${n || '—'}`);
  }
  return parts.join(' · ');
}

function fieldControl(house, key, label, value, multiline) {
  const control = multiline
    ? `<textarea data-edit="${key}" rows="2" maxlength="240">${esc(value)}</textarea>`
    : `<input data-edit="${key}" type="text" maxlength="80" value="${esc(value)}" />`;
  return `<label class="ht-field">${esc(label)}${control}</label>`;
}

const CSS = `
.ht-shell {
  position: absolute;
  inset: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  background: #f3efe6;
  color: #1c1916;
  font: 16px/1.4 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
}
.ht-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 72px 16px calc(32px + env(safe-area-inset-bottom, 0px));
}
.ht-page h1 {
  margin: 0;
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.ht-lead, .ht-foot, .ht-save {
  margin: 6px 0 0;
  color: #5e584f;
  font-size: 14px;
}
.ht-flash {
  margin: 12px 0 0;
  padding: 12px;
  border-radius: 12px;
  background: #fff4e4;
  border: 1px solid #e2c39a;
  color: #5c3b12;
  font-weight: 600;
}
.ht-flash[hidden] { display: none; }
.ht-card {
  margin-top: 12px;
  padding: 12px;
  background: #fffcf8;
  border-radius: 16px;
  box-shadow: 0 1px 0 rgba(80, 50, 20, 0.06), 0 8px 24px rgba(80, 50, 20, 0.05);
}
.ht-card-top {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 12px;
  align-items: start;
}
.ht-thumb {
  width: 88px;
  height: 88px;
  border-radius: 12px;
  object-fit: cover;
  background: #ebe4d8;
}
.ht-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #8a8175;
  font-size: 12px;
  font-weight: 700;
  padding: 6px;
}
.ht-address { margin: 0; font-size: 18px; line-height: 1.25; }
.ht-meta { margin: 4px 0 0; color: #5e584f; font-size: 15px; }
.ht-chip { margin: 8px 0 0; font-size: 15px; font-weight: 800; }
.ht-love { color: #17693f; }
.ht-maybe { color: #8a5a00; }
.ht-no { color: #8a3a32; }
.ht-scoreline { margin: 4px 0 0; font-size: 14px; line-height: 1.35; }
.ht-back {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  margin: 0 0 4px;
  color: #7d3b16;
  font-weight: 800;
  font-size: 17px;
  text-decoration: none;
}
.ht-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 12px;
  min-height: 52px;
  padding: 12px 14px;
  font: 700 16px/1.2 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
  touch-action: manipulation;
  text-decoration: none;
  text-align: center;
}
.ht-wide { display: flex; width: 100%; align-items: center; justify-content: center; margin-top: 12px; }
.ht-primary { background: #7d3b16; color: #fff; }
.ht-ghost { background: #fff; color: #1c1916; border-color: #d9d1c5; }
.ht-danger { background: #8a3a32; color: #fff; }
.ht-row { display: flex; gap: 8px; margin-top: 8px; }
.ht-row .ht-btn { flex: 1; }
.ht-kicker {
  margin: 22px 0 8px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6b645b;
}
.ht-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 14px;
  font-weight: 700;
  font-size: 15px;
}
.ht-field input, .ht-field textarea {
  width: 100%;
  min-height: 48px;
  border: 1px solid #d9d1c5;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  color: #1c1916;
  font: 400 16px/1.4 ui-sans-serif, system-ui, sans-serif;
}
.ht-field textarea { min-height: 96px; resize: vertical; }
.ht-choice, .ht-rate { display: flex; gap: 6px; }
.ht-choice .ht-btn, .ht-rate .ht-btn { flex: 1; padding-left: 0; padding-right: 0; }
.ht-rate .ht-btn { min-height: 48px; font-size: 18px; background: #fff; color: #1c1916; border-color: #d9d1c5; }
.ht-rate .ht-btn[aria-pressed="true"] { background: #1c1916; color: #fff; border-color: #1c1916; }
.ht-choice .ht-btn { background: #fff; color: #1c1916; border-color: #d9d1c5; }
.ht-choice .ht-btn[data-value="love"][aria-pressed="true"] { background: #17693f; color: #fff; border-color: #17693f; }
.ht-choice .ht-btn[data-value="maybe"][aria-pressed="true"] { background: #8a5a00; color: #fff; border-color: #8a5a00; }
.ht-choice .ht-btn[data-value="no"][aria-pressed="true"] { background: #8a3a32; color: #fff; border-color: #8a3a32; }
.ht-choice .ht-btn[data-value="yes"][aria-pressed="true"] { background: #17693f; color: #fff; border-color: #17693f; }
.ht-choice .ht-btn[data-value="unsure"][aria-pressed="true"] { background: #8a5a00; color: #fff; border-color: #8a5a00; }
.ht-upload { display: flex; gap: 8px; }
.ht-upload .ht-btn { position: relative; flex: 1; overflow: hidden; }
.ht-file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  border: 0;
}
.ht-photos {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.ht-photo { position: relative; }
.ht-photo img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  background: #ebe4d8;
}
.ht-photo button {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: 999px;
  background: rgba(28, 25, 22, 0.82);
  color: #fff;
  font: 700 14px/1 ui-sans-serif, system-ui, sans-serif;
  touch-action: manipulation;
}
.ht-compare {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 12px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.ht-col {
  flex: 0 0 180px;
  scroll-snap-align: start;
  background: #fffcf8;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 1px 0 rgba(80, 50, 20, 0.06);
}
.ht-col h3 { margin: 0; font-size: 15px; line-height: 1.3; }
.ht-col .ht-meta { min-height: 2.6em; }
.ht-col .ht-chip { margin-top: 8px; }
.ht-col dl { margin: 8px 0 0; }
.ht-col dl div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  border-top: 1px solid #efe8de;
  font-size: 14px;
}
.ht-col dt { color: #5e584f; font-weight: 600; }
.ht-col dd { margin: 0; font-weight: 800; font-variant-numeric: tabular-nums; }
.ht-offer { margin-top: 8px; font-weight: 800; }
.ht-shell button:focus-visible,
.ht-shell a:focus-visible,
.ht-shell textarea:focus-visible,
.ht-shell input:focus-visible {
  outline: 3px solid #1c1916;
  outline-offset: 2px;
}
@media (hover: hover) {
  .ht-primary:hover { background: #672f10; }
}
`;

export default class Experiment {
  constructor(container) {
    this.container = container;
    this.doc = null;
    this.editingId = null;
    this.confirmId = null;
    this.busy = false;
    this.flash = '';
    this._dead = false;
    this._timer = 0;
    this._op = 0;
    this._routeKey = '';
    this._onHash = () => this.render();
    this._onClick = (event) => this.onClick(event);
    this._onInput = (event) => this.onInput(event);
    this._onChange = (event) => this.onChange(event);
  }

  start() {
    this.doc = load();
    this.container.addEventListener('click', this._onClick);
    this.container.addEventListener('input', this._onInput);
    this.container.addEventListener('change', this._onChange);
    addEventListener('hashchange', this._onHash);
    this.render();
  }

  resize() {}

  destroy() {
    clearTimeout(this._timer);
    this.flushNotes();
    this._dead = true;
    removeEventListener('hashchange', this._onHash);
    this.container.removeEventListener('click', this._onClick);
    this.container.removeEventListener('input', this._onInput);
    this.container.removeEventListener('change', this._onChange);
    this.container.replaceChildren();
    this.doc = null;
  }

  flushNotes() {
    if (this._dead || !this.doc) return true;
    const areas = [...this.container.querySelectorAll('textarea[data-field]')];
    if (!areas.length) return true;
    const id = areas[0].closest('[data-house]')?.dataset.house;
    if (!id) return true;
    const patch = {};
    for (const area of areas) patch[area.dataset.field] = area.value;
    return patchNote(this.doc, id, patch);
  }

  setSaveLabel(ok) {
    const el = this.container.querySelector('.ht-save');
    if (!el) return;
    el.textContent = ok ? 'Saved on this device' : 'Not saved. Storage is full.';
  }

  showFlash() {
    const el = this.container.querySelector('.ht-flash');
    if (!el) return;
    el.hidden = !this.flash;
    el.textContent = this.flash || '';
  }

  ensureShell() {
    let shell = this.container.querySelector('.ht-shell');
    if (shell) return shell;
    const style = document.createElement('style');
    style.id = 'ht-styles';
    style.textContent = CSS;
    const root = document.createElement('div');
    root.className = 'ht-shell';
    this.container.replaceChildren(style, root);
    return root;
  }

  render() {
    if (this._dead || !this.doc) return;
    clearTimeout(this._timer);
    this.flushNotes();
    const route = parseRoute();
    if (route.name !== 'home') {
      this.editingId = null;
      this.confirmId = null;
    }
    const routeKey = `${route.name}:${route.id || ''}`;
    const shell = this.ensureShell();
    const keepScroll = routeKey === this._routeKey && this._routeKey !== '';
    const scroll = keepScroll ? shell.scrollTop : 0;
    this._routeKey = routeKey;
    shell.innerHTML = route.name === 'note' ? this.noteMarkup(route.id) : this.homeMarkup();
    shell.scrollTop = scroll;
  }

  homeMarkup() {
    const count = this.doc.houses.length;
    const cards = this.doc.houses.map((house) => this.cardMarkup(house)).join('');
    const columns = this.doc.houses.map((house) => this.compareMarkup(house)).join('');
    const noun = count === 1 ? 'stop' : 'stops';
    return `<div class="ht-page">
      <h1>House Tours</h1>
      <p class="ht-lead">${count} ${noun} today. Notes stay on this phone.</p>
      <p class="ht-flash" role="status"${this.flash ? '' : ' hidden'}>${esc(this.flash)}</p>
      <p class="ht-foot">Swipe the compare row at the bottom. Photos never leave this device.</p>
      ${cards || '<section class="ht-card"><p class="ht-meta">No stops yet. Add the first open house below.</p></section>'}
      <section class="ht-card" data-add>
        <h2 class="ht-kicker">Add a stop</h2>
        <label class="ht-field">Address
          <textarea data-edit="address" rows="2" maxlength="240" placeholder="2534 W Homer St, Chicago, IL 60647"></textarea>
        </label>
        <label class="ht-field">Open-house time
          <input data-edit="time" type="text" maxlength="80" placeholder="Sat 12–2pm" />
        </label>
        <label class="ht-field">Asking price
          <input data-edit="price" type="text" maxlength="40" placeholder="$875,000" />
        </label>
        <button type="button" class="ht-btn ht-primary ht-wide" data-action="add">Add stop</button>
      </section>
      <h2 class="ht-kicker">Compare</h2>
      <div class="ht-compare" aria-label="Compare stops">
        ${columns || '<p class="ht-meta">Add a stop to compare.</p>'}
      </div>
    </div>`;
  }

  cardMarkup(house) {
    const note = noteFor(this.doc, house.id);
    const filled = noteHasContent(note);
    const src = safeSrc(house.photos[0]);
    const thumb = src
      ? `<img class="ht-thumb" alt="" src="${src}" draggable="false" />`
      : '<div class="ht-thumb ht-ph" aria-hidden="true">No photo</div>';
    const facts = [house.time, house.price].filter(Boolean).join(' · ');
    if (this.editingId === house.id) {
      return `<article class="ht-card" data-house="${esc(house.id)}">
        ${fieldControl(house, 'address', 'Address', house.address, true)}
        ${fieldControl(house, 'time', 'Open-house time', house.time, false)}
        ${fieldControl(house, 'price', 'Asking price', house.price, false)}
        <div class="ht-row">
          <button type="button" class="ht-btn ht-primary" data-action="save-edit">Save stop</button>
          <button type="button" class="ht-btn ht-ghost" data-action="cancel-edit">Cancel</button>
        </div>
      </article>`;
    }
    const removeLabel = this.confirmId === house.id ? 'Remove stop?' : 'Remove';
    const removeClass = this.confirmId === house.id ? 'ht-btn ht-danger' : 'ht-btn ht-ghost';
    const removeAction = this.confirmId === house.id ? 'remove' : 'ask-remove';
    return `<article class="ht-card" data-house="${esc(house.id)}">
      <div class="ht-card-top">
        ${thumb}
        <div>
          <h2 class="ht-address">${esc(house.address || 'Untitled stop')}</h2>
          ${facts ? `<p class="ht-meta">${esc(facts)}</p>` : ''}
          ${filled && note.status ? `<p class="ht-chip ht-${esc(note.status)}">${esc(statusLabel(note.status))}</p>` : ''}
          ${filled ? `<p class="ht-scoreline">${esc(scoreLine(note))}</p>` : ''}
        </div>
      </div>
      <a class="ht-btn ht-primary ht-wide" href="#/note/${encodeURIComponent(house.id)}">Open Notes</a>
      <div class="ht-row">
        <button type="button" class="ht-btn ht-ghost" data-action="edit">Edit</button>
        <button type="button" class="${removeClass}" data-action="${removeAction}">${removeLabel}</button>
      </div>
    </article>`;
  }

  compareMarkup(house) {
    const note = noteFor(this.doc, house.id);
    const rows = SCORE_FIELDS.map((field) => {
      const n = note.scores[field.key];
      return `<div><dt>${esc(field.label)}</dt><dd>${n || '—'}</dd></div>`;
    }).join('');
    const statusClass = note.status ? ` ht-chip ht-${esc(note.status)}` : ' ht-meta';
    return `<article class="ht-col">
      <h3>${esc(house.address || 'Untitled stop')}</h3>
      <p class="ht-meta">${esc([house.time, house.price].filter(Boolean).join(' · ') || '—')}</p>
      <p class="${statusClass.trim()}">${esc(statusLabel(note.status))}</p>
      <dl>${rows}</dl>
      <p class="ht-offer">Would offer: ${esc(offerLabel(note.offer))}</p>
    </article>`;
  }

  noteMarkup(id) {
    const house = this.doc.houses.find((item) => item.id === id);
    if (!house) {
      return `<div class="ht-page">
        <a class="ht-back" href="#/">← Houses</a>
        <h1>Stop not found</h1>
        <p class="ht-lead">That open house is not on this tour.</p>
      </div>`;
    }
    const note = noteFor(this.doc, id);
    const fields = NOTE_FIELDS.map((field) => `<label class="ht-field">${esc(field.label)}
      <textarea data-field="${field.key}" maxlength="2000" rows="${field.key === 'impression' ? 4 : 3}">${esc(note[field.key])}</textarea>
    </label>`).join('');
    const scores = SCORE_FIELDS.map((field) => {
      const buttons = [1, 2, 3, 4, 5].map((n) => {
        const pressed = note.scores[field.key] === n ? 'true' : 'false';
        return `<button type="button" class="ht-btn" data-action="score" data-key="${field.key}" data-n="${n}" aria-pressed="${pressed}">${n}</button>`;
      }).join('');
      return `<div class="ht-field"><span id="ht-score-${field.key}">${esc(field.label)}</span>
        <div class="ht-rate" role="group" aria-labelledby="ht-score-${field.key}">${buttons}</div>
      </div>`;
    }).join('');
    const statusButtons = STATUSES.map((item) => {
      const pressed = note.status === item.value ? 'true' : 'false';
      return `<button type="button" class="ht-btn" data-action="status" data-value="${item.value}" aria-pressed="${pressed}">${esc(item.label)}</button>`;
    }).join('');
    const offerButtons = OFFERS.map((item) => {
      const pressed = note.offer === item.value ? 'true' : 'false';
      return `<button type="button" class="ht-btn" data-action="offer" data-value="${item.value}" aria-pressed="${pressed}">${esc(item.label)}</button>`;
    }).join('');
    const photos = house.photos.map((url, index) => {
      const src = safeSrc(url);
      if (!src) return '';
      return `<div class="ht-photo"><img alt="" src="${src}" draggable="false" /><button type="button" data-action="remove-photo" data-index="${index}" aria-label="Remove photo ${index + 1}">×</button></div>`;
    }).join('');
    const count = photoCount(this.doc);
    const atCap = count >= MAX_PHOTOS;
    const upload = this.busy
      ? '<p class="ht-lead">Compressing photo…</p>'
      : atCap
        ? `<p class="ht-lead">${count} of ${MAX_PHOTOS} photos. Remove one to add another.</p>`
        : `<div class="ht-upload">
            <label class="ht-btn ht-ghost">Camera
              <input class="ht-file" type="file" accept="image/*" capture="environment" data-action="pick-photo" />
            </label>
            <label class="ht-btn ht-ghost">Library
              <input class="ht-file" type="file" accept="image/*" data-action="pick-photo" />
            </label>
          </div>
          <p class="ht-lead">${count} of ${MAX_PHOTOS} photos. Stored only on this device.</p>`;
    const facts = [house.time, house.price].filter(Boolean).join(' · ');
    return `<div class="ht-page" data-house="${esc(house.id)}">
      <a class="ht-back" href="#/">← Houses</a>
      <h1>${esc(house.address || 'Untitled stop')}</h1>
      ${facts ? `<p class="ht-lead">${esc(facts)}</p>` : ''}
      <p class="ht-save">Notes save as you type.</p>
      <p class="ht-flash" role="status"${this.flash ? '' : ' hidden'}>${esc(this.flash)}</p>
      <h2 class="ht-kicker">Notes</h2>
      ${fields}
      <h2 class="ht-kicker">Ratings</h2>
      ${scores}
      <h2 class="ht-kicker">Overall</h2>
      <div class="ht-field"><span id="ht-status">Love it, maybe, or no</span>
        <div class="ht-choice" role="group" aria-labelledby="ht-status">${statusButtons}</div>
      </div>
      <h2 class="ht-kicker">Photos</h2>
      ${upload}
      ${photos ? `<div class="ht-photos">${photos}</div>` : ''}
      <h2 class="ht-kicker">Would we make an offer?</h2>
      <div class="ht-choice" role="group" aria-label="Would we make an offer?">${offerButtons}</div>
    </div>`;
  }

  readEdits(root) {
    const read = (key) => root.querySelector(`[data-edit="${key}"]`)?.value || '';
    return { address: read('address'), time: read('time'), price: read('price') };
  }

  onInput(event) {
    if (this._dead || !event.target?.dataset?.field) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.setSaveLabel(this.flushNotes());
    }, 180);
  }

  onChange(event) {
    const input = event.target;
    if (!input || input.dataset?.action !== 'pick-photo') return;
    this.onPick(input);
  }

  async onPick(input) {
    if (this.busy || this._dead) return;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const id = input.closest('[data-house]')?.dataset.house;
    if (!id) return;
    this.busy = true;
    this.flash = '';
    this.render();
    const op = ++this._op;
    let result;
    try {
      result = await attachPhoto(this.doc, id, file);
    } catch {
      result = { ok: false, reason: 'read' };
    }
    if (this._dead || op !== this._op) return;
    this.busy = false;
    this.flash = result.ok ? '' : (FLASH[result.reason] || 'Photo skipped.');
    this.render();
  }

  onClick(event) {
    if (this._dead || this.busy) return;
    const btn = event.target?.closest?.('[data-action]');
    if (!btn || btn.dataset.action === 'pick-photo') return;
    const action = btn.dataset.action;
    const card = btn.closest('[data-house]');
    const id = card?.dataset.house;

    if (action === 'add') {
      const fields = this.readEdits(btn.closest('[data-add]'));
      if (!fields.address.trim()) {
        this.flash = 'Add an address to create a stop.';
        this.showFlash();
        return;
      }
      const house = addHouse(this.doc, fields);
      this.flash = house ? '' : FLASH.save;
      this.render();
      return;
    }

    if (!id) return;

    if (action === 'edit') {
      this.editingId = id;
      this.confirmId = null;
      this.flash = '';
      this.render();
      return;
    }

    if (action === 'cancel-edit') {
      this.editingId = null;
      this.flash = '';
      this.render();
      return;
    }

    if (action === 'save-edit') {
      const fields = this.readEdits(card);
      if (!fields.address.trim()) {
        this.flash = 'Address cannot be empty.';
        this.showFlash();
        return;
      }
      const ok = updateHouse(this.doc, id, fields);
      if (ok) this.editingId = null;
      this.flash = ok ? '' : FLASH.save;
      this.render();
      return;
    }

    if (action === 'ask-remove') {
      this.confirmId = id;
      this.editingId = this.editingId === id ? null : this.editingId;
      this.render();
      return;
    }

    if (action === 'remove') {
      const ok = removeHouse(this.doc, id);
      if (ok) {
        this.confirmId = null;
        this.editingId = null;
        this.flash = '';
      } else {
        this.flash = FLASH.save;
      }
      this.render();
      return;
    }

    if (action === 'score') {
      const key = btn.dataset.key;
      if (!SCORE_FIELDS.some((field) => field.key === key)) return;
      const ok = patchNote(this.doc, id, { scores: { [key]: Number(btn.dataset.n) } });
      this.setSaveLabel(ok);
      if (!ok) return;
      btn.parentElement?.querySelectorAll('button').forEach((peer) => {
        peer.setAttribute('aria-pressed', peer === btn ? 'true' : 'false');
      });
      return;
    }

    if (action === 'status' || action === 'offer') {
      const value = btn.dataset.value;
      const patch = action === 'status' ? { status: value } : { offer: value };
      const ok = patchNote(this.doc, id, patch);
      this.setSaveLabel(ok);
      if (!ok) return;
      btn.parentElement?.querySelectorAll('button').forEach((peer) => {
        peer.setAttribute('aria-pressed', peer === btn ? 'true' : 'false');
      });
      return;
    }

    if (action === 'remove-photo') {
      const ok = removePhoto(this.doc, id, Number(btn.dataset.index));
      this.flash = ok ? '' : FLASH.save;
      this.render();
    }
  }
}
