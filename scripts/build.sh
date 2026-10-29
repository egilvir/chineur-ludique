#!/usr/bin/env bash
# Fabrique le paquet à envoyer au Chrome Web Store : dist/chineur-ludique-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
out="dist/chineur-ludique-${version}.zip"
rm -f "$out"
# Le jeton d'application BGG n'est jamais versionné : il est injecté ici, dans le paquet seulement.
#   BGG_TOKEN=xxxxxxxx ./scripts/build.sh
tmp=$(mktemp -d)
cp -R extension/. "$tmp/"
if [ -n "${BGG_TOKEN:-}" ]; then
  python3 - "$tmp/lib.js" "$BGG_TOKEN" <<'PY'
import sys
path, token = sys.argv[1], sys.argv[2]
s = open(path).read()
assert "export const BGG = { token: '' };" in s
open(path, "w").write(s.replace("export const BGG = { token: '' };", "export const BGG = { token: '%s' };" % token))
PY
  echo "jeton BGG injecté dans le paquet"
else
  echo "attention : BGG_TOKEN non défini, paquet sans jeton BGG" >&2
fi
(cd "$tmp" && zip -qr - . -x '*.DS_Store') > "$out"
rm -rf "$tmp"
echo "$out"
