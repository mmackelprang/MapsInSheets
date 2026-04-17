# Multi-Group Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend MapsInSheets with multi-group views (group-column selector, muted non-members, click-cycle sub-group highlight with leader distinction), richer popup configuration, removed clustering, fixed "Open in new tab" menu, and a copyright line on the map.

**Architecture:** New Node-tested pure-logic modules (`groups.js`, `popup-labels.js`) extend the existing lib layer. Apps Script glue (`Code.gs`) enriches the payload with parsed group memberships and popup-label overrides. The client (`Map.html`) is refactored into a single state-driven render pipeline (approach B): one `state` object, one `render()` function, `computePinVisual` as the single source of truth for pin appearance.

**Tech Stack:** JavaScript (ES2019 — Apps Script V8 baseline), Vitest, Leaflet 1.9, OpenStreetMap tiles, Google Apps Script runtime.

**Spec:** `docs/superpowers/specs/2026-04-17-multi-group-views-design.md`

---

## Conventions and setup

- **Working directory:** `D:/prj/MapsInSheets`. Shell: Git Bash (Windows). Forward slashes in bash commands.
- **Existing commits on `main` before this plan starts:** many; HEAD is the spec commit `8fcaa6a`. Each task below adds one commit.
- **Test files use ESM `import` syntax** (vitest with Vite transforms this even though `package.json` has `"type": "commonjs"`). Match the pattern of `tests/cache.test.js` etc.
- **Library source files use CJS footer** for dual-environment compatibility:
  ```js
  if (typeof module !== 'undefined') {
    module.exports = { /* … */ };
  }
  ```
  Apps Script V8 has no `module` global so the block is inert there. Node tests pick up the exports.
- **No top-level `import` or `export` statements in source files.** Apps Script V8 does not support ES modules and errors on those. (Learned the hard way in the first project.)
- **Apps Script V8 scoping gotcha:** top-level `const`/`let` in a `.gs` file is **file-scoped**, not global across files. Only `function` declarations and top-level `var` cross files. Any new constant in a lib module that Code.gs or another lib reads must be `var`. (All new modules in this plan only export function symbols cross-file — no cross-file constants — so this should not bite.)
- **Build:** `npm run build` regenerates `dist/`. The build script strips the CJS footer and any top-level `const/let/var … = require('./xxx.js')` line.
- **Dist is committed to the repo.** Every task that changes source code also rebuilds `dist/` and commits both.
- **Full test command:** `npx vitest run`. Single file: `npx vitest run tests/<file>.test.js`.
- **Existing test count (baseline):** 29.

---

## File structure

```
D:/prj/MapsInSheets/
├── src/
│   ├── appsscript.json                 # unchanged
│   ├── Code.js                         # MODIFY — settings keys, readSettings_, readRows_, getMapData, openNewTab
│   ├── Map.html                        # REWRITE — state-driven render; group UI; popup changes; copyright; no clustering
│   └── lib/
│       ├── cache.js                    # unchanged
│       ├── colors.js                   # unchanged
│       ├── columns.js                  # unchanged
│       ├── groups.js                   # NEW — parseGroupCell, buildGroupIndex
│       ├── legend.js                   # unchanged
│       ├── popup-labels.js             # NEW — parsePopupLabels
│       └── smart-links.js              # unchanged
├── tests/
│   ├── … existing …
│   ├── groups.test.js                  # NEW
│   └── popup-labels.test.js            # NEW
├── dist/                               # regenerated from src/ each task
├── docs/superpowers/
│   ├── specs/2026-04-17-multi-group-views-design.md
│   └── plans/2026-04-17-multi-group-views-implementation.md    ← this file
├── README.md                           # MODIFY (Task 13)
├── SETUP.md                            # MODIFY (Task 13)
└── QUICKSTART.md                       # MODIFY (Task 13)
```

**Why this split:**
- `groups.js` and `popup-labels.js` are two small, single-purpose pure modules. Separate files keep each under 100 lines and each test file focused.
- `Code.js` gains ~80 lines of glue; its structure (one function per concern) is unchanged.
- `Map.html` gets substantially reorganized (approach B refactor). This is the largest diff. Expect ~600 lines total.

---

## Task 1: `groups.js` module — parseGroupCell and buildGroupIndex

**Files:**
- Create: `D:/prj/MapsInSheets/src/lib/groups.js`
- Create: `D:/prj/MapsInSheets/tests/groups.test.js`

**Contract:**

- `parseGroupCell(value)` → `[{ id: string, isLeader: boolean }, …]`
  - null/undefined/whitespace-only → `[]`
  - Non-strings stringified first.
  - Split on `,`; trim each token; skip empty and bare `*`.
  - Token ending in `*` (with optional whitespace before the `*`) → strip suffix, `isLeader: true`.
  - Duplicate IDs within one cell collapse to one entry; leader wins.
  - Case preserved for display.

- `buildGroupIndex(rows, groupColumns)` → `{ [columnName]: { groups: { [idLower]: { displayId, members, leaders } }, palette: { [idLower]: '#rrggbb' } } }`
  - `members` and `leaders` are arrays of `{ rowNumber, popupTitle }`.
  - Every leader appears in `members` too.
  - Sub-groups sorted alphabetically by `displayId` (enforced by the object-insertion order).
  - Palette assignment uses `hashString` (from colors.js) + `DEFAULT_PALETTE`. Stable across runs.

- [ ] **Step 1: Write the failing tests**

Create `D:/prj/MapsInSheets/tests/groups.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseGroupCell, buildGroupIndex } from '../src/lib/groups.js';
import { DEFAULT_PALETTE, hashString } from '../src/lib/colors.js';

describe('parseGroupCell', () => {
  it('returns [] for empty/nullish/whitespace inputs', () => {
    expect(parseGroupCell('')).toEqual([]);
    expect(parseGroupCell('   ')).toEqual([]);
    expect(parseGroupCell(null)).toEqual([]);
    expect(parseGroupCell(undefined)).toEqual([]);
  });

  it('stringifies non-string inputs', () => {
    expect(parseGroupCell(42)).toEqual([{ id: '42', isLeader: false }]);
    expect(parseGroupCell(true)).toEqual([{ id: 'true', isLeader: false }]);
  });

  it('parses a single ID', () => {
    expect(parseGroupCell('A')).toEqual([{ id: 'A', isLeader: false }]);
  });

  it('parses CSV with and without spaces', () => {
    expect(parseGroupCell('A,B')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: false },
    ]);
    expect(parseGroupCell(' A , B ')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: false },
    ]);
  });

  it('handles leader-suffix variants', () => {
    expect(parseGroupCell('A*')).toEqual([{ id: 'A', isLeader: true }]);
    expect(parseGroupCell('A *')).toEqual([{ id: 'A', isLeader: true }]);
    expect(parseGroupCell('A  *')).toEqual([{ id: 'A', isLeader: true }]);
  });

  it('parses mixed member + leader', () => {
    expect(parseGroupCell('A, B*, C')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: true },
      { id: 'C', isLeader: false },
    ]);
  });

  it('skips bare * tokens as data bugs', () => {
    expect(parseGroupCell('*')).toEqual([]);
    expect(parseGroupCell('*, A')).toEqual([{ id: 'A', isLeader: false }]);
    expect(parseGroupCell('A, *, B')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: false },
    ]);
  });

  it('treats *A as literal ID (prefix * is not a leader marker)', () => {
    expect(parseGroupCell('*A')).toEqual([{ id: '*A', isLeader: false }]);
  });

  it('dedupes within one cell, leader wins', () => {
    expect(parseGroupCell('A, A, A*')).toEqual([{ id: 'A', isLeader: true }]);
    expect(parseGroupCell('A*, A')).toEqual([{ id: 'A', isLeader: true }]);
  });

  it('preserves case for display but treats IDs as case-insensitive for dedupe', () => {
    expect(parseGroupCell('Tuesday, tuesday')).toEqual([{ id: 'Tuesday', isLeader: false }]);
    expect(parseGroupCell('MixedCase')).toEqual([{ id: 'MixedCase', isLeader: false }]);
  });
});

describe('buildGroupIndex', () => {
  function row(rowNumber, title, membership) {
    return { rowNumber, popup: [{ name: 'Name', value: title }], groupMembership: membership };
  }

  it('returns empty object when no group columns configured', () => {
    const idx = buildGroupIndex([row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }] })], []);
    expect(idx).toEqual({});
  });

  it('groups rows by sub-group within each column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }] }),
      row(3, 'Jones', { Youth: [{ id: 'A', isLeader: true }] }),
      row(4, 'Lee',   { Youth: [{ id: 'B', isLeader: false }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth']);
    expect(Object.keys(idx)).toEqual(['Youth']);
    expect(Object.keys(idx.Youth.groups)).toEqual(['a', 'b']); // alphabetical
    expect(idx.Youth.groups.a.displayId).toBe('A');
    expect(idx.Youth.groups.a.members.map((m) => m.rowNumber)).toEqual([2, 3]);
    expect(idx.Youth.groups.a.leaders.map((m) => m.rowNumber)).toEqual([3]);
    expect(idx.Youth.groups.b.members.map((m) => m.rowNumber)).toEqual([4]);
    expect(idx.Youth.groups.b.leaders).toEqual([]);
  });

  it('handles rows with multiple sub-groups in one column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }, { id: 'B', isLeader: true }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth']);
    expect(idx.Youth.groups.a.members.map((m) => m.rowNumber)).toEqual([2]);
    expect(idx.Youth.groups.b.members.map((m) => m.rowNumber)).toEqual([2]);
    expect(idx.Youth.groups.b.leaders.map((m) => m.rowNumber)).toEqual([2]);
  });

  it('builds an index across multiple columns, scoping IDs per column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }], Committee: [{ id: 'A', isLeader: true }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth', 'Committee']);
    expect(Object.keys(idx)).toEqual(['Youth', 'Committee']);
    expect(idx.Youth.groups.a.leaders).toEqual([]); // not a leader in Youth
    expect(idx.Committee.groups.a.leaders.map((m) => m.rowNumber)).toEqual([2]);
  });

  it('produces stable palette assignment', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }] }),
      row(3, 'Jones', { Youth: [{ id: 'B', isLeader: false }] }),
    ];
    const idx1 = buildGroupIndex(rows, ['Youth']);
    const idx2 = buildGroupIndex(rows, ['Youth']);
    expect(idx1.Youth.palette.a).toBe(idx2.Youth.palette.a);
    expect(idx1.Youth.palette.b).toBe(idx2.Youth.palette.b);
    expect(DEFAULT_PALETTE).toContain(idx1.Youth.palette.a);
  });

  it('popupTitle comes from first popup column', () => {
    const rows = [
      { rowNumber: 2, popup: [{ name: 'Name', value: 'Smith Family' }], groupMembership: { Youth: [{ id: 'A', isLeader: false }] } },
    ];
    const idx = buildGroupIndex(rows, ['Youth']);
    expect(idx.Youth.groups.a.members[0].popupTitle).toBe('Smith Family');
  });

  it('skips rows with no membership in a given column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }], Committee: [] }),
      row(3, 'Jones', { Youth: [],                                Committee: [{ id: 'Finance', isLeader: false }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth', 'Committee']);
    expect(Object.keys(idx.Youth.groups)).toEqual(['a']);
    expect(Object.keys(idx.Committee.groups)).toEqual(['finance']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /d/prj/MapsInSheets && npx vitest run tests/groups.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/groups.js'`.

