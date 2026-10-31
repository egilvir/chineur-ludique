import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../extension/lib.js';
const T = new URL('.', import.meta.url).pathname;
const WD = JSON.parse(readFileSync(T + 'wikidata.json', 'utf8'));

let pass = 0, fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

// --- titres
const cand = [
  ['Les aventuriers du rail - Jeu complet TBE', ['Les aventuriers du rail']],
  ['CATAN - Neuf sous blister', ['CATAN']],
  ['Jeu Catan complet', ['Catan']],
  ['Asmodee - Les Aventuriers du Rail : Europe - Jeu de société - À partir de 8 ans', ['Les Aventuriers du Rail : Europe']],
  ['Days of Wonder | Les Aventuriers du Rail | Jeu de société | À partir de 8 ans | 2 à 5 joueurs | 30 à 60 minutes', ['Les Aventuriers du Rail']],
  ['Ticket to Ride | Board Game | BoardGameGeek', ['Ticket to Ride']],
  ['Catan - Jeu de société', ['Catan']],
  ['Libellud – Dixit – Jeu de Société d’ambiance – Version Française', ['Dixit']],
  ['Jeu de société Azul', ['Azul']],
  ['Catan - Extension Marins', ['Catan Marins']],
  ['Gigamic - Quarto Classic - Jeu de société', ['Quarto Classic']],
  ['Les Charlatans de Belcastel (VF) - 2-4 joueurs, dès 10 ans', ['Les Charlatans de Belcastel']],
  ['', []],
];
for (const [raw, want] of cand) t(`titleCandidates: ${raw.slice(0, 50) || '(vide)'}`, () => assert.deepEqual(L.titleCandidates(raw), want));
t('looksLikeExpansion', () => { assert.ok(L.looksLikeExpansion('Catan - Extension Marins')); assert.ok(!L.looksLikeExpansion('Catan')); });
t('key ignore accents, casse, article', () => { assert.equal(L.key('Les Aventuriers du Rail'), L.key('AVENTURIERS DU RAIL')); assert.equal(L.key('Château Combo'), 'chateau combo'); });

// --- collection
const xml = readFileSync(T + 'collection.xml', 'utf8');
const { items, total } = L.parseCollectionXml(xml);
t('parse: doublons fusionnés', () => { assert.equal(total, 8); assert.equal(items.length, 7); const ttr = items.find((i) => i.id === 9209); assert.ok(ttr.status.own && ttr.status.wanttoplay); });
t('parse: entités XML', () => assert.equal(items.find((i) => i.id === 410201).name, "Dungeons & Dragons: Adventure Begins 'Starter'"));
t('parse: priorité liste d’envies', () => assert.equal(items.find((i) => i.id === 244521).wishlistPriority, 2));
t('parse: erreur pseudo', () => assert.throws(() => L.parseCollectionXml('<errors><error><message>Invalid username specified</message></error></errors>'), (e) => e.code === 'username'));
t('parse: réponse 202', () => assert.throws(() => L.parseCollectionXml('Your request for this collection has been accepted'), (e) => e.code === 'bgg'));
t('extensions marquées', () => { L.markExpansions(items, L.parseCollectionXml(readFileSync(T + 'expansions.xml', 'utf8')).items); assert.equal(items.find((i) => i.id === 325).subtype, 'boardgameexpansion'); });

