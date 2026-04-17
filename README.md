# DriveMap

Turn a Google Sheet of addresses into an interactive, filterable map —
without API keys, external hosting, or third-party accounts.

- Pins are colored by the column you pick (e.g., `Status`, `Small Group`).
- Click a pin to see a configurable info card with phone/email/URL auto-linked
  and a one-click Get Directions button.
- Legend, text search, and per-column filter dropdowns in the left panel.
- Available as a dialog inside the sheet *and* as a full-page web app.

See [SETUP.md](SETUP.md) for installation. For the design rationale, see
[the design spec](docs/superpowers/specs/2026-04-16-drivemap-design.md).

## Repo layout

- `src/` — source files (edit these).
  - `src/lib/*.js` — pure, Node-tested helpers.
  - `src/Code.js` — Apps Script glue.
  - `src/Map.html` — client UI.
  - `src/appsscript.json` — manifest.
- `dist/` — generated paste-ready Apps Script files. Regenerate with
  `npm run build`.
- `tests/` — Vitest unit tests for `src/lib/`.
- `docs/` — design spec and implementation plan.

## Developing

```bash
npm install
npm test            # run unit tests in watch mode
npm run build       # regenerate dist/
```