- [ ] **Step 3: Implement `groups.js`**

Create `D:/prj/MapsInSheets/src/lib/groups.js`:

```js
// For Node tests only — build step strips this require; in Apps Script the
// needed symbols are provided by lib_colors.gs in script-scope.
const { hashString, DEFAULT_PALETTE } = (typeof require !== 'undefined')
  ? require('./colors.js')
  : { hashString: undefined, DEFAULT_PALETTE: undefined };

function parseGroupCell(value) {
  if (value === null || value === undefined) return [];
  const str = String(value);
  if (str.trim() === '') return [];

  const tokens = str.split(',');
  const seen = new Map(); // lowercase id -> { id, isLeader }
  for (let raw of tokens) {
    let token = raw.trim();
    if (token === '' || token === '*') continue;

    let isLeader = false;
    if (token.endsWith('*')) {
      isLeader = true;
      token = token.slice(0, -1).trim();
      if (token === '') continue; // bare * with trailing whitespace
    }

    const key = token.toLowerCase();
    if (seen.has(key)) {
      if (isLeader) seen.get(key).isLeader = true;
    } else {
      seen.set(key, { id: token, isLeader });
    }
  }

  return Array.from(seen.values());
}

function buildGroupIndex(rows, groupColumns) {
  const index = {};
  for (const column of groupColumns) {
    // First pass: collect members/leaders per sub-group.
    const groups = new Map(); // lowercase id -> { displayId, members, leaders }

    for (const row of rows) {
      const entries = (row.groupMembership && row.groupMembership[column]) || [];
      for (const entry of entries) {
        const key = entry.id.toLowerCase();
        let bucket = groups.get(key);
        if (!bucket) {
          bucket = { displayId: entry.id, members: [], leaders: [] };
          groups.set(key, bucket);
        }
        const popupTitle = row.popup && row.popup.length ? String(row.popup[0].value || '') : '';
        const ref = { rowNumber: row.rowNumber, popupTitle };
        bucket.members.push(ref);
        if (entry.isLeader) bucket.leaders.push(ref);
      }
    }

    // Sort keys alphabetically by displayId to create deterministic order.
    const sortedKeys = Array.from(groups.keys()).sort((a, b) =>
      groups.get(a).displayId.localeCompare(groups.get(b).displayId)
    );

    // Auto-assign colors via hash into DEFAULT_PALETTE.
    const orderedGroups = {};
    const palette = {};
    for (const key of sortedKeys) {
      orderedGroups[key] = groups.get(key);
      palette[key] = DEFAULT_PALETTE[hashString(key) % DEFAULT_PALETTE.length];
    }

    index[column] = { groups: orderedGroups, palette };
  }
  return index;
}

if (typeof module !== 'undefined') {
  module.exports = { parseGroupCell, buildGroupIndex };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /d/prj/MapsInSheets && npx vitest run tests/groups.test.js
```
Expected: PASS — 17 tests green.

- [ ] **Step 5: Build and verify dist output**

Run:
```bash
cd /d/prj/MapsInSheets && npm run build
```
Expected: `dist/lib_groups.gs` produced.

Verify the `require` was stripped:
```bash
cd /d/prj/MapsInSheets && grep -c "require(" dist/lib_groups.gs
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
cd /d/prj/MapsInSheets && git add src/lib/groups.js tests/groups.test.js dist/lib_groups.gs && git commit -m "feat(groups): parseGroupCell and buildGroupIndex with tests"
```

---

## Task 2: `popup-labels.js` module — parsePopupLabels

**Files:**
- Create: `D:/prj/MapsInSheets/src/lib/popup-labels.js`
- Create: `D:/prj/MapsInSheets/tests/popup-labels.test.js`

**Contract:**

- `parsePopupLabels(value)` → `{ [header]: displayLabel }`
  - Empty/null/whitespace → `{}`.
  - Split on `,`; each entry split on `→` (arrow) or `->` (ASCII).
  - Trim both sides.
  - Malformed entries (no separator, or empty header/label) skipped.

- [ ] **Step 1: Write the failing tests**

Create `D:/prj/MapsInSheets/tests/popup-labels.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parsePopupLabels } from '../src/lib/popup-labels.js';

describe('parsePopupLabels', () => {
  it('returns {} for empty/nullish/whitespace inputs', () => {
    expect(parsePopupLabels('')).toEqual({});
    expect(parsePopupLabels('   ')).toEqual({});
    expect(parsePopupLabels(null)).toEqual({});
    expect(parsePopupLabels(undefined)).toEqual({});
  });

  it('parses a single arrow entry', () => {
    expect(parsePopupLabels('Phone → ☎ Mobile')).toEqual({ Phone: '☎ Mobile' });
  });

  it('accepts ASCII -> as an alternative separator', () => {
    expect(parsePopupLabels('Phone -> Mobile')).toEqual({ Phone: 'Mobile' });
  });

  it('parses multiple entries separated by commas', () => {
    expect(parsePopupLabels('Phone → ☎, Email → ✉')).toEqual({
      Phone: '☎',
      Email: '✉',
    });
  });

  it('trims whitespace around keys and values', () => {
    expect(parsePopupLabels('  Phone   →   Mobile  ')).toEqual({ Phone: 'Mobile' });
  });

  it('drops malformed entries (no separator)', () => {
    expect(parsePopupLabels('Phone Mobile, Email → ✉')).toEqual({ Email: '✉' });
  });

  it('drops entries with empty header or empty label', () => {
    expect(parsePopupLabels(' → something, Phone → , Email → Valid')).toEqual({
      Email: 'Valid',
    });
  });

  it('later entries with the same header win', () => {
    expect(parsePopupLabels('Phone → Old, Phone → New')).toEqual({ Phone: 'New' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /d/prj/MapsInSheets && npx vitest run tests/popup-labels.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `popup-labels.js`**

Create `D:/prj/MapsInSheets/src/lib/popup-labels.js`:

```js
function parsePopupLabels(value) {
  if (value === null || value === undefined) return {};
  const str = String(value);
  if (str.trim() === '') return {};

  const result = {};
  const entries = str.split(',');
  for (const raw of entries) {
    const piece = raw.trim();
    if (!piece) continue;

    let sepIndex = piece.indexOf('→');
    let sepLen = 1;
    if (sepIndex === -1) {
      sepIndex = piece.indexOf('->');
      sepLen = 2;
    }
    if (sepIndex === -1) continue;

    const header = piece.slice(0, sepIndex).trim();
    const label = piece.slice(sepIndex + sepLen).trim();
    if (!header || !label) continue;

    result[header] = label;
  }
  return result;
}

