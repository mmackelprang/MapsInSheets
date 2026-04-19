# MapsInSheets — Quickstart & UAT

One page. Install into a test Google Sheet and walk through UAT.

## 1 · Prep your test sheet (~2 min)

1. Create a new Google Sheet.
2. Rename the first tab to `Members` (or anything — this is your data tab).
3. Put these headers in row 1: `Name`, `Address`, `Phone`, `Email`, `Status`,
   `Small Group`, `Youth`.
4. Add ~5 rows with real-looking data. Examples:

   | Name | Address | Phone | Email | Status | Small Group | Youth |
   |---|---|---|---|---|---|---|
   | Smith Family | 1600 Pennsylvania Ave NW, Washington, DC | (555) 123-4567 | smith@example.com | Active | Tuesday | A, B* |
   | Jones Family | 350 5th Ave, New York, NY | (555) 234-5678 | jones@example.com | Inactive | Tuesday | A |
   | Lee Family | 1 Infinite Loop, Cupertino, CA | (555) 345-6789 | lee@example.com | Visitor | Wednesday | B |
   | Rivera Family | 500 S Buena Vista St, Burbank, CA | (555) 456-7890 | rivera@example.com | Active | Wednesday | A* |
   | Chen Family | 221B Baker St, London (invalid) | (555) 567-8901 | chen@example.com | Needs visit | Thursday | *(blank)* |

   The last one intentionally won't geocode — it should land in the
   **Unmapped** list.

## 2 · Install the script (~5 min)

