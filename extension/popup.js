import {
  SITES,
  SECONDHAND_SITES,
  loadSettings,
  saveSettings,
  enabledSiteIds,
  parsePrice,
  formatPrice,
  normalizeMax,
  timeAgo,
  POWERED_BY_BGG_LOGO,
} from './lib.js';

const $ = (id) => document.getElementById(id);
const state = { settings: null, tab: null, res: null, dirty: false };

const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);

for (const img of document.querySelectorAll('img[data-bgg-logo]')) img.src = POWERED_BY_BGG_LOGO;

init();

async function init() {
  state.settings = await loadSettings();
  renderSites();
  bindEvents();
  refreshCollection();

  state.tab = await getTargetTab();
  const detected = await detect(state.tab);
  const quick = await send({ type: 'cl:resolve', detected, network: false });
  applyResolution(quick);
  $('q').focus();
  $('q').select();
  const full = await send({ type: 'cl:resolve', detected, network: true });
  if (full) applyResolution(full);
}

async function getTargetTab() {
  const forced = new URLSearchParams(location.search).get('tabId'); // tests automatisés
  try {
    if (forced) return await chrome.tabs.get(Number(forced));
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch {
    return null;
  }
}

async function detect(tab) {
  if (!tab || tab.id == null) return { name: '', title: '', site: 'other' };
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['detect.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (globalThis.__clDetect ? globalThis.__clDetect() : null),
    });
    if (res && res.result) return res.result;
  } catch {
    /* page non scriptable */
  }
  return { name: tab.title || '', title: tab.title || '', site: 'other' };
}

function applyResolution(res) {
  if (!res || !res.game) return;
  state.res = res;
  const g = res.game;

  if (!state.dirty) $('q').value = g.query || '';

  // Carte du jeu
  const hasGame = !!g.display && (g.bggId || res.match || g.fr);
  $('game').hidden = !g.display;
  if (g.display) {
    $('g-name').textContent = g.display;
    $('g-name').title = g.display;
    $('g-exp').hidden = !g.isExpansion;
    const sub = [];
    if (g.en && g.en !== g.display) sub.push(g.en);
    if (g.bggId) sub.push(`BGG #${g.bggId}`);
    $('g-sub').textContent = sub.join(' · ');

    const st = $('g-status');
    const m = res.match;
    st.className = 'g-status';
    if (m && m.quality !== 'partial' && m.status) {
      st.classList.add(m.status.kind);
      st.textContent = `${m.status.kind === 'own' ? '✓' : '♥'} ${m.status.label}`;
      st.hidden = false;
    } else if (m && m.quality === 'partial') {
      st.classList.add('near');
      st.textContent = `Proche de « ${m.name} »${m.status ? ` · ${m.status.label.toLowerCase()}` : ''}`;
      st.hidden = false;
    } else if (res.hasCollection && hasGame) {
      st.classList.add('none');
      st.textContent = 'Pas dans ta collection BGG';
      st.hidden = false;
    } else {
      st.hidden = true;
    }
  }

  // Variantes de nom (FR / EN)
  const names = (g.nameOptions || []).filter(Boolean);
  const box = $('names');
  box.textContent = '';
  box.hidden = names.length < 2;
  for (const n of names) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'name-chip';
    b.textContent = n;
    b.title = n;
    b.setAttribute('aria-pressed', String(n === $('q').value));
    b.addEventListener('click', () => {
      $('q').value = n;
      state.dirty = true;
      syncNameChips();
    });
    box.appendChild(b);
  }

  // Prix
  const price = parsePrice(res.priceText);
  const chips = $('price-chips');
  chips.textContent = '';
  $('price-hint').textContent = '';
  if (price) {
    const secondhand = SECONDHAND_SITES.has(res.site);
    $('price-hint').textContent = secondhand ? `· annonce à ${formatPrice(price, res.currency)}` : `· neuf ${formatPrice(price, res.currency)}`;
    if (!secondhand) renderPriceChips(price);
  }
}

function syncNameChips() {
  for (const b of $('names').querySelectorAll('.name-chip')) b.setAttribute('aria-pressed', String(b.textContent === $('q').value));
}

