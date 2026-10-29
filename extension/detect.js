// Chineur Ludique — détection du jeu sur la page (script classique, monde isolé).
// Définit globalThis.__clDetect(), utilisé par la pastille et par le popup.
(() => {
  globalThis.__clDetect = function () {
    const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
    const q = (sel) => document.querySelector(sel);
    const text = (sel) => {
      const el = q(sel);
      return el ? clean(el.innerText || el.textContent) : '';
    };
    const meta = (sel) => {
      const el = q(sel);
      return el ? clean(el.getAttribute('content')) : '';
    };
    const host = location.hostname.replace(/^www\./, '');
    const path = location.pathname;
    const hash = location.hash || '';

    const r = {
      host,
      site: 'other',
      isGamePage: false,
      boardGameContext: false,
      bggId: null,
      expansionHint: false,
      name: '',
      title: clean(document.title),
      priceText: '',
      currency: '',
      selection: clean(window.getSelection ? String(window.getSelection()) : '').slice(0, 200),
    };

    // Produit en JSON-LD
    let ld = null;
    const visit = (node, depth) => {
      if (!node || ld || depth > 6) return;
      if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
      if (typeof node !== 'object') return;
      const t = node['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.some((x) => typeof x === 'string' && /^(Product|ProductGroup|IndividualProduct|ProductModel)$/i.test(x))) {
        ld = node;
        return;
      }
      if (node['@graph']) visit(node['@graph'], depth + 1);
      if (node.mainEntity) visit(node.mainEntity, depth + 1);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        visit(JSON.parse(s.textContent), 0);
      } catch (e) {
        /* JSON invalide */
      }
      if (ld) break;
    }
    const ldName = ld ? clean(ld.name) : '';
    if (ld) {
      let offers = ld.offers;
      if (Array.isArray(offers)) offers = offers[0];
      if (offers) {
        const spec = offers.priceSpecification || {};
        const pv = offers.price != null ? offers.price : offers.lowPrice != null ? offers.lowPrice : spec.price;
        if (pv != null) r.priceText = String(pv);
        r.currency = offers.priceCurrency || spec.priceCurrency || '';
      }
    }

    const og = meta('meta[property="og:title"]');
    const h1 = text('h1');
    const crumbs = clean(
      [...document.querySelectorAll('nav[aria-label*="readcrumb" i], [class*="breadcrumb" i], #wayfinding-breadcrumbs_feature_div')]
        .map((e) => e.innerText || e.textContent)
        .join(' ')
    );
    const BOARD_RE = /jeux?\s+de\s+soci[ée]t[ée]|board\s?games?|jeux?\s+de\s+plateau|gesellschaftsspiel/i;

    if (/(^|\.)boardgamegeek\.com$/.test(host)) {
      r.site = 'bgg';
      const m = path.match(/^\/(boardgame|boardgameexpansion)\/(\d+)/);
      if (m) {
        r.isGamePage = true;
        r.bggId = Number(m[2]);
        r.expansionHint = m[1] === 'boardgameexpansion';
        r.name = og || clean(document.title.split(' | ')[0]);
      }
    } else if (/(^|\.)okkazeo\.com$/.test(host)) {
      r.site = 'okkazeo';
      if (/^\/jeux\/\d+/.test(path) || ld) {
        r.isGamePage = true;
        r.name = h1 || ldName || og;
      }
    } else if (/(^|\.)myludo\.fr$/.test(host)) {
      r.site = 'myludo';
      if (/^#!\/game\//.test(hash)) {
        r.isGamePage = true;
        r.name = clean(document.title.split(/\s+[–—-]\s+Myludo/i)[0]) || h1;
        if (/myludo/i.test(r.name)) r.name = h1;
      }
    } else if (/(^|\.)leboncoin\.fr$/.test(host)) {
      r.site = 'leboncoin';
      if (/^\/ad\/jeux_jouets\//.test(path)) {
        r.isGamePage = true;
        r.name = text('[data-qa-id="adview_title"]') || ldName || h1 || og;
        if (!r.priceText) r.priceText = text('[data-qa-id="adview_price"]');
      } else if (/^\/ad\//.test(path)) {
        r.name = text('[data-qa-id="adview_title"]') || ldName || h1;
        r.boardGameContext = BOARD_RE.test(r.name);
      }
    } else if (/(^|\.)vinted\.[a-z.]+$/.test(host)) {
      r.site = 'vinted';
      if (/^\/items\/\d+/.test(path)) {
        r.name = h1 || ldName || og;
        r.boardGameContext = BOARD_RE.test(`${crumbs} ${r.name} ${meta('meta[name="description"]')}`);
      }
    } else if (/(^|\.)ebay\.[a-z.]+$/.test(host)) {
      r.site = 'ebay';
      if (/^\/itm\//.test(path)) {
        r.name = text('.x-item-title__mainTitle') || h1 || ldName || og;
        r.boardGameContext = BOARD_RE.test(`${crumbs} ${r.name}`);
        if (!r.priceText) r.priceText = text('.x-price-primary');
      }
    } else if (/(^|\.)philibertnet\.com$/.test(host)) {
      r.site = 'philibert';
      if (ld || q('#product, body#product')) {
        r.isGamePage = true;
        r.name = ldName || h1 || og;
      }
    } else if (/(^|\.)amazon\.[a-z.]+$/.test(host)) {
      r.site = 'amazon';
      const t = text('#productTitle');
      if (t) {
        r.name = t;
        r.boardGameContext = BOARD_RE.test(`${crumbs} ${t}`);
        const p = q(
          '#corePrice_feature_div .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen, .a-price .a-offscreen'
        );
        if (p) r.priceText = clean(p.textContent);
      }
    } else {
      r.name = ldName || og || h1 || r.title;
      r.boardGameContext = BOARD_RE.test(`${crumbs} ${r.name} ${r.title}`);
    }

    if (!r.name) r.name = ldName || og || h1 || r.title;
    if (!r.expansionHint) r.expansionHint = /\b(?:extension|expansion)\b/i.test(r.name);
    if (!r.priceText) {
      const el = q('meta[property="product:price:amount"]') || q('[itemprop="price"]');
      if (el) r.priceText = clean(el.getAttribute('content') || el.textContent);
    }
    return r;
  };
})();
