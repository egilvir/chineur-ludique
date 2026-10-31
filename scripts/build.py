#!/usr/bin/env python3
"""Fabrique le paquet à envoyer au Chrome Web Store : dist/chineur-ludique-<version>.zip

Équivalent de build.sh, sans bash ni zip (fonctionne sous Windows).
Le jeton d'application BGG n'est jamais versionné : il est injecté ici, dans le paquet seulement.
  PowerShell :  $env:BGG_TOKEN = "xxxxxxxx"; python scripts/build.py
  bash :        BGG_TOKEN=xxxxxxxx python3 scripts/build.py
"""
import json
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
PLACEHOLDER = "export const BGG = { token: '' };"

version = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))["version"]
token = os.environ.get("BGG_TOKEN", "").strip()
out = ROOT / "dist" / f"chineur-ludique-{version}.zip"
out.parent.mkdir(exist_ok=True)
out.unlink(missing_ok=True)

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(EXT.rglob("*")):
        if not f.is_file() or f.name in (".DS_Store", "Thumbs.db", "desktop.ini"):
            continue
        rel = f.relative_to(EXT).as_posix()
        if rel == "lib.js" and token:
            s = f.read_text(encoding="utf-8")
            assert PLACEHOLDER in s, "emplacement du jeton introuvable dans lib.js"
            z.writestr(rel, s.replace(PLACEHOLDER, "export const BGG = { token: '%s' };" % token))
        else:
            z.write(f, rel)

if token:
    print("jeton BGG injecté dans le paquet")
else:
    print("attention : BGG_TOKEN non défini, paquet sans jeton BGG", file=sys.stderr)
print(out.relative_to(ROOT).as_posix())
