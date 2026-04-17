# DriveMap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Google Apps Script bound to a Google Sheet that renders address rows as colored, filterable pins on an interactive Leaflet/OSM map, accessible as both a modeless dialog over the sheet and a standalone web app in a new tab.

**Architecture:** Node-tested pure-logic modules (column/color/smart-link/cache/legend) plus Apps Script glue (Code.gs) that wires them to `SpreadsheetApp`, `Maps.newGeocoder()`, and `HtmlService`. A single `Map.html` client uses Leaflet + OpenStreetMap tiles. A small build script concatenates/renames source into `dist/` files ready to paste into Apps Script.

**Tech Stack:** JavaScript (ES2019 — Apps Script's V8 baseline), Vitest (unit tests), Leaflet 1.9 (via CDN) with markercluster plugin, OpenStreetMap tile server, Google Apps Script runtime.

**Spec:** `docs/superpowers/specs/2026-04-16-drivemap-design.md`

---

## Conventions used throughout this plan

- **Paths use forward slashes** — bash/Git Bash on Windows accepts them, they're portable in the tool-call layer, and they match what the final repo will commit.
- **Every pure-logic JS module follows this "dual-environment" footer pattern** so the same file can be required from Vitest *and* pasted into Apps Script:

  ```js
  if (typeof module !== 'undefined') {
    module.exports = { /* named exports */ };
  }
  ```

  Apps Script has no `module` symbol, so the `if` is a no-op there. Node picks up the exports for tests.
- **Commits are frequent** — one per completed task unless the task explicitly says otherwise.
- **Test command throughout:** `npm test -- --run` (one-shot, non-watch).
- **Running in:** `D:/DriveMap` (empty directory, no git repo yet). Task 1 initializes the repo.

---

## File structure

```
D:/DriveMap/
├── .gitignore
├── package.json
├── vitest.config.js
├── README.md
├── SETUP.md
├── template-sheet-link.md
├── src/
│   ├── appsscript.json
│   ├── Code.js                 # Apps Script glue (onOpen, menu, getMapData, geocoding, dialog/webapp entry points)
│   ├── Map.html                # client UI (Leaflet, legend, filters, search, info windows)
│   └── lib/
│       ├── columns.js          # column letter/header → 1-indexed position
│       ├── colors.js           # per-row color resolution + palette hash
│       ├── smart-links.js      # phone/email/URL detection for info windows
│       ├── cache.js            # per-row "needs geocoding?" decision
│       └── legend.js           # legend-entry construction + >20-category guard
├── tests/
│   ├── columns.test.js
│   ├── colors.test.js
│   ├── smart-links.test.js
│   ├── cache.test.js
│   └── legend.test.js
├── scripts/
│   └── build.js                # src/ → dist/ with .js→.gs rename, strips module footers
├── dist/                       # generated; what the user pastes into Apps Script
└── docs/
    └── superpowers/
        ├── specs/2026-04-16-drivemap-design.md
        └── plans/2026-04-16-drivemap-implementation.md   (this file)
```

**Why this split:**
- `src/lib/*.js` — pure, Node-testable logic. One responsibility per file, kept small so each stays in context.
- `src/Code.js` — the only file that touches Apps Script APIs. Manual verification, not unit tested.
- `src/Map.html` — the only client file. Manual verification in a browser.
- `scripts/build.js` — isolates the "paste-ready artifacts" concern from source structure so users get clean files without a module footer.

---

## Task 1: Project scaffolding — git, npm, vitest

**Files:**
- Create: `D:/DriveMap/.gitignore`
- Create: `D:/DriveMap/package.json`
- Create: `D:/DriveMap/vitest.config.js`

- [ ] **Step 1: Initialize git**

Run:
```bash
cd /d/DriveMap && git init && git branch -M main
```
Expected: `Initialized empty Git repository` message.

- [ ] **Step 2: Create `.gitignore`**

Create `D:/DriveMap/.gitignore`:
```
node_modules/
dist/
.DS_Store
*.log
.vscode/
.idea/
```

- [ ] **Step 3: Create `package.json`**

Create `D:/DriveMap/package.json`:
```json
{
  "name": "drivemap",
  "version": "0.1.0",
  "private": true,
  "description": "Google Apps Script that maps addresses from a Google Sheet onto an interactive Leaflet map.",
  "type": "commonjs",
  "scripts": {
    "test": "vitest",
    "build": "node scripts/build.js"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Create `vitest.config.js`**

Create `D:/DriveMap/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Install dependencies**

Run:
```bash
cd /d/DriveMap && npm install
```
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 6: Verify test runner works with an empty suite**

Run:
```bash
cd /d/DriveMap && npx vitest run
```
Expected: `No test files found` (vitest exits 0 or 1 with that message — either is fine for this sanity check).

- [ ] **Step 7: Commit**

```bash
cd /d/DriveMap && git add .gitignore package.json package-lock.json vitest.config.js && git commit -m "chore: initialize project scaffolding with vitest"
```

---

## Task 2: Columns module — letter/header → 1-indexed position

**Files:**
- Create: `D:/DriveMap/src/lib/columns.js`
- Create: `D:/DriveMap/tests/columns.test.js`

**Contract:** Export `resolveColumn(spec, headerRow)` that returns the 1-indexed column number given either:
- a column letter ("A", "Z", "AA", "bc"), or
- a header-row value (case-insensitive, whitespace-trimmed match).
Returns `null` if no match.

- [ ] **Step 1: Write the failing tests**

Create `D:/DriveMap/tests/columns.test.js`:
```js
const { describe, it, expect } = require('vitest');
const { resolveColumn } = require('../src/lib/columns.js');

describe('resolveColumn', () => {
  const headers = ['Name', 'Phone', 'Address', 'Small Group', 'Status'];

  it('resolves single-letter column', () => {
    expect(resolveColumn('A', headers)).toBe(1);
    expect(resolveColumn('e', headers)).toBe(5);
  });

  it('resolves multi-letter column', () => {
    expect(resolveColumn('AA', headers)).toBe(27);
    expect(resolveColumn('AZ', headers)).toBe(52);
  });

  it('resolves header name (case-insensitive, trimmed)', () => {
    expect(resolveColumn('Address', headers)).toBe(3);
    expect(resolveColumn('  address ', headers)).toBe(3);
    expect(resolveColumn('SMALL GROUP', headers)).toBe(4);
  });

  it('prefers header match over letter when header starts with a letter-like string', () => {
    // "Name" header exists; column letter "Name" is not valid.
    // "A" is a valid column letter and also — hypothetically — a header.
    const hdr = ['A', 'B', 'C'];
    expect(resolveColumn('A', hdr)).toBe(1);  // header wins if present
  });

  it('falls back to letter when no header matches', () => {
    expect(resolveColumn('B', headers)).toBe(2); // no "B" header, letter wins
  });

  it('returns null for missing header and invalid letter', () => {
    expect(resolveColumn('Nope', headers)).toBeNull();
    expect(resolveColumn('', headers)).toBeNull();
    expect(resolveColumn(null, headers)).toBeNull();
    expect(resolveColumn('A1', headers)).toBeNull(); // not a pure letter spec
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/columns.test.js
```
Expected: FAIL — `Cannot find module '../src/lib/columns.js'`.

- [ ] **Step 3: Implement `columns.js`**

Create `D:/DriveMap/src/lib/columns.js`:
```js
function lettersToIndex(letters) {
  if (!/^[A-Za-z]+$/.test(letters)) return null;
  const upper = letters.toUpperCase();
  let n = 0;
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64);
  }
  return n;
}

function resolveColumn(spec, headerRow) {
  if (typeof spec !== 'string' || spec.trim() === '') return null;
  const needle = spec.trim().toLowerCase();

  // Header match wins if present.
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').trim().toLowerCase();
    if (h && h === needle) return i + 1;
  }

  // Fall back to letter interpretation.
  return lettersToIndex(spec.trim());
}

if (typeof module !== 'undefined') {
  module.exports = { resolveColumn, lettersToIndex };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/columns.test.js
```
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
cd /d/DriveMap && git add src/lib/columns.js tests/columns.test.js && git commit -m "feat(columns): resolve column letter or header name to 1-indexed position"
```

---

## Task 3: Colors module — literal / lookup / auto-assign precedence

**Files:**
- Create: `D:/DriveMap/src/lib/colors.js`
- Create: `D:/DriveMap/tests/colors.test.js`

**Contract:** Export `resolveColor(value, lookup, palette)` returning a hex color string (`#rrggbb`) for a cell value.
Precedence:
1. If `value` parses as a CSS color (named color or `#...`), return it normalized to hex.
2. If `lookup[normalize(value)]` exists, return it.
3. If `value` is empty/blank, return `#9e9e9e` (neutral gray).
4. Otherwise, hash `value` into `palette` and return that slot.
Also export `NEUTRAL_GRAY` and `DEFAULT_PALETTE` (12 colorblind-friendly hex colors).

- [ ] **Step 1: Write the failing tests**

Create `D:/DriveMap/tests/colors.test.js`:
```js
const { describe, it, expect } = require('vitest');
const { resolveColor, NEUTRAL_GRAY, DEFAULT_PALETTE } = require('../src/lib/colors.js');

describe('resolveColor', () => {
  const lookup = { active: '#2ecc71', inactive: '#95a5a6' };

  it('returns neutral gray for empty/blank value', () => {
    expect(resolveColor('', lookup, DEFAULT_PALETTE)).toBe(NEUTRAL_GRAY);
    expect(resolveColor('   ', lookup, DEFAULT_PALETTE)).toBe(NEUTRAL_GRAY);
    expect(resolveColor(null, lookup, DEFAULT_PALETTE)).toBe(NEUTRAL_GRAY);
  });

  it('returns literal hex color when cell contains one', () => {
    expect(resolveColor('#336699', lookup, DEFAULT_PALETTE)).toBe('#336699');
    expect(resolveColor('#ABC', lookup, DEFAULT_PALETTE)).toBe('#aabbcc');
  });

  it('returns named CSS color when cell contains one', () => {
    expect(resolveColor('red', lookup, DEFAULT_PALETTE)).toBe('#ff0000');
    expect(resolveColor('BLUE', lookup, DEFAULT_PALETTE)).toBe('#0000ff');
  });

  it('returns lookup color for matching value (case-insensitive)', () => {
    expect(resolveColor('Active', lookup, DEFAULT_PALETTE)).toBe('#2ecc71');
    expect(resolveColor('INACTIVE', lookup, DEFAULT_PALETTE)).toBe('#95a5a6');
  });

  it('auto-assigns from palette for unknown values, stably', () => {
    const c1 = resolveColor('Tuesday Night', {}, DEFAULT_PALETTE);
    const c2 = resolveColor('Tuesday Night', {}, DEFAULT_PALETTE);
    expect(c1).toBe(c2); // stable
    expect(DEFAULT_PALETTE).toContain(c1);
  });

  it('auto-assign returns different colors for different values (usually)', () => {
    const colors = new Set();
    ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].forEach((v) => {
      colors.add(resolveColor(v, {}, DEFAULT_PALETTE));
    });
    expect(colors.size).toBeGreaterThan(1); // hash spreads across palette
  });

  it('DEFAULT_PALETTE has 12 hex colors', () => {
    expect(DEFAULT_PALETTE).toHaveLength(12);
    DEFAULT_PALETTE.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/colors.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `colors.js`**

Create `D:/DriveMap/src/lib/colors.js`:
```js
const NEUTRAL_GRAY = '#9e9e9e';

// Colorblind-friendly palette (Okabe-Ito + a few extensions), 12 entries.
const DEFAULT_PALETTE = [
  '#e69f00', '#56b4e9', '#009e73', '#f0e442',
  '#0072b2', '#d55e00', '#cc79a7', '#999999',
  '#8c564b', '#17becf', '#bcbd22', '#7f7f7f',
];

// Minimal named-color table (common names that church users might type).
const NAMED = {
  red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a',
  black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080',
  cyan: '#00ffff', magenta: '#ff00ff', lime: '#00ff00', teal: '#008080',
};

function normalizeHex(hex) {
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const s = hex.slice(1).toLowerCase();
    return '#' + s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  return null;
}

function parseLiteralColor(value) {
  const v = String(value).trim();
  const hex = normalizeHex(v);
  if (hex) return hex;
  const named = NAMED[v.toLowerCase()];
  if (named) return named;
  return null;
}

function hashString(s) {
  let h = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function resolveColor(value, lookup, palette) {
  if (value == null || String(value).trim() === '') return NEUTRAL_GRAY;
  const raw = String(value).trim();

  const literal = parseLiteralColor(raw);
  if (literal) return literal;

  const key = raw.toLowerCase();
  if (lookup && Object.prototype.hasOwnProperty.call(lookup, key)) {
    return lookup[key];
  }

  const idx = hashString(key) % palette.length;
  return palette[idx];
}

if (typeof module !== 'undefined') {
  module.exports = {
    resolveColor,
    parseLiteralColor,
    hashString,
    NEUTRAL_GRAY,
    DEFAULT_PALETTE,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/colors.test.js
```
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
cd /d/DriveMap && git add src/lib/colors.js tests/colors.test.js && git commit -m "feat(colors): resolve per-row color via literal/lookup/auto-assign"
```

---

## Task 4: Smart-links module — phone/email/URL detection

**Files:**
- Create: `D:/DriveMap/src/lib/smart-links.js`
- Create: `D:/DriveMap/tests/smart-links.test.js`

**Contract:** Export `classifyValue(value)` returning `{ kind, href, text }` where `kind` is `"phone" | "email" | "url" | "text"`. For `kind === "text"`, `href` is null and `text` is the trimmed original.

- [ ] **Step 1: Write the failing tests**

Create `D:/DriveMap/tests/smart-links.test.js`:
```js
const { describe, it, expect } = require('vitest');
const { classifyValue } = require('../src/lib/smart-links.js');

describe('classifyValue', () => {
  it('detects US-style phone numbers', () => {
    expect(classifyValue('(555) 123-4567')).toEqual({
      kind: 'phone', href: 'tel:+15551234567', text: '(555) 123-4567',
    });
    expect(classifyValue('555-123-4567')).toMatchObject({ kind: 'phone' });
    expect(classifyValue('+1 555 123 4567')).toMatchObject({ kind: 'phone' });
  });

  it('detects email addresses', () => {
    expect(classifyValue('alice@example.com')).toEqual({
      kind: 'email', href: 'mailto:alice@example.com', text: 'alice@example.com',
    });
    expect(classifyValue('  BoB+tag@sub.example.co.uk ')).toMatchObject({
      kind: 'email', href: 'mailto:BoB+tag@sub.example.co.uk',
    });
  });

  it('detects http(s) URLs', () => {
    expect(classifyValue('https://example.com/path')).toEqual({
      kind: 'url', href: 'https://example.com/path', text: 'https://example.com/path',
    });
    expect(classifyValue('http://example.com')).toMatchObject({ kind: 'url' });
  });

  it('returns text for non-matching values', () => {
    expect(classifyValue('Active')).toEqual({ kind: 'text', href: null, text: 'Active' });
    expect(classifyValue('')).toEqual({ kind: 'text', href: null, text: '' });
    expect(classifyValue(null)).toEqual({ kind: 'text', href: null, text: '' });
    expect(classifyValue(42)).toEqual({ kind: 'text', href: null, text: '42' });
  });

  it('does not misclassify integers as phone numbers', () => {
    // A value like 1234 is too short for a phone and should stay as text.
    expect(classifyValue('1234')).toMatchObject({ kind: 'text' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/smart-links.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `smart-links.js`**

Create `D:/DriveMap/src/lib/smart-links.js`:
```js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/i;
// Match common US/international phone formats (at least 10 digits total).
const PHONE_RE = /^(?:\+?\d[\d\s().-]{8,}\d)$/;

function normalizePhone(s) {
  const digits = s.replace(/\D/g, '');
  // If 10 digits, assume US; prepend +1. If 11 starting with 1, prepend +.
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return '+' + digits;
}

function classifyValue(value) {
  const text = value == null ? '' : String(value).trim();
  if (text === '') return { kind: 'text', href: null, text: '' };

  if (EMAIL_RE.test(text)) {
    return { kind: 'email', href: 'mailto:' + text, text };
  }
  if (URL_RE.test(text)) {
    return { kind: 'url', href: text, text };
  }
  if (PHONE_RE.test(text)) {
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 10) {
      return { kind: 'phone', href: 'tel:' + normalizePhone(text), text };
    }
  }
  return { kind: 'text', href: null, text };
}

if (typeof module !== 'undefined') {
  module.exports = { classifyValue };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/smart-links.test.js
```
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
cd /d/DriveMap && git add src/lib/smart-links.js tests/smart-links.test.js && git commit -m "feat(smart-links): detect phone/email/URL values for info windows"
```

---

## Task 5: Cache module — per-row geocode decision

**Files:**
- Create: `D:/DriveMap/src/lib/cache.js`
- Create: `D:/DriveMap/tests/cache.test.js`

**Contract:** Export `needsGeocoding({ address, lat, lng, geocodedFrom })` returning one of:
- `"skip"` — no address, not a pin
- `"geocode"` — needs a geocoder call
- `"cached"` — use existing lat/lng

- [ ] **Step 1: Write the failing tests**

Create `D:/DriveMap/tests/cache.test.js`:
```js
const { describe, it, expect } = require('vitest');
const { needsGeocoding } = require('../src/lib/cache.js');

describe('needsGeocoding', () => {
  it('skips empty addresses', () => {
    expect(needsGeocoding({ address: '', lat: 1, lng: 2, geocodedFrom: 'x' })).toBe('skip');
    expect(needsGeocoding({ address: '   ', lat: null, lng: null, geocodedFrom: null })).toBe('skip');
    expect(needsGeocoding({ address: null })).toBe('skip');
  });

  it('geocodes when lat or lng is missing', () => {
    expect(needsGeocoding({ address: '123 Main', lat: null, lng: null, geocodedFrom: null })).toBe('geocode');
    expect(needsGeocoding({ address: '123 Main', lat: 40, lng: null, geocodedFrom: '123 Main' })).toBe('geocode');
    expect(needsGeocoding({ address: '123 Main', lat: null, lng: -74, geocodedFrom: '123 Main' })).toBe('geocode');
    expect(needsGeocoding({ address: '123 Main', lat: '', lng: '', geocodedFrom: '' })).toBe('geocode');
  });

  it('geocodes when address has changed', () => {
    expect(needsGeocoding({ address: '123 Main', lat: 40, lng: -74, geocodedFrom: '456 Elm' })).toBe('geocode');
  });

  it('uses cached when address matches geocodedFrom and lat/lng present', () => {
    expect(needsGeocoding({ address: '123 Main', lat: 40, lng: -74, geocodedFrom: '123 Main' })).toBe('cached');
  });

  it('ignores whitespace differences between address and geocodedFrom', () => {
    expect(needsGeocoding({ address: '  123 Main  ', lat: 40, lng: -74, geocodedFrom: '123 Main' })).toBe('cached');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/cache.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement `cache.js`**

Create `D:/DriveMap/src/lib/cache.js`:
```js
function isBlank(v) {
  return v == null || String(v).trim() === '';
}

function isPresentNumber(v) {
  if (v === null || v === undefined || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n);
}

function needsGeocoding(row) {
  const addr = row && row.address;
  if (isBlank(addr)) return 'skip';
  if (!isPresentNumber(row.lat) || !isPresentNumber(row.lng)) return 'geocode';
  const a = String(addr).trim();
  const g = isBlank(row.geocodedFrom) ? '' : String(row.geocodedFrom).trim();
  if (a !== g) return 'geocode';
  return 'cached';
}

if (typeof module !== 'undefined') {
  module.exports = { needsGeocoding };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/cache.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/DriveMap && git add src/lib/cache.js tests/cache.test.js && git commit -m "feat(cache): decide per-row geocode vs cached vs skip"
```

---

## Task 6: Legend module — entries, ordering, >20-category guard

**Files:**
- Create: `D:/DriveMap/src/lib/legend.js`
- Create: `D:/DriveMap/tests/legend.test.js`

**Contract:** Export `buildLegend({ rows, colorField, lookup, palette })` returning:
```
{
  entries: [{ value, color, count, source }],   // source = 'lookup' | 'auto' | 'none'
  collapsed: boolean,                           // true if >20 categories were collapsed
}
```
Ordering: lookup values first (in the order they appear in `lookup`), then auto-assigned values alphabetically, then `(no value)` last. When >20 distinct values exist, keep top 19 by count and add a single `"Other"` entry (neutral gray).

- [ ] **Step 1: Write the failing tests**

Create `D:/DriveMap/tests/legend.test.js`:
```js
const { describe, it, expect } = require('vitest');
const { buildLegend } = require('../src/lib/legend.js');
const { DEFAULT_PALETTE } = require('../src/lib/colors.js');

function rows(values) {
  return values.map((v) => ({ Status: v }));
}

describe('buildLegend', () => {
  const lookup = { active: '#2ecc71', inactive: '#95a5a6' };

  it('counts distinct values', () => {
    const legend = buildLegend({
      rows: rows(['Active', 'Active', 'Inactive', 'Visitor']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    const byValue = Object.fromEntries(legend.entries.map((e) => [e.value, e.count]));
    expect(byValue).toEqual({ Active: 2, Inactive: 1, Visitor: 1 });
    expect(legend.collapsed).toBe(false);
  });

  it('orders lookup entries in insertion order, then auto alphabetical, then (no value)', () => {
    const legend = buildLegend({
      rows: rows(['Visitor', 'Zeta', 'Alpha', 'Inactive', 'Active', '', '']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    expect(legend.entries.map((e) => e.value)).toEqual([
      'Active', 'Inactive',   // lookup order
      'Alpha', 'Visitor', 'Zeta', // auto, alphabetical
      '(no value)',            // last
    ]);
  });

  it('tags source on each entry', () => {
    const legend = buildLegend({
      rows: rows(['Active', 'Visitor', '']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    const byValue = Object.fromEntries(legend.entries.map((e) => [e.value, e.source]));
    expect(byValue).toEqual({ Active: 'lookup', Visitor: 'auto', '(no value)': 'none' });
  });

  it('omits (no value) when no blanks', () => {
    const legend = buildLegend({
      rows: rows(['Active']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    expect(legend.entries.map((e) => e.value)).toEqual(['Active']);
  });

  it('collapses to top-19 + Other when >20 distinct values', () => {
    const many = [];
    for (let i = 0; i < 25; i++) {
      // give first 19 the most count so the collapse is deterministic
      const copies = i < 19 ? 10 : 1;
      for (let j = 0; j < copies; j++) many.push('V' + i);
    }
    const legend = buildLegend({
      rows: rows(many), colorField: 'Status', lookup: {}, palette: DEFAULT_PALETTE,
    });
    expect(legend.collapsed).toBe(true);
    const other = legend.entries.find((e) => e.value === 'Other');
    expect(other).toBeDefined();
    expect(other.count).toBe(6); // V19..V24
    // 19 top values + 1 Other = 20 entries
    expect(legend.entries.length).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/legend.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement `legend.js`**

Create `D:/DriveMap/src/lib/legend.js`:
```js
const { resolveColor, NEUTRAL_GRAY } = require('./colors.js');

const MAX_ENTRIES = 20;
const KEEP_WHEN_COLLAPSED = 19;
const NO_VALUE_LABEL = '(no value)';
const OTHER_LABEL = 'Other';

function normKey(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

function buildLegend({ rows, colorField, lookup, palette }) {
  const counts = new Map();       // displayValue -> count
  const originals = new Map();    // displayValue -> first original form
  let blanks = 0;

  for (const r of rows) {
    const raw = r[colorField];
    if (raw == null || String(raw).trim() === '') {
      blanks++;
      continue;
    }
    const display = String(raw).trim();
    const key = display.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!originals.has(key)) originals.set(key, display);
  }

  const lookupKeysInOrder = Object.keys(lookup || {}); // already lowercase by convention
  const lookupSet = new Set(lookupKeysInOrder);

  const entries = [];

  for (const key of lookupKeysInOrder) {
    if (!counts.has(key)) continue;
    entries.push({
      value: originals.get(key),
      color: lookup[key],
      count: counts.get(key),
      source: 'lookup',
    });
  }

  const autoKeys = [...counts.keys()]
    .filter((k) => !lookupSet.has(k))
    .sort((a, b) => originals.get(a).localeCompare(originals.get(b)));

  for (const key of autoKeys) {
    entries.push({
      value: originals.get(key),
      color: resolveColor(originals.get(key), lookup, palette),
      count: counts.get(key),
      source: 'auto',
    });
  }

  let collapsed = false;
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b.count - a.count);
    const kept = entries.slice(0, KEEP_WHEN_COLLAPSED);
    const rest = entries.slice(KEEP_WHEN_COLLAPSED);
    const otherCount = rest.reduce((s, e) => s + e.count, 0);
    kept.push({ value: OTHER_LABEL, color: NEUTRAL_GRAY, count: otherCount, source: 'auto' });
    entries.length = 0;
    entries.push(...kept);
    collapsed = true;
  }

  if (blanks > 0) {
    entries.push({ value: NO_VALUE_LABEL, color: NEUTRAL_GRAY, count: blanks, source: 'none' });
  }

  return { entries, collapsed };
}

if (typeof module !== 'undefined') {
  module.exports = { buildLegend, NO_VALUE_LABEL, OTHER_LABEL };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /d/DriveMap && npx vitest run tests/legend.test.js
```
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
cd /d/DriveMap && git add src/lib/legend.js tests/legend.test.js && git commit -m "feat(legend): build ordered legend entries with >20-category collapse"
```

---

## Task 7: `appsscript.json` manifest

**Files:**
- Create: `D:/DriveMap/src/appsscript.json`

- [ ] **Step 1: Create the manifest**

Create `D:/DriveMap/src/appsscript.json`:
```json
{
  "timeZone": "America/Denver",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.container.ui",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/maps"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_WITH_GOOGLE_ACCOUNT"
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/appsscript.json && git commit -m "chore: add Apps Script manifest"
```

> Note: `timeZone` is set to the author's local zone. Users can adjust if needed — it does not affect behavior, only script log timestamps.

---

## Task 8: `Code.js` — `onOpen` menu and dialog/web-app entry points

**Files:**
- Create: `D:/DriveMap/src/Code.js`

**Scope of this task:** just the menu, the dialog-opening code, the `doGet` entry point, and a `getWebAppUrl` helper used by the "Open in new tab" menu item. `getMapData` will be added in Task 12.

- [ ] **Step 1: Create `Code.js` with menu and entry points**

Create `D:/DriveMap/src/Code.js`:
```js
// ============================================================================
// DriveMap — Apps Script glue
// ============================================================================

const SETTINGS_TAB_NAME = 'Map Settings';
const DEFAULT_DIALOG_WIDTH = 1100;
const DEFAULT_DIALOG_HEIGHT = 700;

// Called automatically when the spreadsheet is opened.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Map')
    .addItem('Open in dialog', 'openDialog')
    .addItem('Open in new tab', 'openNewTab')
    .addSeparator()
    .addItem('Reset settings tab', 'resetSettingsTab')
    .addToUi();
}

function openDialog() {
  const html = HtmlService
    .createTemplateFromFile('Map')
    .evaluate()
    .setTitle('DriveMap')
    .setWidth(DEFAULT_DIALOG_WIDTH)
    .setHeight(DEFAULT_DIALOG_HEIGHT);
  SpreadsheetApp.getUi().showModalDialog(html, 'DriveMap');
}

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
  const html = HtmlService.createHtmlOutput(
    '<script>window.open(' + JSON.stringify(url) + ', "_blank"); google.script.host.close();</script>'
  ).setWidth(100).setHeight(50);
  ui.showModalDialog(html, 'Opening new tab…');
}

// Web app entry point. Serves the same Map.html used by the dialog.
function doGet() {
  return HtmlService
    .createTemplateFromFile('Map')
    .evaluate()
    .setTitle('DriveMap')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Returns the URL stored on the Settings tab, or '' if not set.
function getWebAppUrl_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SETTINGS_TAB_NAME);
  if (!sheet) return '';
  const range = sheet.getDataRange().getValues();
  for (const row of range) {
    if (String(row[0]).trim().toLowerCase() === 'web app url') {
      return String(row[1] || '').trim();
    }
  }
  return '';
}
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Code.js && git commit -m "feat(apps-script): menu registration and dialog/webapp entry points"
```

> Note: `HtmlService.createTemplateFromFile('Map')` will fail until `Map.html` exists (Task 13). That's fine — this task only writes the file; verification happens at manual-integration time.

---

## Task 9: `ensureSettingsTab` — first-run auto-creation and auto-detection

**Files:**
- Modify: `D:/DriveMap/src/Code.js` (append)

- [ ] **Step 1: Append settings-tab helpers**

Append to `D:/DriveMap/src/Code.js`:
```js
// ============================================================================
// Settings tab scaffolding
// ============================================================================

const SETTINGS_KEYS = [
  { key: 'Data tab',            help: 'Sheet tab containing the address rows.' },
  { key: 'Address column',      help: 'Column letter or header name of the address column.' },
  { key: 'Color column',        help: 'Column whose value drives pin color.' },
  { key: 'Popup columns',       help: 'Comma-separated header names shown in the info window, in order. First one is the title.' },
  { key: 'Filter columns',      help: 'Comma-separated header names exposed as filter dropdowns.' },
  { key: 'Latitude column',     help: 'Auto-managed. Column that stores cached latitude.' },
  { key: 'Longitude column',    help: 'Auto-managed. Column that stores cached longitude.' },
  { key: 'Geocoded From column',help: 'Auto-managed. Stores the address string used to geocode this row.' },
  { key: 'Web app URL',         help: 'Paste the /exec URL from your web-app deployment to enable "Open in new tab".' },
];

function ensureSettingsTab_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_TAB_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SETTINGS_TAB_NAME);
  sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Notes']])
    .setFontWeight('bold');
  sheet.setColumnWidths(1, 1, 180);
  sheet.setColumnWidths(2, 1, 240);
  sheet.setColumnWidths(3, 1, 420);

  const defaults = autoDetectDefaults_(ss);
  const rows = SETTINGS_KEYS.map(({ key, help }) => [key, defaults[key] || '', help]);
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);

  // Block 2: color lookup table.
  const lookupStartRow = rows.length + 4;
  sheet.getRange(lookupStartRow, 1, 1, 2).setValues([['Value', 'Color']]).setFontWeight('bold');
  sheet.getRange(lookupStartRow + 1, 1, 1, 2).setValues([['(example) Active', '#2ecc71']]);
  sheet.getRange(lookupStartRow, 1, 1, 2).setBackground('#f0f0f0');

  sheet.setFrozenRows(1);
  return sheet;
}

function resetSettingsTab() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert('Reset Map Settings tab?',
    'This deletes the Map Settings tab and recreates it with auto-detected defaults. Your color lookup table will be lost. Cached Latitude/Longitude columns in the data tab are NOT affected.',
    ui.ButtonSet.OK_CANCEL);
  if (resp !== ui.Button.OK) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const existing = ss.getSheetByName(SETTINGS_TAB_NAME);
  if (existing) ss.deleteSheet(existing);
  ensureSettingsTab_();
}

function autoDetectDefaults_(ss) {
  const sheets = ss.getSheets().filter((s) => s.getName() !== SETTINGS_TAB_NAME);
  const dataSheet = sheets[0];
  if (!dataSheet) return {};

  const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0]
    .map((h) => String(h || '').trim());

  const addressCandidates = ['address', 'street', 'location', 'home address', 'mailing address'];
  let addressHeader = '';
  for (const cand of addressCandidates) {
    const idx = headers.findIndex((h) => h.toLowerCase() === cand);
    if (idx !== -1) { addressHeader = headers[idx]; break; }
  }

  return {
    'Data tab': dataSheet.getName(),
    'Address column': addressHeader,
    // color/popup/filter are left blank for the user to configure
    'Latitude column': 'Latitude',
    'Longitude column': 'Longitude',
    'Geocoded From column': 'Geocoded From',
  };
}

// Reads the settings tab into a plain object.
function readSettings_() {
  const sheet = ensureSettingsTab_();
  const values = sheet.getDataRange().getValues();
  const kv = {};
  for (let i = 1; i < values.length; i++) {
    const k = String(values[i][0] || '').trim();
    if (!k) continue;
    kv[k] = String(values[i][1] || '').trim();
  }

  // Read the Color lookup table (Block 2). Find the "Value | Color" header row.
  const lookup = {};
  let inTable = false;
  for (let i = 0; i < values.length; i++) {
    const first = String(values[i][0] || '').trim().toLowerCase();
    if (first === 'value' && String(values[i][1] || '').trim().toLowerCase() === 'color') {
      inTable = true;
      continue;
    }
    if (inTable) {
      const v = String(values[i][0] || '').trim();
      const c = String(values[i][1] || '').trim();
      if (!v) continue;
      if (v.toLowerCase().startsWith('(example)')) continue;
      lookup[v.toLowerCase()] = c;
    }
  }

  return { kv, lookup };
}
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Code.js && git commit -m "feat(apps-script): create and read Map Settings tab with auto-detection"
```

---

## Task 10: `ensureCacheColumns` — Latitude / Longitude / Geocoded From

**Files:**
- Modify: `D:/DriveMap/src/Code.js` (append)

- [ ] **Step 1: Append cache-column helper**

Append to `D:/DriveMap/src/Code.js`:
```js
// ============================================================================
// Cache columns (Latitude / Longitude / Geocoded From) in the data tab
// ============================================================================

function ensureCacheColumns_(dataSheet, settings) {
  const header = dataSheet.getRange(1, 1, 1, Math.max(dataSheet.getLastColumn(), 1)).getValues()[0];
  const wanted = [
    { key: 'Latitude column',     label: settings['Latitude column']     || 'Latitude' },
    { key: 'Longitude column',    label: settings['Longitude column']    || 'Longitude' },
    { key: 'Geocoded From column',label: settings['Geocoded From column']|| 'Geocoded From' },
  ];
  const positions = {};
  let nextCol = dataSheet.getLastColumn() + 1;
  let added = false;

  for (const w of wanted) {
    const existing = header.findIndex((h) => String(h || '').trim().toLowerCase() === w.label.toLowerCase());
    if (existing !== -1) {
      positions[w.key] = existing + 1;
    } else {
      dataSheet.getRange(1, nextCol).setValue(w.label).setFontWeight('bold');
      positions[w.key] = nextCol;
      nextCol++;
      added = true;
    }
  }

  if (added) SpreadsheetApp.flush();
  return positions;
}
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Code.js && git commit -m "feat(apps-script): append Latitude/Longitude/GeocodedFrom cache columns if missing"
```

---

## Task 11: `readRows` — serialize data-tab rows using settings

**Files:**
- Modify: `D:/DriveMap/src/Code.js` (append)

- [ ] **Step 1: Append row reader**

Append to `D:/DriveMap/src/Code.js`:
```js
// ============================================================================
// Read rows from the data tab using the configured columns
// ============================================================================

function parseCsvList_(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

// Resolve a column spec to 1-indexed column position, given the header row.
// Accepts a column letter ("A", "AA") or a header name (case-insensitive).
function resolveColumn_(spec, header) {
  if (!spec) return null;
  const needle = String(spec).trim().toLowerCase();
  if (!needle) return null;
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] || '').trim().toLowerCase();
    if (h && h === needle) return i + 1;
  }
  if (!/^[A-Za-z]+$/.test(String(spec).trim())) return null;
  const upper = String(spec).trim().toUpperCase();
  let n = 0;
  for (let i = 0; i < upper.length; i++) n = n * 26 + (upper.charCodeAt(i) - 64);
  return n;
}

function readRows_(settings) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = settings['Data tab'];
  const dataSheet = tabName
    ? ss.getSheetByName(tabName)
    : ss.getSheets().filter((s) => s.getName() !== SETTINGS_TAB_NAME)[0];
  if (!dataSheet) throw new Error('Data tab "' + tabName + '" not found.');

  const cache = ensureCacheColumns_(dataSheet, settings);

  const lastRow = dataSheet.getLastRow();
  const lastCol = dataSheet.getLastColumn();
  if (lastRow < 2) return { rows: [], dataSheet, header: [], positions: {}, cache };

  const allValues = dataSheet.getRange(1, 1, lastRow, lastCol).getValues();
  const header = allValues[0];

  const addressCol  = resolveColumn_(settings['Address column'], header);
  const colorCol    = resolveColumn_(settings['Color column'], header);
  const popupCols   = parseCsvList_(settings['Popup columns']).map((n) => ({ name: n, idx: resolveColumn_(n, header) })).filter((x) => x.idx);
  const filterCols  = parseCsvList_(settings['Filter columns']).map((n) => ({ name: n, idx: resolveColumn_(n, header) })).filter((x) => x.idx);

  if (!addressCol) throw new Error('Address column is not configured or not found. Set it on the Map Settings tab.');

  const rows = [];
  for (let r = 1; r < allValues.length; r++) {
    const raw = allValues[r];
    const address = String(raw[addressCol - 1] || '').trim();
    if (!address) continue;

    const popup = popupCols.map(({ name, idx }) => ({ name, value: raw[idx - 1] }));
    const filters = {};
    for (const { name, idx } of filterCols) filters[name] = raw[idx - 1];

    rows.push({
      rowNumber: r + 1, // 1-indexed sheet row
      address,
      colorValue: colorCol ? raw[colorCol - 1] : '',
      lat: raw[cache['Latitude column'] - 1],
      lng: raw[cache['Longitude column'] - 1],
      geocodedFrom: raw[cache['Geocoded From column'] - 1],
      popup,
      filters,
    });
  }

  return { rows, dataSheet, header, cache };
}
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Code.js && git commit -m "feat(apps-script): read configured columns from data tab into row objects"
```

---

## Task 12: `getMapData` — orchestrate read + incremental geocode + serialize

**Files:**
- Modify: `D:/DriveMap/src/Code.js` (append)

- [ ] **Step 1: Append orchestration**

Append to `D:/DriveMap/src/Code.js`:
```js
// ============================================================================
// Geocoding + getMapData orchestration
// ============================================================================

const GEOCODE_BATCH_SIZE = 50;
const GEOCODE_TIME_BUDGET_MS = 5 * 60 * 1000; // leave a minute of the 6-minute quota

function geocodeRows_(toGeocode, dataSheet, cache) {
  const geocoder = Maps.newGeocoder();
  const latCol = cache['Latitude column'];
  const lngCol = cache['Longitude column'];
  const fromCol = cache['Geocoded From column'];

  const results = [];
  const started = Date.now();
  let pending = [];

  function flushPending() {
    if (pending.length === 0) return;
    const minRow = pending.reduce((m, p) => Math.min(m, p.rowNumber), Infinity);
    const maxRow = pending.reduce((m, p) => Math.max(m, p.rowNumber), -Infinity);
    // Write cache columns individually per row. Range updates are one cell each; this is O(pending).
    for (const p of pending) {
      dataSheet.getRange(p.rowNumber, latCol).setValue(p.lat);
      dataSheet.getRange(p.rowNumber, lngCol).setValue(p.lng);
      dataSheet.getRange(p.rowNumber, fromCol).setValue(p.geocodedFrom);
    }
    SpreadsheetApp.flush();
    pending = [];
  }

  for (const row of toGeocode) {
    if (Date.now() - started > GEOCODE_TIME_BUDGET_MS) {
      flushPending();
      break; // remaining rows stay empty; next open will finish them
    }
    let lat = '', lng = '', ok = false;
    try {
      const resp = geocoder.geocode(row.address);
      if (resp.status === 'OK' && resp.results && resp.results.length) {
        const loc = resp.results[0].geometry.location;
        lat = loc.lat; lng = loc.lng; ok = true;
      }
    } catch (_) {
      // swallow — will be reported as unmapped
    }
    if (ok) {
      pending.push({ rowNumber: row.rowNumber, lat, lng, geocodedFrom: row.address });
      row.lat = lat; row.lng = lng; row.geocodedFrom = row.address;
      results.push({ rowNumber: row.rowNumber, ok: true });
      if (pending.length >= GEOCODE_BATCH_SIZE) flushPending();
    } else {
      results.push({ rowNumber: row.rowNumber, ok: false });
    }
  }
  flushPending();
  return results;
}

function getMapData() {
  const { kv: settings, lookup } = readSettings_();
  const { rows, dataSheet, cache } = readRows_(settings);

  // Partition rows using the cache-decision helper's logic inlined here
  // (Apps Script shares globals across files, so if cache.gs is included it's available).
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
    // 'skip' shouldn't occur here because readRows_ already filters empty addresses
  }

  const geocodeResults = geocodeRows_(toGeocode, dataSheet, cache);
  const byRow = new Map(geocodeResults.map((r) => [r.rowNumber, r]));

  for (const row of toGeocode) {
    const res = byRow.get(row.rowNumber);
    if (res && res.ok) mapped.push(row);
    else unmapped.push({ rowNumber: row.rowNumber, address: row.address });
  }

  const palette = DEFAULT_PALETTE;
  const legend = buildLegend({
    rows: mapped.map((r) => ({ __color__: r.colorValue })),
    colorField: '__color__',
    lookup,
    palette,
  });

  // Attach a resolved color to each mapped row.
  const pins = mapped.map((r) => ({
    rowNumber: r.rowNumber,
    address: r.address,
    lat: Number(r.lat),
    lng: Number(r.lng),
    color: resolveColor(r.colorValue, lookup, palette),
    colorValue: r.colorValue == null ? '' : String(r.colorValue),
    popup: r.popup.map((p) => ({ name: p.name, value: p.value == null ? '' : String(p.value) })),
    filters: r.filters,
  }));

  return {
    settings,
    legend,
    pins,
    unmapped,
    filterColumns: parseCsvList_(settings['Filter columns']),
    totalRows: rows.length,
    geocoded: toGeocode.length - unmapped.length,
    remainingToGeocode: Math.max(0, toGeocode.length - geocodeResults.length),
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Code.js && git commit -m "feat(apps-script): orchestrate incremental geocoding and serialize map payload"
```

> Note: this task depends on the Node-tested modules (`cache.js`, `colors.js`, `legend.js`) being loaded alongside `Code.js` in the Apps Script project. The build script (Task 17) produces the right bundle.

---

## Task 13: `Map.html` — shell, Leaflet, data fetch, basic pins, refresh

**Files:**
- Create: `D:/DriveMap/src/Map.html`

**Scope:** single-file HTML with Leaflet + markercluster via CDN, a top bar with Refresh and a status line, an empty left-panel, and a map that renders pins (solid color circles). Calls the server via `google.script.run` (dialog) or a dedicated `/exec` URL (web app). Both use the same `loadData()` function — Apps Script's `google.script.run` works in both dialog and web-app contexts when the page is served by `HtmlService`.

- [ ] **Step 1: Create `Map.html`**

Create `D:/DriveMap/src/Map.html`:
```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>DriveMap</title>
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
  var map = L.map('map').setView([39.5, -98.35], 4); // center of the US as initial view
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  var cluster = L.markerClusterGroup();
  map.addLayer(cluster);

  var state = { data: null, markers: [] };

  function setStatus(msg) { document.getElementById('status').textContent = msg; }
  function setBanner(msg) {
    var b = document.getElementById('banner');
    if (!msg) { b.classList.remove('show'); b.textContent = ''; }
    else { b.textContent = msg; b.classList.add('show'); }
  }

  function makePinIcon(color) {
    return L.divIcon({
      html: '<div class="pin-circle" style="background:' + color + ';"></div>',
      className: '',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  function renderPins(data) {
    cluster.clearLayers();
    state.markers = [];
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p.color) });
      marker._drivemap = p;
      cluster.addLayer(marker);
      state.markers.push(marker);
    });
    if (data.pins.length) {
      var group = L.featureGroup(state.markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
    setStatus('Showing ' + data.pins.length + ' of ' + data.totalRows);
    if (data.remainingToGeocode > 0) {
      setBanner('Geocoding was interrupted — ' + data.remainingToGeocode + ' rows remain. Click Refresh to continue.');
    } else {
      setBanner('');
    }
  }

  function loadData() {
    setStatus('Loading…');
    google.script.run
      .withSuccessHandler(function (data) { state.data = data; renderPins(data); })
      .withFailureHandler(function (err) { setStatus('Error: ' + err.message); })
      .getMapData();
  }

  document.getElementById('refreshBtn').addEventListener('click', loadData);
  loadData();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Map.html && git commit -m "feat(client): Leaflet map shell with refresh and basic pin rendering"
```

---

## Task 14: `Map.html` — legend panel with click-to-toggle filter

**Files:**
- Modify: `D:/DriveMap/src/Map.html`

- [ ] **Step 1: Add legend rendering and hide/show behavior**

Inside the `<script>` block of `src/Map.html`, replace the line `document.getElementById('refreshBtn').addEventListener('click', loadData);` and the lines surrounding it with this expanded section (keep everything above unchanged):

```js
  var hidden = new Set(); // lowercased legend values that are hidden

  function renderSidebar(data) {
    var sb = document.getElementById('sidebar');
    sb.innerHTML = '';

    var h = document.createElement('h3');
    h.textContent = 'Legend';
    sb.appendChild(h);

    data.legend.entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'legend-row' + (hidden.has(e.value.toLowerCase()) ? ' hidden' : '');
      row.innerHTML =
        '<span class="legend-swatch" style="background:' + e.color + ';"></span>' +
        '<span>' + escapeHtml(e.value) + '</span>' +
        '<span class="legend-count">' + e.count + '</span>';
      row.addEventListener('click', function () {
        var k = e.value.toLowerCase();
        if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
        applyFilters();
      });
      sb.appendChild(row);
    });

    if (data.legend.collapsed) {
      var note = document.createElement('div');
      note.style.fontSize = '11px'; note.style.color = '#999'; note.style.marginTop = '6px';
      note.textContent = 'Too many distinct values — showing top 19 + Other. Consider a column with fewer categories.';
      sb.appendChild(note);
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function applyFilters() {
    cluster.clearLayers();
    var visible = 0;
    state.markers.forEach(function (m) {
      var p = m._drivemap;
      var colorVal = (p.colorValue || '(no value)').toLowerCase();
      if (hidden.has(colorVal)) return;
      cluster.addLayer(m);
      visible++;
    });
    setStatus('Showing ' + visible + ' of ' + state.data.totalRows);
  }

  function renderPins(data) {
    cluster.clearLayers();
    state.markers = [];
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p.color) });
      marker._drivemap = p;
      state.markers.push(marker);
    });
    renderSidebar(data);
    applyFilters();
    if (data.pins.length) {
      var group = L.featureGroup(state.markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
    if (data.remainingToGeocode > 0) {
      setBanner('Geocoding was interrupted — ' + data.remainingToGeocode + ' rows remain. Click Refresh to continue.');
    } else {
      setBanner('');
    }
  }

  document.getElementById('refreshBtn').addEventListener('click', loadData);
  loadData();
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Map.html && git commit -m "feat(client): legend with click-to-toggle filtering"
```

---

## Task 15: `Map.html` — info windows with smart links and directions

**Files:**
- Modify: `D:/DriveMap/src/Map.html`

- [ ] **Step 1: Add info-window binding**

Inside the `<script>` block of `src/Map.html`, after the `applyFilters` function definition and before `renderPins`, add:

```js
  // Smart-link detection (mirrors src/lib/smart-links.js).
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var URL_RE = /^https?:\/\/\S+$/i;
  var PHONE_RE = /^(?:\+?\d[\d\s().-]{8,}\d)$/;

  function classify(value) {
    var text = value == null ? '' : String(value).trim();
    if (!text) return { kind: 'text', href: null, text: '' };
    if (EMAIL_RE.test(text)) return { kind: 'email', href: 'mailto:' + text, text: text };
    if (URL_RE.test(text)) return { kind: 'url', href: text, text: text };
    if (PHONE_RE.test(text)) {
      var digits = text.replace(/\D/g, '');
      if (digits.length >= 10) {
        var norm = digits.length === 10 ? '+1' + digits : (digits[0] === '1' && digits.length === 11 ? '+' + digits : '+' + digits);
        return { kind: 'phone', href: 'tel:' + norm, text: text };
      }
    }
    return { kind: 'text', href: null, text: text };
  }

  function renderValue(value) {
    var c = classify(value);
    if (c.kind === 'text') return escapeHtml(c.text);
    return '<a href="' + escapeHtml(c.href) + '" target="_blank" rel="noopener">' + escapeHtml(c.text) + '</a>';
  }

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
```

Then modify the marker creation inside `renderPins` to bind a popup. Replace:

```js
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p.color) });
      marker._drivemap = p;
      state.markers.push(marker);
    });
```

with:

```js
    data.pins.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p.color) });
      marker._drivemap = p;
      marker.bindPopup(buildInfoHtml(p), { maxWidth: 320 });
      state.markers.push(marker);
    });
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Map.html && git commit -m "feat(client): info windows with smart links and Get Directions button"
```

---

## Task 16: `Map.html` — search, filter dropdowns, unmapped list

**Files:**
- Modify: `D:/DriveMap/src/Map.html`

- [ ] **Step 1: Add search + filter + unmapped UI and filter logic**

Inside the `<script>` block, replace the `applyFilters` function with a version that also honors search and column-dropdown filters:

```js
  var columnFilters = {};   // { [columnName]: Set of allowed values (lowercased); empty Set == all }
  var searchTerm = '';

  function matchesSearch(p) {
    if (!searchTerm) return true;
    var needle = searchTerm.toLowerCase();
    if (p.address && p.address.toLowerCase().indexOf(needle) !== -1) return true;
    for (var i = 0; i < (p.popup || []).length; i++) {
      var v = p.popup[i].value;
      if (v != null && String(v).toLowerCase().indexOf(needle) !== -1) return true;
    }
    return false;
  }

  function matchesColumnFilters(p) {
    for (var col in columnFilters) {
      var allowed = columnFilters[col];
      if (!allowed || allowed.size === 0) continue;
      var val = p.filters && p.filters[col];
      var key = val == null ? '' : String(val).trim().toLowerCase();
      if (!allowed.has(key)) return false;
    }
    return true;
  }

  function applyFilters() {
    cluster.clearLayers();
    var visible = 0;
    state.markers.forEach(function (m) {
      var p = m._drivemap;
      var colorVal = (p.colorValue || '(no value)').toLowerCase();
      if (hidden.has(colorVal)) return;
      if (!matchesSearch(p)) return;
      if (!matchesColumnFilters(p)) return;
      cluster.addLayer(m);
      visible++;
    });
    setStatus('Showing ' + visible + ' of ' + state.data.totalRows);
  }
