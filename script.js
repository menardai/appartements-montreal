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

// Map defaults and neighborhood centroids (fallbacks)
const MONTREAL_CENTER = [45.5089, -73.5617];
const DEFAULT_ZOOM = 12;
const NEIGHBORHOOD_CENTROIDS = {
  'Plateau Mont-Royal': [45.5235, -73.5848],
  'Rosemont': [45.556, -73.57],
  'Petite-Patrie': [45.545, -73.61],
  'Verdun': [45.458, -73.571],
  'Ahuntsic': [45.549, -73.663],
  'Centre-ville (Ville-Marie)': [45.504, -73.568],
  'Mile End': [45.524, -73.593],
  'Saint-Henri': [45.479, -73.586],
  'Griffintown': [45.492, -73.566]
};
const GEOCODE_MIN_INTERVAL_MS = 1100; // be polite to Nominatim

const RATINGS_KEY = 'appartements-ratings-v1';

function loadRatings() {
  try {
    const raw = localStorage.getItem(RATINGS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

function saveRatings(map) {
  try { localStorage.setItem(RATINGS_KEY, JSON.stringify(map)); } catch {}
}

function listingKey(l) {
  return String(l && (l.id || l.url) || '');
}

function getRating(l) {
  const n = Number(loadRatings()[listingKey(l)]);
  return (n === 1 || n === 2 || n === 3) ? n : 0;
}

function setRating(l, value) {
  const map = loadRatings();
  const key = listingKey(l);
  if (!key) return;
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3) map[key] = n;
  else delete map[key];
  saveRatings(map);
}

function buildStars(l) {
  const wrap = document.createElement('div');
  wrap.className = 'stars';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Note sur 3 étoiles');
  const current = getRating(l);
  for (let n = 1; n <= 3; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star' + (n <= current ? ' is-on' : '');
    btn.setAttribute('aria-label', n === 1 ? '1 étoile' : n + ' étoiles');
    btn.setAttribute('aria-checked', n === current ? 'true' : 'false');
    btn.dataset.value = String(n);
    btn.textContent = n <= current ? '★' : '☆';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = getRating(l) === n ? 0 : n; // clic sur la même étoile = enlever
      setRating(l, next);
      render();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}


// DOM elements
const els = {
  count: document.getElementById('listingCount'),
  lastUpdated: document.getElementById('lastUpdated'),
  chipsContainer: document.getElementById('neighborhoodChips'),
  sortSelect: document.getElementById('sortSelect'),
  sqftSelect: document.getElementById('sqftSelect'),
  srcKijiji: document.getElementById('srcKijiji'),
  srcMarketplace: document.getElementById('srcMarketplace'),
  empty: document.getElementById('emptyState'),
  grid: document.getElementById('listingsGrid'),
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
  sort: 'stars-desc',
  sqftFilter: 'all', // 'all' | '800' | '1000'
  map: {
    map: null,
    layer: null,
    markersById: new Map(),
    nextGeocodeAllowedAt: Date.now(),
    cache: loadGeoCache()
  },
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
 *  posted: string,
 *  lat?: number,
 *  lng?: number,
 *  appliances?: {
 *    stove?: boolean,
 *    fridge?: boolean,
 *    washer?: boolean,
 *    dryer?: boolean
 *  }
 * }} Listing */

init().catch(console.error);

async function init() {
  renderPrimaryChips();
  wireControls();
  initMap();
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
  if (els.sqftSelect) {
    els.sqftSelect.addEventListener('change', () => {
      state.sqftFilter = els.sqftSelect.value || 'all';
      render();
    });
  }
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
  let filtered = listings
    .filter((l) => !!(l && l.url)) // require URL, hide listings without link
    .filter((l) => state.sourceActive.has((l.source || '').toLowerCase()));

  // Filter by neighborhoods if any active; if none active -> show all
  if (state.neighborhoodActive.size > 0) {
    filtered = filtered.filter((l) => state.neighborhoodActive.has(l.neighborhood));
  }

  // Filter by superficie (sqft)
  if (state.sqftFilter === '800') {
    filtered = filtered.filter((l) => typeof l.sqft === 'number' && l.sqft >= 800);
  } else if (state.sqftFilter === '1000') {
    filtered = filtered.filter((l) => typeof l.sqft === 'number' && l.sqft >= 1000);
  }

  // Sort: unrated first, then 3★, 2★, 1★; price as tiebreaker
  const sort = state.sort;
  const starRank = (l) => {
    const r = getRating(l);
    if (!r) return 0;      // pas noté → tout en haut
    return 4 - r;          // 3★ → 1, 2★ → 2, 1★ → 3
  };
  const starThenPrice = (a, b) => {
    const ds = starRank(a) - starRank(b);
    if (ds) return ds;
    return (b.price || 0) - (a.price || 0);
  };
  if (sort === 'stars-desc' || !sort) {
    filtered.sort(starThenPrice);
  } else if (sort === 'price-asc' || sort === 'price-desc') {
    const dir = sort === 'price-asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const dp = ((a.price || 0) - (b.price || 0)) * dir;
      if (dp) return dp;
      return getRating(b) - getRating(a);
    });
  } else if (sort === 'neighborhood-asc' || sort === 'neighborhood-desc') {
    const dir = sort === 'neighborhood-asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const dn = (a.neighborhood || '').localeCompare(b.neighborhood || '', 'fr-CA') * dir;
      if (dn) return dn;
      return starThenPrice(a, b);
    });
  } else {
    filtered.sort(starThenPrice);
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
    els.grid.innerHTML = '';
    // Update map to empty state (no pins)
    updateMapMarkers([]);
    return;
  } else {
    els.empty.hidden = true;
  }

  const frag = document.createDocumentFragment();
  for (const l of filtered) {
    frag.appendChild(renderCard(l));
  }
  els.grid.innerHTML = '';
  els.grid.appendChild(frag);
  // Sync map markers with current filtered list
  updateMapMarkers(filtered);
}

