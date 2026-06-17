#!/usr/bin/env bash
# reagent brand asset build script
# Usage: cd assets && bash build.sh   (or: bash assets/build.sh from project root)
# Requires: rsvg-convert, ImageMagick (convert/magick), iconutil (macOS), sips

set -euo pipefail

# Resolve script directory regardless of cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND_DIR="$SCRIPT_DIR/brand"
ICONS_DIR="$SCRIPT_DIR/icons"
MARK_SVG="$BRAND_DIR/mark.svg"

# Ensure output directory exists
mkdir -p "$ICONS_DIR"

# ── Helper ────────────────────────────────────────────────────────────────────
rsvg() {
  local size="$1" src="$2" out="$3"
  rsvg-convert -w "$size" -h "$size" "$src" -o "$out"
  echo "[build] generated $out"
}

# ── Favicon / PWA icons ───────────────────────────────────────────────────────
rsvg 16  "$MARK_SVG" "$ICONS_DIR/favicon-16.png"
rsvg 32  "$MARK_SVG" "$ICONS_DIR/favicon-32.png"
rsvg 192 "$MARK_SVG" "$ICONS_DIR/icon-192.png"
rsvg 512 "$MARK_SVG" "$ICONS_DIR/icon-512.png"

# ── Maskable icon (512x512 with 10% padding on each side → inner mark ≈ 80%) ─
# Render at 410px (≈ 80% of 512), then pad to 512 with brand bg color
TMP_MASKABLE="$ICONS_DIR/_tmp_maskable_inner.png"
rsvg-convert -w 410 -h 410 "$MARK_SVG" -o "$TMP_MASKABLE"
magick -gravity center \
        -background '#14110f' \
        "$TMP_MASKABLE" \
        -extent 512x512 \
        "$ICONS_DIR/icon-maskable-512.png"
rm -f "$TMP_MASKABLE"
echo "[build] generated $ICONS_DIR/icon-maskable-512.png"

# ── Marketplace / plugin icon ─────────────────────────────────────────────────
rsvg 128 "$MARK_SVG" "$ICONS_DIR/marketplace-icon.png"

# ── Tray icons ────────────────────────────────────────────────────────────────
rsvg 16 "$MARK_SVG" "$ICONS_DIR/tray-icon.png"
rsvg 32 "$MARK_SVG" "$ICONS_DIR/tray-icon@2x.png"

# ── macOS .icns ───────────────────────────────────────────────────────────────
ICONSET_DIR="$ICONS_DIR/_tmp.iconset"
mkdir -p "$ICONSET_DIR"

rsvg-convert -w 16   -h 16   "$MARK_SVG" -o "$ICONSET_DIR/icon_16x16.png"
rsvg-convert -w 32   -h 32   "$MARK_SVG" -o "$ICONSET_DIR/icon_16x16@2x.png"
rsvg-convert -w 32   -h 32   "$MARK_SVG" -o "$ICONSET_DIR/icon_32x32.png"
rsvg-convert -w 64   -h 64   "$MARK_SVG" -o "$ICONSET_DIR/icon_32x32@2x.png"
rsvg-convert -w 128  -h 128  "$MARK_SVG" -o "$ICONSET_DIR/icon_128x128.png"
rsvg-convert -w 256  -h 256  "$MARK_SVG" -o "$ICONSET_DIR/icon_128x128@2x.png"
rsvg-convert -w 256  -h 256  "$MARK_SVG" -o "$ICONSET_DIR/icon_256x256.png"
rsvg-convert -w 512  -h 512  "$MARK_SVG" -o "$ICONSET_DIR/icon_256x256@2x.png"
rsvg-convert -w 512  -h 512  "$MARK_SVG" -o "$ICONSET_DIR/icon_512x512.png"
rsvg-convert -w 1024 -h 1024 "$MARK_SVG" -o "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$ICONS_DIR/app.icns"
rm -rf "$ICONSET_DIR"
echo "[build] generated $ICONS_DIR/app.icns"

echo "[build] done"
