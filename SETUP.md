# MapsInSheets — Setup

MapsInSheets turns a Google Sheet of addresses into an interactive map, visible
as a dialog inside the sheet and as a full-page view in a new browser tab.

## What you need

- A Google account
- A Google Sheet with one tab containing address rows and any other columns
  you want (name, phone, status, small group, etc.)

You do **not** need a Google Cloud project or a Maps API key.

## Install into your own sheet

1. Open your spreadsheet.
2. `Extensions → Apps Script` (opens the script editor in a new tab).
3. In the script editor:
   - Replace the default `Code.gs` contents with the contents of
     `dist/Code.gs` from this repo.
   - For every file in `dist/` whose name starts with `lib_`, add a new
     script file (`+ → Script`) of the same name and paste in its contents.
   - Add a new HTML file (`+ → HTML`) named `Map` (no extension) and paste
     in the contents of `dist/Map.html`.
   - Click the project settings (gear icon), enable "Show appsscript.json
     manifest file in editor", then open `appsscript.json` and replace its
     contents with `dist/appsscript.json` from this repo.
4. Click the Save icon.
5. Return to your spreadsheet and reload the browser tab.
6. A new `Map` menu appears. Click `Map → Open in dialog`.
7. The first time, Google asks you to authorize the script. Accept.
   The script only accesses this spreadsheet and the Google Maps geocoder.
8. Wait for the first-run geocoding to finish. A status line at the top
   shows progress. If the run hits the 6-minute Apps Script time limit,
   simply click `Refresh` — it resumes where it left off.

## Configure the map

After the first open, a `Map Settings` tab is created in your spreadsheet.
Open it and fill in:

- **Data tab** — the name of your data sheet tab (defaults to the first
  non-Settings tab).
- **Address column** — the header name of your address column. Auto-detected
  if it's named `Address`, `Street`, or `Location`.
- **Color column** — the column whose value determines pin color
  (e.g., `Status`, `Small Group`).
- **Popup columns** — comma-separated header names to show in each pin's
  info window. The first one is the title.
- **Filter columns** — comma-separated header names exposed as dropdown
  filters in the map's left panel.
- **Group columns** — optional, comma-separated header names (e.g.,
  `Youth, Committee, Small Group`). Each listed column is treated as a
  group column: its cells hold comma-separated group IDs with an optional
  `*` suffix marking a row as a leader of that group
  (e.g., `A, B, C*` = member of A and B, leader of C). Each configured
  group column becomes an entry in the map's `View:` dropdown.
- **Popup labels** — optional, comma-separated `Header → DisplayLabel`
  pairs (e.g., `Phone → ☎ Mobile, Email → ✉`). Overrides the label shown
  in the info window for that column. Both `→` and `->` are accepted.

Below the key/value block, there is a `Value | Color` table. Use it to map
specific values to specific colors:

| Value | Color |
|---|---|
| Active | #2ecc71 |
| Inactive | #95a5a6 |
| Visitor | #f1c40f |

Values not listed get auto-assigned colors from a colorblind-friendly
palette. Cells that contain a literal color name (`red`) or hex (`#336699`)
win over both.

Click `Map → Open in dialog` again to see the configured map.

## Using group views

Once you've configured `Group columns`, the map's top bar gains a `View:`
dropdown with entries for `All` plus each configured column.

- In **All** mode (default): pins are colored by the `Color column` as
  usual; the sidebar shows the legend + filter dropdowns + Unmapped list.
- In a **group-column mode** (e.g., `Youth`): rows without any Youth
  entry fade to ~35% opacity; members keep their `Color column` color. The
  sidebar shows the column name and a list of sub-groups with member
  counts (leader counts in parentheses with a ★).
- **Clicking a member pin** highlights everyone in that pin's first
  sub-group with a ring in the sub-group's color; leaders get a thicker
  ring, larger size, and a ★ overlay. The info window shows the clicked
  row's usual details plus a `Column: GroupID — N members, K leaders`
  header and a compact list of the other members (leaders marked).
- **Clicking the same pin again** cycles through that pin's sub-groups.
- **Clicking a different pin** jumps the focus to that pin's first
  sub-group.
- **Clicking a blank map tile** clears the highlight.
- **Clicking a name in the member list** jumps to that row, keeping the
  same focused sub-group.

## (Optional) Enable "Open in new tab"

1. In the Apps Script editor: `Deploy → New deployment`.
2. Type: `Web app`.
3. Description: `MapsInSheets web app`.
4. Execute as: **Me**.
5. Who has access: **Anyone with Google account** (or the org-restricted
   equivalent).
6. Click `Deploy`. Copy the Web app URL that ends in `/exec`.
7. In your spreadsheet's `Map Settings` tab, paste that URL into the
   `Web app URL` row.
8. Back in the sheet, `Map → Open in new tab` now opens the map full-screen.

## Troubleshooting

- **"Address column is not configured or not found."** — open `Map Settings`
  and fill in `Address column`.
- **A row doesn't show up** — check that `Address` is populated. Rows with
  empty addresses are skipped. Rows with addresses that failed to geocode
  appear in the `Unmapped` section of the map's left panel.
- **A pin is in the wrong spot** — open the data tab and edit `Latitude`
  and `Longitude` directly. The values stick (the script only re-geocodes
  a row when the address itself changes).
- **Geocoding stopped partway through** — click `Refresh`. The script is
  resumable and picks up only the rows that still need geocoding.
- **"Geocoder quota exceeded"** — you hit Apps Script's ~1000-call/day
  limit. Wait 24 hours, or split large sheets across multiple days.

## Privacy

- The script runs as whoever opens the sheet; only people you've shared
  the sheet with can see the map.
- The `Open in new tab` web app deployment executes as *you* and can be
  restricted to your Google account, your organization, or "Anyone with
  link". Either way, the script only reads the specific spreadsheet it's
  bound to.
