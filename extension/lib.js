// Chineur Ludique — logique partagée (service worker, popup, options).

// Points d'accès réseau (remplacés par un serveur local pendant les tests).
export const ENDPOINTS = {
  bgg: 'https://boardgamegeek.com',
  wdApi: 'https://www.wikidata.org/w/api.php',
  wdSparql: 'https://query.wikidata.org/sparql',
};

const BGG_WEB = 'https://boardgamegeek.com';
const MYLUDO_WEB = 'https://www.myludo.fr';
export const DEFAULT_USERNAME = '';
export const USER_AGENT = 'ChineurLudique/1.0.0 (extension de navigateur open source)';

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Sites de recherche

export const SITES = [
  {
    id: 'okkazeo',
    name: 'Okkazeo',
    color: '#5FAE3A',
    defaultOn: true,
    build: (q) => `https://www.okkazeo.com/jeux/resultats?rech_nom=${enc(q)}`,
  },
  {
    id: 'leboncoin',
    name: 'Leboncoin',
    color: '#EC5A13',
    defaultOn: true,
    // category=41 : Jeux & jouets
    build: (q, max) => `https://www.leboncoin.fr/recherche?category=41&text=${enc(q)}${max ? `&price=min-${max}` : ''}`,
  },
  {
    id: 'vinted',
    name: 'Vinted',
    color: '#09B1BA',
    defaultOn: true,
    build: (q, max) => `https://www.vinted.fr/catalog?search_text=${enc(q)}${max ? `&price_to=${max}` : ''}`,
  },
  {
    id: 'ebay',
    name: 'eBay',
    color: '#0064D2',
    defaultOn: true,
    build: (q, max) => `https://www.ebay.fr/sch/i.html?_nkw=${enc(q)}&LH_ItemCondition=3000${max ? `&_udhi=${max}` : ''}`,
  },
  {
    id: 'philibert',
    name: 'Philibert (neuf)',
    color: '#C8102E',
    defaultOn: false,
    build: (q) => `https://www.philibertnet.com/fr/recherche?search_query=${enc(q)}`,
  },
  {
    id: 'facebook',
    name: 'Marketplace',
    color: '#1877F2',
    defaultOn: false,
    build: (q, max) => `https://www.facebook.com/marketplace/search/?query=${enc(q)}${max ? `&maxPrice=${max}` : ''}`,
  },
];

// Sites où le prix affiché est un prix d'occasion (pas un prix neuf de référence)
export const SECONDHAND_SITES = new Set(['okkazeo', 'leboncoin', 'vinted', 'ebay']);

export const DEFAULT_SETTINGS = {
  username: DEFAULT_USERNAME,
  sites: Object.fromEntries(SITES.map((s) => [s.id, s.defaultOn])),
  groupTabs: true,
  pill: true,
};

function mergeSettings(s) {
  return {
    ...DEFAULT_SETTINGS,
    ...(s || {}),
    sites: { ...DEFAULT_SETTINGS.sites, ...((s && s.sites) || {}) },
  };
}

export async function loadSettings() {
  try {
    const { settings } = await chrome.storage.sync.get('settings');
    return mergeSettings(settings);
  } catch {
    return mergeSettings(null);
  }
}

export async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set({ settings });
  } catch {
    /* stockage indisponible */
  }
}

export function enabledSiteIds(settings) {
  return SITES.filter((s) => settings.sites[s.id]).map((s) => s.id);
}

