import {
  ENDPOINTS,
  loadSettings,
  enabledSiteIds,
  openSearch,
  titleCandidates,
  cleanSelection,
  matchCollection,
  betterMatch,
  statusInfo,
  wikidataLookup,
  enrichCollection,
  parseCollectionXml,
  markExpansions,
  collectionUrl,
  fetchCollectionXml,
  buildGame,
  summarizeCollection,
  key,
  bggHeaders,
} from './lib.js';

const DAY = 24 * 60 * 60 * 1000;
const WD_TTL = 14 * DAY;

// ---------------------------------------------------------------------------
// Installation, menus, synchro périodique

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'cl-selection',
      title: 'Chercher le jeu « %s » d’occasion',
      contexts: ['selection'],
    });
  });
  chrome.alarms.create('cl-sync', { periodInMinutes: 12 * 60 });
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  syncCollection().catch(() => {});
});

chrome.runtime.onStartup.addListener(async () => {
  const { collection } = await chrome.storage.local.get('collection');
  if (!collection || Date.now() - collection.syncedAt > DAY) syncCollection().catch(() => {});
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'cl-sync') syncCollection().catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'cl-selection') return;
  const query = cleanSelection(info.selectionText);
  if (!query) return;
  const settings = await loadSettings();
  await openSearch({ query, sites: enabledSiteIds(settings), excludeInserts: settings.excludeInserts, groupTabs: settings.groupTabs, openerTab: tab });
});

// ---------------------------------------------------------------------------
// Synchro de la collection BGG

let syncing = null;

async function fetchViaBggTab(url) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: `*://${new URL(ENDPOINTS.bgg).hostname}/*` });
  } catch {
    return null;
  }
  for (const tab of tabs) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [url, bggHeaders()],
        func: async (u, headers) => {
          for (let i = 0; i < 10; i++) {
            const r = await fetch(u, { credentials: 'include', cache: 'no-store', headers });
            if (r.status === 202) {
              await new Promise((res) => setTimeout(res, 2500));
              continue;
            }
            return { status: r.status, text: r.ok ? await r.text() : '' };
          }
          return { status: 202, text: '' };
        },
      });
      if (res && res.result && res.result.status === 200) return res.result.text;
    } catch {
      /* onglet non scriptable */
    }
  }
  return null;
}

async function fetchXml(url) {
  try {
    return await fetchCollectionXml(url);
  } catch (e) {
    if (e.code === 'auth') {
      const t = await fetchViaBggTab(url);
      if (t) return t;
    }
    throw e;
  }
}

function syncErrorMessage(e) {
  switch (e && e.code) {
    case 'auth':
      return 'BGG refuse l’accès : connecte-toi sur boardgamegeek.com dans Chrome, puis relance la synchro.';
    case 'busy':
      return 'BGG prépare encore ta collection : réessaie dans une minute.';
    case 'username':
      return 'Pseudo BGG introuvable : vérifie-le dans les options.';
    case 'network':
      return 'BGG est injoignable pour le moment.';
    default:
      return `Synchro impossible : ${(e && e.message) || e}`;
  }
}

async function syncCollection() {
  if (syncing) {
    await syncing.catch(() => {});
    return collectionInfo();
  }
  syncing = (async () => {
    const settings = await loadSettings();
    const username = (settings.username || '').trim();
    if (!username) {
      // Collection facultative : sans pseudo, on efface simplement l'ancienne
      await chrome.storage.local.remove('collection');
      await chrome.storage.local.set({ syncError: null });
      return;
    }
    try {
      const xmlAll = await fetchXml(collectionUrl(username));
      const { items } = parseCollectionXml(xmlAll);
      try {
        const xmlExp = await fetchXml(collectionUrl(username, 'boardgameexpansion'));
        markExpansions(items, parseCollectionXml(xmlExp).items);
      } catch {
        /* les extensions restent marquées comme jeux : pas bloquant */
      }
      try {
        await enrichCollection(items);
      } catch {
        /* noms français indisponibles : pas bloquant */
      }
      await chrome.storage.local.set({ collection: { username, syncedAt: Date.now(), items }, syncError: null });
    } catch (e) {
      await chrome.storage.local.set({ syncError: syncErrorMessage(e) });
    }
  })();
  try {
    await syncing;
  } finally {
    syncing = null;
  }
  return collectionInfo();
}