if (typeof module !== 'undefined') {
  module.exports = { parsePopupLabels };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /d/prj/MapsInSheets && npx vitest run tests/popup-labels.test.js
```
Expected: PASS — 8 tests green.

- [ ] **Step 5: Build**

Run:
```bash
cd /d/prj/MapsInSheets && npm run build
```
Expected: `dist/lib_popup_labels.gs` produced.

- [ ] **Step 6: Commit**

```bash
cd /d/prj/MapsInSheets && git add src/lib/popup-labels.js tests/popup-labels.test.js dist/lib_popup_labels.gs && git commit -m "feat(popup-labels): parsePopupLabels with tests"
```

---

## Task 3: Server glue — Settings keys, row parsing, getMapData payload

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Code.js`

**Scope:** add two new `SETTINGS_KEYS`, parse them in `readSettings_`, surface raw group cells per row in `readRows_`, parse them in `getMapData` and include the enriched payload (groupColumns, groupIndex, popupLabels, warnings, per-pin groupMembership).

- [ ] **Step 1: Add new Settings keys**

In `src/Code.js`, find the `SETTINGS_KEYS` array and add two entries. The final array should look like this — insert the new entries at the positions shown:

```js
const SETTINGS_KEYS = [
  { key: 'Data tab',            help: 'Sheet tab containing the address rows.' },
  { key: 'Address column',      help: 'Column letter or header name of the address column.' },
  { key: 'Color column',        help: 'Column whose value drives pin color.' },
  { key: 'Popup columns',       help: 'Comma-separated header names shown in the info window, in order. First one is the title.' },
  { key: 'Popup labels',        help: 'Optional. Comma-separated Header → DisplayLabel pairs to rename labels in the info window.' },
  { key: 'Filter columns',      help: 'Comma-separated header names exposed as filter dropdowns.' },
  { key: 'Group columns',       help: 'Optional. Comma-separated column headers whose cells contain CSV group IDs (with optional * leader suffix).' },
  { key: 'Latitude column',     help: 'Auto-managed. Column that stores cached latitude.' },
  { key: 'Longitude column',    help: 'Auto-managed. Column that stores cached longitude.' },
  { key: 'Geocoded From column',help: 'Auto-managed. Stores the address string used to geocode this row.' },
  { key: 'Web app URL',         help: 'Paste the /exec URL from your web-app deployment to enable "Open in new tab".' },
];
```

- [ ] **Step 2: Extend `readRows_` to surface raw group cells**

Inside `readRows_` (in `src/Code.js`), after the line:
```js
  const filterCols  = parseCsvList_(settings['Filter columns']).map((n) => ({ name: n, idx: resolveColumn_(n, header) })).filter((x) => x.idx);
```
add:
```js
  const groupColList = parseCsvList_(settings['Group columns']);
  const groupCols = groupColList.map((n) => ({ name: n, idx: resolveColumn_(n, header) }));
  const missingGroupCols = groupCols.filter((x) => !x.idx).map((x) => x.name);
  const validGroupCols = groupCols.filter((x) => x.idx);
```

Still inside `readRows_`, inside the row-building loop, after the existing:
```js
    const filters = {};
    for (const { name, idx } of filterCols) filters[name] = raw[idx - 1];
```
add:
```js
    const groupCells = {};
    for (const { name, idx } of validGroupCols) groupCells[name] = raw[idx - 1];
```

And in the same loop, add `groupCells` to the row object push. The `rows.push({ ... })` block becomes:
```js
    rows.push({
      rowNumber: r + 1,
      address,
      colorValue: colorCol ? raw[colorCol - 1] : '',
      lat: raw[cache['Latitude column'] - 1],
      lng: raw[cache['Longitude column'] - 1],
      geocodedFrom: raw[cache['Geocoded From column'] - 1],
      popup,
      filters,
      groupCells,
    });
```

Finally, the function's return should include the missing-column warnings. Change the final `return` statement from:
```js
  return { rows, dataSheet, header, cache };
```
to:
```js
  return { rows, dataSheet, header, cache, groupColumns: validGroupCols.map((c) => c.name), missingGroupColumns: missingGroupCols };
```

- [ ] **Step 3: Update `getMapData` to parse groups and popup-labels and enrich the payload**

Find `getMapData` in `src/Code.js`. Replace its body with:

```js
function getMapData() {
  const { kv: settings, lookup } = readSettings_();
  const readResult = readRows_(settings);
  const { rows, dataSheet, cache, groupColumns, missingGroupColumns } = readResult;

  const toGeocode = [];
  const unmapped = [];
  const mapped = [];

  for (const row of rows) {
    const decision = needsGeocoding({
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      geocodedFrom: row.geocodedFrom,
    });
    if (decision === 'geocode') toGeocode.push(row);
    else if (decision === 'cached') mapped.push(row);
  }

  const geocodeResults = geocodeRows_(toGeocode, dataSheet, cache);
  const byRow = new Map(geocodeResults.map((r) => [r.rowNumber, r]));

  for (const row of toGeocode) {
    const res = byRow.get(row.rowNumber);
    if (res && res.ok) mapped.push(row);
    else unmapped.push({ rowNumber: row.rowNumber, address: row.address });
  }

  // Parse group cells into per-row groupMembership.
  for (const row of mapped) {
    row.groupMembership = {};
    for (const col of groupColumns) {
      row.groupMembership[col] = parseGroupCell(row.groupCells ? row.groupCells[col] : '');
    }
  }

  const palette = DEFAULT_PALETTE;
  const legend = buildLegend({
    rows: mapped.map((r) => ({ __color__: r.colorValue })),
    colorField: '__color__',
    lookup,
    palette,
  });

  // Build the per-column group index (members/leaders + palette).
  const groupIndex = buildGroupIndex(mapped, groupColumns);

  // Parse popup label overrides.
  const popupLabels = parsePopupLabels(settings['Popup labels']);

  // Compose warnings (currently only missing-group-column warnings).
  const warnings = [];
  for (const m of missingGroupColumns) {
    warnings.push('Configured group column "' + m + '" is not in the data tab.');
  }

  const pins = mapped.map((r) => ({
    rowNumber: r.rowNumber,
    address: r.address,
    lat: Number(r.lat),
    lng: Number(r.lng),
    color: resolveColor(r.colorValue, lookup, palette),
    colorValue: r.colorValue == null ? '' : String(r.colorValue),
    popup: r.popup.map((p) => ({ name: p.name, value: p.value == null ? '' : String(p.value) })),
    filters: r.filters,
    groupMembership: r.groupMembership || {},
  }));

  return {
    settings,
    legend,
    pins,
    unmapped,
    filterColumns: parseCsvList_(settings['Filter columns']),
    groupColumns,
    groupIndex,
    popupLabels,
    warnings,
    totalRows: rows.length,
    geocoded: toGeocode.length - unmapped.length,
    remainingToGeocode: Math.max(0, toGeocode.length - geocodeResults.length),
  };
}
```

- [ ] **Step 4: Syntax-check the modified file**

Run:
```bash
cd /d/prj/MapsInSheets && node --check src/Code.js && echo OK
```
Expected: `OK`.

- [ ] **Step 5: Run full test suite (regression)**

Run:
```bash
cd /d/prj/MapsInSheets && npx vitest run
```
Expected: 29 existing tests + 17 (groups) + 8 (popup-labels) = 54 tests pass.

- [ ] **Step 6: Rebuild dist**

Run:
```bash
cd /d/prj/MapsInSheets && npm run build
```
Expected: all 9 dist files regenerated (Code.gs, Map.html, appsscript.json, lib_cache.gs, lib_colors.gs, lib_columns.gs, lib_groups.gs, lib_legend.gs, lib_popup_labels.gs, lib_smart_links.gs).

- [ ] **Step 7: Commit**

```bash
cd /d/prj/MapsInSheets && git add src/Code.js dist/Code.gs && git commit -m "feat(apps-script): parse group cells and popup labels; enrich getMapData payload"
```

---

## Task 4: Client — refactor Map.html to state-driven rendering (no group UI yet)

**Files:**
- Rewrite: `D:/prj/MapsInSheets/src/Map.html`

**Goal of this task:** introduce the `state` object and single `render(state)` pipeline. All existing behavior (legend, filter dropdowns, search, unmapped, info windows, refresh) works identically. No group UI yet, no copyright yet, no clustering removed yet. This task should have zero visible change — it's pure refactor.

**Strategy:** write the full new file, then compare behavior by hand-walking the UAT.

- [ ] **Step 1: Rewrite `src/Map.html`**

Overwrite `D:/prj/MapsInSheets/src/Map.html` with:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>MapsInSheets</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
  <style>
    html, body { margin: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #app { display: grid; grid-template-rows: 48px 1fr; height: 100vh; }
    #topbar { display: flex; gap: 12px; align-items: center; padding: 0 12px; border-bottom: 1px solid #e5e5e5; background: #fafafa; }
    #topbar button { padding: 6px 12px; border: 1px solid #ccc; background: white; cursor: pointer; border-radius: 4px; }
    #topbar input { padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; flex: 0 0 260px; }
    #status { margin-left: auto; color: #666; font-size: 13px; }
    #main { display: grid; grid-template-columns: 280px 1fr; overflow: hidden; }
    #sidebar { border-right: 1px solid #e5e5e5; overflow-y: auto; padding: 12px; background: #fcfcfc; }
    #sidebar h3 { font-size: 13px; text-transform: uppercase; color: #888; margin: 16px 0 6px; }
    #sidebar h3:first-child { margin-top: 0; }
    #map { height: 100%; }
    .pin-circle { width: 18px; height: 18px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    .legend-row { display: flex; align-items: center; gap: 8px; padding: 3px 4px; cursor: pointer; border-radius: 3px; user-select: none; }
    .legend-row:hover { background: #eef; }
    .legend-row.hidden { opacity: 0.35; }
    .legend-swatch { width: 14px; height: 14px; border-radius: 50%; flex: 0 0 14px; }
    .legend-count { color: #888; margin-left: auto; font-size: 12px; }
    .info { font-size: 13px; line-height: 1.4; }
    .info .title { font-weight: 600; font-size: 14px; }
    .info .address { color: #555; margin-bottom: 6px; }
    .info .field { margin: 2px 0; }
    .info .label { color: #888; margin-right: 4px; }
    .info .dir { display: inline-block; margin-top: 8px; padding: 6px 10px; background: #1a73e8; color: white; text-decoration: none; border-radius: 4px; font-weight: 500; }
    #banner { padding: 6px 12px; background: #fff3cd; border-bottom: 1px solid #ffecb5; display: none; }
    #banner.show { display: block; }
    .unmapped-row { font-size: 12px; padding: 3px 0; color: #666; }
  </style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <button id="refreshBtn">🔄 Refresh</button>
    <input id="searchBox" type="search" placeholder="Search…">
    <span id="status">Loading…</span>
  </div>
  <div id="banner"></div>
  <div id="main">
    <div id="sidebar"></div>
    <div id="map"></div>
  </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
  // ---------- Leaflet setup ----------
  var map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  var cluster = L.markerClusterGroup();
  map.addLayer(cluster);

  // ---------- State ----------
  var state = {
    data: null,
    mode: 'all',           // 'all' | 'group'
    activeColumn: null,    // group column name when mode === 'group'
    focusedPin: null,      // pin object when a pin is focused
    cycleIndex: 0,
    searchTerm: '',
    hiddenLegendValues: new Set(),
    columnFilters: {},     // { columnName: Set<lowercase value> }
  };

  var markers = [];        // Leaflet marker objects, one per pin

  // ---------- Smart-link detection (mirrors src/lib/smart-links.js) ----------
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var URL_RE = /^https?:\/\/\S+$/i;
  var PHONE_RE = /^(?:\+?\d[\d\s().-]{8,}\d|\([\d]{3}\)[\d\s().-]{6,}\d)$/;

  function classify(value) {
    var text = value == null ? '' : String(value).trim();
    if (!text) return { kind: 'text', href: null, text: '' };
    if (EMAIL_RE.test(text)) return { kind: 'email', href: 'mailto:' + text, text: text };
    if (URL_RE.test(text)) return { kind: 'url', href: text, text: text };
    if (PHONE_RE.test(text)) {
      var digits = text.replace(/\D/g, '');
      if (digits.length >= 10) {
        var norm = digits.length === 10
          ? '+1' + digits
          : (digits[0] === '1' && digits.length === 11 ? '+' + digits : '+' + digits);
        return { kind: 'phone', href: 'tel:' + norm, text: text };
      }
    }
    return { kind: 'text', href: null, text: text };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function renderValue(value) {
    var c = classify(value);
    if (c.kind === 'text') return escapeHtml(c.text);
    return '<a href="' + escapeHtml(c.href) + '" target="_blank" rel="noopener">' + escapeHtml(c.text) + '</a>';
  }

  // ---------- Pin visual computation ----------
  function computePinVisual(pin) {
    // Task 4: All-mode only. Simple pass-through.
    return {
      color: pin.color,
      opacity: 1,
      ringColor: null,
      ringWidth: 0,
      scale: 1,
      star: false,
    };
  }

  function makePinIcon(visual) {
    var size = Math.round(18 * visual.scale);
    var html = '<div class="pin-circle" style="background:' + visual.color + ';width:' + size + 'px;height:' + size + 'px;opacity:' + visual.opacity + ';"></div>';
    return L.divIcon({
      html: html,
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  // ---------- Info window ----------
  function buildInfoHtml(p) {
    var title = p.popup && p.popup.length ? p.popup[0].value : '';
    var rest = (p.popup || []).slice(1);
    var parts = [];
    parts.push('<div class="info">');
    parts.push('<div class="title">' + escapeHtml(String(title || '')) + '</div>');
    parts.push('<div class="address">' + escapeHtml(p.address) + '</div>');
    rest.forEach(function (f) {
      parts.push('<div class="field"><span class="label">' + escapeHtml(f.name) + ':</span> ' + renderValue(f.value) + '</div>');
    });
    var dirUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.address);
    parts.push('<a class="dir" href="' + dirUrl + '" target="_blank" rel="noopener">Get Directions</a>');
    parts.push('</div>');
    return parts.join('');
  }

  // ---------- Filter predicates ----------
  function matchesSearch(p) {
    if (!state.searchTerm) return true;
    var needle = state.searchTerm.toLowerCase();
    if (p.address && p.address.toLowerCase().indexOf(needle) !== -1) return true;
    for (var i = 0; i < (p.popup || []).length; i++) {
      var v = p.popup[i].value;
      if (v != null && String(v).toLowerCase().indexOf(needle) !== -1) return true;
    }
    return false;
  }

  function matchesColumnFilters(p) {
    for (var col in state.columnFilters) {
      var allowed = state.columnFilters[col];
      if (!allowed || allowed.size === 0) continue;
      var val = p.filters && p.filters[col];
      var key = val == null ? '' : String(val).trim().toLowerCase();
      if (!allowed.has(key)) return false;
    }
    return true;
  }

  function matchesLegend(p) {
    var colorVal = (p.colorValue || '(no value)').toLowerCase();
    return !state.hiddenLegendValues.has(colorVal);
  }

  function pinIsVisible(p) {
    return matchesLegend(p) && matchesSearch(p) && matchesColumnFilters(p);
  }

  // ---------- Render ----------
  function render() {
    if (!state.data) return;
    cluster.clearLayers();
    var visible = 0;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var p = m._drivemap;
      if (!pinIsVisible(p)) continue;
      m.setIcon(makePinIcon(computePinVisual(p)));
      cluster.addLayer(m);
      visible++;
    }
    renderSidebar();
    setStatus('Showing ' + visible + ' of ' + state.data.totalRows);
    if (state.data.remainingToGeocode > 0) {
      setBanner('Geocoding was interrupted — ' + state.data.remainingToGeocode + ' rows remain. Click Refresh to continue.');
    } else {
      setBanner('');
    }
  }

  function renderSidebar() {
    var sb = document.getElementById('sidebar');
    sb.innerHTML = '';
    var data = state.data;

    var hLegend = document.createElement('h3'); hLegend.textContent = 'Legend'; sb.appendChild(hLegend);

    data.legend.entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'legend-row' + (state.hiddenLegendValues.has(e.value.toLowerCase()) ? ' hidden' : '');
      row.innerHTML =
        '<span class="legend-swatch" style="background:' + e.color + ';"></span>' +
        '<span>' + escapeHtml(e.value) + '</span>' +
        '<span class="legend-count">' + e.count + '</span>';
      row.addEventListener('click', function () {
        var k = e.value.toLowerCase();
        if (state.hiddenLegendValues.has(k)) state.hiddenLegendValues.delete(k);
        else state.hiddenLegendValues.add(k);
        render();
      });
      sb.appendChild(row);
    });
    if (data.legend.collapsed) {
      var note = document.createElement('div');
      note.style.fontSize = '11px'; note.style.color = '#999'; note.style.marginTop = '6px';
      note.textContent = 'Too many distinct values — showing top 19 + Other. Consider a column with fewer categories.';
      sb.appendChild(note);
    }

    if (data.filterColumns && data.filterColumns.length) {
      var hFilters = document.createElement('h3'); hFilters.textContent = 'Filters'; sb.appendChild(hFilters);
      data.filterColumns.forEach(function (col) {
        var label = document.createElement('div');
        label.style.fontSize = '12px'; label.style.color = '#666'; label.style.marginTop = '6px';
        label.textContent = col;
        sb.appendChild(label);

        var select = document.createElement('select');
        select.multiple = true;
        select.size = 4;
        select.style.width = '100%';
        select.style.marginBottom = '6px';

        var values = {};
        data.pins.forEach(function (p) {
          var v = p.filters && p.filters[col];
          var display = (v == null || String(v).trim() === '') ? '(blank)' : String(v).trim();
          var key = display === '(blank)' ? '' : display.toLowerCase();
          if (!(display in values)) values[display] = key;
        });
        Object.keys(values).sort().forEach(function (display) {
          var opt = document.createElement('option');
          opt.value = values[display];
          opt.textContent = display;
          select.appendChild(opt);
        });

        select.addEventListener('change', function () {
          var allowed = new Set();
          Array.from(select.selectedOptions).forEach(function (o) { allowed.add(o.value); });
          state.columnFilters[col] = allowed;
          render();
        });
        sb.appendChild(select);
      });
    }

    if (data.unmapped && data.unmapped.length) {
      var hUn = document.createElement('h3');
      hUn.textContent = 'Unmapped (' + data.unmapped.length + ')';
      sb.appendChild(hUn);
      data.unmapped.forEach(function (u) {
        var row = document.createElement('div');
        row.className = 'unmapped-row';
        row.textContent = 'Row ' + u.rowNumber + ': ' + u.address;
        sb.appendChild(row);
      });
    }
  }

  function setStatus(msg) { document.getElementById('status').textContent = msg; }
  function setBanner(msg) {
    var b = document.getElementById('banner');
    if (!msg) { b.classList.remove('show'); b.textContent = ''; }
    else { b.textContent = msg; b.classList.add('show'); }
  }

  // ---------- Marker management ----------
  function rebuildMarkers(data) {
    markers = [];
    cluster.clearLayers();
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(computePinVisual(p)) });
      marker._drivemap = p;
      marker.bindPopup(buildInfoHtml(p), { maxWidth: 320 });
      markers.push(marker);
    });
    if (data.pins.length) {
      var group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  // ---------- Data fetch ----------
  function loadData() {
    setStatus('Loading…');
    google.script.run
      .withSuccessHandler(function (data) {
        state.data = data;
        rebuildMarkers(data);
        render();
      })
      .withFailureHandler(function (err) { setStatus('Error: ' + err.message); })
      .getMapData();
  }

  // ---------- Wire up ----------
  document.getElementById('refreshBtn').addEventListener('click', loadData);
  document.getElementById('searchBox').addEventListener('input', function (ev) {
    state.searchTerm = ev.target.value.trim();
    render();
  });
  loadData();
</script>
</body>
</html>
```

- [ ] **Step 2: Rebuild**

Run:
```bash
cd /d/prj/MapsInSheets && npm run build
```
Expected: `dist/Map.html` regenerated.

- [ ] **Step 3: Commit**

```bash
cd /d/prj/MapsInSheets && git add src/Map.html dist/Map.html && git commit -m "refactor(client): state-driven render pipeline (all-mode only, no behavior change)"
```

> Manual verification cue (for the human executing this plan): after this task, paste the new `dist/Map.html` into your Apps Script project and open the dialog. Confirm that legend click-to-hide, filter dropdowns, search, Unmapped section, info window, and Refresh still work exactly as before. No group UI yet.

---

## Task 5: Remove marker clustering

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html`

- [ ] **Step 1: Remove the two markercluster CSS `<link>` tags**

In `src/Map.html`, delete these two lines from the `<head>`:
```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
```

- [ ] **Step 2: Remove the markercluster `<script>` tag**

Delete this line just below the main Leaflet `<script>`:
```html
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
```

- [ ] **Step 3: Replace the `L.markerClusterGroup` with a plain `L.featureGroup`**

In the `<script>` block, find:
```js
  var cluster = L.markerClusterGroup();
  map.addLayer(cluster);
```
Replace with:
```js
  var pinLayer = L.featureGroup();
  map.addLayer(pinLayer);
```

- [ ] **Step 4: Rename all `cluster` references to `pinLayer`**

In the same `<script>`, find and replace every occurrence of `cluster.` with `pinLayer.` and every occurrence of `cluster,` with `pinLayer,`. There should be exactly three sites:

- `cluster.clearLayers()` in `render()` → `pinLayer.clearLayers()`
- `cluster.clearLayers()` in `rebuildMarkers` → `pinLayer.clearLayers()`
- `cluster.addLayer(m)` in `render()` → `pinLayer.addLayer(m)`

- [ ] **Step 5: Verify no stragglers**

Run:
```bash
cd /d/prj/MapsInSheets && grep -n "cluster\|markercluster\|MarkerCluster" src/Map.html || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Rebuild and commit**

Run:
```bash
cd /d/prj/MapsInSheets && npm run build
cd /d/prj/MapsInSheets && git add src/Map.html dist/Map.html && git commit -m "feat(client): remove marker clustering; individual pins always shown"
```

> Manual verification cue: paste the updated `dist/Map.html` into Apps Script. Overlapping pins should now stack individually. High-density clusters will be visually messy at low zoom — user can always pan/zoom in. If this becomes a real complaint later, revisit.

---

## Task 6: Group-column dropdown in top bar

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html`

**Scope:** add a `<select>` to the top bar with options `All` and one per configured group column. Selecting updates `state.mode` and `state.activeColumn`, resets focus, calls `render()`. No visual change yet for group mode (Task 7 adds muting).

- [ ] **Step 1: Add the dropdown to the top bar HTML**

In `src/Map.html`, find the top bar:
```html
  <div id="topbar">
    <button id="refreshBtn">🔄 Refresh</button>
    <input id="searchBox" type="search" placeholder="Search…">
    <span id="status">Loading…</span>
  </div>
```
Replace with:
```html
  <div id="topbar">
    <button id="refreshBtn">🔄 Refresh</button>
    <label style="font-size:13px;color:#666;">View:</label>
    <select id="viewSelect" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;"></select>
    <input id="searchBox" type="search" placeholder="Search…">
    <span id="status">Loading…</span>
  </div>
```

- [ ] **Step 2: Add `populateViewSelect` function**

In the `<script>` block, add this function immediately after `renderSidebar()`:

```js
  function populateViewSelect(data) {
    var sel = document.getElementById('viewSelect');
    sel.innerHTML = '';
    var allOpt = document.createElement('option');
    allOpt.value = '__all__';
    allOpt.textContent = 'All';
    sel.appendChild(allOpt);
    (data.groupColumns || []).forEach(function (col) {
      var opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      sel.appendChild(opt);
    });
    // Restore current selection if still valid.
    if (state.mode === 'group' && state.activeColumn && (data.groupColumns || []).indexOf(state.activeColumn) !== -1) {
      sel.value = state.activeColumn;
    } else {
      sel.value = '__all__';
    }
  }
```

- [ ] **Step 3: Call `populateViewSelect` on data load**

In `loadData()`'s `.withSuccessHandler(function (data) { … })` block, right after `state.data = data;`, add:
```js
        populateViewSelect(data);
```

The full `loadData` handler becomes:
```js
      .withSuccessHandler(function (data) {
        state.data = data;
        populateViewSelect(data);
        rebuildMarkers(data);
        render();
      })
```

- [ ] **Step 4: Wire the dropdown change handler**

At the bottom of the `<script>`, just before `loadData();`, add:

```js
  document.getElementById('viewSelect').addEventListener('change', function (ev) {
    var value = ev.target.value;
    if (value === '__all__') {
      state.mode = 'all';
      state.activeColumn = null;
    } else {
      state.mode = 'group';
      state.activeColumn = value;
    }
    state.focusedPin = null;
    state.cycleIndex = 0;
    render();
  });
```

- [ ] **Step 5: Rebuild and commit**

```bash
cd /d/prj/MapsInSheets && npm run build
cd /d/prj/MapsInSheets && git add src/Map.html dist/Map.html && git commit -m "feat(client): group-column dropdown selector in top bar"
```

> Manual verification cue: with `Group columns: Youth` configured, the dropdown shows `All` and `Youth`. Switching between them does not (yet) change pin appearance — confirmed in browser devtools that `state.mode` and `state.activeColumn` update.

---

## Task 7: Group-mode resting state — muting and sidebar rewrite

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html`

**Scope:** (a) extend `computePinVisual` to mute non-members in group mode; (b) hide the All-mode sidebar (legend + filters) in group mode and render the group-mode sidebar (column header + sub-group index with counts).

- [ ] **Step 1: Extend `computePinVisual` for group-mode resting state**

Replace the entire `computePinVisual` function with:

```js
  function computePinVisual(pin) {
    if (state.mode === 'all') {
      return { color: pin.color, opacity: 1, ringColor: null, ringWidth: 0, scale: 1, star: false };
    }
    // Group mode, resting (no focus yet) or default for non-focused.
    var hasData = pin.groupMembership && pin.groupMembership[state.activeColumn]
                  && pin.groupMembership[state.activeColumn].length > 0;
    if (!state.focusedPin) {
      return { color: pin.color, opacity: hasData ? 1 : 0.35, ringColor: null, ringWidth: 0, scale: 1, star: false };
    }
    // With focusedPin — Task 8 fills in the real highlight. For now fall through to muted.
    return { color: pin.color, opacity: hasData ? 1 : 0.35, ringColor: null, ringWidth: 0, scale: 1, star: false };
  }
```

- [ ] **Step 2: Split `renderSidebar` into two branches**

Replace the entire `renderSidebar()` function with:

```js
  function renderSidebar() {
    if (state.mode === 'group') renderGroupSidebar();
    else renderAllSidebar();
  }

  function renderAllSidebar() {
    var sb = document.getElementById('sidebar');
    sb.innerHTML = '';
    var data = state.data;

    var hLegend = document.createElement('h3'); hLegend.textContent = 'Legend'; sb.appendChild(hLegend);

    data.legend.entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'legend-row' + (state.hiddenLegendValues.has(e.value.toLowerCase()) ? ' hidden' : '');
      row.innerHTML =
        '<span class="legend-swatch" style="background:' + e.color + ';"></span>' +
        '<span>' + escapeHtml(e.value) + '</span>' +
        '<span class="legend-count">' + e.count + '</span>';
      row.addEventListener('click', function () {
        var k = e.value.toLowerCase();
        if (state.hiddenLegendValues.has(k)) state.hiddenLegendValues.delete(k);
        else state.hiddenLegendValues.add(k);
        render();
      });
      sb.appendChild(row);
    });
    if (data.legend.collapsed) {
      var note = document.createElement('div');
      note.style.fontSize = '11px'; note.style.color = '#999'; note.style.marginTop = '6px';
      note.textContent = 'Too many distinct values — showing top 19 + Other. Consider a column with fewer categories.';
      sb.appendChild(note);
    }

    if (data.filterColumns && data.filterColumns.length) {
      var hFilters = document.createElement('h3'); hFilters.textContent = 'Filters'; sb.appendChild(hFilters);
      data.filterColumns.forEach(function (col) {
        var label = document.createElement('div');
        label.style.fontSize = '12px'; label.style.color = '#666'; label.style.marginTop = '6px';
        label.textContent = col;
        sb.appendChild(label);

        var select = document.createElement('select');
        select.multiple = true;
        select.size = 4;
        select.style.width = '100%';
        select.style.marginBottom = '6px';

        var values = {};
        data.pins.forEach(function (p) {
          var v = p.filters && p.filters[col];
          var display = (v == null || String(v).trim() === '') ? '(blank)' : String(v).trim();
          var key = display === '(blank)' ? '' : display.toLowerCase();
          if (!(display in values)) values[display] = key;
        });
        Object.keys(values).sort().forEach(function (display) {
          var opt = document.createElement('option');
          opt.value = values[display];
          opt.textContent = display;
          select.appendChild(opt);
        });

        select.addEventListener('change', function () {
          var allowed = new Set();
          Array.from(select.selectedOptions).forEach(function (o) { allowed.add(o.value); });
          state.columnFilters[col] = allowed;
          render();
        });
        sb.appendChild(select);
      });
    }

    if (data.unmapped && data.unmapped.length) {
      appendUnmappedSection(sb, data.unmapped);
    }
  }

  function renderGroupSidebar() {
    var sb = document.getElementById('sidebar');
    sb.innerHTML = '';
    var data = state.data;
    var col = state.activeColumn;
    var idx = (data.groupIndex && data.groupIndex[col]) || { groups: {}, palette: {} };

    var hCol = document.createElement('h3'); hCol.textContent = col; sb.appendChild(hCol);

    // Focused sub-group callout (Task 8 will populate meaningful content here; for now show nothing when no focus).

    // Sub-group index.
    var subHeader = document.createElement('h3'); subHeader.textContent = 'Sub-groups'; sb.appendChild(subHeader);
    var keys = Object.keys(idx.groups);
    if (!keys.length) {
      var note = document.createElement('div');
      note.style.fontSize = '12px'; note.style.color = '#999';
      note.textContent = 'No sub-groups found in this column.';
      sb.appendChild(note);
    }
    keys.forEach(function (key) {
      var g = idx.groups[key];
      var row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML =
        '<span class="legend-swatch" style="background:' + (idx.palette[key] || '#9e9e9e') + ';"></span>' +
        '<span>' + escapeHtml(g.displayId) + '</span>' +
        '<span class="legend-count">' + g.members.length + (g.leaders.length ? ' (' + g.leaders.length + '★)' : '') + '</span>';
      // Click focuses this sub-group at its first member (Task 8 wires click-cycle for pins; here we
      // let the sidebar itself focus without needing a pin click, for discoverability).
      row.addEventListener('click', function () {
        if (!g.members.length) return;
        var first = g.members[0];
        var marker = markers.find(function (m) { return m._drivemap.rowNumber === first.rowNumber; });
        if (!marker) return;
        state.focusedPin = marker._drivemap;
        state.cycleIndex = state.focusedPin.groupMembership[col].findIndex(function (e) {
          return e.id.toLowerCase() === key;
        });
        if (state.cycleIndex < 0) state.cycleIndex = 0;
        render();
      });
      sb.appendChild(row);
    });

    if (data.unmapped && data.unmapped.length) {
      appendUnmappedSection(sb, data.unmapped);
    }

    if (data.warnings && data.warnings.length) {
      var hW = document.createElement('h3'); hW.textContent = 'Warnings'; sb.appendChild(hW);
      data.warnings.forEach(function (w) {
        var row = document.createElement('div');
        row.style.fontSize = '12px'; row.style.color = '#b00';
        row.textContent = w;
        sb.appendChild(row);
      });
    }
  }

  function appendUnmappedSection(sb, unmapped) {
    var hUn = document.createElement('h3');
    hUn.textContent = 'Unmapped (' + unmapped.length + ')';
    sb.appendChild(hUn);
    unmapped.forEach(function (u) {
      var row = document.createElement('div');
      row.className = 'unmapped-row';
      row.textContent = 'Row ' + u.rowNumber + ': ' + u.address;
      sb.appendChild(row);
    });
  }
```

- [ ] **Step 3: Rebuild and commit**

```bash
cd /d/prj/MapsInSheets && npm run build
cd /d/prj/MapsInSheets && git add src/Map.html dist/Map.html && git commit -m "feat(client): group-mode resting state — mute non-members, group sidebar"
```

> Manual verification cue: select `Youth` from the dropdown. Non-members fade to ~35% opacity; members keep Status colors. Sidebar shows `Youth` + `Sub-groups` list with counts. Click a sub-group row — the sidebar registers the click in dev tools (full behavior in Task 8).

---

## Task 8: Click-cycle state machine and highlight visuals

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html`

**Scope:** (a) finish `computePinVisual` to produce ring/scale/star for focused-group members and leaders; (b) update `makePinIcon` to render rings and star overlays; (c) add marker click handlers with cycle logic; (d) add empty-tile click to clear focus; (e) update the sidebar to show the focused sub-group callout.

- [ ] **Step 1: Full `computePinVisual`**

Replace the entire `computePinVisual` function with:

```js
  function computePinVisual(pin) {
    if (state.mode === 'all') {
      return { color: pin.color, opacity: 1, ringColor: null, ringWidth: 0, scale: 1, star: false };
    }
    var col = state.activeColumn;
    var hasData = pin.groupMembership && pin.groupMembership[col] && pin.groupMembership[col].length > 0;

    if (!state.focusedPin) {
      return { color: pin.color, opacity: hasData ? 1 : 0.35, ringColor: null, ringWidth: 0, scale: 1, star: false };
    }

    // With focus — compute the focused sub-group ID and check this pin.
    var focusedEntries = state.focusedPin.groupMembership[col] || [];
    if (!focusedEntries.length) {
      // Shouldn't happen (focused pin must have data in col), but handle gracefully.
      return { color: pin.color, opacity: hasData ? 1 : 0.35, ringColor: null, ringWidth: 0, scale: 1, star: false };
    }
    var safeCycle = ((state.cycleIndex % focusedEntries.length) + focusedEntries.length) % focusedEntries.length;
    var focusedId = focusedEntries[safeCycle].id.toLowerCase();

    var entry = (pin.groupMembership[col] || []).find(function (e) { return e.id.toLowerCase() === focusedId; });
    if (!entry) {
      return { color: pin.color, opacity: hasData ? 0.35 : 0.2, ringColor: null, ringWidth: 0, scale: 1, star: false };
    }

    var paletteForCol = (state.data.groupIndex && state.data.groupIndex[col] && state.data.groupIndex[col].palette) || {};
    var ringColor = paletteForCol[focusedId] || '#333';
    if (entry.isLeader) {
      return { color: pin.color, opacity: 1, ringColor: ringColor, ringWidth: 4, scale: 1.5, star: true };
    }
    return { color: pin.color, opacity: 1, ringColor: ringColor, ringWidth: 2, scale: 1, star: false };
  }
```

- [ ] **Step 2: Update `makePinIcon` to render rings and star**

Replace the entire `makePinIcon` function with:

```js
  function makePinIcon(visual) {
    var base = 18;
    var scaled = Math.round(base * visual.scale);
    var extra = visual.ringWidth || 0;
    var total = scaled + 2 * extra;

    var styles = [
      'width:' + scaled + 'px',
      'height:' + scaled + 'px',
      'background:' + visual.color,
    ];
    if (visual.ringColor) {
      styles.push('box-shadow:0 0 0 ' + visual.ringWidth + 'px ' + visual.ringColor + ', 0 1px 3px rgba(0,0,0,0.3)');
    }
    var pinHtml = '<div class="pin-circle" style="' + styles.join(';') + ';"></div>';
    var starHtml = visual.star
      ? '<div style="position:absolute;top:-4px;right:-4px;font-size:14px;line-height:1;text-shadow:0 0 2px white;">★</div>'
      : '';
    var wrapperHtml = '<div style="position:relative;width:' + total + 'px;height:' + total + 'px;opacity:' + visual.opacity + ';">'
                      + '<div style="position:absolute;left:' + extra + 'px;top:' + extra + 'px;">' + pinHtml + '</div>'
                      + starHtml
                    + '</div>';
    return L.divIcon({
      html: wrapperHtml,
      className: '',
      iconSize: [total, total],
      iconAnchor: [total / 2, total / 2],
    });
  }
```

- [ ] **Step 3: Add marker click handler with cycle logic**

In `rebuildMarkers`, find the marker creation block:
```js
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(computePinVisual(p)) });
      marker._drivemap = p;
      marker.bindPopup(buildInfoHtml(p), { maxWidth: 320 });
      markers.push(marker);
    });
```
Replace with:
```js
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(computePinVisual(p)) });
      marker._drivemap = p;
      marker.bindPopup(buildInfoHtml(p), { maxWidth: 320 });
      marker.on('click', function (ev) {
        handlePinClick(p);
      });
      markers.push(marker);
    });
```

Add this new function right before `rebuildMarkers`:

```js
  function handlePinClick(p) {
    if (state.mode === 'all') return; // default popup opens via Leaflet
    var col = state.activeColumn;
    var entries = (p.groupMembership && p.groupMembership[col]) || [];
    if (entries.length === 0) return; // non-member click: just show popup; no state change
    if (state.focusedPin === p) {
      state.cycleIndex = (state.cycleIndex + 1) % entries.length;
    } else {
      state.focusedPin = p;
      state.cycleIndex = 0;
    }
    render();
  }
```

- [ ] **Step 4: Empty-tile click clears focus**

At the bottom of the `<script>`, just before `loadData();`, add:

```js
  map.on('click', function (ev) {
    // Called when the click didn't hit a marker.
    if (state.mode === 'group' && state.focusedPin !== null) {
      state.focusedPin = null;
      state.cycleIndex = 0;
      render();
    }
  });
```

- [ ] **Step 5: Focused sub-group callout in the group sidebar**

In `renderGroupSidebar`, find the placeholder comment:
```js
    // Focused sub-group callout (Task 8 will populate meaningful content here; for now show nothing when no focus).
```
Replace with:

```js
    if (state.focusedPin) {
      var entries = state.focusedPin.groupMembership[col] || [];
      if (entries.length) {
        var safeCycle = ((state.cycleIndex % entries.length) + entries.length) % entries.length;
        var focusedId = entries[safeCycle].id;
        var focusedKey = focusedId.toLowerCase();
        var g = idx.groups[focusedKey];
        if (g) {
          var hFocus = document.createElement('h3'); hFocus.textContent = 'Focused'; sb.appendChild(hFocus);
          var row = document.createElement('div');
          row.className = 'legend-row';
          row.innerHTML =
            '<span class="legend-swatch" style="background:' + (idx.palette[focusedKey] || '#9e9e9e') + ';"></span>' +
            '<strong>' + escapeHtml(g.displayId) + '</strong>' +
            '<span class="legend-count">' + g.members.length + ' members' + (g.leaders.length ? ', ' + g.leaders.length + ' leader' + (g.leaders.length === 1 ? '' : 's') : '') + '</span>';
          sb.appendChild(row);
          if (entries.length > 1) {
            var hint = document.createElement('div');
            hint.style.fontSize = '11px'; hint.style.color = '#666'; hint.style.marginTop = '4px';
            hint.textContent = 'Click the same pin again to cycle (' + (safeCycle + 1) + ' of ' + entries.length + ').';
            sb.appendChild(hint);
          }
        }
      }
    }
```

- [ ] **Step 6: Rebuild and commit**

```bash
cd /d/prj/MapsInSheets && npm run build
cd /d/prj/MapsInSheets && git add src/Map.html dist/Map.html && git commit -m "feat(client): click-cycle state machine and highlight visuals (ring, leader, star)"
```

> Manual verification cue: select Youth; click a pin in Youth A. Members of A get sub-group-colored rings. Leaders get thick rings + larger size + a ★. Same-pin click advances cycle. Other-pin click resets to new pin's first group. Empty-tile click clears highlight.

---

## Task 9: Popup enhancements — custom labels, conditional hiding, group-mode member list

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html`

**Scope:** (a) honor `state.data.popupLabels` for label text; (b) omit rows whose value is empty; (c) in group mode with focus, append a sub-group header and compact member/leader list; (d) member-list item click re-focuses on that row.

- [ ] **Step 1: Replace `buildInfoHtml` with version that honors popupLabels, hides blanks, and adds group-mode list**

Replace the entire `buildInfoHtml` function with:

```js
  function buildInfoHtml(p) {
    var title = p.popup && p.popup.length ? p.popup[0].value : '';
    var rest = (p.popup || []).slice(1);
    var overrides = (state.data && state.data.popupLabels) || {};

    var parts = [];
    parts.push('<div class="info">');
    parts.push('<div class="title">' + escapeHtml(String(title || '')) + '</div>');
    parts.push('<div class="address">' + escapeHtml(p.address) + '</div>');
    rest.forEach(function (f) {
      var value = f.value;
      if (value == null || String(value).trim() === '') return; // conditional hiding
      var label = Object.prototype.hasOwnProperty.call(overrides, f.name) ? overrides[f.name] : f.name;
      parts.push('<div class="field"><span class="label">' + escapeHtml(label) + ':</span> ' + renderValue(value) + '</div>');
    });
    var dirUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.address);
    parts.push('<a class="dir" href="' + dirUrl + '" target="_blank" rel="noopener">Get Directions</a>');

    // Group-mode member list when a pin is focused and this popup is for the focused pin.
    if (state.mode === 'group' && state.focusedPin === p) {
      var col = state.activeColumn;
      var entries = (p.groupMembership && p.groupMembership[col]) || [];
      if (entries.length) {
        var safeCycle = ((state.cycleIndex % entries.length) + entries.length) % entries.length;
        var focusedId = entries[safeCycle].id;
        var focusedKey = focusedId.toLowerCase();
        var idx = state.data.groupIndex[col];
        var g = idx && idx.groups[focusedKey];
        if (g) {
          parts.push('<hr style="margin:10px 0;border:none;border-top:1px solid #e0e0e0;">');
          parts.push('<div style="font-size:13px;font-weight:600;margin-bottom:4px;">' +
            escapeHtml(col) + ': ' + escapeHtml(focusedId) +
            ' — ' + g.members.length + ' member' + (g.members.length === 1 ? '' : 's') +
            (g.leaders.length ? ', ' + g.leaders.length + ' leader' + (g.leaders.length === 1 ? '' : 's') : '') +
          '</div>');
          var MAX = 20;
          var show = g.members.slice(0, MAX);
          var more = g.members.length - show.length;
          show.forEach(function (m) {
            var isLeader = g.leaders.some(function (L) { return L.rowNumber === m.rowNumber; });
            parts.push('<div style="font-size:12px;padding:1px 0;">' +
              (isLeader ? '★ ' : '') +
              '<a href="#" data-row="' + m.rowNumber + '" class="member-link" style="color:#1a73e8;text-decoration:none;">' +
                escapeHtml(m.popupTitle || ('Row ' + m.rowNumber)) +
              '</a>' +
            '</div>');
          });
          if (more > 0) {
            parts.push('<div style="font-size:11px;color:#888;margin-top:2px;">…and ' + more + ' more.</div>');
          }
        }
      }
    }

    parts.push('</div>');
    return parts.join('');
  }
```

- [ ] **Step 2: Wire the member-link clicks after popup opens**

Leaflet's popup HTML doesn't re-bind event handlers for dynamically inserted `<a>` elements. Hook into the `popupopen` event on each marker.

In `rebuildMarkers`, find the marker creation block (with the click handler added in Task 8):
```js
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(computePinVisual(p)) });
      marker._drivemap = p;
      marker.bindPopup(buildInfoHtml(p), { maxWidth: 320 });
      marker.on('click', function (ev) {
        handlePinClick(p);
      });
      markers.push(marker);
    });
