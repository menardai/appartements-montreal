'use strict';

// Neighborhoods to feature as primary chips
const PRIMARY_NEIGHBORHOODS = [
  'Plateau Mont-Royal',
  'Rosemont',
  'Petite-Patrie',
  'Verdun',
  'Ahuntsic',
  'Centre-ville (Ville-Marie)'
];

// Secondary cool areas that may appear in data
const SECONDARY_AREAS = ['Mile End', 'Saint-Henri', 'Griffintown'];

// Simple tasteful placeholder (inline SVG as data URI)
const PLACEHOLDER_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7f4ef"/>
      <stop offset="100%" stop-color="#efe7de"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#g)"/>
  <g fill="#b85c38" fill-opacity="0.55">
    <circle cx="260" cy="160" r="6"/>
    <circle cx="340" cy="200" r="4"/>
    <circle cx="300" cy="240" r="3"/>
  </g>
  <text x="800" y="520" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="44" fill="#7a3a21" opacity="0.55">Photo indisponible</text>
</svg>`);

// DOM elements
const els = {
  count: document.getElementById('listingCount'),
  lastUpdated: document.getElementById('lastUpdated'),
  chipsContainer: document.getElementById('neighborhoodChips'),
  sortSelect: document.getElementById('sortSelect'),
  srcKijiji: document.getElementById('srcKijiji'),
  srcMarketplace: document.getElementById('srcMarketplace'),
  empty: document.getElementById('emptyState'),
  groups: document.getElementById('listingsByNeighborhood'),
  modal: document.getElementById('detailModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalMeta: document.getElementById('modalMeta'),
  modalDesc: document.getElementById('modalDescription'),
  modalLink: document.getElementById('modalExternalLink'),
  carousel: null,
  carouselTrack: document.getElementById('carouselTrack')
};

/** State */
const state = {
  allListings: /** @type {Listing[]} */([]),
  neighborhoodActive: new Set(),
  sourceActive: new Set(['kijiji', 'marketplace']),
  sort: 'price-asc',
  modal: {
    currentIndex: 0,
    photos: /** @type {string[]} */([]),
    releaseFocusTrap: null
  }
};

/** @typedef {{
 *  id: string,
 *  source: 'kijiji'|'marketplace'|string,
 *  title: string,
 *  price: number,
 *  neighborhood: string,
 *  address: string,
 *  bedrooms: number,
 *  bathrooms: number,
 *  sqft: number|null,
 *  bright: boolean,
 *  basement: boolean,
 *  high_end_notes: string,
 *  description: string,
 *  url: string,
 *  photos: string[],
 *  posted: string
 * }} Listing */

init().catch(console.error);

async function init() {
  renderPrimaryChips();
  wireControls();
  await loadListings();
  render();
  updateLastUpdated();
}

function renderPrimaryChips() {
  for (const name of PRIMARY_NEIGHBORHOODS) {
    const chip = createChip(name);
    els.chipsContainer.appendChild(chip);
  }
}

function ensureChipsForData() {
  // Add chips for secondary or unseen neighborhoods present in data
  const existingLabels = new Set(
    Array.from(els.chipsContainer.querySelectorAll('[data-neighborhood]'))
      .map((el) => el.getAttribute('data-neighborhood') || '')
  );
  const allNames = new Set([
    ...PRIMARY_NEIGHBORHOODS,
    ...SECONDARY_AREAS,
    ...state.allListings.map((l) => l.neighborhood)
  ]);
  for (const name of allNames) {
    if (!name || existingLabels.has(name)) continue;
    const chip = createChip(name);
    els.chipsContainer.appendChild(chip);
  }
}

function createChip(name) {
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'chip';
  label.textContent = name;
  label.setAttribute('data-neighborhood', name);
  label.setAttribute('aria-pressed', 'false');
  label.addEventListener('click', () => {
    const isActive = state.neighborhoodActive.has(name);
    if (isActive) {
      state.neighborhoodActive.delete(name);
      label.dataset.active = 'false';
      label.setAttribute('aria-pressed', 'false');
    } else {
      state.neighborhoodActive.add(name);
      label.dataset.active = 'true';
      label.setAttribute('aria-pressed', 'true');
    }
    render();
  });
  return label;
}

function wireControls() {
  els.sortSelect.addEventListener('change', () => {
    state.sort = els.sortSelect.value;
    render();
  });
  els.srcKijiji.addEventListener('change', () => {
    toggleSource('kijiji', els.srcKijiji.checked);
  });
  els.srcMarketplace.addEventListener('change', () => {
    toggleSource('marketplace', els.srcMarketplace.checked);
  });

  // Modal global close handling
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });
  window.addEventListener('keydown', (e) => {
    if (els.modal.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveCarousel(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCarousel(-1);
    }
  });
}

function toggleSource(source, enabled) {
  if (enabled) state.sourceActive.add(source);
  else state.sourceActive.delete(source);
  render();
}

async function loadListings() {
  try {
    const res = await fetch('listings.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Le fichier JSON doit contenir un tableau.');
    // Sanitize minimally
    state.allListings = data.filter((x) => x && typeof x === 'object');
  } catch (err) {
    console.error('Erreur en chargeant listings.json:', err);
    state.allListings = [];
  }
  ensureChipsForData();
}

function filterAndSort(listings) {
  // Filter by sources
  let filtered = listings.filter((l) => state.sourceActive.has((l.source || '').toLowerCase()));

  // Filter by neighborhoods if any active; if none active -> show all
  if (state.neighborhoodActive.size > 0) {
    filtered = filtered.filter((l) => state.neighborhoodActive.has(l.neighborhood));
  }

  // Sort
  const sort = state.sort;
  if (sort === 'price-asc' || sort === 'price-desc') {
    const dir = sort === 'price-asc' ? 1 : -1;
    filtered.sort((a, b) => (a.price - b.price) * dir);
  } else if (sort === 'neighborhood-asc' || sort === 'neighborhood-desc') {
    const dir = sort === 'neighborhood-asc' ? 1 : -1;
    filtered.sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, 'fr-CA') * dir);
  }
  return filtered;
}

function groupByNeighborhood(listings) {
  /** @type {Record<string, Listing[]>} */
  const groups = {};
  for (const l of listings) {
    const key = l.neighborhood || 'Autres quartiers';
    (groups[key] ||= []).push(l);
  }
  return groups;
}

function render() {
  const filtered = filterAndSort(state.allListings.slice());
  els.count.textContent = String(filtered.length);

  if (filtered.length === 0) {
    els.empty.hidden = false;
    els.groups.innerHTML = '';
    return;
  } else {
    els.empty.hidden = true;
  }

  const groups = groupByNeighborhood(filtered);
  // Order neighborhoods according to PRIMARY + SECONDARY + alphabetical fallback
  const order = [...PRIMARY_NEIGHBORHOODS, ...SECONDARY_AREAS];
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'fr-CA');
  });

  const frag = document.createDocumentFragment();
  for (const key of sortedKeys) {
    const section = document.createElement('section');
    section.className = 'neighborhood-group';
    const h = document.createElement('h2');
    h.className = 'neighborhood-title';
    h.textContent = key;
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const l of groups[key]) {
      cards.appendChild(renderCard(l));
    }
    section.appendChild(h);
    section.appendChild(cards);
    frag.appendChild(section);
  }
  els.groups.innerHTML = '';
  els.groups.appendChild(frag);
}

function renderCard(l) {
  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Voir détails pour ${l.title || 'annonce'}`);
  card.addEventListener('click', () => openModal(l));
  card.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(l);
    }
  });

  // Media grid: show up to 4 photos with first larger
  const grid = document.createElement('div');
  grid.className = 'media-grid';
  const photos = Array.isArray(l.photos) ? l.photos.slice(0, 4) : [];
  const placeholdersNeeded = Math.max(0, 3 - photos.length);
  while (photos.length < 3) photos.push(PLACEHOLDER_DATA_URL);
  if (photos.length < 1) photos.push(PLACEHOLDER_DATA_URL);

  photos.forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src || PLACEHOLDER_DATA_URL;
    img.loading = 'lazy';
    img.alt = buildAlt(l, idx);
    img.decoding = 'async';
    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_DATA_URL;
    };
    if (idx === 0) img.classList.add('main');
    grid.appendChild(img);
  });

  const body = document.createElement('div');
  body.className = 'card-body';

  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = formatPrice(l.price);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <span>${escapeHtml(l.neighborhood || '—')}</span>
    <span>${l.bedrooms ?? '—'} ch · ${l.bathrooms ?? '—'} sdb</span>
    ${l.sqft ? `<span>${l.sqft} pi²</span>` : ''}
    ${l.bright ? `<span class="badge" title="Lumineux confirmé">Lumineux</span>` : ''}
    ${l.basement ? `<span class="badge" title="Sous-sol">Sous-sol</span>` : ''}
    <span class="badge">${sourceLabel(l.source)}</span>
  `;

  const desc = document.createElement('p');
  desc.className = 'desc';
  desc.textContent = truncate((l.description || '').trim() || (l.high_end_notes || '').trim() || l.title || '', 160);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const btnView = document.createElement('button');
  btnView.type = 'button';
  btnView.className = 'btn primary';
  btnView.textContent = 'Voir les détails';
  btnView.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(l);
  });
  const btnAd = document.createElement('a');
  btnAd.className = 'btn';
  btnAd.href = l.url || '#';
  btnAd.target = '_blank';
  btnAd.rel = 'noopener noreferrer';
  btnAd.textContent = "Voir l'annonce";
  actions.appendChild(btnView);
  actions.appendChild(btnAd);

  body.appendChild(price);
  body.appendChild(meta);
  body.appendChild(desc);
  body.appendChild(actions);

  card.appendChild(grid);
  card.appendChild(body);
  return card;
}

function openModal(l) {
  els.modal.hidden = false;
  els.modalTitle.textContent = l.title || 'Détails';
  els.modalMeta.textContent = [
    formatPrice(l.price),
    l.neighborhood || null,
    `${l.bedrooms ?? '—'} ch · ${l.bathrooms ?? '—'} sdb`,
    l.sqft ? `${l.sqft} pi²` : null,
    l.posted ? `Publié: ${formatDate(l.posted)}` : null,
    l.bright ? 'Lumineux' : null,
    l.basement ? 'Sous-sol' : null,
    sourceLabel(l.source)
  ].filter(Boolean).join(' · ');
  els.modalDesc.textContent = (l.description || '').trim() || (l.high_end_notes || '').trim() || '';
  els.modalLink.href = l.url || '#';

  // Build carousel
  state.modal.photos = Array.isArray(l.photos) && l.photos.length ? l.photos.slice() : [PLACEHOLDER_DATA_URL];
  state.modal.currentIndex = 0;
  renderCarousel();

  // Focus the carousel for keyboard control
  const car = document.querySelector('.carousel');
  els.carousel = car;
  car.focus();

  // Wire nav buttons
  const prev = car.querySelector('.prev');
  const next = car.querySelector('.next');
  prev.onclick = () => moveCarousel(-1);
  next.onclick = () => moveCarousel(1);

  // Trap focus inside modal
  state.modal.releaseFocusTrap = trapFocus(els.modal);
}

function closeModal() {
  els.modal.hidden = true;
  els.carouselTrack.innerHTML = '';
  if (state.modal.releaseFocusTrap) {
    state.modal.releaseFocusTrap();
    state.modal.releaseFocusTrap = null;
  }
}

function renderCarousel() {
  els.carouselTrack.innerHTML = '';
  state.modal.photos.forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src || PLACEHOLDER_DATA_URL;
    img.alt = `Photo ${idx + 1}`;
    img.loading = idx === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_DATA_URL;
    };
    els.carouselTrack.appendChild(img);
  });
  // Ensure currentIndex is visible
  scrollCarouselTo(state.modal.currentIndex);
}

function moveCarousel(delta) {
  const max = state.modal.photos.length - 1;
  let idx = state.modal.currentIndex + delta;
  if (idx < 0) idx = max;
  if (idx > max) idx = 0;
  state.modal.currentIndex = idx;
  scrollCarouselTo(idx);
}

function scrollCarouselTo(idx) {
  const width = els.carouselTrack.clientWidth;
  els.carouselTrack.scrollTo({ left: idx * width, behavior: 'smooth' });
}

function updateLastUpdated() {
  const dates = state.allListings.map((l) => Date.parse(l.posted || '')).filter((t) => !Number.isNaN(t));
  const ts = dates.length ? Math.max(...dates) : Date.now();
  const d = new Date(ts);
  try {
    els.lastUpdated.textContent = new Intl.DateTimeFormat('fr-CA', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(d);
  } catch {
    els.lastUpdated.textContent = d.toLocaleString('fr-CA');
  }
}

// Utilities
function formatPrice(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n) + ' / mois';
  } catch {
    return `${Math.round(n)} $ / mois`;
  }
}
function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  try {
    return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' }).format(d);
  } catch {
    return d.toLocaleDateString('fr-CA');
  }
}
function sourceLabel(src) {
  const s = (src || '').toLowerCase();
  if (s.includes('kijiji')) return 'Kijiji';
  if (s.includes('marketplace') || s.includes('facebook')) return 'Marketplace';
  return src || 'Source';
}
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1).trimEnd() + '…' : str;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function buildAlt(l, idx) {
  const title = l.title || 'annonce';
  const num = (idx | 0) + 1;
  return `${title} — Photo ${num}`;
}

// Focus trap inside an element; returns a release function
function trapFocus(container) {
  const FOCUSABLE = [
    'a[href]',
    'area[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    'audio[controls]',
    'video[controls]',
    '[contenteditable]',
    '[tabindex]:not([tabindex="-1"])'
  ];
  const start = document.activeElement;
  function loop(e) {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(container.querySelectorAll(FOCUSABLE.join(','))).filter(isVisible);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  container.addEventListener('keydown', loop);
  return () => {
    container.removeEventListener('keydown', loop);
    if (start && start.focus) start.focus();
  };
}