export function normalizeMax(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildSearchUrls(query, { maxPrice = null, sites = [] } = {}) {
  const q = String(query || '').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const max = normalizeMax(maxPrice);
  return SITES.filter((s) => sites.includes(s.id)).map((s) => ({ id: s.id, name: s.name, url: s.build(q, max) }));
}

export function bggUrl(game) {
  if (game && game.bggId) return `${BGG_WEB}/boardgame/${game.bggId}`;
  const q = (game && (game.en || game.query || game.display)) || '';
  return `${BGG_WEB}/geeksearch.php?action=search&objecttype=boardgame&q=${enc(q)}`;
}

export function myludoUrl(game) {
  const q = (game && (game.fr || game.query || game.display || game.en)) || '';
  return `${MYLUDO_WEB}/#!/search/${enc(q)}`;
}

// ---------------------------------------------------------------------------
// Texte : normalisation et nettoyage des titres de jeux

export function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Clé de comparaison : normalisée, sans article initial.
export function key(s) {
  return norm(s).replace(/^(?:les|le|la|l|the|un|une|des|a|an) /, '');
}

const PUBLISHERS = new Set(
  [
    'Asmodee', 'Days of Wonder', 'Gigamic', 'Iello', 'Repos Production', 'Libellud', 'Matagot', 'Blackrock Games',
    'Blackrock', 'Ludonaute', 'Space Cowboys', 'Hasbro', 'Hasbro Gaming', 'Mattel', 'Mattel Games', 'Ravensburger',
    'Kosmos', 'Z-Man Games', 'Z-Man', 'Fantasy Flight Games', 'Fantasy Flight', 'Lucky Duck Games', 'Funforge',
    'Catch Up Games', 'Bombyx', 'Cocktail Games', 'Super Meeple', 'Pearl Games', 'Le Scorpion Masqué',
    'Scorpion Masqué', 'Hurrican', 'Lookout Games', 'Lookout', 'Pandasaurus', 'Stonemaier Games', 'Stonemaier',
    'Czech Games Edition', 'CGE', 'Plaid Hat Games', 'CMON', 'Origames', 'Act in Games', 'Ankama', 'Edge',
    'Edge Entertainment', 'Ystari', 'Filosofia', 'Atalia', 'Gameworks', 'Djeco', 'Haba', 'Smart Games', 'SmartGames',
    'Goliath', 'Dujardin', 'Schmidt', 'Queen Games', 'Pegasus Spiele', 'Lui-même', 'Bézier Games', 'Renegade Game Studios',
    'Leder Games', 'Grrre Games', 'Sorry We Are French', 'Explor8', 'Board&Dice', 'Portal Games', 'Mixlore', 'Spiral Editions',
    'Moonster Games', 'Oya', 'Helvetiq', 'Tiki Editions', 'Jumbo', 'Winning Moves', 'Paille Éditions', 'Unexpected Games',
    'Studio H', 'Ludically', 'Atomic Soup', 'Lumberjacks Studio', 'Intrafin', 'Arkhane Asylum', 'Nuts Publishing',
    'Kyf Edition', 'Purple Brain', 'Blue Orange', 'Bankiiiz', 'Mancalamaro', 'Ferti', 'Topi Games', 'Cartamundi',
  ].map(norm)
);

const SITE_WORDS = new Set(
  ['BoardGameGeek', 'BGG', 'Myludo', 'Okkazeo', 'Philibert', 'Philibertnet', 'leboncoin', 'Vinted', 'eBay', 'Amazon',
    'Amazon.fr', 'Fnac', 'Cultura', 'Board Game', 'Board Game Expansion', 'Boardgame'].map(norm)
);

const GENERIC_RE = new RegExp(
  '^(?:' +
    [
      'jeux? (?:de |d |du )?(?:societe|plateau|cartes?|des|role|strategie|reflexion|ambiance|cooperatifs?|cooperation|deduction|enquete|lettres|mots|famille|adresse|rapidite|memoire|logique|voyage|apero|soiree|connaissances?|culture generale)' +
        '(?: (?:d |de |du |pour |en )?(?:ambiance|strategie|reflexion|cooperatifs?|cooperation|deduction|enquete|famille|familial|toute la famille|enfants?|adultes?|apero|soiree|lettres|mots|rapidite|adresse|memoire|logique|culture generale|connaissances?|equipe|solo|duo|2 joueurs|voyage))*',
      'board ?games?(?: expansion| accessory)?',
      'a partir de',
      'card ?games?',
      'jeux?',
      'famille',
      'familial',
      'enfants?',
      'adultes?',
      'cadeau.*',
      'nouveaute',
      'nouveau',
      'nouvelle edition',
      'version francaise',
      'edition francaise',
      'en francais',
      'vf',
      'fr',
      'francais',
      'neuf.*',
      'occasion',
      'complete?',
      'tres bon etat',
      'tbe',
      'bon etat',
      'etat neuf',
      'comme neuf',
      'sous blister',
      'blister',
      'scelle',
      'jamais (?:servi|joue|ouvert)',
      'boite.*',
      'multicolore',
      'expansion',
      'extension',
      'standard',
      '\\d+',
    ].join('|') +
    ')$'
);

const LEAD_RE = /^(?:jeux?\s+(?:de\s+soci[ée]t[ée]|de\s+plateau|de\s+cartes?)|jeux?|board\s?game)\s+/i;
const TRAIL_RE =
  /\s+(?:jeux?\s+de\s+soci[ée]t[ée]|jeux?\s+de\s+plateau|jeux?\s+de\s+cartes?|complet|compl[èe]te|neuf(?:\s+sous\s+blister)?|sous\s+blister|tbe|tr[èe]s\s+bon\s+[ée]tat|bon\s+[ée]tat|comme\s+neuf|vf|version\s+fran[çc]aise|en\s+fran[çc]ais|fr|occasion|jamais\s+(?:servi|jou[ée]|ouvert)|[ée]tat\s+neuf)$/i;

const NOISE_RES = [
  /\b\d+\s*(?:[-–àa]|et)\s*\d+\s*joueurs?\b/gi,
  /\b\d+\s*\+?\s*joueurs?\b/gi,
  /\b\d+\s*[-–àa]\s*\d+\s*(?:minutes?|min|mn)\b/gi,
  /\b\d+\s*(?:minutes?|min|mn)\b/gi,
  /(?:d[èe]s|[àa]\s+partir\s+de)\s+\d+\s*(?:ans)?\s*(?:et\s*\+|\+)?/gi,
  /\b\d+\s*ans\s*(?:et\s*\+|\+)?/gi,
  /\b\d+\s*\+(?=\s|$)/g,
];

function trimPunct(s) {
  return s.replace(/^[\s\-–—:|,.;]+|[\s\-–—:|,.;]+$/g, '');
}

// Renvoie les noms de jeu plausibles contenus dans un titre de page / d'annonce.
export function titleCandidates(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  s = s.replace(/^amazon\.[a-z.]+\s*:\s*/i, '');
  s = s.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, ' ');
  for (const re of NOISE_RES) s = s.replace(re, ' ');

  const out = [];
  for (const part of s.split(/\s+[-–—|•·]\s+|\s*,\s+|\s+\/\s+/)) {
    let seg = trimPunct(part.replace(/\s+/g, ' ').trim());
    if (GENERIC_RE.test(norm(seg))) continue;
    let prev;
    do {
      prev = seg;
      seg = trimPunct(seg.replace(LEAD_RE, '').replace(TRAIL_RE, '').trim());
    } while (seg !== prev);
    if (!seg) continue;
    const n = norm(seg);
    if (!n || GENERIC_RE.test(n) || PUBLISHERS.has(n) || SITE_WORDS.has(n)) continue;
    const ext = seg.match(/^(?:extension|expansion)\s*:?\s+(.+)$/i);
    if (ext && out.length) {
      out[out.length - 1] = `${out[out.length - 1]} ${ext[1]}`;
      continue;
    }
    out.push(seg);
  }
  return dedupeByKey(out);
}