```
Replace with:
```js
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(computePinVisual(p)) });
      marker._drivemap = p;
      marker.bindPopup(buildInfoHtml(p), { maxWidth: 320 });
      marker.on('click', function (ev) {
        handlePinClick(p);
      });
      marker.on('popupopen', function (ev) {
        var container = ev.popup.getElement();
        if (!container) return;
        var links = container.querySelectorAll('a.member-link');
        links.forEach(function (link) {
          link.addEventListener('click', function (evt) {
            evt.preventDefault();
            var rowNumber = parseInt(link.getAttribute('data-row'), 10);
            jumpToRow(rowNumber);
          });
        });
      });
      markers.push(marker);
    });
```

- [ ] **Step 3: Add the `jumpToRow` helper**

Right before `rebuildMarkers`, add:

```js
  function jumpToRow(rowNumber) {
    var marker = markers.find(function (m) { return m._drivemap.rowNumber === rowNumber; });
    if (!marker) return;
    var p = marker._drivemap;
    var col = state.activeColumn;
    // Preserve current focused sub-group: find its position in the target's group list.
    var currentFocusedId = null;
    if (state.focusedPin) {
      var fe = state.focusedPin.groupMembership[col] || [];
      if (fe.length) {
        var safe = ((state.cycleIndex % fe.length) + fe.length) % fe.length;
        currentFocusedId = fe[safe].id.toLowerCase();
      }
    }
    state.focusedPin = p;
    var targetEntries = p.groupMembership[col] || [];
    var targetIdx = -1;
    if (currentFocusedId) {
      targetIdx = targetEntries.findIndex(function (e) { return e.id.toLowerCase() === currentFocusedId; });
    }
    state.cycleIndex = targetIdx >= 0 ? targetIdx : 0;
    marker.openPopup();
    render();
  }
