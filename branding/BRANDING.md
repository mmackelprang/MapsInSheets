# MapsInSheets — brand guide

**Proposed display name:** MapsInSheets
**Tagline:** *Your sheet, on the map.*

## Why this name

Keep it — the name is the elevator pitch (maps, in Sheets, nothing else to install), and it's
what people would search for. It also honestly scopes the tool: no keys, no hosting, no
accounts.

**Alternates considered:** *Pinsheet* (nice and short — a good name for a future standalone
version), *Sheetmap* (reads as one mumbled word).

## The mark

A map pin whose head is a 2×2 spreadsheet grid — the two halves of the product fused into one
object. White on sheet-green; deliberately adjacent to the Sheets ecosystem it lives in without
copying Google's palette outright.

## Palette

| Color | Hex | Role |
|---|---|---|
| Sheet Green | `#1E9E62` | Background / primary brand color |
| White | `#FFFFFF` | Pin, grid, text on dark |
| Pin Coral | `#FF5A5F` | Optional accent (selected pin, leader stars) |

## Voice

Spreadsheet-native: talk in columns, rows, and dropdowns, because that's the user's mental
model. "Point it at your address column" beats "configure the geocoding source".

## Files in this directory

| File | Use |
|---|---|
| `logo.svg` | Full lockup (mark + wordmark + tagline) for README headers and docs |
| `favicon.svg` | Square app mark, scales from 16px to full size |
| `favicon.ico` | Legacy multi-size favicon (16/32/48) for browsers that want `.ico` |
| `favicon-32.png` | 32px PNG favicon |
| `apple-touch-icon.png` | 180px iOS home-screen icon |
| `icon-512.png` | Large raster for app manifests, social cards, stores |

### Wiring the favicon into a web page

```html
<link rel="icon" href="/branding/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/branding/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/branding/apple-touch-icon.png">
```

### README header

```markdown
<p align="center"><img src="branding/logo.svg" alt="MapsInSheets" width="520"></p>
```

## Typography

Wordmark: **Montserrat Bold** (falls back to Segoe UI / system sans). Body text: the platform
default sans. For code-adjacent surfaces, any monospace at hand — the brand doesn't pin one.

The logo's wordmark is live SVG text, so it renders with whatever sans is installed; if you want
it pixel-identical everywhere, convert the text to outlines in any SVG editor and re-save.

## Dark and light backgrounds

The tile carries its own background, so both `logo.svg` and `favicon.svg` work unchanged on
light or dark pages. The wordmark in `logo.svg` is dark ink — on a dark page, either rely on the
tile alone (use `favicon.svg`) or restyle the two `<text>` fills to `#F0F2F5`.

---
*Generated as a proposal — names, colors, and marks are suggestions to accept, tweak, or reject.*
