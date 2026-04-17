# Multi-Group Views — Design Spec

**Date:** 2026-04-17
**Status:** Approved design, ready for implementation planning
**Builds on:** [2026-04-16-drivemap-design.md](./2026-04-16-drivemap-design.md)

## Summary

Extend MapsInSheets with multi-group views. A sheet can now declare one or
more *group columns* whose cells contain comma-separated group IDs, with an
optional `*` suffix to mark a row as a leader of that group. The map gains a
group-column selector: in All mode it behaves as today (colored by
`Color column`); in a group-column mode, non-members are muted and clicking
a pin highlights the clicked row's sub-group members with a distinct leader
treatment. Same-pin clicks cycle circularly through that pin's groups.

This release also:

- Removes Leaflet marker clustering (pins are always individual).
- Adds custom popup labels and conditional hiding of empty rows in popups.
- Fixes the "Open in new tab" menu entry (replaces the popup-blocked
  `window.open` trick with an anchor-based click-through).
- Adds a `© 2026 Mark Mackelprang` line to the map's attribution control.

## Goals

- Let a user overlay arbitrary group memberships (Youth groups, committees,
  small groups) on the existing map without abandoning the at-a-glance
  `Status` coloring of All mode.
- Make the spatial distribution of any one sub-group immediately obvious via
  muting + ring highlight + leader emphasis.
- Keep the interaction fast and click-driven — no round-trips, no mode
  toggles buried in menus.
- Preserve full backward compatibility for sheets that don't configure any
  group columns.

## Non-goals

- Per-group color configuration (auto-assigned only).
- Group-based filtering separate from highlighting (no "hide all non-A"
  mode).
- Editing group memberships from the map UI.
- Group columns with nested/hierarchical IDs beyond the two-level
  column → sub-group structure.
- HTML-templated popups (keeping popup config simple).

## Audience

Unchanged — semi-technical Google Sheets owner with an Apps Script editor.

## Data model

### Group-cell format

A cell in a group column is a comma-separated list of tokens. Each token is
an arbitrary short string (letter, word, number) optionally followed by `*`
to mark the row as a leader of that group.

- `"A"` — member of sub-group `A`.
- `"A, B, C*"` — member of `A`, `B`; leader of `C`.
- `"Tuesday"` — member of sub-group `Tuesday`.
- `""` or blank cell — row is not in any sub-group of this column.
- `"*"` alone — data bug; token ignored.
- `"*A"` — `*` must be a suffix; this is treated as a sub-group literally
  named `*A`. (The `*`-as-suffix rule is documented; users can hand-correct.)

### `parseGroupCell(value)` contract

Pure function in `src/lib/groups.js`.

Input: any value (typically a string from `SpreadsheetApp`).
Output: an array `[{ id: string, isLeader: boolean }, …]`.

Rules:

1. `null`, `undefined`, and strings that are entirely whitespace return `[]`.
2. Non-string inputs are stringified first.
3. Split on `,`.
4. Each token is trimmed of whitespace.
5. Empty tokens after trimming are skipped.
6. A token consisting only of `*` is skipped.
7. If a token ends with `*`, strip the `*` and set `isLeader: true`. Strip
   any trailing whitespace between the ID body and the `*` so `"C *"` also
   parses as leader of `C`.
8. Duplicate IDs within a single cell: keep the first occurrence; if any
   occurrence was a leader, the resulting entry is a leader.
9. The surviving ID is preserved with its original casing for display.
   Case-insensitive comparisons happen downstream using a normalized
   lowercase key.

### `buildGroupIndex(rows, groupColumns)` contract

Given the array of rows (each with a `groupMembership` field already
computed per group column) and the ordered list of configured group column
names, returns:

```
{
  '<ColumnName>': {
    groups: {
      '<lowercase id>': {
        displayId: '<original-case id>',
        members: [{ rowNumber, popupTitle }, …],   // all rows in this sub-group
        leaders: [{ rowNumber, popupTitle }, …],   // subset flagged as leaders
      },
      …
    },
    palette: {
      '<lowercase id>': '<#rrggbb>',               // stable hash-based auto-assignment
    },
  },
  …
}
```