```

- [ ] **Step 4: Refocus popup after render**

Because `render()` updates icons and can close popups, ensure the focused pin's popup stays open. In `render()`, after the for-loop that updates markers and before `renderSidebar()`, add:

Find:
```js
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var p = m._drivemap;
      if (!pinIsVisible(p)) continue;
      m.setIcon(makePinIcon(computePinVisual(p)));
      pinLayer.addLayer(m);
      visible++;
    }
    renderSidebar();
```
Replace with:
```js
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var p = m._drivemap;
      if (!pinIsVisible(p)) continue;
      m.setIcon(makePinIcon(computePinVisual(p)));
      // Rebuild the popup HTML so the member list and cycle hint stay in sync with state.
      m.setPopupContent(buildInfoHtml(p));
      pinLayer.addLayer(m);
      visible++;
    }
    renderSidebar();
    // If a pin is focused, ensure its popup is open to show the member list.
    if (state.focusedPin) {
      var fm = markers.find(function (mk) { return mk._drivemap === state.focusedPin; });
      if (fm) fm.openPopup();
    }
```

- [ ] **Step 5: Rebuild and commit**

```bash
cd /d/prj/MapsInSheets && npm run build
cd /d/prj/MapsInSheets && git add src/Map.html dist/Map.html && git commit -m "feat(client): popup-label overrides, conditional hiding, group-mode member list"
```

> Manual verification cue: configure `Popup labels: Phone → ☎ Mobile`. Click any pin → label line reads `☎ Mobile: (555) …`. Clear that row's Email in the sheet, refresh — Email row is omitted from the popup. In Youth mode, click a pin in Youth A — popup now shows `Youth: A — N members, K leaders` with a clickable list below. Click a name → map refocuses on that row, popup stays showing the list for the same sub-group.

---

## Task 10: Copyright attribution

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html`

