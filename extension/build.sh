#!/usr/bin/env sh
# Builds the Chrome extension from the same code as the website.
# Output: dist/daszframe-extension/  (load it via chrome://extensions → Load unpacked)
set -e
cd "$(dirname "$0")/.."
OUT=dist/daszframe-extension
rm -rf "$OUT" && mkdir -p "$OUT"
cp -r docs/index.html docs/app.js docs/styles.css docs/react.min.js docs/react-dom.min.js docs/js docs/vendor "$OUT"/
cp -r extension/manifest.json extension/background.js extension/icons "$OUT"/
echo "Built $OUT"
