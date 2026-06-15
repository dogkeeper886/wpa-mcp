#!/usr/bin/env bash
# render-diagrams.sh -- Render every docs/images/*.svg to a PNG beside it.
#
# Diagrams are authored as SVG (the source of truth) and embedded in the README
# as PNG for reliable rendering on GitHub. This keeps the PNGs reproducible:
# re-run after editing an SVG and commit the result -- no hand-exporting.
#
# Requires: rsvg-convert (librsvg).  ZOOM controls raster density (2 = retina).

set -euo pipefail

IMAGES_DIR="$(cd "$(dirname "$0")/../docs/images" && pwd)"
ZOOM="${ZOOM:-2}"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found (install librsvg)" >&2
  exit 1
fi

shopt -s nullglob
svgs=("$IMAGES_DIR"/*.svg)
if [ ${#svgs[@]} -eq 0 ]; then
  echo "no SVGs in $IMAGES_DIR"
  exit 0
fi

for svg in "${svgs[@]}"; do
  png="${svg%.svg}.png"
  rsvg-convert -z "$ZOOM" -o "$png" "$svg"
  echo "rendered $(basename "$png")"
done