export function dedupeByKey(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!x) continue;
    const k = key(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export function cleanSelection(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function looksLikeExpansion(raw) {
  return /\b(?:extension|expansion)\b/i.test(String(raw || ''));
}

// ---------------------------------------------------------------------------
// Collection BGG

export const STATUS_KEYS = ['own', 'prevowned', 'fortrade', 'want', 'wanttoplay', 'wanttobuy', 'wishlist', 'preordered'];

export function decodeXml(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttrs(s) {
  const o = {};
  for (const m of String(s || '').matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = decodeXml(m[2]);
  return o;
}

export function parseCollectionXml(xml) {
  const text = String(xml || '');
  if (!/<items\b/.test(text)) {
    const msg = (text.match(/<message>([\s\S]*?)<\/message>/) || [])[1];
    const err = new Error(msg ? decodeXml(msg).trim() : 'Réponse BGG inattendue');
    err.code = /invalid username/i.test(msg || '') ? 'username' : 'bgg';
    throw err;
  }
  const byId = new Map();
  for (const m of text.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)) {
    const attrs = parseAttrs(m[1]);
    const body = m[2];
    const id = Number(attrs.objectid);
    if (!id) continue;
    const name = decodeXml((body.match(/<name\b[^>]*>([\s\S]*?)<\/name>/) || [])[1] || '').trim();
    const originalName = decodeXml((body.match(/<originalname>([\s\S]*?)<\/originalname>/) || [])[1] || '').trim();
    const st = parseAttrs((body.match(/<status\b([^>]*)\/?>/) || [])[1] || '');
    const status = Object.fromEntries(STATUS_KEYS.map((k) => [k, st[k] === '1']));
    const wishlistPriority = st.wishlistpriority ? Number(st.wishlistpriority) : undefined;
    const prev = byId.get(id);
    if (prev) {
      for (const k of STATUS_KEYS) prev.status[k] = prev.status[k] || status[k];
      if (wishlistPriority && (!prev.wishlistPriority || wishlistPriority < prev.wishlistPriority)) prev.wishlistPriority = wishlistPriority;
      continue;
    }
    const item = { id, subtype: attrs.subtype || 'boardgame', name, status };
    if (originalName && originalName !== name) item.originalName = originalName;
    if (wishlistPriority) item.wishlistPriority = wishlistPriority;
    byId.set(id, item);
  }
  const total = (text.match(/<items\b[^>]*totalitems="(\d+)"/) || [])[1];
  return { items: [...byId.values()], total: total ? Number(total) : byId.size };
}

export function markExpansions(items, expansionItems) {
  const ids = new Set((expansionItems || []).map((i) => i.id));
  for (const it of items) if (ids.has(it.id)) it.subtype = 'boardgameexpansion';
  return items;
}

export function collectionUrl(username, subtype) {
  return `${ENDPOINTS.bgg}/xmlapi2/collection?username=${enc(username)}&brief=1${subtype ? `&subtype=${subtype}` : ''}`;
}

// BGG répond 202 le temps de préparer la collection : on réessaie.
export async function fetchCollectionXml(url, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tries = 10 } = {}) {
  for (let i = 0; i < tries; i++) {
    let r;
    try {
      r = await fetchImpl(url, { credentials: 'include', cache: 'no-store' });
    } catch (e) {
      const err = new Error('BGG injoignable');
      err.code = 'network';
      throw err;
    }
    if (r.status === 202) {
      await sleep(2500);
      continue;
    }
    if (r.status === 429) {
      await sleep(5000);
      continue;
    }
    if (r.status === 401 || r.status === 403) {
      const err = new Error('Accès refusé par BGG');
      err.code = 'auth';
      throw err;
    }
    const text = await r.text();
    if (!r.ok && !/<errors?>/.test(text)) {
      const err = new Error(`BGG a répondu ${r.status}`);
      err.code = 'bgg';
      throw err;
    }
    return text;
  }
  const err = new Error('BGG prépare encore la collection');
  err.code = 'busy';
  throw err;
}

export function itemNames(it) {
  return [it.name, it.originalName, it.fr, it.en, ...(it.aliases || [])].filter(Boolean);
}

const QUALITY_RANK = { id: 3, exact: 2, partial: 1 };
export function betterMatch(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return QUALITY_RANK[b.quality] > QUALITY_RANK[a.quality] ? b : a;
}

export function matchCollection(items, { bggId = null, names = [] } = {}) {
  if (!items || !items.length) return null;
  if (bggId) {
    const it = items.find((i) => i.id === Number(bggId));
    if (it) return { item: it, quality: 'id' };
  }
  const keys = names.map(key).filter(Boolean);
  if (!keys.length) return null;
  for (const it of items) {
    for (const n of itemNames(it)) {
      if (keys.includes(key(n))) return { item: it, quality: 'exact' };
    }
  }
  let best = null;
  for (const it of items) {
    for (const n of itemNames(it)) {
      const k = key(n);
      if (k.length < 4) continue;
      for (const c of keys) {
        if (c !== k && ` ${c} `.includes(` ${k} `) && (!best || k.length > best.len)) {
          best = { item: it, quality: 'partial', len: k.length, matchedName: n };
        }
      }
    }
  }
  return best ? { item: best.item, quality: 'partial', matchedName: best.matchedName } : null;
}

const PRIORITY_LABELS = {
  1: 'indispensable',
  2: 'adorerais l’avoir',
  3: 'aimerais l’avoir',
  4: 'j’y réfléchis',
  5: 'à ne pas acheter',
};

export function statusInfo(item) {
  if (!item) return null;
  const s = item.status || {};
  if (s.own) return { kind: 'own', label: 'Dans ta ludothèque' };
  if (s.preordered) return { kind: 'preordered', label: 'Précommandé' };
  if (s.wishlist) {
    const p = PRIORITY_LABELS[item.wishlistPriority];
    return { kind: 'wishlist', label: `Liste d’envies${p ? ` · ${p}` : ''}`, priority: item.wishlistPriority };
  }
  if (s.wanttobuy || s.want) return { kind: 'want', label: 'Tu veux l’acheter' };
  if (s.prevowned) return { kind: 'prevowned', label: 'Tu l’as déjà eu' };
  if (s.wanttoplay) return { kind: 'wanttoplay', label: 'Tu veux y jouer' };
  if (s.fortrade) return { kind: 'fortrade', label: 'À échanger' };
  return null;
}

export function summarizeCollection(collection) {
  const items = (collection && collection.items) || [];
  return {
    count: items.length,
    owned: items.filter((i) => i.status.own).length,
    wishlist: items.filter((i) => i.status.wishlist).length,
    username: collection ? collection.username : null,
    syncedAt: collection ? collection.syncedAt : null,
  };
}

// ---------------------------------------------------------------------------
// Wikidata : noms FR/EN et numéro BGG (propriété P2339)

const SPARQL_SELECT =
  'SELECT ?item ?bgg ?fr ?en (GROUP_CONCAT(DISTINCT ?a; separator="|") AS ?aliases) (GROUP_CONCAT(DISTINCT ?tl; separator="|") AS ?types) WHERE {';
const SPARQL_TAIL =
  ' OPTIONAL { ?item rdfs:label ?fr FILTER(LANG(?fr) = "fr") }' +
  ' OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }' +
  ' OPTIONAL { ?item skos:altLabel ?a FILTER(LANG(?a) = "fr" || LANG(?a) = "en") }' +
  ' OPTIONAL { ?item wdt:P31 ?t . ?t rdfs:label ?tl FILTER(LANG(?tl) = "fr") }' +
  ' } GROUP BY ?item ?bgg ?fr ?en';

export function sparqlForItems(qids) {
  return `${SPARQL_SELECT} VALUES ?item { ${qids.map((q) => `wd:${q}`).join(' ')} } ?item wdt:P2339 ?bgg .${SPARQL_TAIL}`;
}

export function sparqlForBggIds(ids) {
  return `${SPARQL_SELECT} VALUES ?bgg { ${ids.map((i) => `"${Number(i)}"`).join(' ')} } ?item wdt:P2339 ?bgg .${SPARQL_TAIL}`;
}

export function parseSparqlGames(json) {
  const rows = (json && json.results && json.results.bindings) || [];
  return rows
    .map((b) => {
      const v = (k) => (b[k] && b[k].value) || '';
      const bggId = Number(v('bgg'));
      if (!bggId) return null;
      return {
        qid: v('item').split('/').pop(),
        bggId,
        fr: v('fr') || null,
        en: v('en') || null,
        aliases: v('aliases') ? v('aliases').split('|').filter(Boolean) : [],
        isExpansion: /extension|expansion/i.test(v('types')),
      };
    })
    .filter(Boolean);
}

export function similarity(a, b) {
  const x = key(a);
  const y = key(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ta = new Set(x.split(' '));
  const tb = new Set(y.split(' '));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jac = inter / (ta.size + tb.size - inter);
  const contains = x.includes(y) || y.includes(x) ? 0.15 : 0;
  return Math.min(0.95, jac + contains);
}

export function pickBestGame(games, names, rank = {}) {
  let best = null;
  for (const g of games) {
    const labels = [g.fr, g.en, ...g.aliases].filter(Boolean);
    let score = 0;
    for (const n of names) for (const l of labels) score = Math.max(score, similarity(n, l));
    const r = rank[g.qid] != null ? rank[g.qid] : 99;
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && r < best.rank)) {
      best = { ...g, score, rank: r };
    }
  }
  return best && best.score >= 0.6 ? best : null;
}

async function sparql(query, fetchImpl) {
  const r = await fetchImpl(ENDPOINTS.wdSparql, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: `query=${enc(query)}`,
  });
  if (!r.ok) throw new Error(`Wikidata ${r.status}`);
  return r.json();
}

