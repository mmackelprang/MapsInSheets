# MapsInSheets — Quickstart & UAT

One page. Install into a test Google Sheet and walk through UAT.

## 1 · Prep your test sheet (~2 min)

1. Create a new Google Sheet.
2. Rename the first tab to `Members` (or anything — this is your data tab).
3. Put these headers in row 1: `Name`, `Address`, `Phone`, `Email`, `Status`,
   `Small Group`.
4. Add ~5 rows with real-looking data. Examples:

   | Name | Address | Phone | Email | Status | Small Group |
   |---|---|---|---|---|---|
   | Smith Family | 1600 Pennsylvania Ave NW, Washington, DC | (555) 123-4567 | smith@example.com | Active | Tuesday |
   | Jones Family | 350 5th Ave, New York, NY | (555) 234-5678 | jones@example.com | Inactive | Tuesday |
   | Lee Family | 1 Infinite Loop, Cupertino, CA | (555) 345-6789 | lee@example.com | Visitor | Wednesday |
   | Rivera Family | 500 S Buena Vista St, Burbank, CA | (555) 456-7890 | rivera@example.com | Active | Wednesday |
   | Chen Family | 221B Baker St, London (invalid) | (555) 567-8901 | chen@example.com | Needs visit | Thursday |

   The last one intentionally won't geocode — it should land in the
   **Unmapped** list.

## 2 · Install the script (~5 min)

From the test sheet: **Extensions → Apps Script**. In the Apps Script editor
create or replace each of these files, pasting the contents from this repo's
`dist/` folder. Apps Script sorts files alphabetically, which is fine — the
`lib_*.gs` files just need to be present.

| File in `dist/` | Create in Apps Script as | How |
|---|---|---|
| `Code.gs` | `Code.gs` | replace the default stub |
| `lib_cache.gs` | `lib_cache.gs` | `+ → Script` |
| `lib_colors.gs` | `lib_colors.gs` | `+ → Script` |
| `lib_columns.gs` | `lib_columns.gs` | `+ → Script` |
| `lib_legend.gs` | `lib_legend.gs` | `+ → Script` |
| `lib_smart_links.gs` | `lib_smart_links.gs` | `+ → Script` |
| `Map.html` | `Map` | `+ → HTML`, name it `Map` (no extension) |
| `appsscript.json` | `appsscript.json` | Click ⚙️ Project Settings, check "Show appsscript.json manifest file in editor", then paste contents |

Click the **Save** icon once. Reload your spreadsheet browser tab.

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
   - `Filter columns: Status, Small Group`
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

### Privacy sanity
- [ ] Open the sheet in an incognito window or as a different Google user
      that does NOT have sheet access. Confirm they can't open the map.

### Optional: web app deployment
- [ ] In Apps Script editor: **Deploy → New deployment → Web app**.
- [ ] Execute as: **Me**, Who has access: **Anyone with Google account**.
- [ ] Copy the `/exec` URL. Paste into `Web app URL` row of `Map Settings`.
- [ ] Click **Map → Open in new tab**. The map opens full-screen in a new tab.

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