From the test sheet: **Extensions → Apps Script**. In the Apps Script editor
create or replace each of these files, pasting the contents from this repo's
[`dist/`](https://github.com/mmackelprang/MapsInSheets/tree/main/dist) folder.

**Fastest way if you're on GitHub:** open each file link below in a new tab,
click the **Raw** button, `Ctrl+A` / `Cmd+A` to select all, copy, and paste
into Apps Script. No clone needed.

| File on GitHub | Create in Apps Script as | How |
|---|---|---|
| [`dist/Code.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/Code.gs) | `Code.gs` | replace the default stub |
| [`dist/lib_cache.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/lib_cache.gs) | `lib_cache.gs` | `+ → Script` |
| [`dist/lib_colors.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/lib_colors.gs) | `lib_colors.gs` | `+ → Script` |
| [`dist/lib_columns.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/lib_columns.gs) | `lib_columns.gs` | `+ → Script` |
| [`dist/lib_groups.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/lib_groups.gs) | `lib_groups.gs` | `+ → Script` |
| [`dist/lib_legend.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/lib_legend.gs) | `lib_legend.gs` | `+ → Script` |
| [`dist/lib_popup_labels.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/lib_popup_labels.gs) | `lib_popup_labels.gs` | `+ → Script` |
| [`dist/lib_smart_links.gs`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/lib_smart_links.gs) | `lib_smart_links.gs` | `+ → Script` |
| [`dist/Map.html`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/Map.html) | `Map` | `+ → HTML`, name it `Map` (no extension) |
| [`dist/appsscript.json`](https://github.com/mmackelprang/MapsInSheets/blob/main/dist/appsscript.json) | `appsscript.json` | Click ⚙️ Project Settings, check "Show appsscript.json manifest file in editor", then paste contents |

Click the **Save** icon once. Reload your spreadsheet browser tab.

> **Verify all 8 script files are present before the first run** (`Code.gs`
> plus 7 × `lib_*.gs`). If you miss a `lib_*.gs` file you will get errors
> like `ReferenceError: needsGeocoding is not defined` (missing `lib_cache.gs`)
> or `ReferenceError: parseGroupCell is not defined` (missing `lib_groups.gs`)
> when the map tries to load.

## 3 · First run (~2 min)

1. A new **Map** menu appears at the top of the sheet.
2. Click **Map → Open in dialog**.
3. Google will ask you to authorize. **Click through:**
   - "Authorization required" → Review permissions
   - Pick your account
   - "Google hasn't verified this app" → **Advanced** → "Go to MapsInSheets (unsafe)"
   - Allow. (The script only reads your sheet and the Google geocoder — see
     `src/appsscript.json` for exact scopes.)
4. The map dialog opens with a "Loading…" status. Geocoding runs in the
   background. It will take a few seconds for 5 rows.

## 4 · Configure (~1 min)

1. Find the new **Map Settings** tab (created automatically).
2. Confirm `Data tab` and `Address column` are filled in.
3. Fill in:
   - `Color column: Status`
   - `Popup columns: Name, Phone, Email, Status, Small Group`
   - `Popup labels: Phone → ☎ Mobile, Email → ✉`
   - `Filter columns: Status, Small Group`
   - `Group columns: Youth`
4. Scroll down to the **Value | Color** table and add rows:
   ```
   Active       #2ecc71
   Inactive     #95a5a6
   Visitor      #f1c40f
   Needs visit  #e74c3c
   ```
5. Click **Map → Open in dialog** again.

## 5 · UAT checklist

Tick each as you verify. If something fails, note expected vs actual.

### Core rendering
- [ ] Map appears and pins are at the right geographic locations.
- [ ] Pins are colored by `Status` (green/gray/yellow/red).
- [ ] Legend on the left lists the Status values with counts.
- [ ] "Showing 4 of 5" (or similar) appears in the top-right status.
- [ ] The Chen Family row appears in an **Unmapped** section in the left panel.

### Info window
- [ ] Click a pin → info window opens.
- [ ] Title line is the family name (first `Popup column`).
- [ ] Address line shows below the title.
- [ ] Phone is a clickable `tel:` link (tap/click attempts to dial).
- [ ] Email is a clickable `mailto:` link.
- [ ] **Get Directions** button opens Google Maps directions in a new tab
      with the address pre-filled as destination.

### Filters
- [ ] Click the green Active swatch in the legend — Active pins disappear.
      Click again — they reappear.
- [ ] Type "Smith" in the Search box — only the Smith Family pin is visible.
      Clear the search — all reappear.
- [ ] In the Status filter dropdown, pick only `Active`. Only Active pins
      remain. Unselect — everyone's back.
- [ ] Combine: filter to `Visitor` AND search for "Lee" — single pin.

### Caching
- [ ] Open the data tab. The `Latitude`, `Longitude`, `Geocoded From`
      columns are filled for the 4 geocoded rows. Chen Family row has
      them blank.
- [ ] Edit the Chen Family address to a real one (e.g., `100 Main St, Boston, MA`).
      Go back to the map, click **🔄 Refresh**. The pin now appears.
- [ ] Change an existing address (e.g., Smith Family) to a different real
      one. Click Refresh. Only that row's `Geocoded From` changes — others
      keep their cached lat/lng.

### Group views

- [ ] The top bar shows a `View:` dropdown with `All` and `Youth`.
- [ ] In `All` (default), pins are colored by `Status` and the sidebar
      shows the legend + filter dropdowns.
- [ ] Switch to `Youth`. The Chen Family pin (no Youth entry) dims to
      ~15% opacity and neutral gray. All other pins recolor to their
      first Youth sub-group in cell order. The sidebar shows `Youth`
      and a list of sub-groups (A, B) with member counts.
- [ ] Click the Smith Family pin (`Youth: A, B*`). Smith gets a thin
      dark hero outline. All other Youth A members take on Youth A's
      color; non-members of Youth A dim to neutral gray. Smith is NOT
      a leader of A (first entry has no `*`).
- [ ] Click Smith again. Focus cycles to Youth B. Smith now shows a
      `★` and is larger (leader of B). The whole-map palette shifts —
      Youth B members take on Youth B's color; Rivera (Youth A*) dims
      because they are not in B.
- [ ] Click Smith a third time. Cycle returns to Youth A.
- [ ] Click the Rivera Family pin. Focus resets to Rivera's first group
      (Youth A). Rivera shows the leader treatment (`★` and larger).
- [ ] Click a blank patch of ocean on the map. Highlight clears; hero
      outline and star overlay disappear; focus leaves.
- [ ] Click Smith's popup member-list link for Jones Family. Map
      refocuses on Jones, same Youth A sub-group (since Jones has A),
      popup stays open showing the same member list.
- [ ] Info-window label for Phone reads `☎ Mobile` (from Popup labels).
- [ ] If a row has no Email cell value, the Email row is omitted from
      the popup entirely (no `Email: ` empty line).

### Group-view refinements (2026-04-19)

- [ ] Switch to `Youth`. Pins that have at least one Youth entry recolor to
      their **first** sub-group's color (in cell order — e.g. `B, A` →
      colored by B). Pins with no Youth entry go dim gray (~15% opacity).
- [ ] Click the Smith Family pin (`Youth: A, B*`). Smith gets a thin dark
      outline (the "hero" marker). Every other pin that's a member of
      Youth A also shows Youth A's color. Pins not in Youth A dim gray.
- [ ] Click Smith again. The whole-map palette shifts to Youth B. Smith
      now shows `★` and is larger (leader of B).
- [ ] No pins show a colored ring anywhere — the old ring treatment is
      gone. Color alone + star + size + hero outline carry the state.
- [ ] Open a popup for a large sub-group (add ≥8 rows with the same sub-group
      for testing if needed). The member list is scrollable within the
      popup; ~6 rows are visible at a time; no "…and N more" line appears.
- [ ] Leaders appear at the top of the member list (with `★`) in source
      order; non-leaders follow in source order.
- [ ] In All mode, pan/zoom the map far away from the pins. Click `🎯 Fit`.
      The map refits around all visible pins.
- [ ] In All mode, hide one legend color. Click Fit. The map fits only to
      still-visible pins (hidden color is excluded).
- [ ] In group mode, click a pin in a small sub-group, then click Fit. The
      map tightens around that sub-group's members.
- [ ] In group mode without focus, click Fit. The map fits pins with ≥1
      membership only (dim-gray non-members are excluded).
- [ ] Focus on a sub-group whose only member pin is one row. Click Fit.
      The map centers on the pin at a reasonable zoom (not zoomed to street level).

### Privacy sanity
- [ ] Open the sheet in an incognito window or as a different Google user
      that does NOT have sheet access. Confirm they can't open the map.

### Optional: web app deployment
- [ ] In Apps Script editor: **Deploy → New deployment → Web app**.
- [ ] Execute as: **Me**, Who has access: **Anyone with Google account**.
- [ ] Copy the `/exec` URL. Paste into `Web app URL` row of `Map Settings`.
- [ ] Click **Map → Open in new tab**. The map opens full-screen in a new tab.

### Mobile usage

- [ ] After deploying the web app and pasting the `/exec` URL in
      `Map Settings → Web app URL`, open the same URL on a phone.
      Map loads; pins are placed correctly.
- [ ] **iOS:** Share → "Add to Home Screen." **Android:** 3-dot menu →
      "Install app" or "Add to Home screen." The new icon launches a
      standalone map view (no browser chrome).
- [ ] Tap a pin on the phone. Popup renders. `Get Directions` opens the
      phone's default maps app with the destination prefilled.

## 6 · If anything failed

Open an issue (or just message me) with:
- Which checklist item.
- What you expected.
- What actually happened.
- Any errors from Apps Script's execution log (**View → Executions** in the
  script editor).

## Troubleshooting quick reference

| Symptom | Fix |
|---|---|
| No Map menu after install | Reload the spreadsheet browser tab. |
| "Address column not configured" | Fill in `Address column` on `Map Settings`. |
| Pin in wrong spot | Edit `Latitude`/`Longitude` in the data tab directly. |
| "Geocoder quota exceeded" | Hit ~1000 calls/day. Wait 24h. |
| Map stuck on "Loading…" | Open script editor → **Executions** → see the error. |
| Info window empty | `Popup columns` on Settings is blank — fill it in. |
| `View:` dropdown only shows `All` | `Group columns` is blank or its names don't match data-tab headers exactly. Check the left panel for a "Warnings" section listing missing columns. |
| Pin doesn't recolor / no hero outline on click | You clicked a pin that has no entry in the active group column. It's not a bug — non-members don't cycle. |
