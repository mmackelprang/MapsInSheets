# DriveMap — Design Spec

**Date:** 2026-04-16
**Status:** Approved design, ready for implementation planning

## Summary

DriveMap is a Google Apps Script bound to a Google Sheet. It reads rows of
addresses plus arbitrary metadata columns and renders them as colored pins on
an interactive map. The map is available two ways: as a modeless dialog over
the spreadsheet, and as a full-page web app opened in a new browser tab. Both
views share a single HTML implementation.

The target use case is a church membership sheet (up to ~1000 rows) where the
spreadsheet owner wants to visualize where members live, color-coded by
attributes like small group or status, with one-click phone/email/directions
from each pin's info window.

## Goals

- Zero external hosting, zero third-party accounts, zero API keys.
- Privacy inherits from the sheet's existing sharing — no new access surface.
- "Copy the sheet template, click the menu, it works" for semi-technical users.
- Sub-minute refresh on demand; geocoding happens incrementally and resumes
  after interruption.
- Configuration lives in the sheet itself (editable, versioned with the data).

## Non-goals

- Real-time push updates (polling or websockets). Refresh is manual.
- Multiple data tabs per spreadsheet in a single map view.
- Custom pin shapes/icons (color only).
- Native Google Maps look (using OpenStreetMap tiles instead).
- Arbitrary HTML templating inside info windows.

## Audience

Semi-technical: willing to paste a script into Apps Script and run it once, but
not expected to write code, set up API keys, or configure cloud services.

## Architecture

A single Apps Script project bound to the spreadsheet.

### Files

- `Code.gs` — server-side logic:
  - `onOpen()` — registers the `Map` custom menu.
  - `openDialog()` — shows the map in a modeless dialog via `HtmlService`.
  - `openNewTabUrl()` — returns the deployed web-app URL for the "Open in new
    tab" menu item.
  - `doGet()` — web-app entry point; serves the same `Map.html`.
  - `getMapData()` — called from the client; reads Settings + data, performs
    incremental geocoding, returns a JSON payload.
  - `ensureSettingsTab()`, `ensureCacheColumns()` — first-run scaffolding.
  - `geocodeBatch()` — batched geocoding with write-back every 50 rows.
- `Map.html` — single-file client: Leaflet map, filter/search/legend panel,
  info windows. Loaded both by the dialog and by the web-app `doGet`.
- `appsscript.json` — manifest declaring required scopes (Spreadsheet,
  Maps geocoder, UI, and web-app execution).
- `Map Settings` tab — in-spreadsheet config (described below).
- `SETUP.md` — setup instructions shipped with the script source.
- `template-sheet-link.md` — points at a pre-built template sheet for the
  easiest path.

### Data flow (open/refresh)

```
User clicks Map → Open in dialog
  → Code.gs openDialog() serves Map.html in a modeless dialog
  → Map.html calls google.script.run.getMapData()
  → getMapData() reads Map Settings tab
                 reads data tab as a 2D array
                 for each row:
                   if address empty                    → skip
                   else if cached lat/lng present
                        and address == GeocodedFrom    → use cache
                   else                                → geocode now,
                                                         write lat/lng +
                                                         GeocodedFrom back
                                                         (in batches of 50)
                 returns { config, rows, unmapped, legend } as JSON
  → Map.html renders Leaflet pins, legend, filters, info windows
```

Refresh button in the map UI re-invokes `getMapData()`. No polling, no
installable triggers, no push channel.

### Privacy

The bound Apps Script executes as the viewer's Google identity. Only users
with access to the spreadsheet can load the map in either form. The new-tab
web-app deployment uses `Execute as: Me, Who has access: Anyone with the link`
(or the org-restricted equivalent); because the script still reads only the
specific bound spreadsheet, access to that sheet remains the gate.

## Configuration — `Map Settings` tab

Auto-created on first run if missing. Two blocks of key/value cells.

### Block 1 — Column configuration

| Key | Example value | Notes |
|---|---|---|
| Data tab | `Members` | sheet tab to read; defaults to the first non-Settings tab |
| Address column | `D` or `Address` | column letter or header name |
| Color column | `F` or `Status` | drives pin color |
| Popup columns | `Name, Phone, Email, Small Group` | comma-separated header names; order preserved in info window |
| Filter columns | `Small Group, Status` | columns exposed as dropdown filters in the map UI |
| Latitude column | `Y` | auto-created if missing; stores cached lat |
| Longitude column | `Z` | auto-created if missing; stores cached lng |
| Geocoded From column | `AA` | auto-created; stores address string used, for cache invalidation |
| Web app URL | `https://script.google.com/…/exec` | set after deploying the web app; used by `Map → Open in new tab` |

