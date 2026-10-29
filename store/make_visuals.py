"""Génère les visuels du Chrome Web Store (store/screenshots) à partir de la vraie extension,
chargée dans Chromium avec BoardGameGeek et Wikidata simulés (tests/mock.py)."""
import base64, io, json, os, re, shutil, sys, tempfile, time
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tests"))
import mock  # noqa: E402

OUT = os.path.join(ROOT, "store", "screenshots"); os.makedirs(OUT, exist_ok=True)
PORT = 8773; BASE = f"http://127.0.0.1:{PORT}"
EXT = os.path.join(tempfile.mkdtemp(), "ext"); shutil.copytree(os.path.join(ROOT, "extension"), EXT)
lib = open(os.path.join(EXT, "lib.js")).read()
for a, b in [("https://boardgamegeek.com',", f"{BASE}/bgg',"), ("https://www.wikidata.org/w/api.php',", f"{BASE}/w/api.php',"), ("https://query.wikidata.org/sparql',", f"{BASE}/sparql',")]:
    lib = lib.replace(a, b, 1)
open(os.path.join(EXT, "lib.js"), "w").write(lib)
m = json.load(open(os.path.join(EXT, "manifest.json"))); m["host_permissions"].append("<all_urls>")
json.dump(m, open(os.path.join(EXT, "manifest.json"), "w"))

PAGES = os.path.join(ROOT, "tests", "pages")
P = lambda n: open(os.path.join(PAGES, n)).read()
ROUTES = [
    (r"^https://www\.leboncoin\.fr/ad/jeux_jouets/", P("annonce.html")),
    (r"^https://boardgamegeek\.com/boardgame/244521", P("bgg_quacks.html")),
    (r"^https://www\.okkazeo\.com/jeux/99/", P("okkazeo_marins.html")),
    (r"^https://www\.amazon\.fr/dp/B0TTR", P("amazon_ttr.html")),
]
def router(route):
    url = route.request.url
    for pat, html in ROUTES:
        if re.search(pat, url):
            return route.fulfill(status=200, content_type="text/html; charset=utf-8", body=html)
    return route.continue_() if url.startswith(BASE) or url.startswith("chrome") else route.abort()

def b64(png_bytes):
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode()

def shot(pg, sel, pad=48, tries=8):
    """Capture la pastille seule, ombre comprise, sur fond transparent (attend qu'elle ne bouge plus)."""
    apply = """() => { document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        for (const c of document.body.children) c.style.visibility = 'hidden';
        const r = document.getElementById('chineur-ludique-pill').shadowRoot;
        const w = r.querySelector('.wrap'); w.style.bottom = '90px'; w.style.right = '90px';
        r.querySelector('.logo').style.display = 'none'; }"""
    applied = """() => { const r = document.getElementById('chineur-ludique-pill').shadowRoot;
        return r.querySelector('.wrap').style.bottom === '90px'; }"""
    for i in range(tries):
        pg.evaluate(apply)
        time.sleep(1.5)
        if not pg.evaluate(applied):
            continue
        b = pg.locator(sel).bounding_box()
        clip = {"x": b["x"] - pad, "y": b["y"] - pad, "width": b["width"] + 2 * pad, "height": b["height"] + 2 * pad}
        img = pg.screenshot(clip=clip, omit_background=True)
        if pg.evaluate(applied):
            return img
    raise RuntimeError("capture impossible : " + pg.url)

def wait_pill(pg, t=12):
    end = time.time() + t
    while time.time() < end:
        if pg.locator("#chineur-ludique-pill .card").count():
            time.sleep(5); return
        time.sleep(0.2)
    raise RuntimeError("pastille absente : " + pg.url)