// enrichissement FR (fetch simulé)
function mockFetch() {
  const calls = [];
  const f = async (url, opts = {}) => {
    calls.push(url);
    if (url.startsWith(L.ENDPOINTS.wdApi)) {
      const u = new URL(url);
      const ids = WD.search[L.norm(u.searchParams.get('search')).replace(/\s+/g, ' ')] || WD.search[u.searchParams.get('search').toLowerCase()] || [];
      return { ok: true, status: 200, json: async () => ({ search: ids.map((id) => ({ id })) }) };
    }
    if (url === L.ENDPOINTS.wdSparql) {
      const q = decodeURIComponent(opts.body.slice(6));
      const bggIds = [...q.matchAll(/"(\d+)"/g)].map((m) => m[1]);
      const qids = [...q.matchAll(/wd:(Q\d+)/g)].map((m) => m[1]);
      const rows = WD.games.filter((g) => (q.includes('VALUES ?bgg') ? bggIds.includes(g.bgg) : qids.includes(g.q))).map((g) => ({
        item: { value: `http://www.wikidata.org/entity/${g.q}` }, bgg: { value: g.bgg }, fr: { value: g.fr }, en: { value: g.en },
        aliases: { value: g.aliases }, types: { value: g.types },
      }));
      return { ok: true, status: 200, json: async () => ({ results: { bindings: rows } }) };
    }
    throw new Error('unexpected ' + url);
  };
  f.calls = calls;
  return f;
}
t('enrichCollection ajoute les noms FR', async () => {
  await L.enrichCollection(items, mockFetch());
  assert.equal(items.find((i) => i.id === 9209).fr, 'Les Aventuriers du Rail');
  assert.equal(items.find((i) => i.id === 244521).fr, 'Les Charlatans de Belcastel');
});

// matching
t('match par id', () => assert.equal(L.matchCollection(items, { bggId: 9209 }).quality, 'id'));
t('match exact par nom FR enrichi', () => { const m = L.matchCollection(items, { names: ['Les aventuriers du rail'] }); assert.equal(m.item.id, 9209); assert.equal(m.quality, 'exact'); });
t('match exact casse/accents (CATAN)', () => assert.equal(L.matchCollection(items, { names: ['Catan'] }).item.id, 13));
t('match partiel jeu proche', () => { const m = L.matchCollection(items, { names: ['Les Aventuriers du Rail : Europe'] }); assert.equal(m.quality, 'partial'); assert.equal(m.item.id, 9209); });
t('pas de match', () => assert.equal(L.matchCollection(items, { names: ['Azul'] }), null));
t('noms courts ignorés en partiel', () => assert.equal(L.matchCollection([{ id: 1, name: 'Go', status: {} }], { names: ['Go Fish Deluxe'] }), null));
t('betterMatch', () => assert.equal(L.betterMatch({ quality: 'partial' }, { quality: 'id' }).quality, 'id'));

t('statusInfo', () => {
  assert.equal(L.statusInfo(items.find((i) => i.id === 9209)).label, 'Dans ta ludothèque');
  assert.equal(L.statusInfo(items.find((i) => i.id === 244521)).label, 'Liste d’envies · adorerais l’avoir');
  assert.equal(L.statusInfo(items.find((i) => i.id === 410201)).label, 'Tu l’as déjà eu');
});
t('summarizeCollection', () => { const s = L.summarizeCollection({ username: 'MeepleFan', syncedAt: 1, items }); assert.deepEqual([s.count, s.owned, s.wishlist], [7, 4, 2]); });

// Wikidata
t('wikidataLookup par nom FR', async () => { const g = await L.wikidataLookup({ names: ['Les Aventuriers du Rail : Europe'] }, mockFetch()); assert.equal(g.bggId, 14996); assert.equal(g.en, 'Ticket to Ride: Europe'); });
t('wikidataLookup par id BGG', async () => { const g = await L.wikidataLookup({ bggId: 244521 }, mockFetch()); assert.equal(g.fr, 'Les Charlatans de Belcastel'); });
t('wikidataLookup extension', async () => { const g = await L.wikidataLookup({ names: ['Catan Marins'] }, mockFetch()); assert.equal(g.bggId, 325); assert.ok(g.isExpansion); });
t('wikidataLookup rien de proche', async () => assert.equal(await L.wikidataLookup({ names: ['Azul'] }, mockFetch()), null));
t('pickBestGame seuil', () => assert.equal(L.pickBestGame([{ qid: 'Q1', bggId: 1, fr: 'Monopoly', en: 'Monopoly', aliases: [] }], ['Catan']), null));

