/* Chineur Ludique – Wishlist MyLudo en colonnes (glisser-déposer).
 *
 * Content script injecté dans le monde « MAIN » de myludo.fr : il a besoin du
 * jeton CSRF que le site garde dans `App.CSRF` (inaccessible depuis le monde
 * isolé). Il n'utilise aucune API chrome.* et ne parle qu'à myludo.fr, avec la
 * session de l'utilisateur, exactement comme le fait le site lui-même.
 *
 * Une colonne par niveau d'impatience (10 → 1). Glisser un jeu dans une autre
 * colonne enregistre sa nouvelle impatience sur MyLudo. La note personnelle du
 * jeu est relue juste avant l'écriture pour ne jamais être écrasée.
 */
(() => {
  'use strict';
  if (window.__clWishlistBoard) return;
  window.__clWishlistBoard = true;

  const ENDPOINT_LIST = 'views/wishlist/datas.php';
  const ENDPOINT_GAME = 'views/game/datas.php';
  const BTN_ID = 'cl-wl-toggle';
  const BOARD_ID = 'cl-wl-board';

  const onWishlist = () => /^#!\/wishlist(\/|$)/.test(location.hash);
  const fmt = (v) => String(v).replace('.', ',');

  /* ---------- Réseau ---------- */

  function headers(extra) {
    return Object.assign({
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
      'X-Csrf-Token': (window.App && window.App.CSRF) || '',
    }, extra || {});
  }

  async function getJson(url) {
    const r = await fetch(url, { headers: headers(), credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function loadWishlist() {
    const out = [];
    const limit = 500;
    for (let page = 1; page < 20; page++) {
      const q = new URLSearchParams({
        type: 'list', page: String(page), limit: String(limit), filter: '', lang: '',
        played: '', players: '', age: '', duration: '', order: 'desire',
      });
      const j = await getJson(ENDPOINT_LIST + '?' + q);
      const list = Array.isArray(j.list) ? j.list : [];
      out.push(...list);
      if (list.length < limit) break;
    }
    const seen = new Set();
    return out.filter((g) => !seen.has(g.id) && seen.add(g.id)).map((g) => ({
      id: String(g.id),
      title: g.title || '',
      subtitle: g.subtitle || '',
      year: g.edition || '',
      img: (g.image && (g.image.S160 || g.image.S80 || g.image.S300)) || '',
      desire: Number(g.rating && g.rating.desire) || 0,
      note: communityNote(g.rating),
    }));
  }

  /** Note communautaire (ex. « 8,6 ») d'un bloc `rating` MyLudo, ou '' si absente. */
  function communityNote(rating) {
    const n = rating && rating.game && rating.game.note;
    return typeof n === 'string' || typeof n === 'number' ? String(n) : '';
  }

  /** Complète les notes manquantes, quelques jeux à la fois (la liste ne les contient pas toujours). */
  async function fillNotes(games, onNote, alive) {
    const todo = games.filter((g) => !g.note);
    let next = 0;
    const worker = async () => {
      while (alive() && next < todo.length) {
        const g = todo[next++];
        try {
          const j = await getJson(ENDPOINT_GAME + '?' + new URLSearchParams({ type: 'game', id: g.id }));
          g.note = communityNote(j && j.rating);
        } catch (e) { /* on réessaiera à la prochaine ouverture */ }
        onNote(g);
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
  }

  /** Enregistre l'impatience d'un jeu en conservant sa note perso. */
  async function saveDesire(id, desire) {
    const cur = await getJson(ENDPOINT_GAME + '?' + new URLSearchParams({ type: 'game', id }));
    const note = cur && cur.rating && Number(cur.rating.note) ? Number(cur.rating.note) : 0;
    const body = new URLSearchParams({ rating: String(note), desire: String(desire), type: 'ratings', game: id });
    const r = await fetch(ENDPOINT_GAME, {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }),
      body,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json().catch(() => ({}));
    if (j && j.success === false) throw new Error(j.message || 'refusé');
  }

  /* ---------- Regroupement (pur, testable) ---------- */

  function buildColumns(games) {
    const keys = new Set();
    for (let i = 10; i >= 1; i--) keys.add(i);
    games.forEach((g) => keys.add(g.desire));
    return [...keys]
      .filter((k) => k > 0 || games.some((g) => g.desire === 0))
      .sort((a, b) => (a === 0) - (b === 0) || b - a);
  }
  window.__clWishlistBoard = { buildColumns, communityNote };

  /* ---------- Interface ---------- */

  const STYLE = `
  #${BTN_ID}{margin-left:8px;border:0;border-radius:18px;padding:0 14px;height:36px;cursor:pointer;
    background:#5c6bc0;color:#fff;font:500 13px/36px Roboto,Arial,sans-serif;vertical-align:top}
  #${BTN_ID}.cl-float{position:fixed;left:230px;bottom:20px;z-index:900;box-shadow:0 2px 8px #0004}
  #${BOARD_ID}{position:fixed;top:var(--cl-top,60px);left:var(--cl-left,0);right:0;bottom:0;z-index:900;background:#f4f4f6;display:flex;flex-direction:column;
    font-family:Roboto,Arial,sans-serif;color:#222}
  #${BOARD_ID} .cl-bar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;
    border-bottom:1px solid #ddd}
  #${BOARD_ID} .cl-bar h2{margin:0;font-size:18px;flex:1}
  #${BOARD_ID} .cl-bar small{color:#666}
  #${BOARD_ID} .cl-bar button{border:0;border-radius:18px;padding:8px 16px;background:#e91e63;color:#fff;
    cursor:pointer;font-weight:500}
  #${BOARD_ID} .cl-cols{flex:1;display:flex;gap:10px;padding:12px;overflow-x:auto;align-items:stretch;min-height:0}
  #${BOARD_ID} .cl-col{flex:0 0 190px;display:flex;flex-direction:column;background:#e6e7ee;border-radius:10px;min-height:0}
  #${BOARD_ID} .cl-col.over{outline:3px solid #e91e63;background:#f8dfe8}
  #${BOARD_ID} .cl-head{padding:8px 10px;font-weight:700;display:flex;justify-content:space-between;
    border-bottom:1px solid #d0d1da}
  #${BOARD_ID} .cl-head span{color:#e91e63}
  #${BOARD_ID} .cl-head i{font-style:normal;font-weight:400;color:#666}
  #${BOARD_ID} .cl-list{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;min-height:60px}
  #${BOARD_ID} .cl-card{display:flex;gap:8px;align-items:center;background:#fff;border-radius:8px;padding:6px;
    cursor:grab;box-shadow:0 1px 2px #0002;font-size:12px;line-height:1.25}
  #${BOARD_ID} .cl-card .cl-t{flex:1;min-width:0}
  #${BOARD_ID} .cl-card .cl-note{flex:none;font-weight:700;color:#0091ea;font-size:13px}
  #${BOARD_ID} .cl-card.busy{opacity:.45;pointer-events:none}
  #${BOARD_ID} .cl-card.drag{opacity:.35}
  #${BOARD_ID} .cl-card img{width:44px;height:44px;object-fit:contain;border-radius:4px;background:#f0f0f0;flex:none}
  #${BOARD_ID} .cl-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#323232;color:#fff;
    padding:10px 18px;border-radius:6px;font-size:13px;z-index:2100;pointer-events:none}
  #${BOARD_ID} .cl-toast.err{background:#c62828}`;

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) Object.assign(n, props);
    kids.forEach((k) => n.append(k));
    return n;
  }

  function toast(board, msg, err) {
    board.querySelectorAll('.cl-toast').forEach((t) => t.remove());
    const t = el('div', { className: 'cl-toast' + (err ? ' err' : ''), textContent: msg });
    board.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  let activeShut = null;
  const MODE_KEY = 'cl-wl-mode';
  const getMode = () => { try { return localStorage.getItem(MODE_KEY) || 'board'; } catch (e) { return 'board'; } };
  const setMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* stockage indisponible */ } };

  async function openBoard() {
    if (document.getElementById(BOARD_ID)) return;
    let changed = false;
    const board = el('div', { id: BOARD_ID });
    const style = el('style', { textContent: STYLE });
    const count = el('small', { textContent: 'Chargement…' });
    const close = el('button', { textContent: 'Grille MyLudo', type: 'button', title: 'Revenir à l\'affichage normal de MyLudo (Échap)' });
    const cols = el('div', { className: 'cl-cols' });
    board.append(style, el('div', { className: 'cl-bar' },
      el('h2', { textContent: 'Wishlist par impatience' }), count, close), cols);
    document.body.append(board);

    // La vue se pose sur la zone de contenu : l'en-tête et le menu de MyLudo restent visibles.
    const place = () => {
      const nav = document.querySelector('nav');
      const main = document.querySelector('main');
      board.style.setProperty('--cl-top', (nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 60) + 'px');
      board.style.setProperty('--cl-left', (main ? main.getBoundingClientRect().left + (parseFloat(getComputedStyle(main).paddingLeft) || 0) : 0) + 'px');
    };
    place();
    window.addEventListener('resize', place);

    const onKey = (e) => { if (e.key === 'Escape') shut(true); };
    // user=true : l'utilisateur revient à la grille (on s'en souvient) ; sinon on quitte juste la page.
    function shut(user) {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      board.remove();
      activeShut = null;
      if (user === true) {
        setMode('grid');
        if (changed) location.reload(); // la grille MyLudo reprend le nouveau tri
      }
    }
    activeShut = shut;
    close.addEventListener('click', () => shut(true));
    document.addEventListener('keydown', onKey);

    let games;
    try {
      games = await loadWishlist();
    } catch (e) {
      count.textContent = 'Impossible de charger la wishlist (' + e.message + ')';
      return;
    }
    count.textContent = games.length + ' jeux · glisse un jeu vers une autre colonne pour changer son impatience · note communautaire en bleu';

    const byId = new Map(games.map((g) => [g.id, g]));
    const columns = new Map();

    function makeCard(g) {
      const card = el('div', { className: 'cl-card', draggable: true, title: g.title + (g.subtitle ? ' – ' + g.subtitle : '') });
      card.dataset.id = g.id;
      if (/^https:\/\//.test(g.img)) card.append(el('img', { src: g.img, alt: '', loading: 'lazy', draggable: false }));
      card.append(el('div', { className: 'cl-t', textContent: g.title + (g.year ? ' (' + g.year + ')' : '') }));
      card.append(el('span', { className: 'cl-note', title: 'Note communautaire MyLudo', textContent: g.note }));
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', g.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('drag');
      });
      card.addEventListener('dragend', () => card.classList.remove('drag'));
      return card;
    }

    function refreshHeads() {
      columns.forEach((c, key) => {
        c.n.textContent = c.list.children.length + ' jeu' + (c.list.children.length > 1 ? 'x' : '');
      });
    }

    buildColumns(games).forEach((key) => {
      const list = el('div', { className: 'cl-list' });
      const n = el('i');
      const col = el('div', { className: 'cl-col' },
        el('div', { className: 'cl-head' }, el('span', { textContent: key ? '♥ ' + fmt(key) : 'Sans impatience' }), n), list);
      columns.set(key, { col, list, n });
      cols.append(col);

      col.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        const g = byId.get(id);
        const card = list.ownerDocument.querySelector('.cl-card[data-id="' + CSS_escape(id) + '"]');
        if (!g || !card || g.desire === key) return;
        const from = columns.get(g.desire);
        card.classList.add('busy');
        list.append(card);
        refreshHeads();
        try {
          await saveDesire(id, key);
          g.desire = key;
          changed = true;
          toast(board, g.title + ' → ♥ ' + (key ? fmt(key) : '0'));
        } catch (err) {
          from.list.append(card);
          toast(board, 'Échec de l\'enregistrement (' + err.message + ') — ' + g.title + ' reste à sa place', true);
        } finally {
          card.classList.remove('busy');
          refreshHeads();
        }
      });
    });

    games
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
      .forEach((g) => columns.get(g.desire).list.append(makeCard(g)));
    refreshHeads();

    // Notes communautaires : affichées au fur et à mesure, puis chaque colonne est classée par note décroissante.
    const noteOf = (id) => parseFloat(String(byId.get(id).note).replace(',', '.')) || 0;
    fillNotes(games, (g) => {
      const c = board.querySelector('.cl-card[data-id="' + CSS_escape(g.id) + '"] .cl-note');
      if (c) c.textContent = g.note;
    }, () => board.isConnected).then(() => {
      if (!board.isConnected) return;
      columns.forEach((c) => {
        [...c.list.children]
          .sort((a, b) => noteOf(b.dataset.id) - noteOf(a.dataset.id) || byId.get(a.dataset.id).title.localeCompare(byId.get(b.dataset.id).title, 'fr'))
          .forEach((card) => c.list.append(card));
      });
    });
  }

  const CSS_escape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'));

  /* ---------- Bouton dans la page Wishlist (SPA : on surveille le DOM) ---------- */

  function ensureButton() {
    const existing = document.getElementById(BTN_ID);
    if (!onWishlist()) {
      if (existing) existing.remove();
      if (activeShut) activeShut(false);
      return;
    }
    if (existing) return;
    const btn = el('button', { id: BTN_ID, type: 'button', textContent: '▦ Colonnes' });
    btn.addEventListener('click', () => { setMode('board'); openBoard(); });
    const scan = [...document.querySelectorAll('main a, main button')].find((n) => /scanner/i.test(n.textContent));
    if (scan && scan.parentElement) {
      scan.after(btn);
    } else {
      btn.classList.add('cl-float');
      document.body.append(btn);
    }
    if (!document.getElementById(BTN_ID + '-css')) {
      document.head.append(el('style', { id: BTN_ID + '-css', textContent: STYLE.split('#' + BOARD_ID)[0] }));
    }
    if (getMode() === 'board') openBoard();
  }

  new MutationObserver(ensureButton).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', ensureButton);
  ensureButton();
})();