function renderCard(l) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = l.id || '';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Voir détails pour ${l.title || 'annonce'}`);
  card.addEventListener('click', () => {
    focusListingOnMap(l);
  });
  card.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      focusListingOnMap(l);
      openModal(l);
    }
  });

  // Hero image (square-ish)
  const heroWrap = document.createElement('div');
  heroWrap.className = 'card-hero';
  const hero = document.createElement('img');
  const featured = (Array.isArray(l.photos_featured) && l.photos_featured.length) ? l.photos_featured : (l.photos || []);
  hero.src = featured[0] ? featured[0] : PLACEHOLDER_DATA_URL;
  hero.loading = 'lazy';
  hero.alt = buildAlt(l, 0);
  hero.decoding = 'async';
  hero.onerror = () => {
    hero.onerror = null;
    hero.src = PLACEHOLDER_DATA_URL;
  };
  heroWrap.appendChild(hero);

  // Thumbnail strip (up to 3 more)
  const thumbs = document.createElement('div');
  thumbs.className = 'card-thumbs';
  const thumbSrcs = featured.slice(1, 4);
  while (thumbSrcs.length < 3) thumbSrcs.push(PLACEHOLDER_DATA_URL);
  thumbSrcs.forEach((src, i) => {
    const t = document.createElement('img');
    t.src = src || PLACEHOLDER_DATA_URL;
    t.loading = 'lazy';
    t.alt = buildAlt(l, i + 1);
    t.decoding = 'async';
    t.onerror = () => {
      t.onerror = null;
      t.src = PLACEHOLDER_DATA_URL;
    };
    thumbs.appendChild(t);
  });

  const body = document.createElement('div');
  body.className = 'card-body';

  const priceRow = document.createElement('div');
  priceRow.className = 'price-row';
  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = formatPrice(l.price);
  priceRow.appendChild(price);
  priceRow.appendChild(buildStars(l));

  const meta = document.createElement('div');
  meta.className = 'meta';
  const line1 = document.createElement('div');
  line1.className = 'meta-line';
  line1.innerHTML = `
    <span>${escapeHtml(l.neighborhood || '—')}</span>
    <span>${formatSqft(l.sqft)}</span>
    ${l.floor ? `<span>${escapeHtml(l.floor)}</span>` : ''}
  `;
  const line2 = document.createElement('div');
  line2.className = 'meta-line';
  line2.innerHTML = `
    <span>${l.bedrooms ?? '—'} ch</span>
    ${buildApplianceBadges(l.appliances)}
    ${l.bright ? `<span class="badge" title="Lumineux confirmé">Lumineux</span>` : ''}
    ${l.basement ? `<span class="badge" title="Sous-sol">Sous-sol</span>` : ''}
    <span class="badge">${sourceLabel(l.source)}</span>
  `;
  const lineDates = document.createElement('div');
  lineDates.className = 'meta-line dates';
  const posted = formatPosted(l);
  const dispo = formatAvailable(l);
  lineDates.innerHTML = [posted, dispo].filter(Boolean).map((t) => `<span>${escapeHtml(t)}</span>`).join('');

  const desc = document.createElement('p');
  desc.className = 'desc';
  desc.textContent = buildBlurb(l);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const btnAd = document.createElement('a');
  btnAd.className = 'btn primary';
  btnAd.href = l.url || '#';
  btnAd.target = '_blank';
  btnAd.rel = 'noopener noreferrer';
  btnAd.textContent = "Voir l'annonce";
  btnAd.addEventListener('click', (e) => {
    e.stopPropagation();
    focusListingOnMap(l);
  });
  const btnView = document.createElement('button');
  btnView.type = 'button';
  btnView.className = 'btn';
  btnView.textContent = 'Détails';
  btnView.addEventListener('click', (e) => {
    e.stopPropagation();
    focusListingOnMap(l);
    openModal(l);
  });
  actions.appendChild(btnAd);
  actions.appendChild(btnView);

  // Compose meta lines
  meta.appendChild(line1);
  meta.appendChild(line2);
  if (lineDates.innerHTML) meta.appendChild(lineDates);

  body.appendChild(priceRow);
  body.appendChild(meta);
  body.appendChild(desc);
  body.appendChild(actions);

  card.appendChild(heroWrap);
  card.appendChild(thumbs);
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
    formatSqft(l.sqft),
    l.posted ? formatPosted(l) : null,
    l.available ? formatAvailable(l) : null,
    l.bright ? 'Lumineux' : null,
    l.basement ? 'Sous-sol' : null,
    sourceLabel(l.source)
  ].filter(Boolean).join(' · ');
  if (l.appliances) {
    const badges = [
      l.appliances.stove ? 'Cuisinière' : null,
      l.appliances.fridge ? 'Frigo' : null,
      l.appliances.washer ? 'Laveuse' : null,
      l.appliances.dryer ? 'Sécheuse' : null
    ].filter(Boolean);
    if (badges.length) {
      els.modalMeta.textContent += ' · ' + badges.join(', ');
    }
  }
  els.modalDesc.textContent = (l.description || '').trim() || (l.high_end_notes || '').trim() || '';
  els.modalLink.href = l.url || '#';

  // Full gallery in the modal (every photo we have, not just the card picks)
  const allPhotos = Array.isArray(l.photos) && l.photos.length ? l.photos.slice() : (
    Array.isArray(l.photos_featured) && l.photos_featured.length ? l.photos_featured.slice() : [PLACEHOLDER_DATA_URL]
  );
  state.modal.photos = allPhotos;
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
  const strip = document.querySelector('.carousel-strip');
  if (strip) strip.remove();
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
    img.alt = `Photo ${idx + 1} sur ${state.modal.photos.length}`;
    img.loading = idx === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_DATA_URL;
    };
    els.carouselTrack.appendChild(img);
  });
  renderCarouselMeta();
  scrollCarouselTo(state.modal.currentIndex);
}

function renderCarouselMeta() {
  const car = document.querySelector('.carousel');
  if (!car) return;
  let count = car.querySelector('.carousel-count');
  if (!count) {
    count = document.createElement('div');
    count.className = 'carousel-count';
    car.appendChild(count);
  }
  const n = state.modal.photos.length;
  const i = (state.modal.currentIndex || 0) + 1;
  count.textContent = n ? `${i} / ${n}` : '';

  let strip = document.querySelector('.carousel-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'carousel-strip';
    car.insertAdjacentElement('afterend', strip);
  }
  strip.innerHTML = '';
  state.modal.photos.forEach((src, idx) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'carousel-strip-item' + (idx === state.modal.currentIndex ? ' is-active' : '');
    t.setAttribute('aria-label', `Photo ${idx + 1}`);
    const img = document.createElement('img');
    img.src = src || PLACEHOLDER_DATA_URL;
    img.alt = '';
    img.loading = 'lazy';
    t.appendChild(img);
    t.onclick = () => {
      state.modal.currentIndex = idx;
      scrollCarouselTo(idx);
    };
    strip.appendChild(t);
  });
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
  renderCarouselMeta();
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
  const s = (iso || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    try {
      return new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' }).format(dt);
    } catch {
      return s.slice(0, 10);
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    try {
      return new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch {
      return d.toLocaleDateString('fr-CA');
    }
  }
  return s;
}
function formatPosted(l) {
  const s = formatDate(l.posted);
  return s ? 'Publié le ' + s : '';
}
function formatAvailable(l) {
  const s = (l.available || '').trim();
  return s ? 'Dispo. ' + s : '';
}
function sourceLabel(src) {
  const s = (src || '').toLowerCase();
  if (s.includes('kijiji')) return 'Kijiji';
  if (s.includes('marketplace') || s.includes('facebook')) return 'Marketplace';
  return src || 'Source';
}
function formatSqft(n) {
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return `${n} pi²`;
  }
  return 'Superficie non indiquée';
}
function buildApplianceBadges(ap) {
  if (!ap) return '';
  const items = [];
  if (ap.stove) items.push('<span class="badge appliance" title="Cuisinière">Cuisinière</span>');
  if (ap.fridge) items.push('<span class="badge appliance" title="Frigo">Frigo</span>');
  if (ap.washer) items.push('<span class="badge appliance" title="Laveuse">Laveuse</span>');
  if (ap.dryer) items.push('<span class="badge appliance" title="Sécheuse">Sécheuse</span>');
  return items.join(' ');
}
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1).trimEnd() + '…' : str;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function buildBlurb(l) {
  const blurb = (l.blurb_fr || '').trim();
  if (blurb) return truncate(blurb, 160);
  const fallback = (l.description || '').trim() || (l.high_end_notes || '').trim() || l.title || '';
  return truncate(fallback, 160);
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

// Map & geocoding
function initMap() {
  const target = document.getElementById('map');
  if (!target || typeof L === 'undefined') return;
  const map = L.map(target, {
    scrollWheelZoom: true,
    tap: true
  }).setView(MONTREAL_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  state.map.map = map;
  state.map.layer = layer;
}

async function updateMapMarkers(listings) {
  if (!state.map.map || !state.map.layer) return;
  state.map.layer.clearLayers();
  state.map.markersById.clear();

  if (!Array.isArray(listings) || listings.length === 0) {
    state.map.map.setView(MONTREAL_CENTER, DEFAULT_ZOOM);
    return;
  }

  const bounds = L.latLngBounds([]);
  for (const l of listings) {
    const ll = await ensureCoordinates(l);
    if (!ll) continue;
    const price = formatPriceShort(l.price);
    const icon = L.divIcon({
      className: 'price-marker',
      html: `<span class="pm-price">${price}</span>`,
      iconSize: [0, 0],
      iconAnchor: [20, 20]
    });
    const marker = L.marker(ll, { icon }).addTo(state.map.layer);
    state.map.markersById.set(l.id, marker);
    const thumb = (Array.isArray(l.photos) && l.photos[0]) ? l.photos[0] : PLACEHOLDER_DATA_URL;
    const popupHtml = `
      <div style="display:flex;gap:8px;align-items:center;min-width:220px">
        <img src="${thumb}" alt="Miniature" style="width:64px;height:64px;object-fit:cover;border-radius:8px;background:#ddd" onerror="this.src='${PLACEHOLDER_DATA_URL}'">
        <div style="display:flex;flex-direction:column;gap:2px">
          <strong>${escapeHtml(price)}</strong>
          <span style="color:#6b6258">${escapeHtml(l.neighborhood || '')}</span>
          <a href="${l.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;color:#7a3a21">Voir l'annonce</a>
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml);
    marker.on('click', () => setHighlightedCard(l.id));
    marker.on('popupopen', () => setHighlightedCard(l.id));
    bounds.extend(ll);
  }
  try {
    state.map.map.fitBounds(bounds.pad(0.2), { animate: true, maxZoom: 16 });
  } catch {}
}