- Sub-group order within a column is alphabetical by `displayId`.
- `palette` uses the same `hashString` + `DEFAULT_PALETTE` mechanism that
  already exists in `colors.js`. Stable across sessions.
- `popupTitle` is the row's value in the first `Popup columns` entry (the
  popup title), so the member list can render names without re-reading
  the full rows.

## Settings tab additions

Two new rows in Block 1. Auto-created blank on first run; existing users
can add them manually to opt in.

| Key | Example value | Meaning |
|---|---|---|
| `Popup labels` | `Phone → ☎ Mobile, Email → ✉` | Optional. Comma-separated `Header → DisplayLabel` pairs. Any column not listed falls back to its header. Both `→` (arrow) and `->` (ASCII) accepted. |
| `Group columns` | `Youth, Committee, Small Group` | Optional. Comma-separated column headers treated as group columns. |

Validation is lenient:

- `Popup labels` entries with no `→`/`->` are skipped.
- `Group columns` entries that don't match any data-tab header are dropped
  with a visible warning in the map's left panel: `"Configured group
  column 'Foo' is not in the data tab."`.

Block 2 (color lookup table) is unchanged. The existing `Color column`
row remains — it still drives All-mode pin coloring.

## Server changes

### New module: `src/lib/groups.js`

Exports `parseGroupCell(value)` and `buildGroupIndex(rows, groupColumns)`
per the contracts above. Uses the existing `hashString` and
`DEFAULT_PALETTE` from `colors.js` via the dual-environment pattern
(require in Node; build step strips the `require` for Apps Script, where
those identifiers are already in script scope).

### `Code.gs` changes

- `SETTINGS_KEYS` — append `{ key: 'Popup labels', help: '…' }` and
  `{ key: 'Group columns', help: '…' }`.
- `readSettings_` — read those two keys into `kv`. No structural changes.
- `readRows_` — for every row, include a raw `groupCells` map keyed by
  group-column name. Example: `{ 'Youth': 'A, B, C*' }`. No parsing yet.
- `getMapData`:
  - Parse each row's `groupCells` into `groupMembership` using
    `parseGroupCell`. The row object's new shape:
    ```
    { …existing…, groupMembership: { 'Youth': [{ id, isLeader }, …], … } }
    ```
  - Call `buildGroupIndex(mapped, groupColumnsList)` once to compute the
    index + palette.
  - Parse `Popup labels` into `{ [header]: displayLabel }`.
- Payload additions:
  ```
  {
    …existing…,
    groupColumns: ['Youth', 'Committee', 'Small Group'],
    groupIndex: { as above },
    popupLabels: { Phone: '☎ Mobile', Email: '✉' },
    warnings: ['…'],                  // missing group columns, etc.
    pins: [
      { …existing…, groupMembership: { … } },
      …
    ],
  }
  ```
- Warnings list added to surface lenient-parse issues in the UI.

### No changes to

Geocoding, cache, `Map Settings` auto-detection, column resolution,
manifest, web-app deployment flow.

## Client state model

Refactor Map.html to a single state-driven render pipeline. All user
interactions mutate `state`, then call `render()`. Nothing else touches
Leaflet markers or DOM.

```js
state = {
  data: <payload>,               // set once per load/refresh
  mode: 'all' | 'group',         // driven by group-column dropdown
  activeColumn: null | '<name>', // null in all-mode; name in group-mode
  focusedPin: null | <pinRef>,   // null unless a pin was clicked in group-mode
  cycleIndex: 0,                 // index into focusedPin.groupMembership[activeColumn]
  searchTerm: '',
  hiddenLegendValues: new Set(), // all-mode legend toggles
  columnFilters: {},             // all-mode dropdown filters: { col: Set<value> }
};
```

### `computePinVisual(pin, state)` — single source of truth for pin appearance

Pure function. Returns `{ color, opacity, ringColor, ringWidth, scale, star }`.