export function wdSearchUrl(q, lang = 'fr') {
  return `${ENDPOINTS.wdApi}?action=wbsearchentities&search=${enc(q)}&language=${lang}&uselang=${lang}&type=item&limit=8&format=json&origin=*`;
}

export async function wikidataLookup({ names = [], bggId = null }, fetchImpl = fetch) {
  if (bggId) {
    const games = parseSparqlGames(await sparql(sparqlForBggIds([bggId]), fetchImpl));
    const g = games.find((x) => x.bggId === Number(bggId));
    return g ? { ...g, score: 1 } : null;
  }
  const qids = [];
  for (const n of names.slice(0, 2)) {
    for (const lang of ['fr', 'en']) {
      const r = await fetchImpl(wdSearchUrl(n, lang), { headers: { 'Api-User-Agent': USER_AGENT } });
      if (!r.ok) continue;
      const j = await r.json();
      for (const s of j.search || []) if (!qids.includes(s.id)) qids.push(s.id);
      if (qids.length) break;
    }
    if (qids.length >= 8) break;
  }
  if (!qids.length) return null;
  const list = qids.slice(0, 12);
  const games = parseSparqlGames(await sparql(sparqlForItems(list), fetchImpl));
  const rank = Object.fromEntries(list.map((q, i) => [q, i]));
  return pickBestGame(games, names, rank);
}