### Block 2 — Color lookup table

| Value | Color |
|---|---|
| Active | `#2ecc71` |
| Inactive | `#95a5a6` |
| Visitor | `#f1c40f` |
| Needs visit | `#e74c3c` |

### Auto-detection on first run

If `Map Settings` doesn't exist, the script creates it, picks a data tab (first
non-Settings tab), and guesses the address column by preferring a header named
`Address`, `Street`, or `Location`; falling back to the first column whose
first few non-empty values successfully geocode on a sample. Color, Popup, and
Filter fields are left blank with a comment telling the user to fill them in.

## Data model — cache columns in the data tab

Three columns appended to the data tab if not already configured:

- `Latitude` — number, cached.
- `Longitude` — number, cached.
- `Geocoded From` — text; exact address string that produced the lat/lng.

Cache-invalidation rule per row:

```
if row.address is empty
    skip (not a pin)
else if row.lat and row.lng are present and row.address == row.geocodedFrom
    use cached lat/lng
else
    geocode now; write lat, lng, geocodedFrom back to the row
```

Users may hand-edit Latitude/Longitude to correct a bad geocode;
`Geocoded From` ensures the override is only clobbered when the address
itself changes.

## Geocoding

Uses Apps Script's built-in `Maps.newGeocoder()`. No API key, no billing.

**Scale behavior:**
- Only uncached rows (new address or changed address) are geocoded per run.
- First full-sheet run of up to 1000 rows may approach the 6-minute script
  timeout; results are written back in batches of 50 so progress persists.
- If the script times out, the user reopens the map and the remaining rows
  are picked up automatically (their lat/lng are still empty).
- A progress dialog shown during the initial bulk geocode explains what's
  happening and that it resumes.

**Failure handling:** rows whose address fails geocoding are returned in a
separate `unmapped` list, surfaced in the map's left panel as a collapsed
"Could not locate (N)" section. Each entry links back to the row in the
sheet for the user to correct. No pin is placed in a random default location.

**Quota note:** Apps Script geocoder has a ~1000 call/day ceiling for consumer
accounts. At the stated scale this is sufficient for a full initial build;
subsequent opens only re-geocode changed rows.

## Map UI

Single HTML file served identically by the dialog and the web app.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  [🔄 Refresh]   [🔍 Search…]     Showing 843 of 912     │
├──────────────┬──────────────────────────────────────────┤
│  Legend      │                                          │
│  ● Active    │                                          │
│  ● Inactive  │                  MAP                     │
│  ● Visitor   │               (Leaflet + OSM)            │
│  ● Needs…    │                                          │
│              │                                          │
│  Filters     │                                          │
│  Small Group │                                          │
│   ▾ All      │                                          │
│  Status      │                                          │
│   ▾ All      │                                          │
│              │                                          │
│  Unmapped(3) │                                          │
└──────────────┴──────────────────────────────────────────┘
```

### Top bar

- **Refresh** — re-runs the full pipeline (read, incremental-geocode, render).
- **Search** — live substring match across all `Popup columns`. Non-matching
  pins dim but remain on the map.
- **Count** — `Showing X of Y` updates as filters and search narrow the
  visible set.

### Left panel

- **Legend** — one row per distinct color-column value actually present.
  Click a swatch to hide/show that group.
- **Filter dropdowns** — one per column listed in `Filter columns`.
  Multi-select, "All" selected by default.
- **Unmapped list** — collapsed by default; expands to show addresses that
  failed to geocode, with links that select the offending row in the sheet.

### Pins

- Colored circle markers rendered with inline SVG. No raster assets.
- Pins that overlap at the same coordinates cluster; click to expand. Cluster
  inherits the dominant color of its children (ties broken by legend order).

### Info window

Triggered by clicking a pin.

```
Smith Family
123 Main St, Springfield
─────────────
Phone:  (555) 123-4567   ← tel: link
Email:  smiths@…         ← mailto: link
Small Group: Tuesday Night
Status: Active
─────────────
[ Get Directions ]       ← opens Google Maps nav in a new tab
```

- The first `Popup column` is rendered as the title (bold). The row's
  address-column value is shown directly below the title.
- Remaining popup columns render as `Label: value` lines in the configured
  order.
- **Smart link detection:** values matching a phone-number regex become
  `tel:` links; values matching an email regex become `mailto:` links;
  values matching a URL regex become `http(s):` links.
- **Get Directions button:** opens
  `https://www.google.com/maps/dir/?api=1&destination=<encoded address>`
  in a new tab.