| Mode | focusedPin | Pin matches focused sub-group? | Pin has activeColumn data? | Result |
|---|---|---|---|---|
| `all` | n/a | n/a | n/a | Color-column color, opacity 1, no ring, scale 1, no star |
| `group` | null | n/a | yes | Color-column color, opacity 1, no ring |
| `group` | null | n/a | no | Color-column color, **opacity 0.35** |
| `group` | set | yes, non-leader | yes | Color-column color, opacity 1, **ring = sub-group palette color** (width 2px) |
| `group` | set | yes, leader | yes | Color-column color, opacity 1, **thick ring** (width 4px), **scale 1.5**, **star overlay** |
| `group` | set | no | yes | Color-column color, **opacity 0.35** |
| `group` | set | no | no | Color-column color, **opacity 0.2** |

"Matches focused sub-group" = the pin's `groupMembership[activeColumn]` includes
an entry with `id` equal (case-insensitive) to the focused sub-group ID at
`focusedPin.groupMembership[activeColumn][cycleIndex].id`. "Leader" status is
determined by that pin's own `isLeader` flag for that sub-group (not the
focused pin's).

### `makePinIcon(visual)`

Replaces the current `makePinIcon(color)`. Returns a Leaflet `divIcon` whose
HTML renders:

- A colored SVG circle sized per `visual.scale`.
- If `visual.ringColor`, a concentric ring of `visual.ringWidth`px in that
  color just outside the circle.
- If `visual.star`, a small `★` glyph overlay at the top-right of the circle.
- The whole icon wrapper has `opacity: <visual.opacity>`.

### Render flow

Every state change goes through `render()`:

1. Compute focused sub-group ID from `focusedPin`, `activeColumn`,
   `cycleIndex` (if any).
2. For each marker in `state.markers`: `computePinVisual`, update the
   marker's icon in place (Leaflet handles DOM diffing cheaply).
3. Rebuild the sidebar contents (see below).
4. If `focusedPin` is set, rebuild and reopen its popup.
5. Update top-bar `Showing N of M`.

## Click-cycle state machine

All events below mutate state and call `render()`.

| Event | Pre-state | Action | Post-state changes |
|---|---|---|---|
| Dropdown → `All` | any | — | `mode='all'`, `activeColumn=null`, `focusedPin=null`, `cycleIndex=0` |
| Dropdown → `<Column>` | any | — | `mode='group'`, `activeColumn=<Column>`, `focusedPin=null`, `cycleIndex=0` |
| Click pin P | `mode='all'` | open Leaflet popup with normal info | no state change |
| Click pin P | `mode='group'`, P has ≥1 entry in `activeColumn`, `focusedPin !== P` | focus P | `focusedPin=P`, `cycleIndex=0` |
| Click pin P | `mode='group'`, `focusedPin === P` | advance cycle circularly | `cycleIndex=(cycleIndex+1) mod P.groupMembership[activeColumn].length` |
| Click pin P | `mode='group'`, P has 0 entries in `activeColumn` | open popup with normal info | no state change |
| Click empty tile | `mode='group'`, `focusedPin !== null` | clear focus | `focusedPin=null`, `cycleIndex=0` |
| Click empty tile | otherwise | — | no-op |
| Search input | any | — | `searchTerm` updated |
| Legend swatch click | `mode='all'` | toggle legend-value visibility | `hiddenLegendValues` updated |
| Filter dropdown change | `mode='all'` | update filters | `columnFilters` updated |
| Refresh button | any | re-fetch | data replaced; if `focusedPin`, try to re-resolve by `rowNumber`; clamp `cycleIndex` to valid range; else clear focus |

Event bindings:
- `marker.on('click', …)` — per-pin click handler; stops bubbling.
- `map.on('click', …)` — empty-tile click handler; only fires when no marker
  absorbed it.

## Popup, sidebar, and misc

### Popup content

*All mode, or group mode without `focusedPin`:*

- Title = first `Popup column` value.
- Address line.
- Remaining popup columns as `Label: value` rows, where `Label` uses the
  `Popup labels` override if present, else the header name.
- **Conditional hiding:** any popup column whose value is blank/empty is
  omitted entirely (row does not appear).
- Get Directions button.

*Group mode with `focusedPin`:*

