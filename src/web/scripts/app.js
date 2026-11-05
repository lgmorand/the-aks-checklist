import { emptyReview, parseReview, completion } from './review-state.js';

const $ = (selector) => document.querySelector(selector);
const config = JSON.parse($('#checklist-data').textContent);
const items = [...document.querySelectorAll('.check-item')];
const sections = [...document.querySelectorAll('.checklist-section')];
const knownIds = new Set(items.map((item) => item.dataset.id));
const storageKey = 'aks-checklist-review-v2';
let review = emptyReview();

function message(text) {
  $('#storage-message').textContent = text;
  $('#storage-message').hidden = false;
}
function storageError(error) {
  console.error('AKS Checklist: browser storage failed.', error);
  message('This browser could not save your review. Progress remains available for this visit; export it before leaving.');
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(review)); }
  catch (error) { storageError(error); }
}
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) review = parseReview(JSON.parse(stored), knownIds);
  else {
    const migrated = [];
    for (const [key, ids] of Object.entries(config.legacy)) {
      const previous = localStorage.getItem(key);
      if (!previous) continue;
      const selected = JSON.parse(previous);
      if (!Array.isArray(selected)) throw new Error(`Invalid legacy review data: ${key}`);
      for (const entry of selected) {
        const index = Number(entry.id);
        if (Number.isInteger(index) && index >= 0 && ids[index] && knownIds.has(ids[index])) migrated.push(ids[index]);
      }
    }
    if (migrated.length) {
      review.completed = [...new Set(migrated)];
      save();
      message('Your previous checklist progress has been migrated. Please re-verify completed checks against the updated guidance.');
    }
  }
} catch (error) {
  console.error('AKS Checklist: saved review could not be loaded.', error);
  message('Saved review data could not be loaded. It has not been overwritten. Export any recoverable data before resetting or editing this review.');
}

function updateProgress() {
  const { applicable, percent } = completion(items.length, review.completed.length, review.notApplicable.length);
  $('#progress-summary').textContent = `${review.completed.length} of ${applicable} applicable checks complete${review.notApplicable.length ? ` · ${review.notApplicable.length} not applicable` : ''}`;
  $('#progress-percent').replaceChildren(document.createTextNode(String(percent)), Object.assign(document.createElement('span'), { textContent: '%' }));
  $('#overall-progress').max = applicable || 1;
  $('#overall-progress').value = review.completed.length;
  for (const section of sections) {
    const ids = [...section.querySelectorAll('.check-item')].map((item) => item.dataset.id);
    const done = ids.filter((id) => review.completed.includes(id)).length;
    const applicableCount = ids.filter((id) => !review.notApplicable.includes(id)).length;
    section.querySelector('.section-progress').textContent = `${done} / ${applicableCount}`;
  }
}
function populate() {
  for (const item of items) {
    const id = item.dataset.id;
    const na = review.notApplicable.includes(id);
    item.querySelector('.item-check').checked = review.completed.includes(id);
    item.querySelector('.item-check').disabled = na;
    item.querySelector('.item-na').checked = na;
    item.querySelector('.evidence').value = review.evidence[id] ?? '';
    item.dataset.state = na ? 'na' : review.completed.includes(id) ? 'complete' : 'open';
  }
  for (const [id, key] of [['project-name', 'project'], ['review-owner', 'owner'], ['review-environment', 'environment']]) {
    $(`#${id}`).value = review[key];
  }
  updateProgress();
  filter();
}
function filter() {
  const query = $('#search').value.toLocaleLowerCase().trim();
  const priority = $('#priority-filter').value;
  const tag = $('#tag-filter').value;
  const status = $('#status-filter').value;
  let visible = 0;
  for (const item of items) {
    const matches = (!query || item.dataset.search.includes(query)) &&
      (priority === 'all' || priority === item.dataset.priority) &&
      (tag === 'all' || item.dataset.tags.split(' ').includes(tag)) &&
      (status === 'all' || status === item.dataset.state);
    item.hidden = !matches;
    if (matches) visible++;
  }
  for (const section of sections) {
    section.hidden = ![...section.querySelectorAll('.check-item')].some((item) => !item.hidden);
  }
  $('#result-count').textContent = `${visible} of ${items.length} checks shown`;
  $('#empty-state').hidden = visible > 0;
}
function select(id, selected) {
  review.completed = review.completed.filter((value) => value !== id);
  review.notApplicable = review.notApplicable.filter((value) => value !== id);
  if (selected === 'complete') review.completed.push(id);
  if (selected === 'na') review.notApplicable.push(id);
}
document.addEventListener('change', (event) => {
  const item = event.target.closest('.check-item');
  if (!item) return;
  if (event.target.matches('.item-check')) select(item.dataset.id, event.target.checked ? 'complete' : 'open');
  else if (event.target.matches('.item-na')) select(item.dataset.id, event.target.checked ? 'na' : 'open');
  else return;
  save();
  populate();
});
document.addEventListener('input', (event) => {
  const input = event.target;
  if (input.matches('.evidence')) {
    const id = input.closest('.check-item').dataset.id;
    if (input.value.trim()) review.evidence[id] = input.value;
    else delete review.evidence[id];
    save();
  }
});
for (const [id, key] of [['project-name', 'project'], ['review-owner', 'owner'], ['review-environment', 'environment']]) {
  $(`#${id}`).addEventListener('input', (event) => { review[key] = event.target.value; save(); });
}
$('.filter-bar').addEventListener('submit', (event) => event.preventDefault());
for (const id of ['search', 'priority-filter', 'tag-filter', 'status-filter']) $(`#${id}`).addEventListener('input', filter);
for (const section of sections) {
  for (const action of ['complete', 'clear']) section.querySelector(`[data-action="${action}"]`).addEventListener('click', () => {
    for (const item of section.querySelectorAll('.check-item:not([hidden])')) {
      if (item.dataset.state !== 'na') select(item.dataset.id, action === 'complete' ? 'complete' : 'open');
    }
    save();
    populate();
  });
}
for (const [id, open] of [['expand-all', true], ['collapse-all', false]]) $(`#${id}`).addEventListener('click', () => {
  for (const item of items.filter((item) => !item.hidden)) item.querySelector('details').open = open;
});

