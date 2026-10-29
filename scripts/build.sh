#!/usr/bin/env bash
# Fabrique le paquet à envoyer au Chrome Web Store : dist/chineur-ludique-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
out="dist/chineur-ludique-${version}.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" . -x '*.DS_Store')
echo "$out"
