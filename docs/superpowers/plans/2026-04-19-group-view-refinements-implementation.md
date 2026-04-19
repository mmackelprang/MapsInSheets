# Group-View Refinements & Template Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four UX refinements to the group-view mode (pin color carries sub-group identity, stronger non-member muting, scrollable popup member list with leaders sorted to top, zoom-to-selection button) and a distribution path that lets end-users one-click copy a maintainer-hosted template sheet.

**Architecture:** The most branching piece of UI logic — computing a pin's visual treatment in group mode — is extracted into a new Node-testable lib module (`pin-visuals.js`) and mirrored into `Map.html` following the project's existing mirror pattern (e.g. `smart-links.js`). The remaining changes (popup leader-sort + scroll container, fit button + handler) are small enough to live inline in `Map.html` without a library counterpart. Distribution is a docs-only track: new `MAINTAINER.md` for the clasp workflow, fleshed-out `template-sheet-link.md` for the publish workflow, and a "Quick install" section at the top of `README.md` pointing at the template.

**Tech Stack:** JavaScript (ES2019 — Apps Script V8 baseline), Vitest, Leaflet 1.9, OpenStreetMap tiles, Google Apps Script runtime, `@google/clasp` for script push.

**Spec:** `docs/superpowers/specs/2026-04-19-group-view-refinements-design.md`

---

## Conventions and setup

- **Working directory:** `D:/prj/MapsInSheets`. Shell: Git Bash (Windows). Forward slashes in bash commands.
- **Existing commits on `main` before this plan starts:** many; HEAD is the spec commit `2d54898`. Each task below adds one commit.
- **Test files use ESM `import` syntax** (vitest with Vite transforms this even though `package.json` has `"type": "commonjs"`). Match the pattern of `tests/groups.test.js` etc.
- **Library source files use CJS footer** for dual-environment compatibility:
  ```js
  if (typeof module !== 'undefined') {
    module.exports = { /* … */ };
  }
  ```
  Apps Script V8 has no `module` global so the block is inert there. Node tests pick up the exports.
- **No top-level `import` or `export` statements in source files.**
- **Client-side mirroring:** `Map.html` is a static template. It cannot `require` lib modules at runtime. The project's pattern (see the "Smart-link detection (mirrors src/lib/smart-links.js)" section in `Map.html`) is: implement the logic once in `src/lib/<x>.js` with Node tests, then **mirror** the same logic inline in `Map.html` with a header comment pointing at the lib module. Manual sync — tolerated because the Apps Script runtime has no module system for HTML templates.
- **Build:** `npm run build` regenerates `dist/`. The build script strips the CJS footer and any top-level `const/let/var … = require('./xxx.js')` line, and renames `src/lib/pin-visuals.js` to `dist/lib_pin_visuals.gs` (non-alphanumerics → `_`).
- **Dist is committed to the repo.** Every task that changes source code also rebuilds `dist/` and commits both.
- **Full test command:** `npx vitest run`. Single file: `npx vitest run tests/<file>.test.js`.
- **Existing test count (baseline):** 29.
- **Apps Script V8 scoping gotcha:** top-level `const`/`let` in a `.gs` file is **file-scoped**, not global across files. Only `function` declarations and top-level `var` cross files. The new `pin-visuals.js` module exposes only function symbols, so this does not bite.

---

## File structure

```
D:/prj/MapsInSheets/
├── src/
│   ├── appsscript.json                 # unchanged
│   ├── Code.js                         # unchanged
│   ├── Map.html                        # MODIFY — computePinVisual, makePinIcon, buildInfoHtml, fit button, fitToSelection
│   └── lib/
│       ├── cache.js                    # unchanged
│       ├── colors.js                   # unchanged
│       ├── columns.js                  # unchanged
│       ├── groups.js                   # unchanged
│       ├── legend.js                   # unchanged
│       ├── pin-visuals.js              # NEW — computeGroupPinVisual
│       ├── popup-labels.js             # unchanged
│       └── smart-links.js              # unchanged
├── tests/
│   ├── … existing 7 files …
│   └── pin-visuals.test.js             # NEW
├── dist/                               # regenerated from src/ each task
├── docs/
│   ├── MAINTAINER.md                   # NEW — clasp workflow
│   └── superpowers/
│       ├── specs/2026-04-19-group-view-refinements-design.md
│       └── plans/2026-04-19-group-view-refinements-implementation.md   ← this file
├── README.md                           # MODIFY — add "Quick install (recommended)" section
├── QUICKSTART.md                       # MODIFY — add UAT items
└── template-sheet-link.md              # MODIFY — publish workflow
```

**Why this split:**
- `pin-visuals.js` is the only chunk of group-view logic with enough branching to warrant pure-module testing (one table with four cases × cycle-index math).
- The popup leader-sort is three lines and the selection-set computation for the fit button is five lines each — not worth the mirror-burden; they stay inline in `Map.html`.
- `docs/MAINTAINER.md` is new because the existing docs (`SETUP.md`, `QUICKSTART.md`) are end-user facing. Maintainer workflow is separate concern.