```

And extend `renderSidebar` (still inside `<script>`) to also render filter dropdowns and an unmapped section. Replace the existing `renderSidebar` with:

```js
  function renderSidebar(data) {
    var sb = document.getElementById('sidebar');
    sb.innerHTML = '';

    var hLegend = document.createElement('h3'); hLegend.textContent = 'Legend'; sb.appendChild(hLegend);

    data.legend.entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'legend-row' + (hidden.has(e.value.toLowerCase()) ? ' hidden' : '');
      row.innerHTML =
        '<span class="legend-swatch" style="background:' + e.color + ';"></span>' +
        '<span>' + escapeHtml(e.value) + '</span>' +
        '<span class="legend-count">' + e.count + '</span>';
      row.addEventListener('click', function () {
        var k = e.value.toLowerCase();
        if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
        applyFilters();
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
          columnFilters[col] = allowed;
          applyFilters();
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
```

Finally, wire the search input. At the bottom of the `<script>`, just above `loadData();`, replace the line `document.getElementById('refreshBtn').addEventListener('click', loadData);` with:

```js
  document.getElementById('refreshBtn').addEventListener('click', loadData);
  document.getElementById('searchBox').addEventListener('input', function (ev) {
    searchTerm = ev.target.value.trim();
    applyFilters();
  });
```

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add src/Map.html && git commit -m "feat(client): search, column-filter dropdowns, unmapped list"
```

---

## Task 17: `build.js` — src/ → dist/ with .js→.gs rename

**Files:**
- Create: `D:/DriveMap/scripts/build.js`

**Behavior:**
- Copy `src/appsscript.json` to `dist/appsscript.json`.
- Copy `src/Map.html` to `dist/Map.html`.
- Copy `src/Code.js` to `dist/Code.gs`, stripping the `if (typeof module !== 'undefined') { … }` block at the file end if present.
- For each `src/lib/*.js`, copy to `dist/lib_<name>.gs` (e.g., `dist/lib_colors.gs`), stripping the module footer. Apps Script's editor sorts files alphabetically by name; prefixing with `lib_` keeps helpers together and before `Code`.

- [ ] **Step 1: Create `build.js`**

Create `D:/DriveMap/scripts/build.js`:
```js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const LIB = path.join(SRC, 'lib');
const DIST = path.join(ROOT, 'dist');

function stripModuleFooter(code) {
  // Remove a trailing block of the form: if (typeof module !== 'undefined') { ... }
  return code.replace(/\n?\s*if\s*\(\s*typeof\s+module\s*!==?\s*['"]undefined['"]\s*\)\s*\{[\s\S]*?\}\s*$/m, '\n');
}

function writeOut(rel, data) {
  const dst = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, data);
  console.log('  wrote', path.relative(ROOT, dst));
}

function buildOne(srcPath, outName) {
  const raw = fs.readFileSync(srcPath, 'utf8');
  const cleaned = stripModuleFooter(raw);
  writeOut(outName, cleaned);
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  console.log('Building DriveMap dist/');
  writeOut('appsscript.json', fs.readFileSync(path.join(SRC, 'appsscript.json')));
  writeOut('Map.html', fs.readFileSync(path.join(SRC, 'Map.html')));
  buildOne(path.join(SRC, 'Code.js'), 'Code.gs');

  for (const f of fs.readdirSync(LIB)) {
    if (!f.endsWith('.js')) continue;
    const base = path.basename(f, '.js').replace(/[^a-zA-Z0-9]+/g, '_');
    buildOne(path.join(LIB, f), 'lib_' + base + '.gs');
  }

  console.log('Done.');
}

main();
```

- [ ] **Step 2: Run the build**

Run:
```bash
cd /d/DriveMap && npm run build
```
Expected output (file names may vary):
```
Building DriveMap dist/
  wrote dist/appsscript.json
  wrote dist/Map.html
  wrote dist/Code.gs
  wrote dist/lib_cache.gs
  wrote dist/lib_colors.gs
  wrote dist/lib_columns.gs
  wrote dist/lib_legend.gs
  wrote dist/lib_smart_links.gs
Done.
```

- [ ] **Step 3: Spot-check one output**

Run:
```bash
cd /d/DriveMap && grep -c "typeof module" dist/lib_colors.gs
```
Expected: `0` (module footer stripped).

- [ ] **Step 4: Commit**

```bash
cd /d/DriveMap && git add scripts/build.js && git commit -m "chore: add build script that produces paste-ready .gs files in dist/"
```

---

## Task 18: `SETUP.md` — user-facing setup instructions

**Files:**
- Create: `D:/DriveMap/SETUP.md`

- [ ] **Step 1: Create `SETUP.md`**

Create `D:/DriveMap/SETUP.md`:
````markdown
# DriveMap — Setup

DriveMap turns a Google Sheet of addresses into an interactive map, visible
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

## (Optional) Enable "Open in new tab"

1. In the Apps Script editor: `Deploy → New deployment`.
2. Type: `Web app`.
3. Description: `DriveMap web app`.
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
````

- [ ] **Step 2: Commit**

```bash
cd /d/DriveMap && git add SETUP.md && git commit -m "docs: setup instructions for installing DriveMap into a sheet"
```

---

## Task 19: `README.md` and `template-sheet-link.md`

**Files:**
- Create: `D:/DriveMap/README.md`
- Create: `D:/DriveMap/template-sheet-link.md`

- [ ] **Step 1: Create `README.md`**

Create `D:/DriveMap/README.md`:
````markdown
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
````

- [ ] **Step 2: Create `template-sheet-link.md`**

Create `D:/DriveMap/template-sheet-link.md`:
````markdown
# Template sheet

A pre-built template sheet with DriveMap already bound can be used as the
"easy path" for non-technical users.

**Status:** not yet published.

**How to create and publish one (author action):**

1. Create a new Google Sheet with sample address/metadata rows and a
   reasonable `Status`/`Small Group` column.
2. Install DriveMap into it following `SETUP.md`.
3. `File → Share → Publish to the web` is **not** needed — instead, share
   as read-only, and tell recipients to `File → Make a copy` into their
   own Drive.
4. Paste the shareable URL here once it exists:

```
TEMPLATE_SHEET_URL = <not published yet>
```
````

- [ ] **Step 3: Commit**

```bash
cd /d/DriveMap && git add README.md template-sheet-link.md && git commit -m "docs: README and template-sheet placeholder"
```

---

## Task 20: Full-build smoke test and manual verification checklist

**Files:** no new files. Runs end-to-end tests and produces a checklist
output for the human to execute against a live sheet.

- [ ] **Step 1: Run all unit tests**

Run:
```bash
cd /d/DriveMap && npx vitest run
```
Expected: all tests pass across `columns`, `colors`, `smart-links`, `cache`, `legend`.

- [ ] **Step 2: Rebuild dist/**

Run:
```bash
cd /d/DriveMap && npm run build
```
Expected: `dist/` regenerates with the 5 `lib_*.gs` files, `Code.gs`, `Map.html`, `appsscript.json`.

- [ ] **Step 3: Verify no module footers leaked into dist**

Run:
```bash
cd /d/DriveMap && grep -l "typeof module" dist/ || echo "no matches — clean"
```
Expected: `no matches — clean`.

- [ ] **Step 4: Manual verification in a live spreadsheet**

Execute the checklist below against a real Google Sheet. The script cannot
verify any of this automatically — `SpreadsheetApp` and `Maps.newGeocoder()`
only run inside Apps Script. Report results back.

- [ ] Open a test Google Sheet with at least 5 rows that have an
      `Address` header and a `Status` column.
- [ ] Install per `SETUP.md` Task 1-8. Authorize on first run.
- [ ] Verify `Map Settings` tab was created with auto-detected `Data tab`
      and `Address column` values.
- [ ] Verify `Latitude`, `Longitude`, `Geocoded From` columns were added to
      the data tab.
- [ ] Fill in `Color column: Status`, `Popup columns: Name, Phone, Email, Status`,
      `Filter columns: Status`.
- [ ] Click `Map → Open in dialog`. Confirm pins appear in the right
      geographic region, colored by Status.
- [ ] Click a pin. Confirm the info window shows the configured columns and
      that phone/email values are clickable links.
- [ ] Click `Get Directions` on a pin. Confirm Google Maps opens in a new
      tab with that address pre-filled as destination.
- [ ] Click a legend swatch. Confirm those pins hide/show.
- [ ] Type a member's name into search. Confirm non-matching pins hide.
- [ ] Select a value from the Status filter dropdown. Confirm filter
      narrows the set.
- [ ] Edit an address in the sheet, click `Refresh`. Confirm only that row
      is re-geocoded (new value in `Geocoded From`).
- [ ] Deploy the web app (`Deploy → New deployment`), paste the `/exec` URL
      into `Map Settings → Web app URL`, click `Map → Open in new tab`.
      Confirm the full-page view renders identically.

- [ ] **Step 5: Commit verification results (optional)**

If any issues were found and fixed during manual verification, commit them
with messages describing the symptom and fix. Otherwise no commit.

---

## Self-review notes (filled in by the plan author)

**Spec coverage:**
- §Architecture/Files — Tasks 7, 8, 13; `lib/*` — Tasks 2–6.
- §Data flow — Tasks 9–12.
- §Privacy — handled by `appsscript.json` scopes (Task 7) and the
  `executeAs: USER_DEPLOYING` + `ANYONE_WITH_GOOGLE_ACCOUNT` defaults;
  noted in SETUP.md (Task 18).
- §Settings tab, Block 1 — Task 9 (`SETTINGS_KEYS` includes `Web app URL`).
- §Settings tab, Block 2 (color lookup) — Task 9 (`readSettings_` Block-2
  parser) and Task 18 (docs).
- §Auto-detection — Task 9 (`autoDetectDefaults_`).
- §Cache columns — Task 10 (`ensureCacheColumns_`).
- §Cache invalidation — Task 5 (`needsGeocoding`) used in Task 12.
- §Geocoding, batching, resumability, failure handling — Task 12
  (`geocodeRows_` with `GEOCODE_BATCH_SIZE`, `GEOCODE_TIME_BUDGET_MS`,
  try/catch → `unmapped`).
- §Map UI layout, top bar, left panel, pins, cluster — Tasks 13–16.
- §Info window smart links + Get Directions — Task 15.
- §Color system precedence — Task 3.
- §Legend construction + >20 collapse — Task 6.
- §Setup instructions — Task 18 (SETUP.md), Task 19 (README).
- §Repository layout — enforced by file paths throughout.

**Placeholder scan:** No `TBD`/`TODO`/"implement later" in task bodies.
The `template-sheet-link.md` file intentionally documents an
"unpublished" status — that's a post-development publishing step, not a
code placeholder.

**Type consistency:**
- `resolveColumn` exists as both a Node-exported helper (`src/lib/columns.js`,
  Task 2) and as a local Apps Script helper `resolveColumn_` (Task 11). In
  Apps Script both will be present in global scope; `resolveColumn_`'s
  underscore-suffix is Apps Script convention for "file-private" and avoids
  name collision with the Node helper. Task 11 redeclares the logic inline
  rather than calling `resolveColumn` because trailing underscore naming
  preserves visibility-as-private to Apps Script.
- `needsGeocoding`, `buildLegend`, `resolveColor`, `DEFAULT_PALETTE`,
  `classifyValue` — used in Task 12 and Task 15, defined with matching
  signatures in Tasks 5, 6, 3, 4 respectively.
- Map UI `columnFilters` shape (`{ [column]: Set<lowercaseValue> }`) is
  consistent between Task 16's definition and `applyFilters` usage.