- Everything above, using the clicked pin's data.
- Separator.
- Focused-group header: `<ColumnName>: <GroupID> — N members, K leader(s)`.
- Compact member list, max 20 shown, then `…and N more` if longer. Each
  item: `★ Smith Family` for leaders, `Jones Family` for non-leaders. Each
  name is a link that, when clicked, sets `focusedPin` to that row's
  marker. `cycleIndex` is set to the new target's position of the
  currently-focused sub-group ID — so the focused sub-group stays the
  same, it just shifts to whichever row's popup you clicked from. If for
  any reason the new target doesn't have that sub-group (shouldn't
  happen when jumping from a member list), `cycleIndex` falls back to 0.
  Used for jumping between members without going to the map.
- The currently clicked pin appears in its own list, marked in place.

### Sidebar content

*All mode:*

- Legend (unchanged).
- Filter dropdowns (unchanged).
- Unmapped section (unchanged).

*Group mode:*

- Active column name heading.
- If `focusedPin` is set: focused sub-group callout (swatch, ID, member
  count, leader count).
- Sub-group index: alphabetical list of sub-groups in this column. Each
  entry shows swatch, ID, member count. Clicking an entry sets
  `focusedPin` to that sub-group's first member (by alphabetical
  popupTitle) and `cycleIndex` to 0.
- Unmapped section (unchanged).
- Legend/filter dropdowns are hidden — they are All-mode concerns.

### Top-bar

Unchanged. `Showing N of M` updates from search/filter state as today.

### "Open in new tab" fix

`openNewTab()` in `Code.gs` replaces its current `window.open(…)` inline
script with a user-gesture anchor click:

```js
function openNewTab() {
  const url = getWebAppUrl_();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert('New-tab map not configured',
      'Deploy as web app, then paste the /exec URL into the "Web app URL" row of Map Settings.',
      ui.ButtonSet.OK);
    return;
  }
  const safeUrl = url.replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(
    '<div style="padding:16px;font-family:sans-serif">' +
      '<p>Click to open MapsInSheets in a new tab:</p>' +
      '<a href="' + safeUrl + '" target="_blank" rel="noopener" ' +
      'style="display:inline-block;padding:8px 16px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:4px">' +
      'Open in new tab ↗</a>' +
    '</div>'
  ).setWidth(340).setHeight(140);
  ui.showModalDialog(html, 'Open in new tab');
}
```

The anchor click is a true user gesture, so popup blockers allow the
new tab.

### Copyright attribution

Leaflet's tile layer attribution is extended:

```js
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors | &copy; 2026 Mark Mackelprang',
  maxZoom: 19,
}).addTo(map);
```

Appears in the bottom-right of the map area, small grey text, always visible.

### Clustering and initial zoom

- **`L.markerClusterGroup` is removed.** All pins added directly to the map
  (or a plain `L.featureGroup`). CSS + JS for `MarkerCluster` is removed.
- **Initial zoom:** on first load and on Refresh, call
  `map.fitBounds(group.getBounds().pad(0.1))` against the union of *all*
  pins (muted included). The map does not re-fit on dropdown changes or
  pin focus — user pans/zooms freely.

## Testing

### New Node tests

**`tests/groups.test.js`** — ~15 tests:

- `parseGroupCell`
  - empty / null / undefined / whitespace-only → `[]`
  - non-string inputs (number, boolean) stringify
  - single `"A"`
  - `"A, B"` and `"A,B"` and `" A , B "` all equivalent
  - leader suffix `"A*"`, `"A *"`, `"A  *"`
  - mixed `"A, B*, C"`
  - bare `"*"` skipped; `"*, A"` returns only `A`
  - `"*A"` — treated as literal ID `*A` (non-leader, documented)
  - duplicate IDs within a cell: `"A, a, A*"` → single `{id:'A', isLeader:true}`
  - case preservation: `"Mixed"` → `{id:'Mixed', isLeader:false}`
- `buildGroupIndex`
  - rows with overlapping sub-group membership across rows
  - leader counting: same ID, multiple leaders across rows
  - stable palette assignment across multiple invocations
  - alphabetical ordering of `groups` within each column
  - empty rows (no group membership) don't affect the index

**`tests/popup-labels.test.js`** — ~5 tests:

- `parsePopupLabels('')` → `{}`
- `parsePopupLabels('Phone → ☎ Mobile')` → `{ Phone: '☎ Mobile' }`
- Arrow variants: `→` and `->` both accepted.
- Malformed entries (no separator) are silently dropped.
- Whitespace around keys/values is trimmed.

All existing 29 tests remain green (no behavioral change in `colors`,
`columns`, `cache`, `smart-links`, `legend`).

### Manual verification

QUICKSTART.md UAT checklist is extended in the documentation-update step:

- Pick `Youth` from the dropdown. Confirm non-members mute and group-column
  sidebar appears.
- Click a Youth member. Confirm ring appears on sub-group members, thick
  ring + larger size + ★ on leaders, others stay muted.
- Click the same pin again. Confirm cycle advances to next sub-group.
- Click a different Youth member. Confirm focus resets to their first
  sub-group.
- Click empty map tile. Confirm highlight clears.
- Change the dropdown back to `All`. Confirm pins return to Status colors.
- Verify `Popup labels` overrides in the popup.
- Verify empty cells are omitted from popup rows.
- Click the `Open in new tab` menu → dialog with anchor link → new tab
  opens with full map.
- Verify copyright line in the bottom-right map attribution.

## Migration

Existing sheets that do not configure `Group columns`:

- The new rows are blank. Behavior identical to today (All mode always;
  no group UI).
- The dropdown renders only the `All` entry.
- No visible difference in the info window (popup labels are blank;
  empty-row hiding applies, which is strictly an improvement over
  showing `Label: ` for empty cells).

Existing sheets opting in:

1. Open `Map Settings` tab; add rows `Popup labels` and `Group columns`
   manually, or run `Map → Reset settings tab` (preserves data tab only;
   loses color lookup — user reconfigures).
2. Fill in values; reopen the map.

## Rollout sequence (for the implementation plan)

1. New server lib module `groups.js` + Node tests.
2. Server glue: `SETTINGS_KEYS` additions, `readSettings_` parses new keys,
   `readRows_` surfaces `groupCells`, `getMapData` runs `parseGroupCell` +
   `buildGroupIndex`, payload includes new fields. Verify payload shape
   via a diagnostic logger (no UI change yet).
3. Client refactor: state object, `render(state)`, `computePinVisual`, new
   `makePinIcon(visual)`. All-mode-only; no group UI added. Verify no
   regression in legend, filters, search, unmapped list, refresh,
   info-window rendering, Get Directions.
4. Remove marker clustering; initial zoom unchanged.
5. Group-mode UI: dropdown selector, resting-state mute, group-mode
   sidebar (column heading + sub-group index).
6. Click-cycle state machine + highlight visuals (ring, scale, star).
7. Popup updates: popup-label overrides, empty-row hiding, group-mode
   member/leader list.
8. Copyright attribution extension.
9. "Open in new tab" anchor fix.
10. Docs update: SETUP.md, QUICKSTART.md, README.md.

Each step produces a working, testable state. Step 3 is the riskiest —
completing it cleanly before introducing the group UI ensures regressions
in existing behavior are diagnosable in isolation.

## Documentation updates (step 10)

- **`README.md`:** add group views to the feature bullet list; update the
  ASCII UI diagram to show the group-column selector + group-mode sidebar;
  update the "Design at a glance" section to mention group columns.
- **`SETUP.md`:** document the two new `Map Settings` rows (`Popup labels`,
  `Group columns`); add a "Using group views" subsection with a small
  walkthrough (pick Youth from dropdown, click pin, see highlight, cycle).
- **`QUICKSTART.md`:** sample data gets a `Youth` column with CSV cells
  including leader markers; UAT checklist gains group-mode test items
  listed under "Manual verification" above; troubleshooting table gains
  a row for "Group columns configured but no entries appear in dropdown"
  (→ "check header names match exactly").

## Open questions

None blocking. Deferred considerations for future enhancement:

- Per-group color overrides in Settings (currently auto-only).
- Group-based filters in All mode ("show only Youth A members").
- Cross-column group highlighting ("show all leaders across all group
  columns").
- Group-cell validation tooling (flag rows with obvious typos).