async function collectionInfo() {
  const { collection, syncError } = await chrome.storage.local.get(['collection', 'syncError']);
  const settings = await loadSettings();
  return { ...summarizeCollection(collection), error: syncError || null, configuredUser: settings.username, syncing: !!syncing };
}

// ---------------------------------------------------------------------------
// Résolution du jeu affiché sur une page

async function cachedWikidata(names, bggId) {
  const cacheKey = bggId ? `id:${bggId}` : `q:${key(names[0] || '')}`;
  if (cacheKey === 'q:') return null;
  const { wdcache = {} } = await chrome.storage.local.get('wdcache');
  const hit = wdcache[cacheKey];
  if (hit && Date.now() - hit.t < WD_TTL) return hit.v;
  let v = null;
  try {
    v = await wikidataLookup({ names, bggId });
  } catch {
    return null; // pas de cache en cas d'erreur réseau
  }
  wdcache[cacheKey] = { t: Date.now(), v };
  const keys = Object.keys(wdcache);
  if (keys.length > 400) {
    keys.sort((a, b) => wdcache[a].t - wdcache[b].t).slice(0, keys.length - 400).forEach((k) => delete wdcache[k]);
  }
  await chrome.storage.local.set({ wdcache });
  return v;
}

async function resolve(detected, { auto = false, network = true } = {}) {
  const settings = await loadSettings();
  if (auto && !settings.pill) return { show: false };
  const d = detected || {};
  const { collection } = await chrome.storage.local.get('collection');
  const items = (collection && collection.items) || [];

  const names = titleCandidates(d.name || d.title);
  const sel = !auto && d.selection ? cleanSelection(d.selection) : '';
  if (sel) names.unshift(sel);

  let match = matchCollection(items, { bggId: d.bggId, names });
  const relevant = d.isGamePage || d.boardGameContext || !auto;
  let wd = null;
  if (network && relevant && (names.length || d.bggId)) {
    wd = await cachedWikidata(names, d.bggId);
    if (wd) {
      const m2 = matchCollection(items, { bggId: wd.bggId, names: [wd.fr, wd.en, ...(wd.aliases || [])].filter(Boolean) });
      match = betterMatch(match, m2);
    }
  }

  const show = !auto || d.isGamePage || (d.boardGameContext && names.length > 0) || !!(match && match.quality !== 'partial');
  const game = buildGame({ detected: d, names, wd, match });
  if (sel) game.query = sel;

  return {
    show,
    site: d.site,
    game,
    match: match
      ? {
          quality: match.quality,
          status: statusInfo(match.item),
          name: match.item.fr || match.item.name,
          id: match.item.id,
        }
      : null,
    priceText: d.priceText || '',
    currency: d.currency || '',
    hasCollection: items.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Messages (popup, pastille, options)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('cl:')) return false;
  (async () => {
    switch (msg.type) {
      case 'cl:resolve':
        return resolve(msg.detected, { auto: !!msg.auto, network: msg.network !== false });
      case 'cl:search': {
        let openerTab = sender.tab || null;
        if (!openerTab && msg.tabId != null) openerTab = await chrome.tabs.get(msg.tabId).catch(() => null);
        const settings = await loadSettings();
        return openSearch({
          query: msg.query,
          maxPrice: msg.maxPrice,
          sites: msg.sites || enabledSiteIds(settings),
          excludeInserts: settings.excludeInserts,
          groupTabs: msg.groupTabs != null ? msg.groupTabs : settings.groupTabs,
          openerTab,
        });
      }
      case 'cl:open': {
        const url = String(msg.url || '');
        if (!/^https:\/\/(boardgamegeek\.com|www\.myludo\.fr)\//.test(url)) return { ok: false };
        let opener = sender.tab || null;
        if (!opener && msg.tabId != null) opener = await chrome.tabs.get(msg.tabId).catch(() => null);
        const props = { url, active: true };
        if (opener) {
          props.index = opener.index + 1;
          props.windowId = opener.windowId;
          props.openerTabId = opener.id;
        }
        await chrome.tabs.create(props);
        return { ok: true };
      }
      case 'cl:sync':
        return syncCollection();
      case 'cl:info':
        return collectionInfo();
      default:
        return null;
    }
  })()
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ error: String((e && e.message) || e) }));
  return true;
});
