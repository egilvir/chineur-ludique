import json, os, re, sys, time, tempfile, shutil
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock

T = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(T), "extension")
EXT = os.path.join(tempfile.mkdtemp(), "ext")
OUT = os.path.join(T, "out"); os.makedirs(OUT, exist_ok=True)
PORT = 8771
BASE = f"http://127.0.0.1:{PORT}"

# Copie de test : endpoints vers le serveur simulé + accès à toutes les pages
shutil.rmtree(EXT, ignore_errors=True); shutil.copytree(SRC, EXT)
lib = open(os.path.join(EXT, "lib.js")).read()
lib = lib.replace("bgg: 'https://boardgamegeek.com',", f"bgg: '{BASE}/bgg',")
lib = lib.replace("wdApi: 'https://www.wikidata.org/w/api.php',", f"wdApi: '{BASE}/w/api.php',")
lib = lib.replace("wdSparql: 'https://query.wikidata.org/sparql',", f"wdSparql: '{BASE}/sparql',")
assert lib.count(BASE) == 3
open(os.path.join(EXT, "lib.js"), "w").write(lib)
m = json.load(open(os.path.join(EXT, "manifest.json"))); m["host_permissions"].append("<all_urls>")
json.dump(m, open(os.path.join(EXT, "manifest.json"), "w"), indent=2)

srv = mock.start(PORT)
P = lambda n: open(os.path.join(T, "pages", n)).read()
ROUTES = [
    (r"^https://www\.leboncoin\.fr/ad/jeux_jouets/", P("leboncoin.html")),
    (r"^https://boardgamegeek\.com/boardgame/244521", P("bgg_quacks.html")),
    (r"^https://www\.okkazeo\.com/jeux/41387/", P("okkazeo_catan.html")),
    (r"^https://www\.amazon\.fr/dp/B0TTR", P("amazon_ttr.html")),
    (r"^https://www\.amazon\.fr/dp/B0CASQUE", P("amazon_casque.html")),
    (r"^https://www\.vinted\.fr/items/1-", P("vinted_azul.html")),
    (r"^https://www\.vinted\.fr/items/2-", P("vinted_pull.html")),
    (r"^https://www\.myludo\.fr/", P("myludo.html")),
    (r"^https://(boardgamegeek\.com|www\.okkazeo\.com|www\.leboncoin\.fr|www\.vinted\.fr|www\.ebay\.fr|www\.philibertnet\.com|www\.facebook\.com|www\.youtube\.com)/", P("stub.html")),
]
# Logo « Powered by BGG » servi localement (pas de réseau pendant les tests)
PNG_1PX = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                        "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a00000000049454e44ae426082")