function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
}
$('#theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('aks-checklist-theme', theme); }
  catch (error) { storageError(error); }
  syncThemeButton();
});
syncThemeButton();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  try {
    if (!localStorage.getItem('aks-checklist-theme')) {
      document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
      syncThemeButton();
    }
  } catch (error) { storageError(error); }
});

$('#reset-review').addEventListener('click', () => {
  if (!confirm('Reset this review, including completion, evidence, and project details? Export it first if you need a copy.')) return;
  review = emptyReview();
  save();
  populate();
});
$('#export-review').addEventListener('click', () => {
  const payload = { ...review, reviewed: config.reviewed, exportedAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'aks-checklist-review.json' });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#import-review').addEventListener('click', () => $('#review-file').click());
$('#review-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Review file exceeds the 2 MB limit.');
    const imported = parseReview(JSON.parse(await file.text()), knownIds);
    if (!confirm('Replace the current review with this imported review?')) return;
    review = imported;
    save();
    populate();
    message('Review imported. Checks removed from this edition were ignored; verify your evidence against current guidance.');
  } catch (error) {
    console.error('AKS Checklist: import failed.', error);
    message(`The review could not be imported: ${error.message}`);
  } finally { event.target.value = ''; }
});

let printState;
window.addEventListener('beforeprint', () => {
  printState = {
    hidden: [...document.querySelectorAll('[hidden]')],
    closed: [...document.querySelectorAll('.item-details:not([open])')]
  };
  for (const element of [...items, ...sections]) element.hidden = false;
  for (const details of document.querySelectorAll('.item-details')) details.open = true;
  for (const item of items) {
    const note = document.createElement('p');
    note.className = 'print-only';
    const status = item.dataset.state === 'complete' ? 'Complete' : item.dataset.state === 'na' ? 'Not applicable' : 'To review';
    note.textContent = `Review: ${status}${review.evidence[item.dataset.id] ? `\nEvidence / exception: ${review.evidence[item.dataset.id]}` : ''}`;
    item.querySelector('.detail-content').append(note);
  }
  for (const input of document.querySelectorAll('.review-metadata input')) {
    const value = document.createElement('span');
    value.className = 'print-only';
    value.textContent = input.value || 'Not specified';
    input.after(value);
  }
});
window.addEventListener('afterprint', () => {
  if (!printState) return;
  for (const element of printState.hidden) element.hidden = true;
  for (const details of printState.closed) details.open = false;
  for (const note of document.querySelectorAll('.print-only')) note.remove();
  printState = undefined;
  filter();
});
$('#print-review').addEventListener('click', () => window.print());
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    for (const link of document.querySelectorAll('.section-nav a')) {
      const active = link.hash === `#${entry.target.id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
}, { rootMargin: '-5% 0px -70% 0px' });
for (const section of sections) observer.observe(section);
populate();

// Retire the old cache-first worker so previously visited sites receive the new assets.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    const directory = new URL('.', location.href).href;
    for (const registration of registrations) if (registration.scope === directory) await registration.unregister();
  }).catch((error) => console.warn('AKS Checklist: old service worker cleanup failed.', error));
}