- [ ] **Step 1: Extend Leaflet tile attribution**

In `src/Map.html`, find:
```js
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
```
Replace with:
```js
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | &copy; 2026 Mark Mackelprang',
    maxZoom: 19,
  }).addTo(map);
```

- [ ] **Step 2: Rebuild and commit**

```bash
cd /d/prj/MapsInSheets && npm run build
cd /d/prj/MapsInSheets && git add src/Map.html dist/Map.html && git commit -m "feat(client): add copyright line to Leaflet attribution"
```

---

## Task 11: Fix "Open in new tab" to use anchor instead of window.open

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Code.js`

- [ ] **Step 1: Replace `openNewTab` function body**

In `src/Code.js`, find the current `openNewTab` function and replace it with:

```js
function openNewTab() {
  const url = getWebAppUrl_();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert(
      'New-tab map not configured',
      'Deploy the Apps Script as a web app, then paste the /exec URL into the "Web app URL" row of the Map Settings tab.',
      ui.ButtonSet.OK
    );
    return;
  }
  const safeUrl = String(url).replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(
    '<div style="padding:16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<p style="margin:0 0 12px 0;">Click to open MapsInSheets in a new tab:</p>' +
      '<a href="' + safeUrl + '" target="_blank" rel="noopener" ' +
      'style="display:inline-block;padding:8px 16px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:4px;font-weight:500;">' +
      'Open in new tab &#8599;</a>' +
    '</div>'
  ).setWidth(360).setHeight(160);
  ui.showModalDialog(html, 'Open in new tab');
}
```

- [ ] **Step 2: Syntax-check**

Run:
```bash
cd /d/prj/MapsInSheets && node --check src/Code.js && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Rebuild and commit**