export async function enrichCollection(items, fetchImpl = fetch) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 150) {
    const games = parseSparqlGames(await sparql(sparqlForBggIds(ids.slice(i, i + 150)), fetchImpl));
    for (const g of games) {
      const it = byId.get(g.bggId);
      if (!it) continue;
      if (g.fr) it.fr = g.fr;
      if (g.en) it.en = g.en;
      if (g.aliases.length) it.aliases = g.aliases.slice(0, 8);
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Assemblage : ce qu'on affiche pour une page donnée

export function buildGame({ detected, names, wd, match }) {
  const solid = match && match.quality !== 'partial' ? match.item : null;
  const fr = (wd && wd.fr) || (solid && solid.fr) || null;
  const en = (wd && wd.en) || (solid && (solid.en || solid.name)) || null;
  const bggId = (detected && detected.bggId) || (wd && wd.bggId) || (solid && solid.id) || null;
  const isExpansion = !!(
    (wd && wd.isExpansion) ||
    (solid && solid.subtype === 'boardgameexpansion') ||
    (detected && detected.expansionHint)
  );
  const display = fr || names[0] || en || (solid && solid.name) || '';
  const query = fr || names[0] || en || '';
  const nameOptions = dedupeByKey([fr, names[0], en, solid && solid.name]).slice(0, 4);
  const game = { display, fr, en, bggId, isExpansion, query, nameOptions };
  game.links = { bgg: bggUrl(game), myludo: myludoUrl(game) };
  return game;
}

// ---------------------------------------------------------------------------
// Prix

export function parsePrice(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  let s = String(v).replace(/[\s  ]/g, '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) {
    s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lc >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '') : s.replace(/,/g, '');
  } else if (ld >= 0) {
    s = /\.\d{1,2}$/.test(s) ? s.replace(/\.(?=.*\.)/g, '') : s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatPrice(n, currency) {
  const cur = /^[A-Z]{3}$/.test(currency || '') ? currency : 'EUR';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${n} €`;
  }
}

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

// ---------------------------------------------------------------------------
// Ouverture des onglets (service worker)

export async function openSearch({ query, maxPrice = null, sites = [], groupTabs = true, openerTab = null }) {
  const urls = buildSearchUrls(query, { maxPrice, sites });
  if (!urls.length) return { opened: 0 };
  const windowId = openerTab ? openerTab.windowId : undefined;
  const baseIndex = openerTab ? openerTab.index + 1 : undefined;
  const tabIds = [];
  for (let i = 0; i < urls.length; i++) {
    const props = { url: urls[i].url, active: i === 0 };
    if (windowId !== undefined) props.windowId = windowId;
    if (baseIndex !== undefined) props.index = baseIndex + i;
    if (openerTab) props.openerTabId = openerTab.id;
    const t = await chrome.tabs.create(props);
    tabIds.push(t.id);
  }
  if (groupTabs && chrome.tabs.group && tabIds.length > 1) {
    try {
      const groupId = await chrome.tabs.group({ tabIds, createProperties: windowId !== undefined ? { windowId } : {} });
      const label = query.length > 24 ? `${query.slice(0, 23)}…` : query;
      if (chrome.tabGroups) await chrome.tabGroups.update(groupId, { title: `🎲 ${label}`, color: 'purple' });
    } catch {
      /* groupes indisponibles */
    }
  }
  return { opened: tabIds.length, tabIds };
}