def router(route):
    url = route.request.url
    if url.startswith("https://cf.geekdo-images.com/"):
        return route.fulfill(status=200, content_type="image/png", body=PNG_1PX)
    for pat, html in ROUTES:
        if re.search(pat, url):
            return route.fulfill(status=200, content_type="text/html; charset=utf-8", body=html)
    if url.startswith(BASE) or url.startswith("chrome"):
        return route.continue_()
    return route.abort()

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def wait_for(fn, timeout=12, step=0.25):
    end = time.time() + timeout; last = None
    while time.time() < end:
        try:
            last = fn()
            if last: return last
        except Exception as e:
            last = None
        time.sleep(step)
    return last

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", headless=True,
        args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width": 1100, "height": 720})
    ctx.route("**/*", router)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext = sw.url.split("/")[2]
    errors = []
    def watch(pg):
        pg.on("pageerror", lambda e: errors.append(f"{pg.url}: {e}"))
        pg.on("console", lambda m: m.type == "error" and "chrome-extension" in pg.url and errors.append(f"{pg.url}: {m.text}"))
        return pg
    for pg in ctx.pages: watch(pg)
    ctx.on("page", watch)

    def tabs():
        return sw.evaluate("chrome.tabs.query({}).then(ts => ts.map(t => ({id: t.id, url: t.pendingUrl || t.url || '', group: t.groupId, index: t.index})))")
    def close_tabs_matching(rx):
        for t in tabs():
            if re.search(rx, t["url"]): sw.evaluate("id => chrome.tabs.remove(id)", t["id"])

    print("— Installation sans pseudo (collection facultative)")
    opened = wait_for(lambda: sw.evaluate("chrome.runtime.getContexts({contextTypes: ['TAB']}).then(cs => cs.filter(c => c.documentUrl.endsWith('/options.html')).length)"), timeout=8)
    check("Page d'options ouverte à l'installation", opened == 1, opened)
    opt0 = ctx.new_page(); opt0.goto(f"chrome-extension://{ext}/options.html"); time.sleep(0.5)
    time.sleep(1.5)
    info = sw.evaluate("chrome.storage.local.get(['collection', 'syncError'])")
    check("Pas d'erreur ni de collection sans pseudo", not info.get("collection") and not info.get("syncError"), info)
    check("Champ pseudo vide par défaut", opt0 and opt0.input_value("#user") == "", opt0 and opt0.input_value("#user"))
    pz = ctx.new_page(); pz.goto("https://www.vinted.fr/items/1-azul")
    wait_for(lambda: pz.locator("#chineur-ludique-pill .name").count() > 0, timeout=10); time.sleep(1.2)
    check("Sans collection : pastille avec boutons, sans ligne de statut",
          pz.locator("#chineur-ludique-pill .actions button").all_inner_texts() == ["BGG", "MyLudo", "Occasion"] and pz.locator("#chineur-ludique-pill .status").count() == 0)
    pz.close()

    print("— Configuration du pseudo et synchro")
    opt0.fill("#user", "MeepleFan"); opt0.click("#save")
    coll = wait_for(lambda: sw.evaluate("chrome.storage.local.get('collection').then(r => r.collection)"), timeout=25)
    check("Synchro après saisie du pseudo (202 puis 200)", coll and len(coll["items"]) == 7, coll and len(coll["items"]))
    if coll:
        ttr = next(i for i in coll["items"] if i["id"] == 9209)
        check("Noms FR ajoutés via Wikidata", ttr.get("fr") == "Les Aventuriers du Rail", ttr)
        check("Extensions repérées", next(i for i in coll["items"] if i["id"] == 325)["subtype"] == "boardgameexpansion")

    def open_page(url):
        pg = ctx.new_page(); pg.goto(url); return pg
    def pill(pg, timeout=10):
        return wait_for(lambda: pg.locator("#chineur-ludique-pill .name").count() > 0 and pg.locator("#chineur-ludique-pill .status").inner_text(), timeout=timeout)
    def pill_state(pg):
        return {"name": pg.locator("#chineur-ludique-pill .name .t").inner_text(),
                "status": pg.locator("#chineur-ludique-pill .status").inner_text(),
                "buttons": pg.locator("#chineur-ludique-pill .actions button").all_inner_texts(),
                "exp": pg.locator("#chineur-ludique-pill .exp").count()}

    print("— Pastille : annonce Leboncoin")
    pg = open_page("https://www.leboncoin.fr/ad/jeux_jouets/3289635880")
    pill(pg); time.sleep(1.2)
    s = pill_state(pg)
    check("Nom FR affiché", s["name"] == "Les Aventuriers du Rail", s)
    check("Statut « Dans ta ludothèque »", s["status"] == "✓ Dans ta ludothèque", s)
    check("Boutons BGG / MyLudo / Occasion", s["buttons"] == ["BGG", "MyLudo", "Occasion"], s)
    pg.screenshot(path=os.path.join(OUT, "pill-leboncoin.png"), clip={"x": 560, "y": 600, "width": 540, "height": 120})
    pg.locator("#chineur-ludique-pill .actions button", has_text="BGG").click(); time.sleep(0.8)
    check("BGG ouvre la fiche exacte", any(t["url"].startswith("https://boardgamegeek.com/boardgame/9209") for t in tabs()), [t["url"] for t in tabs()])
    pg.locator("#chineur-ludique-pill .actions button", has_text="MyLudo").click(); time.sleep(0.8)
    check("MyLudo ouvre la recherche du nom FR", any(t["url"] == "https://www.myludo.fr/#!/search/Les%20Aventuriers%20du%20Rail" for t in tabs()), [t["url"] for t in tabs()])
    pg.locator("#chineur-ludique-pill .actions button", has_text="Occasion").click(); time.sleep(1.5)
    urls = sorted(t["url"] for t in tabs() if re.search(r"okkazeo\.com/jeux/resultats|leboncoin\.fr/recherche|vinted\.fr/catalog|ebay\.fr/sch|youtube\.com/results", t["url"]))
    check("Occasion ouvre les 5 sites par défaut", urls == sorted([
        "https://www.okkazeo.com/jeux/resultats?rech_nom=Les%20Aventuriers%20du%20Rail",
        "https://www.leboncoin.fr/recherche?category=41&toy_type=jeuxdesociete&text=Les%20Aventuriers%20du%20Rail%20NOT%20insert%20NOT%20inserts&shippable=1&transaction_status=search__no_value",
        "https://www.vinted.fr/catalog?search_text=Les%20Aventuriers%20du%20Rail&catalog[]=4881",
        "https://www.ebay.fr/sch/i.html?_nkw=Les%20Aventuriers%20du%20Rail%20-insert%20-inserts&LH_ItemCondition=3000",
        "https://www.youtube.com/results?search_query=Les%20Aventuriers%20du%20Rail%20jeu%20de%20soci%C3%A9t%C3%A9"]), urls)
    close_tabs_matching(r"okkazeo\.com/jeux/resultats|leboncoin\.fr/recherche|vinted\.fr/catalog|ebay\.fr/sch|youtube\.com/results|boardgamegeek\.com/boardgame/9209|myludo")

    # réduire / rouvrir
    pg.locator("#chineur-ludique-pill .x").click(); time.sleep(0.3)
    check("× réduit la pastille", pg.locator("#chineur-ludique-pill .wrap.collapsed").count() == 1)
    pg.reload(); pill(pg); time.sleep(0.8)
    check("Réduction mémorisée après rechargement", pg.locator("#chineur-ludique-pill .wrap.collapsed").count() == 1)
    pg.locator("#chineur-ludique-pill .logo").click(); time.sleep(0.3)
    check("Clic sur le meeple rouvre", pg.locator("#chineur-ludique-pill .wrap.collapsed").count() == 0)
    pg.emulate_media(color_scheme="dark"); time.sleep(0.3)
    pg.screenshot(path=os.path.join(OUT, "pill-leboncoin-dark.png"), clip={"x": 560, "y": 600, "width": 540, "height": 120})
    pg.emulate_media(color_scheme="light")

    print("— Pastille : BGG, Okkazeo, Amazon, Vinted, MyLudo")
    pg2 = open_page("https://boardgamegeek.com/boardgame/244521/the-quacks-of-quedlinburg"); pill(pg2); time.sleep(1.2)
    s = pill_state(pg2)
    check("BGG : nom FR « Les Charlatans de Belcastel »", s["name"] == "Les Charlatans de Belcastel", s)
    check("BGG : liste d'envies + priorité", s["status"] == "♥ Liste d’envies · adorerais l’avoir", s)
    check("BGG : pas de bouton BGG, bouton MyLudo présent", s["buttons"] == ["MyLudo", "Occasion"], s)
    pg2.close()

    pg3 = open_page("https://www.okkazeo.com/jeux/41387/catan"); pill(pg3); time.sleep(1.0)
    s = pill_state(pg3)
    check("Okkazeo : Catan possédé", s["name"] == "Catan" and s["status"] == "✓ Dans ta ludothèque", s)
    pg3.close()

    pg4 = open_page("https://www.amazon.fr/dp/B0TTR"); pill(pg4); time.sleep(1.5)
    s = pill_state(pg4)
    check("Amazon : titre nettoyé", s["name"] == "Les Aventuriers du Rail : Europe", s)
    check("Amazon : jeu proche signalé", s["status"].startswith("Proche de « Les Aventuriers du Rail »"), s)

    pg5 = open_page("https://www.amazon.fr/dp/B0CASQUE"); time.sleep(4.5)
    check("Amazon hors jeux : pas de pastille", pg5.locator("#chineur-ludique-pill").count() == 0)
    pg5.close()

    pg6 = open_page("https://www.vinted.fr/items/1-azul"); pill(pg6); time.sleep(1.2)
    s = pill_state(pg6)
    check("Vinted jeu : Azul, pas dans la collection", s["name"] == "Azul" and s["status"] == "Pas dans ta collection BGG", s)
    pg6.close()
    pg7 = open_page("https://www.vinted.fr/items/2-pull"); time.sleep(4.5)
    check("Vinted vêtement : pas de pastille", pg7.locator("#chineur-ludique-pill").count() == 0)
    pg7.close()

    pg8 = open_page("https://www.myludo.fr/"); time.sleep(1.5)
    check("MyLudo accueil : pas de pastille", pg8.locator("#chineur-ludique-pill").count() == 0)
    pg8.evaluate("() => { location.hash = '#!/game/les-charlatans-de-belcastel-1234'; document.title = 'Les Charlatans de Belcastel – Myludo'; }")
    pill(pg8); time.sleep(1.2)
    s = pill_state(pg8)
    check("MyLudo (navigation SPA) : pastille + bouton BGG seul", s["name"] == "Les Charlatans de Belcastel" and s["buttons"] == ["BGG", "Occasion"], s)
    pg8.locator("#chineur-ludique-pill .actions button", has_text="BGG").click(); time.sleep(0.8)
    check("MyLudo → BGG fiche exacte", any(t["url"].startswith("https://boardgamegeek.com/boardgame/244521") for t in tabs()))
    close_tabs_matching(r"boardgamegeek\.com/boardgame/244521"); pg8.close()

    print("— Popup")
    tid = sw.evaluate("chrome.tabs.query({url: 'https://www.amazon.fr/dp/B0TTR'}).then(t => t[0].id)")
    pop = ctx.new_page(); pop.set_viewport_size({"width": 350, "height": 640})
    pop.goto(f"chrome-extension://{ext}/popup.html?tabId={tid}")
    wait_for(lambda: pop.locator("#g-sub").inner_text().find("BGG #14996") >= 0, timeout=10)
    check("Popup : nom du jeu", pop.inner_text("#g-name") == "Les Aventuriers du Rail : Europe", pop.inner_text("#g-name"))
    check("Popup : nom EN + numéro BGG", pop.inner_text("#g-sub") == "Ticket to Ride: Europe · BGG #14996", pop.inner_text("#g-sub"))
    check("Popup : statut jeu proche", pop.inner_text("#g-status").startswith("Proche de « Les Aventuriers du Rail »"), pop.inner_text("#g-status"))
    chips = pop.locator(".name-chip").all_inner_texts()
    check("Popup : choix FR / EN", chips == ["Les Aventuriers du Rail : Europe", "Ticket to Ride: Europe"], chips)
    check("Popup : prix neuf détecté", "neuf 39,99" in pop.inner_text("#price-hint"), pop.inner_text("#price-hint"))
    credit = pop.locator(".credit a")
    check("Popup : crédit « Powered by BGG » lié à BGG", credit.count() == 1 and credit.get_attribute("href") == "https://boardgamegeek.com/"
          and "pic7779581" in (pop.locator(".credit img").get_attribute("src") or "") and pop.locator(".credit img").get_attribute("alt") == "Powered by BGG")
    check("Popup : collection en pied", "MeepleFan · 4 possédés · 2 envies" in pop.inner_text("#coll"), pop.inner_text("#coll"))
    h = pop.evaluate("document.documentElement.scrollHeight"); pop.set_viewport_size({"width": 350, "height": h})
    pop.screenshot(path=os.path.join(OUT, "popup-light.png"))
    pop.locator(".name-chip", has_text="Ticket to Ride").click()
    check("Popup : clic sur le nom EN", pop.input_value("#q") == "Ticket to Ride: Europe")
    pop.click("#btn-bgg"); time.sleep(0.8)
    check("Popup : Avis BGG ouvre la fiche", any(t["url"].startswith("https://boardgamegeek.com/boardgame/14996") for t in tabs()))
    close_tabs_matching(r"boardgamegeek\.com/boardgame/14996")
    pg4.close()

    tid = sw.evaluate("chrome.tabs.query({url: 'https://www.leboncoin.fr/ad/jeux_jouets/*'}).then(t => t[0].id)")
    pop = ctx.new_page(); pop.emulate_media(color_scheme="dark"); pop.set_viewport_size({"width": 350, "height": 640})
    pop.goto(f"chrome-extension://{ext}/popup.html?tabId={tid}")
    wait_for(lambda: pop.locator("#g-status").inner_text().startswith("✓"), timeout=10)
    check("Popup Leboncoin : prix de l'annonce, sans puces", "annonce à 25" in pop.inner_text("#price-hint") and pop.locator(".chip-sm").count() == 0, pop.inner_text("#price-hint"))
    h = pop.evaluate("document.documentElement.scrollHeight"); pop.set_viewport_size({"width": 350, "height": h})
    pop.screenshot(path=os.path.join(OUT, "popup-dark.png"))
    pop.click(".site[data-id='philibert']"); pop.fill("#max", "20"); pop.click("#go"); time.sleep(1.5)
    found = [t for t in tabs() if re.search(r"okkazeo\.com/jeux/resultats|leboncoin\.fr/recherche|vinted\.fr/catalog|ebay\.fr/sch|youtube\.com/results|philibertnet", t["url"])]
    check("Popup : 6 sites dont Philibert, prix max appliqué", len(found) == 6 and any("price=min-20" in t["url"] for t in found) and any("philibertnet.com/fr/recherche?search_query=Les%20Aventuriers%20du%20Rail" in t["url"] for t in found), [t["url"] for t in found])
    groups = {t["group"] for t in found}
    if len(groups) == 1 and -1 not in groups:
        g = sw.evaluate("id => chrome.tabGroups.get(id)", groups.pop())
        check("Groupe « 🎲 Les Aventuriers du Rail » violet", g["title"] == "🎲 Les Aventuriers du Rail" and g["color"] == "purple", g)
    else:
        check("Onglets groupés", False, groups)
    close_tabs_matching(r"okkazeo\.com/jeux/resultats|leboncoin\.fr/recherche|vinted\.fr/catalog|ebay\.fr/sch|youtube\.com/results|philibertnet")
    sw.evaluate("chrome.storage.sync.get('settings').then(r => { r.settings.sites.philibert = false; return chrome.storage.sync.set({settings: r.settings}); })")

    print("— Réglages")
    sw.evaluate("chrome.storage.sync.get('settings').then(r => { r.settings.pill = false; return chrome.storage.sync.set({settings: r.settings}); })")
    pg.reload(); time.sleep(4.5)
    check("Pastille désactivable", pg.locator("#chineur-ludique-pill").count() == 0)
    sw.evaluate("chrome.storage.sync.get('settings').then(r => { r.settings.pill = true; return chrome.storage.sync.set({settings: r.settings}); })")

    opt = ctx.new_page(); opt.set_viewport_size({"width": 760, "height": 760}); opt.goto(f"chrome-extension://{ext}/options.html")
    wait_for(lambda: opt.inner_text("#status").startswith("✓"), timeout=8)
    check("Options : crédit « Powered by BGG »", opt.locator("a.bgg-credit[href='https://boardgamegeek.com/'] img[alt='Powered by BGG']").count() == 1)
    check("Options : statut de la collection", "7 jeux de MeepleFan : 4 possédés, 2 en liste" in opt.inner_text("#status"), opt.inner_text("#status"))
    opt.screenshot(path=os.path.join(OUT, "options.png"), full_page=True)
    opt.fill("#user", "inconnu"); opt.click("#save")
    wait_for(lambda: "introuvable" in opt.inner_text("#status"), timeout=10)
    check("Options : pseudo inconnu signalé", "Pseudo BGG introuvable" in opt.inner_text("#status"), opt.inner_text("#status"))
    opt.fill("#user", "MeepleFan"); opt.click("#save")
    wait_for(lambda: opt.inner_text("#status").startswith("✓"), timeout=15)
    check("Options : resynchro OK", opt.inner_text("#status").startswith("✓ 7 jeux"), opt.inner_text("#status"))

    lg = json.loads(__import__("urllib.request").request.urlopen(f"{BASE}/_log").read())
    wd_calls = [l for l in lg if l[1] in ("/w/api.php", "/sparql")]
    check("Cache Wikidata (pas d'appels répétés)", len(wd_calls) < 40, len(wd_calls))
    check("Aucune erreur JS", not errors, errors[:5])
    ctx.close()

srv.shutdown()
ok = sum(1 for _, c in results if c)
print(f"\n{ok}/{len(results)} vérifications OK")
sys.exit(0 if ok == len(results) else 1)