srv = mock.start(PORT)
shots = {}
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel="chromium", headless=True, device_scale_factor=2,
        viewport={"width": 760, "height": 600}, args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"])
    ctx.route("**/*", router)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext = sw.url.split("/")[2]
    sw.evaluate("chrome.storage.sync.set({settings: {username: 'MeepleFan', sites: {okkazeo: true, leboncoin: true, vinted: true, ebay: true, philibert: false, facebook: false}, groupTabs: true, pill: true}})")
    opt = ctx.new_page(); opt.goto(f"chrome-extension://{ext}/options.html"); time.sleep(0.5); opt.click("#sync")
    for _ in range(60):
        if sw.evaluate("chrome.storage.local.get('collection').then(r => !!r.collection)"): break
        time.sleep(0.5)
    else:
        raise RuntimeError("collection non synchronisée : " + opt.inner_text("#status"))
    opt.close()

    pg = ctx.new_page(); pg.goto("https://www.leboncoin.fr/ad/jeux_jouets/1"); wait_pill(pg)
    shots["page"] = pg.screenshot()
    tid = sw.evaluate("chrome.tabs.query({url: 'https://www.leboncoin.fr/ad/*'}).then(t => t[0].id)")
    pop = ctx.new_page(); pop.set_viewport_size({"width": 350, "height": 300}); pop.goto(f"chrome-extension://{ext}/popup.html?tabId={tid}")
    for _ in range(40):
        if pop.inner_text("#g-status").startswith("✓"): break
        time.sleep(0.25)
    pop.evaluate("document.activeElement && document.activeElement.blur()"); time.sleep(0.3)
    h = pop.evaluate("document.documentElement.scrollHeight"); pop.set_viewport_size({"width": 350, "height": h})
    shots["popup"] = pop.screenshot(); pop.close()

    for key_, url in [("pill_own", "https://www.leboncoin.fr/ad/jeux_jouets/2"), ("pill_wish", "https://boardgamegeek.com/boardgame/244521/the-quacks-of-quedlinburg"),
                      ("pill_near", "https://www.amazon.fr/dp/B0TTR"), ("pill_exp", "https://www.okkazeo.com/jeux/99/catan-marins")]:
        q = ctx.new_page(); q.goto(url); wait_pill(q)
        shots[key_] = shot(q, "#chineur-ludique-pill .card"); q.close()
    pg.close()

    # ---- composition des visuels
    CSS = """
    *{box-sizing:border-box;margin:0} body{width:1280px;height:800px;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f2fb;display:flex}
    .side{width:450px;height:800px;padding:84px 56px;background:linear-gradient(160deg,#6a57e6,#3d2ca8);color:#fff;display:flex;flex-direction:column}
    .brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:20px;opacity:.95;margin-bottom:auto}
    .brand img{width:40px;height:40px;border-radius:10px}
    h1{font-size:44px;line-height:1.08;letter-spacing:-.01em;margin-bottom:22px}
    p{font-size:20px;line-height:1.45;opacity:.9;margin-bottom:auto}
    .main{flex:1;display:grid;place-items:center;padding:40px}
    .win{border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 30px 60px rgba(40,25,120,.22),0 0 0 1px rgba(40,25,120,.08)}
    .bar{height:30px;background:#eceaf3;display:flex;align-items:center;gap:7px;padding:0 12px}.bar i{width:11px;height:11px;border-radius:50%;background:#cfcbe0}
    """
    icon = b64(open(os.path.join(ROOT, "extension", "icons", "icon128.png"), "rb").read())
    def side(title, text):
        return f'<div class="side"><div class="brand"><img src="{icon}">Chineur Ludique</div><h1>{title}</h1><p>{text}</p></div>'
    pages = {
        "1-pastille.png": side("Ta ludothèque sur chaque annonce", "Déjà possédé, dans ta liste d’envies ou jeu proche&nbsp;: tu le vois tout de suite, sans chercher.")
            + f'<div class="main"><div class="win"><div class="bar"><i></i><i></i><i></i></div><img src="{b64(shots["page"])}" style="display:block;width:760px;height:600px"></div></div>',
        "2-popup.png": side("Avis et occasion en un clic", "Fiches BGG et MyLudo, recherche sur Okkazeo, Leboncoin, Vinted et eBay, nom FR ou EN, prix max.")
            + f'<div class="main"><div class="win" style="border-radius:16px"><img src="{b64(shots["popup"])}" style="display:block;width:350px"></div></div>',
        "3-statuts.png": side("Reconnaît le jeu, même mal titré", "Noms français et anglais, extensions, priorité de ta liste d’envies BoardGameGeek.")
            + '<div class="main"><div style="display:flex;flex-direction:column;gap:0;align-items:flex-end;margin-top:-20px">'
            + "".join(f'<img src="{b64(shots[k])}" style="display:block;height:{Image.open(io.BytesIO(shots[k])).height // 2}px">' for k in ["pill_own", "pill_wish", "pill_near", "pill_exp"])
            + "</div></div>",
    }
    view = ctx.browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1) if ctx.browser else None
    page = (view or ctx).new_page(); page.set_viewport_size({"width": 1280, "height": 800})
    for name, body in pages.items():
        page.set_content(f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>")
        time.sleep(0.4)
        Image.open(io.BytesIO(page.screenshot(scale="css"))).convert("RGB").save(os.path.join(OUT, name))
    page.set_viewport_size({"width": 440, "height": 280})
    page.set_content(f"""<!doctype html><html><head><meta charset='utf-8'><style>
      *{{margin:0;box-sizing:border-box}} body{{width:440px;height:280px;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      background:linear-gradient(150deg,#6a57e6,#3d2ca8);color:#fff;display:flex;align-items:center;gap:22px;padding:0 34px}}
      img{{width:104px;height:104px;border-radius:24px;box-shadow:0 14px 30px rgba(0,0,0,.25)}} h1{{font-size:30px;line-height:1.05;margin-bottom:10px}} p{{font-size:16px;opacity:.9;line-height:1.35}}
      </style></head><body><img src="{icon}"><div><h1>Chineur<br>Ludique</h1><p>Chine malin tes jeux de société d’occasion</p></div></body></html>""")
    time.sleep(0.3)
    Image.open(io.BytesIO(page.screenshot(scale="css"))).convert("RGB").save(os.path.join(OUT, "promo-440x280.png"))
    ctx.close()
srv.shutdown()
for f in sorted(os.listdir(OUT)):
    im = Image.open(os.path.join(OUT, f)); print(f, im.size, im.mode)