### Dialog vs new tab

- Dialog: opened via `SpreadsheetApp.getUi().showModalDialog()` at ~90% of
  the browser window.
- New tab: opened by navigating to the deployed web-app URL stored in
  `Map Settings` (set at deploy time).

## Color system

Per-row color resolution, highest precedence first:

1. **Literal CSS color in the cell.** If the value parses as a CSS color
   (`red`, `#336699`, `rgb(…)`), use it directly.
2. **Settings lookup table.** If the value matches a Block 2 row
   (case-insensitive, whitespace-trimmed), use the mapped color.
3. **Auto-assign.** Remaining unique values get colors from a fixed
   12-hue colorblind-friendly palette, assigned stably via a hash of the
   value string so the same value always gets the same slot.

**Blank color cell:** neutral gray pin; legend label `(no value)`, shown
last if any exist.

### Legend construction

- One entry per distinct color-column value actually present in the rows
  returned by the server (i.e., before UI-level filter/search is applied).
- Order: Settings lookup entries first (in their listed order), then
  auto-assigned values alphabetically, then `(no value)` last.
- Each entry shows swatch, value text, and count: `● Active (412)`.

### Category-explosion guard

If the color column has more than 20 distinct values, the legend shows the
top 19 by count plus a single neutral-gray `● Other (N)` bucket. A note in
the legend suggests choosing a column with fewer categories.

## Setup instructions

### For the author (first-time)

1. Open the spreadsheet. `Extensions → Apps Script`.
2. Create three files in the Apps Script project: `Code.gs`, `Map.html`,
   `appsscript.json`. Paste in the source from the repo. Save.
3. Reload the spreadsheet tab once. A `Map` menu appears.
4. `Map → Open in dialog`. First run:
   - Creates the `Map Settings` tab with best-guess values.
   - Appends `Latitude`, `Longitude`, `Geocoded From` columns to the data tab.
   - Geocodes all rows; shows a progress dialog; resumes if interrupted.
5. Review `Map Settings`. Correct the column mappings if auto-detect missed.
   Add the color lookup table.
6. `Map → Open in dialog` again to see the finished map.
7. Deploy the new-tab version: `Deploy → New deployment → Web app →
   Execute as: Me → Who has access: Anyone with the link` (or the
   org-restricted option). Copy the URL. Paste it into the `Web app URL`
   key in `Map Settings`.

### For others with a similar spreadsheet

Shipped as `SETUP.md` alongside the script source:

1. Either copy the pre-built template sheet (script already bound), or in
   your own sheet: `Extensions → Apps Script`, paste the three files, save.
2. Reload the spreadsheet. Click `Map → Open in dialog`.
3. Accept the Google authorization prompt. Google shows what the script can
   do (read this spreadsheet, use the geocoder); it's the same script you
   just pasted.
4. Wait for the first-run geocoding to finish. A progress dialog shows
   counts; the process is resumable if interrupted.
5. Open `Map Settings`, confirm/fix the column mappings, add color lookup
   entries.
6. (Optional) Deploy the web-app version to enable `Open in new tab`. About
   60 seconds.

## Repository layout (for sharing)

```
drivemap/
├── Code.gs
├── Map.html
├── appsscript.json
├── SETUP.md               # instructions above
├── template-sheet-link.md # URL to pre-built template sheet
└── docs/
    └── superpowers/specs/2026-04-16-drivemap-design.md  (this file)
```

## Open questions for implementation planning

None blocking. Noted for the implementation plan:

- Exact column-letter vs header-name resolution rules when both are valid.
- Clustering radius tuning (Leaflet MarkerClusterGroup default is usually
  fine; verify at 1000-pin density).
- Progress-dialog UX — a simple percentage is probably enough; revisit if
  the initial run feels opaque.
