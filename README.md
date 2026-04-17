# MapsInSheets

Turn a Google Sheet of addresses into an interactive, filterable map — without
API keys, external hosting, or third-party accounts.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Runtime: Google Apps Script](https://img.shields.io/badge/runtime-Apps%20Script%20V8-yellow)
![Tests: 29 passing](https://img.shields.io/badge/tests-29%20passing-brightgreen)

## What it does

Point MapsInSheets at a Google Sheet with an address column. Get an interactive
map in a dialog over the sheet — and, optionally, a full-page web app in a new
tab — that shows:

- **Colored pins** driven by any column you pick (e.g., `Status` →
  Active / Inactive / Visitor).
- **Group views.** Declare one or more columns as *group columns* whose
  cells hold comma-separated group IDs with an optional `*` suffix for
  leaders. Switch the top `View:` dropdown to a group column to mute
  non-members; click a pin to ring-highlight that pin's sub-group members
  and badge leaders with a star. Same-pin clicks cycle through multiple
  memberships.
- **Info windows** with your chosen columns. Phone numbers become tap-to-call,
  emails become `mailto:` links, URLs become clickable, plus a one-click
  **Get Directions** button. Column labels can be customized (`Phone → ☎ Mobile`)
  and empty cells are omitted automatically.
- **Legend** that doubles as a filter (click a color to hide that group).
- **Text search** and **per-column filter dropdowns** in the left panel.
- An **Unmapped** section listing rows whose addresses didn't geocode.

Everything runs as a Google Apps Script bound to your sheet. No API keys, no
billing, no hosted services.

## Why

Google My Maps almost works for this but doesn't live-update and has clunky
styling. Looker Studio's map charts don't customize pins. Full web apps want
API keys and hosting. MapsInSheets is the minimal thing: the data already
lives in a sheet; the map lives in the same sheet.

## Who it's for

Built for small-organization use cases — church membership lists, volunteer
rosters, sales territories, field-work logs — where:

- The data is under ~1,000 rows.
- You want to share with a few people who have the sheet open.
- Setup has to be "copy a script, click a menu" — not a cloud-console tour.

## Quick start

1. **Clone or download this repo.**
2. **Follow [QUICKSTART.md](QUICKSTART.md)** — a single-page install + UAT
   walkthrough. You'll paste the contents of `dist/` into your sheet's Apps
   Script editor and click `Map → Open in dialog`.

For the longer version with every option spelled out, see
[SETUP.md](SETUP.md).

## UI at a glance

```
┌─────────────────────────────────────────────────────────┐
│  🔄 Refresh   View: ▾ Youth   🔍 …      Showing 47 of 912│
├──────────────┬──────────────────────────────────────────┤
│  Youth       │                                          │
│              │                 ◉   ◯                    │
│  Focused     │              ◯           ◉★              │
│  ● A — 24 m  │              ◉ ◯   ·   · ·               │
│  (1 ★)       │                                          │
│              │       Leaflet + OpenStreetMap            │
│  Sub-groups  │     (pins ringed = sub-group A;          │
│  ● A  24     │      ★ and thicker ring = leader;        │
│  ● B  19     │      dots = non-members, muted)          │
│  ● C  12     │                                          │
│              │                                          │
│  Unmapped(3) │                                          │
└──────────────┴──────────────────────────────────────────┘
```

## Design at a glance

- **Storage:** your existing Google Sheet. Three extra columns get added
  (`Latitude`, `Longitude`, `Geocoded From`) to cache geocoder results. They
  are plain columns — you can hand-edit them to fix bad geocodes.
- **Geocoding:** Apps Script's free built-in geocoder. Per-row cached.
  Re-runs only when the address changes.
- **Config:** a `Map Settings` tab auto-created on first run with best-guess
  defaults. Pin-color mappings live in a tiny lookup table below the config.
- **Group columns:** optional extra columns whose cells contain CSV group
  IDs (with `*` leader suffix). Each configured group column becomes a
  selectable view that mutes non-members and reveals sub-groups by
  clicking member pins. Colors for sub-groups are auto-assigned from the
  same palette used elsewhere; assignment is stable across sessions.
- **Privacy:** the script inherits your sheet's sharing. Only people with
  access to the sheet can see the map.
- **Real-time model:** manual refresh (button in the map, or reopen). No
  polling, no triggers, no background processes.

## What's in this repo

```
MapsInSheets/
├── dist/                   # paste-ready .gs + .html files (build output)
├── src/                    # source (edit here; npm run build regenerates dist)
│   ├── Code.js             # Apps Script glue — menu, settings, geocoding
│   ├── Map.html            # client UI — Leaflet + OSM, legend, filters
│   ├── appsscript.json     # manifest
│   └── lib/                # pure, Node-testable helpers
│       ├── cache.js        # per-row geocode decision
│       ├── colors.js       # pin-color precedence (literal/lookup/auto)
│       ├── columns.js      # column letter/header → 1-indexed position
│       ├── legend.js       # legend construction + >20-category collapse
│       └── smart-links.js  # phone/email/URL classification
├── tests/                  # Vitest unit tests for src/lib/ (29 tests)
├── scripts/
│   └── build.js            # src/ → dist/ build script
├── docs/
│   └── superpowers/
│       ├── specs/          # design spec
│       └── plans/          # implementation plan
├── SETUP.md                # detailed setup instructions
├── QUICKSTART.md           # one-page install + UAT checklist
├── LICENSE                 # MIT
└── README.md               # this file
```

## Developing

```bash
npm install
npm test            # 29 unit tests
npm run build       # regenerate dist/
```

Test coverage is focused on the pure-logic modules in `src/lib/`. The
Apps Script glue (`Code.js`) and the client (`Map.html`) are manually
verified inside a live Google Sheet — see [QUICKSTART.md](QUICKSTART.md)
for the checklist.

## Contributing

This is a small project. Bug reports and focused pull requests are
welcome — please open an issue first for anything larger than a fix.

## License

[MIT](LICENSE).