function setHighlightedCard(id) {
  document.querySelectorAll('.card.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
  const el = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (el) {
    el.classList.add('is-highlighted');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function focusListingOnMap(l) {
  const marker = state.map.markersById.get(l.id);
  if (marker && state.map.map) {
    state.map.map.setView(marker.getLatLng(), Math.max(state.map.map.getZoom(), 15), { animate: true });
    marker.openPopup();
    setHighlightedCard(l.id);
  }
}

function loadGeoCache() {
  try {
    const raw = localStorage.getItem('geo-cache-v1');
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}
function saveGeoCache(cache) {
  try {
    localStorage.setItem('geo-cache-v1', JSON.stringify(cache));
  } catch {}
}

async function ensureCoordinates(l) {
  if (isFiniteNum(l.lat) && isFiniteNum(l.lng)) {
    return L.latLng(l.lat, l.lng);
  }
  const query = buildGeocodeQuery(l);
  if (!query) {
    const c = centroidForNeighborhood(l.neighborhood);
    return c ? L.latLng(c[0], c[1]) : L.latLng(MONTREAL_CENTER[0], MONTREAL_CENTER[1]);
  }
  const cached = state.map.cache[query];
  if (cached && isFiniteNum(cached.lat) && isFiniteNum(cached.lng)) {
    return L.latLng(cached.lat, cached.lng);
  }
  const res = await geocodeWithRateLimit(query);
  if (res) {
    state.map.cache[query] = { lat: res[0], lng: res[1], t: Date.now() };
    saveGeoCache(state.map.cache);
    return L.latLng(res[0], res[1]);
  }
  const c = centroidForNeighborhood(l.neighborhood);
  if (c) return L.latLng(c[0], c[1]);
  return L.latLng(MONTREAL_CENTER[0], MONTREAL_CENTER[1]);
}

function centroidForNeighborhood(name) {
  if (!name) return null;
  return NEIGHBORHOOD_CENTROIDS[name] || null;
}
function buildGeocodeQuery(l) {
  const parts = [];
  if (l.address) parts.push(l.address);
  if (l.neighborhood) parts.push(l.neighborhood);
  parts.push('Montréal, QC');
  return parts.join(', ').trim();
}
async function geocodeWithRateLimit(query) {
  const now = Date.now();
  const wait = Math.max(0, state.map.nextGeocodeAllowedAt - now);
  state.map.nextGeocodeAllowedAt = now + wait + GEOCODE_MIN_INTERVAL_MS;
  if (wait) await delay(wait);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1&addressdetails=0&accept-language=fr-CA`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'fr-CA' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (Array.isArray(json) && json[0] && json[0].lat && json[0].lon) {
      return [parseFloat(json[0].lat), parseFloat(json[0].lon)];
    }
    return null;
  } catch (e) {
    console.warn('Geocoding failed for', query, e);
    return null;
  }
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function isFiniteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}
function formatPriceShort(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n)} $`;
  }
}
