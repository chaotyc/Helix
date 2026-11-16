#!/bin/sh
# Builds assets/icon.icns from the brand SVG with macOS's own tools (sips, iconutil).
# Run again only when the icon changes: pnpm --filter @helix/desktop icon
set -eu
cd "$(dirname "$0")/.."
SVG=../web/public/brand/helix-app-icon.svg
SET=$(mktemp -d)/icon.iconset
mkdir -p "$SET"
for size in 16 32 128 256 512; do
  sips -s format png -z $size $size "$SVG" --out "$SET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -s format png -z $double $double "$SVG" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o assets/icon.icns
echo "Wrote assets/icon.icns"
