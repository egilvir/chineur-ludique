import json, os, sys, threading, unicodedata, re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

T = os.path.dirname(os.path.abspath(__file__))
WD = json.load(open(os.path.join(T, "wikidata.json")))
COLL = open(os.path.join(T, "collection.xml")).read()
EXP = open(os.path.join(T, "expansions.xml")).read()
calls = {}
log = []

def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

SEARCH = {norm(k): v for k, v in WD["search"].items()}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        log.append(("GET", u.path, u.query))
        if u.path == "/bgg/xmlapi2/collection":
            user = q.get("username", [""])[0]; sub = q.get("subtype", [""])[0]
            if user == "inconnu":
                return self.send(200, '<?xml version="1.0"?><errors><error><message>Invalid username specified</message></error></errors>', "text/xml")
            k = (user, sub); calls[k] = calls.get(k, 0) + 1
            if calls[k] == 1:
                return self.send(202, "Your request for this collection has been accepted and will be processed.", "text/xml")
            return self.send(200, EXP if sub == "boardgameexpansion" else COLL, "text/xml")
        if u.path == "/w/api.php":
            ids = SEARCH.get(norm(q.get("search", [""])[0]), [])
            return self.send(200, json.dumps({"search": [{"id": i} for i in ids]}), "application/json")
        if u.path == "/_log":
            return self.send(200, json.dumps(log), "application/json")
        self.send(404, "nope", "text/plain")
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = self.rfile.read(n).decode()
        u = urlparse(self.path); log.append(("POST", u.path, ""))
        if u.path == "/sparql":
            query = parse_qs(body).get("query", [""])[0]
            if "VALUES ?bgg" in query:
                ids = re.findall(r'"(\d+)"', query); rows = [g for g in WD["games"] if g["bgg"] in ids]
            else:
                qids = re.findall(r"wd:(Q\d+)", query); rows = [g for g in WD["games"] if g["q"] in qids]
            b = [{"item": {"value": "http://www.wikidata.org/entity/" + g["q"]}, "bgg": {"value": g["bgg"]}, "fr": {"value": g["fr"]},
                  "en": {"value": g["en"]}, "aliases": {"value": g["aliases"]}, "types": {"value": g["types"]}} for g in rows]
            return self.send(200, json.dumps({"results": {"bindings": b}}), "application/sparql-results+json")
        self.send(404, "nope", "text/plain")

def start(port):
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