---

## Task 1: `pin-visuals.js` module — `computeGroupPinVisual`

**Files:**
- Create: `D:/prj/MapsInSheets/src/lib/pin-visuals.js`
- Create: `D:/prj/MapsInSheets/tests/pin-visuals.test.js`

**Contract:**

`computeGroupPinVisual(pin, context)` → `{ color, opacity, scale, star, heroOutline }`

Inputs:
- `pin`: `{ groupMembership: { [column]: [{ id, isLeader }, …] }, … }` (the pin object from `state.data.pins`; other fields ignored).
- `context`: `{ activeColumn, focusedPin, cycleIndex, palette }`
  - `palette`: `{ [idLowercase]: '#rrggbb' }` — the palette for the active column.
  - `focusedPin`: another pin object, or `null`.

Rules (matching the spec's table):

| Condition | Output color / opacity | Scale / star / heroOutline |
|---|---|---|
| `pin.groupMembership[activeColumn]` is empty or absent | `MUTED_COLOR`, `MUTED_OPACITY` | 1 / false / false |
| `focusedPin` is null → active entry is the pin's first membership | `palette[id]`, 1 | 1.5 if leader else 1 / leader / false |
| `focusedPin` is this pin | active entry is pin's membership at `cycleIndex % length` | `palette[id]`, 1 | 1.5 if leader else 1 / leader / `true` |
| `focusedPin` is a different pin that has memberships in the active column, and this pin is a member of the focused sub-group | `palette[id]`, 1 | 1.5 if leader else 1 / leader / false |
| `focusedPin` is a different pin, and this pin is *not* a member of the focused sub-group (though it has other memberships) | `MUTED_COLOR`, `MUTED_OPACITY` | 1 / false / false |

Edge cases:
- Cycle index is normalised via `((i % n) + n) % n` so negative and overflow values are safe.
- `focusedPin` set but focused pin has no memberships in `activeColumn` (degenerate state): treat as `focusedPin: null` — active entry = this pin's first membership.
- `palette` missing the active id (shouldn't happen given `buildGroupIndex` populates all seen ids): fall back to `MUTED_COLOR`.

Constants exported:
- `MUTED_COLOR = '#9e9e9e'`
- `MUTED_OPACITY = 0.15`
- `LEADER_SCALE = 1.5`

- [ ] **Step 1: Write the failing tests**

Create `D:/prj/MapsInSheets/tests/pin-visuals.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  computeGroupPinVisual,
  MUTED_COLOR,
  MUTED_OPACITY,
  LEADER_SCALE,
} from '../src/lib/pin-visuals.js';

function pin(memberships) {
  // memberships: { [column]: [{id, isLeader}, ...] } | null for empty
  return { groupMembership: memberships || {} };
}

const COL = 'Youth';
const PALETTE = {
  a: '#ff0000',
  b: '#00ff00',
  c: '#0000ff',
};

describe('computeGroupPinVisual', () => {
  it('returns muted for pins with no memberships in the active column', () => {
    const p = pin({});
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v).toEqual({
      color: MUTED_COLOR, opacity: MUTED_OPACITY,
      scale: 1, star: false, heroOutline: false,
    });
  });

  it('returns muted for pins with memberships in a different column', () => {
    const p = pin({ 'Committee': [{ id: 'X', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe(MUTED_COLOR);
    expect(v.opacity).toBe(MUTED_OPACITY);
  });

  it('no focus: colors by first membership in cell order', () => {
    const p = pin({ [COL]: [{ id: 'B', isLeader: false }, { id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#00ff00'); // B
    expect(v.opacity).toBe(1);
    expect(v.scale).toBe(1);
    expect(v.star).toBe(false);
    expect(v.heroOutline).toBe(false);
  });

  it('no focus: leader flag drives star and scale', () => {
    const p = pin({ [COL]: [{ id: 'A', isLeader: true }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000');
    expect(v.star).toBe(true);
    expect(v.scale).toBe(LEADER_SCALE);
    expect(v.heroOutline).toBe(false);
  });

  it('focused on self, single membership: heroOutline true', () => {
    const p = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: p, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000');
    expect(v.heroOutline).toBe(true);
    expect(v.star).toBe(false);
  });

  it('focused on self, multiple memberships: cycleIndex picks active sub-group', () => {
    const p = pin({ [COL]: [
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: true },
      { id: 'C', isLeader: false },
    ] });
    const v0 = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 0, palette: PALETTE });
    expect(v0.color).toBe('#ff0000'); // A
    const v1 = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 1, palette: PALETTE });
    expect(v1.color).toBe('#00ff00'); // B
    expect(v1.star).toBe(true);
    expect(v1.scale).toBe(LEADER_SCALE);
    const v2 = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 2, palette: PALETTE });
    expect(v2.color).toBe('#0000ff'); // C
  });

  it('cycleIndex wraps safely for negative and overflow values', () => {
    const p = pin({ [COL]: [{ id: 'A', isLeader: false }, { id: 'B', isLeader: false }] });
    const vNeg = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: -1, palette: PALETTE });
    expect(vNeg.color).toBe('#00ff00'); // B
    const vBig = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 5, palette: PALETTE });
    expect(vBig.color).toBe('#00ff00'); // index 5 % 2 = 1 → B
  });

  it('focused on other pin: this pin is member of focused sub-group → colored, no hero', () => {
    const focused = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const other   = pin({ [COL]: [{ id: 'A', isLeader: true }, { id: 'B', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000'); // A
    expect(v.opacity).toBe(1);
    expect(v.star).toBe(true); // other is leader of A
    expect(v.scale).toBe(LEADER_SCALE);
    expect(v.heroOutline).toBe(false);
  });

  it('focused on other pin: this pin has memberships but not in focused sub-group → muted', () => {
    const focused = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const other   = pin({ [COL]: [{ id: 'B', isLeader: false }, { id: 'C', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe(MUTED_COLOR);
    expect(v.opacity).toBe(MUTED_OPACITY);
  });

  it('id matching is case-insensitive', () => {
    const focused = pin({ [COL]: [{ id: 'a', isLeader: false }] });
    const other   = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000');
  });

  it('degenerate: focused pin has no memberships in the active column → falls back to no-focus behavior', () => {
    const focused = pin({}); // no memberships
    const other   = pin({ [COL]: [{ id: 'B', isLeader: false }, { id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#00ff00'); // first membership = B
    expect(v.heroOutline).toBe(false);
  });

  it('palette missing active id: falls back to MUTED_COLOR', () => {
    const p = pin({ [COL]: [{ id: 'Z', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe(MUTED_COLOR);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pin-visuals.test.js`

Expected: FAIL with `Cannot find module '../src/lib/pin-visuals.js'` (or similar).

- [ ] **Step 3: Implement the module**

Create `D:/prj/MapsInSheets/src/lib/pin-visuals.js`:

```js
// Pure-logic module for computing a pin's visual treatment in group view mode.
// The `all` mode visual (pin.color, opacity 1) is trivial and stays inline in
// Map.html.

var MUTED_COLOR = '#9e9e9e';
var MUTED_OPACITY = 0.15;
var LEADER_SCALE = 1.5;

function computeGroupPinVisual(pin, context) {
  // context = { activeColumn, focusedPin, cycleIndex, palette }
  var col = context.activeColumn;
  var memberships = (pin.groupMembership && pin.groupMembership[col]) || [];

  if (memberships.length === 0) {
    return muted();
  }

  var activeEntry = null;
  var isHero = false;

  if (context.focusedPin) {
    var focusedEntries =
      (context.focusedPin.groupMembership && context.focusedPin.groupMembership[col]) || [];
    if (focusedEntries.length === 0) {
      activeEntry = memberships[0];
    } else {
      var n = focusedEntries.length;
      var safeCycle = ((context.cycleIndex % n) + n) % n;
      var focusedId = focusedEntries[safeCycle].id.toLowerCase();
      activeEntry = memberships.find(function (e) {
        return e.id.toLowerCase() === focusedId;
      });
      if (!activeEntry) {
        return muted();
      }
      isHero = (context.focusedPin === pin);
    }
  } else {
    activeEntry = memberships[0];
  }

  var color = context.palette[activeEntry.id.toLowerCase()];
  if (!color) {
    return muted();
  }

  return {
    color: color,
    opacity: 1,
    scale: activeEntry.isLeader ? LEADER_SCALE : 1,
    star: !!activeEntry.isLeader,
    heroOutline: isHero,
  };
}

function muted() {
  return {
    color: MUTED_COLOR,
    opacity: MUTED_OPACITY,
    scale: 1,
    star: false,
    heroOutline: false,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    computeGroupPinVisual: computeGroupPinVisual,
    MUTED_COLOR: MUTED_COLOR,
    MUTED_OPACITY: MUTED_OPACITY,
    LEADER_SCALE: LEADER_SCALE,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pin-visuals.test.js`

Expected: 12 tests passing.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`

Expected: 41 tests passing (29 existing + 12 new).

- [ ] **Step 6: Rebuild dist/**

Run: `npm run build`

Expected output ends with `Done.` and `dist/lib_pin_visuals.gs` exists.

- [ ] **Step 7: Commit**

```bash
git -C D:/prj/MapsInSheets add src/lib/pin-visuals.js tests/pin-visuals.test.js dist/
git -C D:/prj/MapsInSheets commit -m "feat(lib): add pin-visuals module for group-mode pin coloring

Pure-logic helper that encodes the 'active sub-group per pin' table from
the 2026-04-19 spec. Used by Map.html's computePinVisual via mirror."
```

---

## Task 2: Wire `pin-visuals` into `Map.html`; remove ring; add hero outline

Covers spec features 1 and 2. The logic from `computeGroupPinVisual` in the new lib module is mirrored inline into `Map.html`, the existing `computePinVisual` is rewritten to call the mirror for group mode, and `makePinIcon` is updated to drop the ring branch and render a hero outline when asked.

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html:114-176` (rewrite `computePinVisual`, rewrite `makePinIcon`)

**No test file** — these are DOM-producing functions. Logic is tested via the lib module.

- [ ] **Step 1: Replace `computePinVisual` in `src/Map.html`**

Delete the current block from line 114 (the `// ---------- Pin visual computation ----------` header comment) through line 146 (closing `}` of `computePinVisual`) and replace with the below. The mirror comment points at the lib module. If you change the logic here, also update `src/lib/pin-visuals.js` and its tests.

```js
  // ---------- Pin visual computation ----------
  // Mirrors src/lib/pin-visuals.js (tests live under tests/pin-visuals.test.js).
  // Keep the two in sync.
  var MUTED_COLOR = '#9e9e9e';
  var MUTED_OPACITY = 0.15;
  var LEADER_SCALE = 1.5;

  function computePinVisual(pin) {
    if (state.mode === 'all') {
      return { color: pin.color, opacity: 1, scale: 1, star: false, heroOutline: false };
    }
    return computeGroupPinVisual(pin, {
      activeColumn: state.activeColumn,
      focusedPin: state.focusedPin,
      cycleIndex: state.cycleIndex,
      palette: (state.data.groupIndex &&
                state.data.groupIndex[state.activeColumn] &&
                state.data.groupIndex[state.activeColumn].palette) || {},
    });
  }

  function computeGroupPinVisual(pin, context) {
    var col = context.activeColumn;
    var memberships = (pin.groupMembership && pin.groupMembership[col]) || [];
    if (memberships.length === 0) return mutedVisual();

    var activeEntry = null;
    var isHero = false;

    if (context.focusedPin) {
      var focusedEntries =
        (context.focusedPin.groupMembership && context.focusedPin.groupMembership[col]) || [];
      if (focusedEntries.length === 0) {
        activeEntry = memberships[0];
      } else {
        var n = focusedEntries.length;
        var safeCycle = ((context.cycleIndex % n) + n) % n;
        var focusedId = focusedEntries[safeCycle].id.toLowerCase();
        activeEntry = memberships.find(function (e) { return e.id.toLowerCase() === focusedId; });
        if (!activeEntry) return mutedVisual();
        isHero = (context.focusedPin === pin);
      }
    } else {
      activeEntry = memberships[0];
    }

    var color = context.palette[activeEntry.id.toLowerCase()];
    if (!color) return mutedVisual();
    return {
      color: color,
      opacity: 1,
      scale: activeEntry.isLeader ? LEADER_SCALE : 1,
      star: !!activeEntry.isLeader,
      heroOutline: isHero,
    };
  }

  function mutedVisual() {
    return { color: MUTED_COLOR, opacity: MUTED_OPACITY, scale: 1, star: false, heroOutline: false };
  }
```

- [ ] **Step 2: Replace `makePinIcon` in `src/Map.html`**

Delete the current `makePinIcon` function (starting at line 148 `function makePinIcon(visual) {` through the closing `}` at line 176) and replace with:

```js
  function makePinIcon(visual) {
    var base = 18;
    var scaled = Math.round(base * visual.scale);
    var extra = visual.heroOutline ? 2 : 0;
    var total = scaled + 2 * extra;

    var shadow = visual.heroOutline
      ? 'box-shadow:0 0 0 2px #333, 0 1px 3px rgba(0,0,0,0.3)'
      : null;

    var styles = [
      'width:' + scaled + 'px',
      'height:' + scaled + 'px',
      'background:' + visual.color,
    ];
    if (shadow) styles.push(shadow);

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

The changes vs. the old `makePinIcon`:
- `extra` is derived from `heroOutline` (was: `ringWidth`).
- The shadow branch uses a fixed 2px dark outline; the user-facing `ringColor`/`ringWidth` parameters are gone.

- [ ] **Step 3: Rebuild dist/**

Run: `npm run build`

Expected: `dist/Map.html` now reflects the new functions.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`

Expected: still 41 passing (Map.html is not under test — this is a sanity check that we didn't break an import).

- [ ] **Step 5: Manual verification in the live sheet**

Run through the pre-existing `QUICKSTART.md §5 "Group views"` checklist using a fresh paste of `dist/` into your test sheet (or, if you have already set up clasp from Task 6+, `clasp push`). Confirm:

- Switch to a group view. All pins recolor to their first sub-group's palette color in sheet-cell order. Rows with no memberships in that column go dim gray (opacity ~0.15).
- Click a single-membership pin. The clicked pin gets a thin dark outline (the hero outline); every other pin in that sub-group retains its color at full opacity; all other pins dim gray.
- Click a multi-membership pin twice. On second click, the whole-map palette shifts to reflect the new active sub-group.
- No pins show a colored ring any more — the ring should be completely absent.

- [ ] **Step 6: Commit**

```bash
git -C D:/prj/MapsInSheets add src/Map.html dist/
git -C D:/prj/MapsInSheets commit -m "feat(client): pin color carries sub-group identity in group view

Rewrites Map.html's computePinVisual to delegate group-mode coloring to
the mirrored computeGroupPinVisual helper. Drops the colored-ring branch
in makePinIcon in favor of a thin dark hero outline on the clicked pin.
Non-members render at #9e9e9e / opacity 0.15."
```

---

## Task 3: Scrollable popup member list with leaders sorted to top

Covers spec feature 3.

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html:198-231` (the member-list branch inside `buildInfoHtml`)

- [ ] **Step 1: Replace the member-list block in `buildInfoHtml`**

In `src/Map.html`, locate the block that starts with `// Group-mode member list when a pin is focused…` (around line 198). The full existing block is:

```js
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
```

Replace that entire block with:

```js
    // Group-mode member list when a pin is focused and this popup is for the focused pin.
    // Leaders sorted to top; full list wrapped in a scroll container (~6 rows visible).
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

          // Partition members into leaders + non-leaders, preserve source order within each.
          var leaderRowNumbers = {};
          g.leaders.forEach(function (L) { leaderRowNumbers[L.rowNumber] = true; });
          var leaders = [];
          var nonLeaders = [];
          g.members.forEach(function (m) {
            if (leaderRowNumbers[m.rowNumber]) leaders.push(m);
            else nonLeaders.push(m);
          });
          var ordered = leaders.concat(nonLeaders);

          parts.push('<div style="max-height:126px;overflow-y:auto;">');
          ordered.forEach(function (m) {
            var isLeader = !!leaderRowNumbers[m.rowNumber];
            parts.push('<div style="font-size:12px;padding:1px 0;">' +
              (isLeader ? '★ ' : '') +
              '<a href="#" data-row="' + m.rowNumber + '" class="member-link" style="color:#1a73e8;text-decoration:none;">' +
                escapeHtml(m.popupTitle || ('Row ' + m.rowNumber)) +
              '</a>' +
            '</div>');
          });
          parts.push('</div>');
        }
      }
    }
```

Key changes vs. the original:
- Replaced `show = g.members.slice(0, MAX)` with partition-by-leader, concat.
- Removed the `more`/`…and N more` block entirely.
- Wrapped the list in `<div style="max-height:126px;overflow-y:auto;">`.
- The header `<div>` remains outside the scroll container.

- [ ] **Step 2: Rebuild dist/**

Run: `npm run build`

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`

Expected: 41 passing.

- [ ] **Step 4: Manual verification**

In the live sheet with a Youth-style column that has at least one sub-group with >6 members and at least one leader:

- Click a pin in a large sub-group. The popup opens.
- The member list is scrollable within a ~126px region; you can scroll to see members beyond the first six.
- Leaders appear at the top of the list with the `★` prefix, in their source order; non-leaders follow, in their source order.
- No "…and N more" line appears.
- Click a `member-link` — map refocuses on that pin (existing `jumpToRow` behaviour unchanged).

- [ ] **Step 5: Commit**

```bash
git -C D:/prj/MapsInSheets add src/Map.html dist/
git -C D:/prj/MapsInSheets commit -m "feat(client): scrollable popup member list with leaders sorted to top

Replaces the 20-item truncation with a fixed-height (126px) scroll
container. Members are partitioned into leaders and non-leaders before
rendering, preserving source order within each segment."
```

---

## Task 4: `🎯 Fit` button and `fitToSelection` handler

Covers spec feature 4.

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html:39-46` (the `#topbar` block — add the button)
- Modify: `D:/prj/MapsInSheets/src/Map.html` (add `fitToSelection` function; add click handler wiring near the other handlers at the bottom of the `<script>`)

- [ ] **Step 1: Add the button to the top bar**

In the `<div id="topbar">` block, immediately after the `<select id="viewSelect">` line, insert the new button. The new top bar looks like:

```html
  <div id="topbar">
    <button id="refreshBtn">🔄 Refresh</button>
    <label style="font-size:13px;color:#666;">View:</label>
    <select id="viewSelect" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;"></select>
    <button id="fitBtn" title="Zoom to selection">🎯 Fit</button>
    <input id="searchBox" type="search" placeholder="Search…">
    <span id="status">Loading…</span>
  </div>
```

- [ ] **Step 2: Add `fitToSelection` function**

Immediately before the `// ---------- Data fetch ----------` section (around line 571), add:

```js
  // ---------- Fit-to-selection ----------
  function fitToSelection() {
    if (!state.data) return;
    var selected = [];
    if (state.mode === 'all') {
      // All visible pins (post-search / legend / column filters).
      for (var i = 0; i < markers.length; i++) {
        if (pinIsVisible(markers[i]._drivemap)) selected.push(markers[i]);
      }
    } else if (state.mode === 'group' && state.focusedPin) {
      // All pins in the focused sub-group — ignore other filters.
      var col = state.activeColumn;
      var focusedEntries = state.focusedPin.groupMembership[col] || [];
      if (!focusedEntries.length) return;
      var n = focusedEntries.length;
      var safeCycle = ((state.cycleIndex % n) + n) % n;
      var focusedKey = focusedEntries[safeCycle].id.toLowerCase();
      for (var j = 0; j < markers.length; j++) {
        var p = markers[j]._drivemap;
        var entries = (p.groupMembership && p.groupMembership[col]) || [];
        var isMember = entries.some(function (e) { return e.id.toLowerCase() === focusedKey; });
        if (isMember) selected.push(markers[j]);
      }
    } else {
      // Group mode without focus: visible pins with ≥1 membership in active column.
      var col2 = state.activeColumn;
      for (var k = 0; k < markers.length; k++) {
        var p2 = markers[k]._drivemap;
        if (!pinIsVisible(p2)) continue;
        var entries2 = (p2.groupMembership && p2.groupMembership[col2]) || [];
        if (entries2.length > 0) selected.push(markers[k]);
      }
    }

    if (selected.length === 0) return; // silent no-op
    if (selected.length === 1) {
      var ll = selected[0].getLatLng();
      map.setView([ll.lat, ll.lng], 16);
      return;
    }
    var bounds = L.featureGroup(selected).getBounds();
    if (!bounds.isValid()) return;
    map.fitBounds(bounds.pad(0.1));
  }
```

- [ ] **Step 3: Wire the button click**

In the "Wire up" block near the bottom (around line 585), immediately after the `refreshBtn` handler, add:

```js
  document.getElementById('fitBtn').addEventListener('click', fitToSelection);
```

- [ ] **Step 4: Rebuild dist/**

Run: `npm run build`

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`

Expected: 41 passing.

- [ ] **Step 6: Manual verification**

In the live sheet:

- **All mode:** manually pan and zoom away from the pins. Click `🎯 Fit`. The map refits to include all visible pins.
- **All mode with legend filter:** hide one legend color. Click Fit. The map fits to only the remaining (visible) pins — hidden colors are excluded.
- **Group mode without focus:** switch to a group view with at least one row that has no entry in that column. Click Fit. The map fits to pins with ≥1 membership only (the muted gray pin is excluded from the zoom target).
- **Group mode with focus:** click a pin in a small sub-group. Click Fit. The map fits tightly around the pins in that sub-group.
- **Group mode with focus, sub-group of 1:** focus on a pin in a sub-group with a single member. Click Fit. The map centers on that single pin at zoom 16 (not an absurd max-zoom).
- **Empty selection:** should not happen in normal use; if the map has zero pins total, Fit does nothing silently (no error).

- [ ] **Step 7: Commit**

```bash
git -C D:/prj/MapsInSheets add src/Map.html dist/
git -C D:/prj/MapsInSheets commit -m "feat(client): add zoom-to-selection button

A '🎯 Fit' button in the top bar refits the map to the current selection:
all visible pins in All mode, the focused sub-group's members in group
mode with focus, or pins with >=1 membership in group mode without focus.
Handles single-pin selections by centering at zoom 16."
```

---

## Task 5: QUICKSTART.md UAT additions

**Files:**
- Modify: `D:/prj/MapsInSheets/QUICKSTART.md`

- [ ] **Step 1: Add UAT items**

In `QUICKSTART.md §5 "UAT checklist"`, under the existing `### Group views` section, append the following bullets **after** the existing list (keep the existing bullets unchanged):

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git -C D:/prj/MapsInSheets add QUICKSTART.md
git -C D:/prj/MapsInSheets commit -m "docs(quickstart): add UAT items for group-view refinements"
```

---

## Task 6: Create `docs/MAINTAINER.md` with the clasp workflow

**Files:**
- Create: `D:/prj/MapsInSheets/docs/MAINTAINER.md`

- [ ] **Step 1: Write the file**

Create `D:/prj/MapsInSheets/docs/MAINTAINER.md`:

```markdown
# Maintainer Guide

This is for the person publishing and maintaining the MapsInSheets
template sheet. End-users don't need to read this.

## One-time setup: publish the template sheet

1. In your Google account, create a new Google Sheet — e.g.
   `MapsInSheets — Template`.
2. Populate the first tab with sample data. You can use the 5-row sample
   from [QUICKSTART.md §1](../QUICKSTART.md). Include at least one row
   with an unmappable address so the Unmapped section is demonstrable.
3. **Extensions → Apps Script.** In the script editor, paste the contents
   of every file in `dist/` following the first-install instructions in
   [QUICKSTART.md §2](../QUICKSTART.md#2--install-the-script-5-min).
   (After the first install, all updates go through `clasp push` — see
   below.)
4. In the `appsscript.json` manifest editor (show it via ⚙️ Project
   Settings → "Show appsscript.json"), confirm the scopes match
   `src/appsscript.json`.
5. Configure `Map Settings` per [QUICKSTART.md §4](../QUICKSTART.md#4--configure-1-min),
   but **leave the `Web app URL` row blank** (see the caveat below).
6. Run **Map → Open in dialog** once and authorize. Confirm the map
   renders.
7. **Share the sheet:**
   - Click **Share**, set general access to **Anyone with the link → Viewer**.
   - Click the gear icon. Leave **Viewers and commenters can see the option
     to download, print, and copy** CHECKED. This is the setting that
     lets recipients make their own copy.
8. **Construct the one-click copy URL.** From the sheet's URL
   `https://docs.google.com/spreadsheets/d/<FILE_ID>/edit…`, extract
   `<FILE_ID>` and form:

   ```
   https://docs.google.com/spreadsheets/d/<FILE_ID>/copy
   ```

   This URL auto-opens Google's "Make a copy" dialog when a recipient
   visits it.
9. Paste that URL into `template-sheet-link.md`, replacing the
   `TEMPLATE_SHEET_URL = <not published yet>` placeholder.

### Web-app URL caveat (important)

Apps Script's `/exec` URL is tied to the deploying script and runs under
the deployer's auth. Inside `doGet()`, `SpreadsheetApp.getActiveSpreadsheet()`
returns the spreadsheet that owns the **bound** script — for the master
template, that's your template sheet.

**Consequence:** if you pre-fill `Web app URL` in the master template's
Map Settings, every recipient's copy that hasn't re-deployed would hit
*your* `/exec` URL and see *your* template data. That's a privacy and
correctness bug.

**Mitigation:** leave `Web app URL` blank in the master. Recipients who
want `Map → Open in new tab` on their copy must deploy their own web app
and paste their own `/exec` URL. The existing "New-tab map not configured"
alert walks them through this.

## Updating the template (clasp workflow)

After initial publish, use `clasp` to push new `dist/` builds to the
template's bound script without re-pasting files manually.

1. Install clasp globally (one-time):

   ```bash
   npm install -g @google/clasp
   ```

2. Log in (one-time per Google account):

   ```bash
   clasp login
   ```

   This opens a browser; authorize clasp to manage your Apps Script
   projects.

3. Copy the template's **Script ID** from its Apps Script editor:
   **Project Settings** (gear icon in the left rail) → **IDs** →
   **Script ID** → Copy.

4. Create `.clasp.json` in this repo's root:

   ```json
   { "scriptId": "<SCRIPT_ID>", "rootDir": "./dist" }
   ```

   This file is safe to commit. The Script ID is not a secret — the
   script itself is open-source in this repo — and committing it
   documents which deployment the repo's HEAD maps to.

5. Update workflow after making changes to `src/`:

   ```bash
   npm run build     # regenerate dist/
   clasp push        # upload dist/ to the template's script
   ```

   New copies made from the template *after* the push include your
   changes. Existing copies made *before* the push are frozen snapshots
   and do not receive updates automatically.

6. Optional — to version the deployment with a visible change log in the
   Apps Script editor:

   ```bash
   clasp version "feat: add zoom-to-selection and pin recoloring"
   ```

   This creates a named version in the Apps Script editor's version
   history. It does not create a web-app deployment.

## Update propagation — what recipients can expect

- **New copies** get the latest pushed version.
- **Existing copies** are frozen. To pick up updates, the recipient
  either (a) makes a fresh copy and migrates their data, or (b) follows
  the paste instructions in `QUICKSTART.md §2` to replace each `dist/`
  file in their copy's bound script.
- Announce notable changes so existing-copy users know an update is
  available.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `clasp push` fails with "Invalid scriptId" | Re-copy the Script ID from Project Settings; common mistake is to paste the Deployment ID. |
| `clasp login` hangs | Use `clasp login --no-localhost` on systems where the loopback server is blocked. |
| `clasp push` overwrites files the recipient edited on the master | You shouldn't edit the master's script manually any more once clasp is the source of truth. If you did, `clasp pull` first to reconcile. |
| Recipients complain "Open in new tab" shows someone else's data | `Web app URL` was pre-filled in the master. Clear that row and re-publish. |
```

- [ ] **Step 2: Commit**

```bash
git -C D:/prj/MapsInSheets add docs/MAINTAINER.md
git -C D:/prj/MapsInSheets commit -m "docs: add MAINTAINER.md with clasp workflow and template publishing

Publishing workflow for the maintainer's template sheet, the clasp-based
update workflow for pushing new dist/ builds, and the Web app URL
privacy caveat (don't pre-fill it in the master)."
```

---

## Task 7: Flesh out `template-sheet-link.md`

**Files:**
- Modify: `D:/prj/MapsInSheets/template-sheet-link.md`

- [ ] **Step 1: Replace the file contents**

Overwrite `D:/prj/MapsInSheets/template-sheet-link.md` with:

```markdown
# Template sheet

A pre-built template sheet with MapsInSheets already installed, intended
as the "easy path" for non-technical users who want to skip the
paste-every-file quickstart.

**Status:** `<not published yet>` — replace with the URL below once published.

## One-click copy URL (for end-users)

```
TEMPLATE_SHEET_URL = <not published yet>
```

The URL above will be of the form:

```
https://docs.google.com/spreadsheets/d/<FILE_ID>/copy
```

Opening it in a browser auto-prompts the recipient with Google's "Make a
copy" dialog. After they name the copy, they have a fully-working
MapsInSheets install in their Drive — no paste, no Apps Script editor.

## How to publish one

See [docs/MAINTAINER.md](docs/MAINTAINER.md) for the full workflow:

- One-time template publish (create the sheet, install `dist/`,
  configure `Map Settings`, share as Viewer with copy enabled, and
  construct the `/copy` URL).
- Ongoing updates via `clasp push`.
- The Web app URL caveat (leave it blank in the master).

## What recipients get

- A working sheet with sample data and MapsInSheets menu/settings.
- Full edit rights to **their** copy and **their** copy's bound script.
- A **frozen** snapshot of the script at copy time — updates to the
  master template do not propagate automatically. See
  `docs/MAINTAINER.md § Update propagation` for the tradeoff.
```

- [ ] **Step 2: Commit**

```bash
git -C D:/prj/MapsInSheets add template-sheet-link.md
git -C D:/prj/MapsInSheets commit -m "docs: flesh out template-sheet-link.md with copy-URL instructions

Points at docs/MAINTAINER.md for the full publish workflow and
documents the frozen-snapshot tradeoff."
```

---

## Task 8: Add a "Quick install" section to `README.md`

**Files:**
- Modify: `D:/prj/MapsInSheets/README.md`

- [ ] **Step 1: Insert a new section**

In `README.md`, locate the existing `## Quick start` section (line 51 in the current file):

```markdown
## Quick start

1. **Clone or download this repo.**
2. **Follow [QUICKSTART.md](QUICKSTART.md)** — a single-page install + UAT
   walkthrough. You'll paste the contents of `dist/` into your sheet's Apps
   Script editor and click `Map → Open in dialog`.

For the longer version with every option spelled out, see
[SETUP.md](SETUP.md).
```

Replace the whole `## Quick start` block with:

```markdown
## Quick install (recommended — non-technical users)

A pre-built template sheet is available for one-click copying. See
[`template-sheet-link.md`](template-sheet-link.md) for the URL. Click
the URL → Google prompts you to make a copy → name the copy → done.

The copy is fully self-contained — its own Google Sheet, its own bound
Apps Script, your own data. No paste required.

**Caveat:** your copy is a frozen snapshot of the script at copy time.
To pick up later upstream changes, either make a fresh copy and
migrate your data, or follow the manual install steps below.

## Manual install (technical users, or for updates to an existing copy)

1. **Clone or download this repo.**
2. **Follow [QUICKSTART.md](QUICKSTART.md)** — a single-page install + UAT
   walkthrough. You'll paste the contents of `dist/` into your sheet's Apps
   Script editor and click `Map → Open in dialog`.

For the longer version with every option spelled out, see
[SETUP.md](SETUP.md).
```

- [ ] **Step 2: Commit**

```bash
git -C D:/prj/MapsInSheets add README.md
git -C D:/prj/MapsInSheets commit -m "docs(readme): add Quick install section pointing at the template sheet

Surfaces the one-click copy URL as the primary install path and reframes
the paste-based QUICKSTART as Manual install for technical users."
```

---

## Post-plan checklist (before calling it done)

- [ ] `npx vitest run` — 41 passing (29 existing + 12 new in `pin-visuals.test.js`).
- [ ] `npm run build` — no errors; `dist/` includes `lib_pin_visuals.gs` and the updated `Map.html`.
- [ ] Full `QUICKSTART.md §5` UAT has been manually walked through in a live sheet, including the 11 new items added in Task 5.
- [ ] `git log --oneline` shows 8 new commits since the spec commit (`2d54898`), one per task.
- [ ] `git status` is clean.

---

## Self-review notes

- **Spec coverage:**
  - Feature 1 (pin coloring) → Tasks 1–2.
  - Feature 2 (muting) → folded into Tasks 1–2 via `MUTED_COLOR` / `MUTED_OPACITY`.
  - Feature 3 (scrollable popup member list) → Task 3.
  - Feature 4 (fit button) → Task 4.
  - Feature 5 (distribution + clasp) → Tasks 6–8; `template-sheet-link.md` update in Task 7 and publishing instructions in Task 6's `MAINTAINER.md`.
  - QUICKSTART UAT additions → Task 5.
- **Placeholders:** searched for "TBD", "TODO", "implement later", "similar to Task" — none found.
- **Type consistency:** `computeGroupPinVisual` signature `(pin, context)` and return shape `{color, opacity, scale, star, heroOutline}` match between lib module (Task 1), Map.html mirror (Task 2), and the fields consumed by the rewritten `makePinIcon` (Task 2). `fitToSelection` (Task 4) uses the same `markers` global and `pinIsVisible` helper that already exist in `Map.html`.
