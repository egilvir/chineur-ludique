// Chineur Ludique — pastille affichée sur les pages de jeux des sites connus.
(() => {
  if (window.top !== window || globalThis.__clPillLoaded) return;
  globalThis.__clPillLoaded = true;

  const MEEPLE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4a3.3 3.3 0 0 1 3.3 3.3c0 .95-.4 1.8-1.04 2.4l5.6 1.65c1.02.3 1.64 1.27 1.43 2.3-.2.93-1.03 1.57-1.98 1.57h-2.2l2.68 6.3c.34.8-.25 1.68-1.12 1.68h-3.36L12 17.6l-2.31 4.0H6.33c-.87 0-1.46-.88-1.12-1.68l2.68-6.3h-2.2c-.95 0-1.78-.64-1.98-1.57-.21-1.03.41-2 1.43-2.3l5.6-1.65A3.3 3.3 0 0 1 8.7 5.7 3.3 3.3 0 0 1 12 2.4z"/></svg>';

  const CSS = `
  :host { all: initial; }
  .wrap { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: flex; align-items: center; gap: 8px;
    font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: #1c1a26; }
  .card { display: flex; align-items: center; gap: 10px; padding: 8px 6px 8px 12px; max-width: 480px;
    background: #fff; border: 1px solid rgba(20, 16, 40, .09); border-radius: 14px; box-shadow: 0 10px 30px rgba(20, 16, 40, .18); }
  .collapsed .card { display: none; }
  .logo { position: relative; flex: none; width: 42px; height: 42px; border: 0; border-radius: 13px; cursor: pointer;
    background: #5b47d6; display: grid; place-items: center; box-shadow: 0 8px 22px rgba(60, 40, 160, .35); }
  .logo svg { width: 25px; height: 25px; fill: #fff; }
  .logo:hover { filter: brightness(1.08); }
  .dot { position: absolute; top: -3px; right: -3px; width: 13px; height: 13px; border-radius: 50%; border: 2px solid #fff; display: none; }
  .dot.own { display: block; background: #1f9d55; }
  .dot.wishlist, .dot.want, .dot.preordered { display: block; background: #e0457b; }
  .dot.near { display: block; background: #e6a100; }
  .info { min-width: 0; }
  .name { display: flex; align-items: center; gap: 6px; font-weight: 650; font-size: 13.5px; }
  .name span.t { max-width: 210px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .exp { flex: none; font-size: 10.5px; font-weight: 650; padding: 1px 7px; border-radius: 999px; background: #efeafd; color: #5b47d6; }
  .status { font-size: 12px; color: #6d6a7d; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status.own { color: #1b7a45; font-weight: 600; }
  .status.wishlist, .status.want, .status.preordered { color: #c2185b; font-weight: 600; }
  .status.near { color: #946200; }
  .actions { display: flex; gap: 6px; flex: none; }
  .actions button { height: 30px; padding: 0 11px; border-radius: 9px; border: 1px solid #e2dfee; background: #fff; color: #1c1a26;
    font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .actions button:hover { border-color: #5b47d6; color: #5b47d6; }
  .actions button.primary { background: #5b47d6; border-color: #5b47d6; color: #fff; }
  .actions button.primary:hover { filter: brightness(1.08); color: #fff; }
  .x { flex: none; width: 24px; height: 24px; border: 0; border-radius: 7px; background: none; color: #9a96aa; font-size: 18px; line-height: 1; cursor: pointer; }
  .x:hover { background: #f1eff7; color: #1c1a26; }
  button:focus-visible { outline: 2px solid #5b47d6; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    .wrap { color: #efecf8; }
    .card { background: #1f1d2a; border-color: rgba(255, 255, 255, .08); box-shadow: 0 10px 30px rgba(0, 0, 0, .45); }
    .dot { border-color: #1f1d2a; }
    .exp { background: #2e2850; color: #b9adff; }
    .status { color: #a7a3b8; }
    .status.own { color: #5fd394; }
    .status.wishlist, .status.want, .status.preordered { color: #ff8fb5; }
    .status.near { color: #f2c35b; }
    .actions button { background: #272436; border-color: #3a3650; color: #efecf8; }
    .actions button:hover { border-color: #8d7cff; color: #b9adff; }
    .actions button.primary { background: #6d5bf0; border-color: #6d5bf0; color: #fff; }
    .x:hover { background: #2c2940; color: #fff; }
  }
  @media (max-width: 560px) { .actions button.secondary { display: none; } }
  `;

  let hostEl = null;
  let root = null;
  let collapsed = false;
  let seq = 0;
  let lastUrl = '';
  let timer = null;

  const send = (msg) => {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch {
      return Promise.resolve(null); // extension rechargée : on se tait
    }
  };

  try {
    chrome.storage.local.get('pillCollapsed').then((v) => {
      collapsed = !!(v && v.pillCollapsed);
      const w = root && root.querySelector('.wrap');
      if (w) w.classList.toggle('collapsed', collapsed);
    });
  } catch {
    /* ignore */
  }

  function remove() {
    if (hostEl) hostEl.remove();
    hostEl = null;
    root = null;
  }

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function render(res) {
    if (!hostEl || !document.documentElement.contains(hostEl)) {
      hostEl = document.createElement('div');
      hostEl.id = 'chineur-ludique-pill';
      root = hostEl.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(hostEl);
    }
    const g = res.game || {};
    const m = res.match;
    const solid = m && m.quality !== 'partial' ? m : null;
    const near = m && m.quality === 'partial' ? m : null;
    const kind = solid && solid.status ? solid.status.kind : near ? 'near' : '';

    root.textContent = '';
    const style = el('style');
    style.textContent = CSS;
    const wrap = el('div', `wrap${collapsed ? ' collapsed' : ''}`);

    const card = el('div', 'card');
    const info = el('div', 'info');
    const name = el('div', 'name');
    name.append(el('span', 't', g.display || 'Jeu'));
    if (g.isExpansion) name.append(el('span', 'exp', 'Extension'));
    info.append(name);

    let statusText = '';
    if (solid && solid.status) statusText = `${solid.status.kind === 'own' ? '✓' : '♥'} ${solid.status.label}`;
    else if (near) statusText = `Proche de « ${near.name} »${near.status ? ` · ${near.status.label.toLowerCase()}` : ''}`;
    else if (res.hasCollection) statusText = 'Pas dans ta collection BGG';
    if (statusText) {
      const status = el('div', `status ${kind}`, statusText);
      status.title = statusText;
      info.append(status);
    }

    const actions = el('div', 'actions');
    if (res.site !== 'bgg') {
      const b = el('button', 'secondary', 'BGG');
      b.title = 'Ouvrir la fiche BoardGameGeek (avis, notes)';
      b.addEventListener('click', () => send({ type: 'cl:open', url: g.links.bgg }));
      actions.append(b);
    }
    if (res.site !== 'myludo') {
      const b = el('button', 'secondary', 'MyLudo');
      b.title = 'Ouvrir le jeu sur MyLudo (avis)';
      b.addEventListener('click', () => send({ type: 'cl:open', url: g.links.myludo }));
      actions.append(b);
    }
    const s = el('button', 'primary', 'Occasion');
    s.title = `Chercher « ${g.query} » d’occasion`;
    s.addEventListener('click', () => send({ type: 'cl:search', query: g.query }));
    actions.append(s);

    const x = el('button', 'x', '×');
    x.title = 'Réduire';
    x.setAttribute('aria-label', 'Réduire');
    x.addEventListener('click', () => setCollapsed(true));

    card.append(info, actions, x);

    const logo = el('button', 'logo');
    logo.title = collapsed ? `Chineur Ludique · ${g.display || ''}` : 'Chineur Ludique';
    logo.innerHTML = MEEPLE;
    logo.append(el('span', `dot ${kind}`));
    logo.addEventListener('click', () => setCollapsed(!collapsed));

    wrap.append(card, logo);
    root.append(style, wrap);
  }

  function setCollapsed(v) {
    collapsed = v;
    const w = root && root.querySelector('.wrap');
    if (w) w.classList.toggle('collapsed', v);
    try {
      chrome.storage.local.set({ pillCollapsed: v });
    } catch {
      /* ignore */
    }
  }

  async function run() {
    const my = ++seq;
    let d;
    try {
      d = globalThis.__clDetect();
    } catch {
      return;
    }
    const maybe = d.isGamePage || d.boardGameContext || ['vinted', 'ebay', 'amazon', 'leboncoin'].includes(d.site);
    if (!maybe || (!d.name && !d.bggId)) {
      remove();
      return;
    }
    const quick = await send({ type: 'cl:resolve', detected: d, auto: true, network: false });
    if (my !== seq) return;
    if (quick && quick.show) render(quick);
    else if (!d.isGamePage && !d.boardGameContext) {
      remove();
      return;
    }
    const full = await send({ type: 'cl:resolve', detected: d, auto: true, network: true });
    if (my !== seq) return;
    if (full && full.show) render(full);
    else if (!(quick && quick.show)) remove();
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  lastUrl = location.href;
  schedule(600);
  setTimeout(() => {
    if (!hostEl) run();
  }, 3500);
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      schedule(800);
    }
  }, 700);
})();