```bash
cd /d/prj/MapsInSheets && npm run build
cd /d/prj/MapsInSheets && git add src/Code.js dist/Code.gs && git commit -m "fix(apps-script): replace window.open with anchor link to dodge popup blockers"
```

---

## Task 12: Update SETUP.md, QUICKSTART.md, and README.md

**Files:**
- Modify: `D:/prj/MapsInSheets/SETUP.md`
- Modify: `D:/prj/MapsInSheets/QUICKSTART.md`
- Modify: `D:/prj/MapsInSheets/README.md`

- [ ] **Step 1: Update `SETUP.md` — add the two new Settings rows and a "Using group views" subsection**

In `SETUP.md`, find the existing configuration list that starts with `- **Data tab** —` under `## Configure the map`. After the bullet for `- **Filter columns** —`, insert two new bullets:

```markdown
- **Group columns** — optional, comma-separated header names (e.g.,
  `Youth, Committee, Small Group`). Each listed column is treated as a
  group column: its cells hold comma-separated group IDs with an optional
  `*` suffix marking a row as a leader of that group
  (e.g., `A, B, C*` = member of A and B, leader of C). Each configured
  group column becomes an entry in the map's `View:` dropdown.
- **Popup labels** — optional, comma-separated `Header → DisplayLabel`
  pairs (e.g., `Phone → ☎ Mobile, Email → ✉`). Overrides the label shown
  in the info window for that column. Both `→` and `->` are accepted.
```

Then, directly after the color-lookup block (just before the `## (Optional) Enable "Open in new tab"` heading), insert a new subsection:

```markdown
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
```

- [ ] **Step 2: Update `QUICKSTART.md` — sample data + UAT items + troubleshooting**

In `QUICKSTART.md`, find the sample-data table (the rows with Smith/Jones/Lee etc.). Replace it with a version that has an additional `Youth` column:

Find:
```markdown
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
```
Replace with:
```markdown
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
```

Find the `## 4 · Configure (~1 min)` section and update the fill-in instructions. Find:
```markdown
3. Fill in:
   - `Color column: Status`
   - `Popup columns: Name, Phone, Email, Status, Small Group`
   - `Filter columns: Status, Small Group`
```
Replace with:
```markdown
3. Fill in:
   - `Color column: Status`
   - `Popup columns: Name, Phone, Email, Status, Small Group`
   - `Popup labels: Phone → ☎ Mobile, Email → ✉`
   - `Filter columns: Status, Small Group`
   - `Group columns: Youth`
```

Find the `## 5 · UAT checklist` section. After the existing `### Caching` subsection (and before `### Privacy sanity`), insert a new subsection:

```markdown
### Group views

- [ ] The top bar shows a `View:` dropdown with `All` and `Youth`.
- [ ] In `All` (default), pins are colored by `Status` and the sidebar
      shows the legend + filter dropdowns.
- [ ] Switch to `Youth`. The Chen Family pin (no Youth entry) fades to
      ~35% opacity. All other pins keep their Status color. The sidebar
      shows `Youth` and a list of sub-groups (A, B) with member counts.
- [ ] Click the Smith Family pin (`Youth: A, B*`). Members of Youth A
      get a ring in the A color; Smith has a `Name` label in their popup.
      Smith is NOT a leader of A (first entry has no `*`).
- [ ] Click Smith again. Focus cycles to Youth B. Smith now has a
      **thicker ring, larger size, and a ★** (leader of B). Rivera
      (Youth A*) dims because they are not in B.
- [ ] Click Smith a third time. Cycle returns to Youth A.
- [ ] Click the Rivera Family pin. Focus resets to Rivera's first group
      (Youth A). Rivera shows the leader treatment (Rivera is `A*`).
- [ ] Click a blank patch of ocean on the map. Highlight clears; rings
      and star overlay disappear; focus leaves.
- [ ] Click Smith's popup member-list link for Jones Family. Map
      refocuses on Jones, same Youth A sub-group (since Jones has A),
      popup stays open showing the same member list.
- [ ] Info-window label for Phone reads `☎ Mobile` (from Popup labels).
- [ ] If a row has no Email cell value, the Email row is omitted from
      the popup entirely (no `Email: ` empty line).
```

Find the troubleshooting table at the bottom of `QUICKSTART.md`. Add a new row just before the final row:

Find:
```markdown
| Info window empty | `Popup columns` on Settings is blank — fill it in. |
```
Replace with:
```markdown
| Info window empty | `Popup columns` on Settings is blank — fill it in. |
| `View:` dropdown only shows `All` | `Group columns` is blank or its names don't match data-tab headers exactly. Check the left panel for a "Warnings" section listing missing columns. |
| Group ring doesn't appear on click | You clicked a pin that has no entry in the active group column. It's not a bug — non-members don't cycle. |
```

- [ ] **Step 3: Update `README.md` — feature bullets, UI diagram, design section**

In `README.md`, find the feature bullet list under `## What it does`:

```markdown
- **Colored pins** driven by any column you pick (e.g., `Status` →
  Active / Inactive / Visitor).
- **Info windows** with your chosen columns. Phone numbers become tap-to-call,
  emails become `mailto:` links, URLs become clickable, plus a one-click
  **Get Directions** button.
- **Legend** that doubles as a filter (click a color to hide that group).
- **Text search** and **per-column filter dropdowns** in the left panel.
- An **Unmapped** section listing rows whose addresses didn't geocode.
```
Replace with:
```markdown
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
```

Find the ASCII UI diagram:
```markdown
┌─────────────────────────────────────────────────────────┐
│  🔄 Refresh   🔍 Search…         Showing 843 of 912     │
├──────────────┬──────────────────────────────────────────┤
│  Legend      │                                          │
│  ● Active    │                 ● ●                      │
│  ● Inactive  │              ●           ●               │
│  ● Visitor   │              ● ●   ● ●                   │
│  ● Needs…    │                                          │
│              │       Leaflet + OpenStreetMap            │
│  Filters     │                                          │
│  Small Group │                                          │
│   ▾ All      │                                          │
│  Status      │                                          │
│   ▾ Active   │                                          │
│              │                                          │
│  Unmapped(3) │                                          │
└──────────────┴──────────────────────────────────────────┘
```
Replace with:
```markdown
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

Find the `## Design at a glance` section. After the `- **Config:**` bullet, insert a new bullet:

```markdown
- **Group columns:** optional extra columns whose cells contain CSV group
  IDs (with `*` leader suffix). Each configured group column becomes a
  selectable view that mutes non-members and reveals sub-groups by
  clicking member pins. Colors for sub-groups are auto-assigned from the
  same palette used elsewhere; assignment is stable across sessions.
```

- [ ] **Step 4: Commit**

```bash
cd /d/prj/MapsInSheets && git add SETUP.md QUICKSTART.md README.md && git commit -m "docs: document group views, popup labels, conditional hiding, and related UAT steps"
```

---

## Task 13: Final smoke test and push

**Files:** none new; verifies end-to-end state and pushes.

- [ ] **Step 1: Run full test suite**

Run:
```bash
cd /d/prj/MapsInSheets && npx vitest run
```
Expected: 29 (existing) + 17 (groups) + 8 (popup-labels) = 54 tests pass.

- [ ] **Step 2: Clean rebuild of dist**

Run:
```bash
cd /d/prj/MapsInSheets && npm run build
```
Expected: 10 files in `dist/` — `Code.gs`, `Map.html`, `appsscript.json`, `lib_cache.gs`, `lib_colors.gs`, `lib_columns.gs`, `lib_groups.gs`, `lib_legend.gs`, `lib_popup_labels.gs`, `lib_smart_links.gs`.

- [ ] **Step 3: Verify no module-footer or require leaks**

Run:
```bash
cd /d/prj/MapsInSheets && grep -l "typeof module" dist/ 2>/dev/null && echo "LEAK" || echo "OK footers stripped"
cd /d/prj/MapsInSheets && grep -rl "= require(" dist/ 2>/dev/null && echo "LEAK" || echo "OK requires stripped"
```
Expected: both `OK …`.

- [ ] **Step 4: Syntax-check all dist .gs files via stdin**

Node 22 doesn't accept `.gs` as an extension to `--check`. Work around by piping:
```bash
cd /d/prj/MapsInSheets && for f in dist/Code.gs dist/lib_*.gs; do node --input-type=commonjs --check < "$f" || echo "SYNTAX ERROR IN $f"; done; echo "done"
```
Expected: `done` with no `SYNTAX ERROR` lines above.

- [ ] **Step 5: Stage any missed dist changes and commit**

Run:
```bash
cd /d/prj/MapsInSheets && git status --short
```
If anything in `dist/` is modified but uncommitted, run:
```bash
cd /d/prj/MapsInSheets && git add dist/ && git commit -m "chore: final dist rebuild"
```
Otherwise skip.

- [ ] **Step 6: Push**

```bash
cd /d/prj/MapsInSheets && git push origin main 2>&1 | tail -3
```
Expected: a line like `main -> main`.

- [ ] **Step 7: Post-deploy manual verification in a live sheet**

Copy `dist/Code.gs` (overwrites existing), `dist/Map.html`, `dist/appsscript.json`, `dist/lib_cache.gs`, `dist/lib_colors.gs`, `dist/lib_columns.gs`, `dist/lib_groups.gs` (new), `dist/lib_legend.gs`, `dist/lib_popup_labels.gs` (new), `dist/lib_smart_links.gs` into the Apps Script project. Add a `Youth` column to the sheet with sample CSV values. Walk through the `QUICKSTART.md` UAT checklist; focus on the new "Group views" subsection.

---

## Self-review notes

**Spec coverage:**

- §`parseGroupCell` contract — Task 1.
- §`buildGroupIndex` contract — Task 1.
- §Settings tab additions (`Popup labels`, `Group columns`) — Task 3 step 1.
- §`readSettings_` new-key parsing — Task 3 step 2 (keys land in `kv`; no new code needed — readSettings_ is generic).
- §`readRows_` group-cell surfacing + missing-column warnings — Task 3 step 2.
- §`getMapData` enriched payload (groupColumns, groupIndex, popupLabels, warnings, per-pin groupMembership) — Task 3 step 3.
- §Client state shape — Task 4 step 1.
- §`computePinVisual` table — Task 4 (all-mode baseline), Task 7 (muting), Task 8 (ring/scale/star).
- §Render flow — Task 4 step 1 + Task 9 step 4 (popup refresh).
- §Click-cycle state machine — Task 8 steps 3, 4.
- §Popup content rules (All, group-mode, popup-label overrides, conditional hiding, member list, jump-to-member) — Task 9.
- §Sidebar content rules (All vs. group) — Task 7 step 2 (group sidebar), Task 8 step 5 (focused callout).
- §"Open in new tab" fix — Task 11.
- §Copyright attribution — Task 10.
- §Clustering removal — Task 5.
- §Initial zoom to all pins — preserved in Task 4 `rebuildMarkers`; confirmed not re-fitting on dropdown change (only `rebuildMarkers` fits bounds, and it runs only on `loadData`).
- §Tests — Tasks 1 and 2.
- §Manual verification (UAT) — Task 12 QUICKSTART update plus Task 13 step 7.
- §Migration — no code change needed; documented in SETUP.md "Group views" subsection (users without group columns simply see only `All`).
- §Docs updates — Task 12.

**Placeholder scan:** no `TBD`/`TODO`/`implement later`/etc. in task bodies.

**Type consistency:**

- `parseGroupCell` signature: `(value) → [{id, isLeader}]` — used consistently in Task 1, Task 3 (Code.js getMapData), and the client (which reads the parsed result from the payload's `groupMembership`, never calls `parseGroupCell` itself).
- `buildGroupIndex(rows, groupColumns) → { [col]: { groups: { [keyLower]: { displayId, members, leaders } }, palette: { [keyLower]: '#hex' } } }` — server consumes in `getMapData`; client reads `state.data.groupIndex[col].groups[keyLower]` in Tasks 7, 8, 9 consistently.
- `computePinVisual` return shape `{ color, opacity, ringColor, ringWidth, scale, star }` — produced in Tasks 4, 7, 8; consumed by `makePinIcon` in Tasks 4, 8.
- `state` object shape — declared in Task 4, extended via field-assign in Tasks 6 (`mode`, `activeColumn`), 8 (`focusedPin`, `cycleIndex` — actually already present from Task 4's initial declaration; Task 8 just writes to them).
- `groupMembership` field per pin — set by server in Task 3 (`row.groupMembership[col] = parseGroupCell(...)`), read by client in Tasks 7, 8, 9.
- `warnings` field — set by server in Task 3, read by client in Task 7 step 2 (`renderGroupSidebar`).
- `popupLabels` field — set by server in Task 3, read by client in Task 9 step 1.
- `jumpToRow(rowNumber)` — defined in Task 9 step 3; referenced by member-link click handler in Task 9 step 2.
- `handlePinClick(p)` — defined in Task 8 step 3; called from marker click handler in Task 8 step 3 and (unchanged) in Task 9 step 2.

All function names consistent across tasks. No orphaned references.
