# reagent brand assets

This directory contains the canonical brand sources for **reagent** — a phone-drivable
Claude Code coding harness. All raster outputs are generated from the SVG sources via
`build.sh`.

## Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#14110f` | Page/app background |
| `--surface` | `#1f1b18` | Card / panel surface (also: mark tile) |
| `--surface-2` | `#1a1612` | Slightly darker surface layer |
| `--surface-3` | `#221d19` | Slightly lighter surface layer |
| `--border` | `#3a322c` | Standard border |
| `--border-soft` | `#2a2520` | Subtle border |
| `--text` | `#eeeeee` | Primary text |
| `--text-dim` | `#dddddd` | Dimmed text |
| `--text-muted` | `#888888` | Muted / secondary text |
| `--text-faint` | `#666666` | Faint / placeholder text |
| `--text-mid` | `#cccccc` | Mid-weight text |
| `--text-bbb` | `#bbbbbb` | Slightly dimmer text (pre/code) |
| `--accent` | `#cc8899` | Rose accent — primary brand color |
| `--accent-hover` | `#e8b0a0` | Accent hover state (peach-rose) |
| `--ok` | `#2f7d4f` | Success green background |
| `--ok-text` | `#6dba8e` | Success green text |
| `--err` | `#8a3b2f` | Error red background |
| `--err-text` | `#d9735c` | Error red text |
| `--gate-bg` | `#2a1f14` | Gate card background |
| `--gate-border` | `#aa9966` | Amber gate border |
| `--warm-code` | `#c8b8a2` | Warm-toned code text |

Spacing scale: `--sp-1: 4px`, `--sp-2: 8px`, `--sp-3: 12px`, `--sp-4: 16px`

Border radius: `--radius: 6px`, `--radius-lg: 8px`

The authoritative runtime source of these tokens is the `:root` block in
`bridge/src/web/index.html`. `brand/tokens.css` and `brand/tokens.json` are reference
copies for tooling; do NOT import `tokens.css` into `index.html`.

## SVG sources

| File | Description |
|---|---|
| `brand/mark.svg` | Primary 64x64 mark — lowercase "r" on warm dark rounded-square tile |
| `brand/wordmark.svg` | "reagent" set in system-ui on transparent background |
| `brand/lockup.svg` | Mark (40px) + wordmark horizontal, dark background |
| `brand/lockup-mono.svg` | Single-color variant for coloured/photo backgrounds |
| `brand/lockup-inverse.svg` | Light background variant (tile `#f5f0eb`, text `#1f1b18`) |

## Mark usage rules

- **Minimum size:** 16 px. Do not render smaller — the stem and arch become illegible.
- **Clear space:** maintain at least 1/4 of the tile width on all four sides (4 px at 16 px).
- **Which variant to use:**
  - Dark background → `lockup.svg`
  - Light background → `lockup-inverse.svg`
  - Single-color / overlay context → `lockup-mono.svg`
  - Icon-only contexts (favicons, tray, app icon) → `mark.svg`

## Generated rasters (`icons/`)

| File | Size | Purpose |
|---|---|---|
| `icons/favicon-16.png` | 16x16 | Browser tab favicon (small) |
| `icons/favicon-32.png` | 32x32 | Browser tab favicon (large) |
| `icons/icon-192.png` | 192x192 | PWA home-screen icon |
| `icons/icon-512.png` | 512x512 | PWA splash / store icon |
| `icons/icon-maskable-512.png` | 512x512 | PWA maskable icon (mark occupies ~80% with bg padding) |
| `icons/marketplace-icon.png` | 128x128 | Claude plugin marketplace icon |
| `icons/tray-icon.png` | 16x16 | Desktop tray icon (1x) |
| `icons/tray-icon@2x.png` | 32x32 | Desktop tray icon (Retina 2x) |
| `icons/app.icns` | multi | macOS app bundle icon |

## Regenerating rasters

After editing any SVG source, regenerate all rasters:

```bash
cd assets && bash build.sh
```

**Requirements:** `rsvg-convert` (librsvg), ImageMagick (`magick`), `iconutil` and `sips` (macOS).

Install on macOS: `brew install librsvg imagemagick`