// fetch collection avec 202 puis 200, et 401
t('fetchCollectionXml réessaie sur 202', async () => {
  let n = 0; const sleeps = [];
  const f = async () => (++n < 3 ? { status: 202, ok: true, text: async () => 'wait' } : { status: 200, ok: true, text: async () => xml });
  const out = await L.fetchCollectionXml('u', { fetchImpl: f, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(out, xml); assert.equal(sleeps.length, 2);
});
t('fetchCollectionXml 401 -> auth', async () => {
  await assert.rejects(L.fetchCollectionXml('u', { fetchImpl: async () => ({ status: 401, ok: false, text: async () => '' }), sleep: async () => {} }), (e) => e.code === 'auth');
});
t('collectionUrl', () => assert.equal(L.collectionUrl('MeepleFan', 'boardgameexpansion'), 'https://boardgamegeek.com/xmlapi2/collection?username=MeepleFan&brief=1&subtype=boardgameexpansion'));

// liens et recherche
t('liens BGG / MyLudo', () => {
  assert.equal(L.bggUrl({ bggId: 9209 }), 'https://boardgamegeek.com/boardgame/9209');
  assert.equal(L.bggUrl({ en: 'Azul' }), 'https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=Azul');
  assert.equal(L.myludoUrl({ fr: 'Les Aventuriers du Rail' }), 'https://www.myludo.fr/#!/search/Les%20Aventuriers%20du%20Rail');
});
t('buildSearchUrls', () => {
  const u = L.buildSearchUrls('Catan', { maxPrice: 20, sites: L.SITES.map((s) => s.id) }).map((x) => x.url);
  assert.deepEqual(u, [
    'https://www.okkazeo.com/jeux/resultats?rech_nom=Catan',
    'https://www.leboncoin.fr/recherche?category=41&text=Catan&shippable=1&price=min-20',
    'https://www.vinted.fr/catalog?search_text=Catan&catalog[]=4881&price_to=20',
    'https://www.ebay.fr/sch/i.html?_nkw=Catan&LH_ItemCondition=3000&_udhi=20',
    'https://www.philibertnet.com/fr/recherche?search_query=Catan',
    'https://www.facebook.com/marketplace/search/?query=Catan&maxPrice=20',
    'https://www.youtube.com/results?search_query=Catan%20jeu%20de%20soci%C3%A9t%C3%A9',
  ]);
});
t('buildGame : nom FR prioritaire', () => {
  const g = L.buildGame({ detected: { bggId: 9209 }, names: ['Ticket to Ride'], wd: { bggId: 9209, fr: 'Les Aventuriers du Rail', en: 'Ticket to Ride', aliases: [] }, match: null });
  assert.equal(g.display, 'Les Aventuriers du Rail'); assert.equal(g.query, 'Les Aventuriers du Rail');
  assert.deepEqual(g.nameOptions, ['Les Aventuriers du Rail', 'Ticket to Ride']);
  assert.equal(g.links.bgg, 'https://boardgamegeek.com/boardgame/9209');
});
t('jeton BGG : absent par défaut, envoyé quand défini', async () => {
  assert.deepEqual(L.bggHeaders(), {});
  L.BGG.token = 'abc-123';
  let seen = null;
  await L.fetchCollectionXml('u', { fetchImpl: async (u, opts) => { seen = opts.headers; return { status: 200, ok: true, text: async () => xml }; }, sleep: async () => {} });
  L.BGG.token = '';
  assert.deepEqual(seen, { Authorization: 'Bearer abc-123' });
});
t('logo Powered by BGG hébergé par BGG', () => assert.match(L.POWERED_BY_BGG_LOGO, /^https:\/\/cf\.geekdo-images\.com\/.+pic7779581\.png$/));
t('pas de pseudo par défaut', () => assert.equal(L.DEFAULT_USERNAME, ''));
t('timeAgo', () => { assert.equal(L.timeAgo(Date.now() - 2 * 3600e3), 'il y a 2 h'); assert.equal(L.timeAgo(Date.now() - 3 * 86400e3), 'il y a 3 j'); });

for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', e.message.split('\n').slice(0, 6).join('\n        ')); }
}
console.log(`\n${pass} ok, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