function renderPriceChips(price) {
  const box = $('price-chips');
  const opts = [
    { label: 'neuf', value: Math.ceil(price) },
    { label: '−30 %', value: Math.round(price * 0.7) },
    { label: '−50 %', value: Math.round(price * 0.5) },
  ].filter((o, i, arr) => o.value > 0 && arr.findIndex((x) => x.value === o.value) === i);
  for (const o of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-sm';
    b.dataset.value = String(o.value);
    b.setAttribute('aria-pressed', 'false');
    b.append(`${o.value} €`);
    const sm = document.createElement('small');
    sm.textContent = o.label;
    b.append(sm);
    b.addEventListener('click', () => {
      $('max').value = $('max').value === String(o.value) ? '' : String(o.value);
      syncPriceChips();
    });
    box.appendChild(b);
  }
}

function syncPriceChips() {
  for (const b of $('price-chips').querySelectorAll('.chip-sm')) b.setAttribute('aria-pressed', String(b.dataset.value === $('max').value));
}

function renderSites() {
  const grid = $('sites');
  grid.textContent = '';
  for (const s of SITES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'site';
    b.style.setProperty('--c', s.color);
    b.dataset.id = s.id;
    b.setAttribute('aria-pressed', String(!!state.settings.sites[s.id]));
    const dot = document.createElement('span');
    dot.className = 'dot';
    b.append(dot, document.createTextNode(s.name));
    b.addEventListener('click', () => {
      state.settings.sites[s.id] = !state.settings.sites[s.id];
      b.setAttribute('aria-pressed', String(state.settings.sites[s.id]));
      saveSettings(state.settings);
      updateGo();
    });
    grid.appendChild(b);
  }
  updateGo();
}

function updateGo() {
  const n = enabledSiteIds(state.settings).length;
  $('go').textContent = n === 0 ? 'Choisis au moins un site' : `Chercher sur ${n} site${n > 1 ? 's' : ''}`;
  $('go').disabled = n === 0;
  $('msg').hidden = true;
}

async function refreshCollection(info) {
  const i = info || (await send({ type: 'cl:info' }));
  const el = $('coll');
  el.classList.remove('err');
  if (!i) {
    el.textContent = 'Collection BGG indisponible';
    return;
  }
  if (i.error) {
    el.textContent = i.error;
    el.classList.add('err');
    el.title = i.error;
    return;
  }
  if (!i.configuredUser) {
    el.innerHTML = '';
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Relier ta collection BoardGameGeek →';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    el.append(a);
    $('sync').hidden = true;
    return;
  }
  $('sync').hidden = false;
  if (!i.count) {
    el.textContent = `Collection de ${i.configuredUser} pas encore synchronisée`;
    return;
  }
  el.textContent = `${i.username} · ${i.owned} possédés · ${i.wishlist} envies · ${timeAgo(i.syncedAt)}`;
  el.title = `${i.count} jeux dans la collection BGG`;
}

function bindEvents() {
  $('opts').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('clear').addEventListener('click', () => {
    $('q').value = '';
    state.dirty = true;
    $('q').focus();
  });
  $('q').addEventListener('input', () => {
    state.dirty = true;
    syncNameChips();
  });
  $('max').addEventListener('input', syncPriceChips);
  $('btn-bgg').addEventListener('click', () => openLink('bgg'));
  $('btn-myludo').addEventListener('click', () => openLink('myludo'));
  $('sync').addEventListener('click', async () => {
    $('sync').classList.add('spin');
    $('coll').textContent = 'Synchronisation avec BGG…';
    const info = await send({ type: 'cl:sync' });
    $('sync').classList.remove('spin');
    refreshCollection(info);
  });
  $('form').addEventListener('submit', onSubmit);
}

async function openLink(which) {
  const g = state.res && state.res.game;
  if (!g || !g.links) return;
  await send({ type: 'cl:open', url: g.links[which], tabId: state.tab ? state.tab.id : null });
  window.close();
}

async function onSubmit(e) {
  e.preventDefault();
  const query = $('q').value.replace(/\s+/g, ' ').trim();
  if (!query) {
    $('q').classList.remove('shake');
    void $('q').offsetWidth;
    $('q').classList.add('shake');
    $('q').focus();
    return;
  }
  const sites = enabledSiteIds(state.settings);
  if (!sites.length) return;
  $('go').disabled = true;
  const r = await send({
    type: 'cl:search',
    query,
    maxPrice: normalizeMax($('max').value),
    sites,
    groupTabs: state.settings.groupTabs,
    tabId: state.tab ? state.tab.id : null,
  });
  if (!r || r.error) {
    $('msg').textContent = `Impossible d’ouvrir les onglets${r && r.error ? ` : ${r.error}` : ''}`;
    $('msg').hidden = false;
    $('go').disabled = false;
    return;
  }
  window.close();
}
