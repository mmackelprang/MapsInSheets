# In-App Usage Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `❓ Help` button to the MapsInSheets top bar, create a new end-user-and-light-admin `docs/USAGE.md`, and surface it from `README.md`.

**Architecture:** Pure-doc + one anchor tag. No JavaScript. No tests. Map.html gets a new topbar anchor styled to match the existing buttons; a new USAGE.md lives in `docs/`; README gets a one-line pointer.

**Tech Stack:** Markdown (GitHub-rendered), HTML/CSS in `src/Map.html`.

**Spec:** `docs/superpowers/specs/2026-04-19-in-app-usage-guide-design.md`

---

## Conventions and setup

- **Working directory:** `D:/prj/MapsInSheets`. Branch: `docs/in-app-usage-guide` (already checked out). Shell: Git Bash (forward slashes).
- **Existing commits:** HEAD on the branch = HEAD on main = `b79a901` (the PR #1 merge commit).
- **Build:** `npm run build` regenerates `dist/`. `dist/Map.html` is a verbatim copy of `src/Map.html`.
- **No tests**: the anchor is static; the `.md` file is text. Existing 66 tests must still pass.
- **Dist is committed.** Any source change to `src/Map.html` must commit the regenerated `dist/Map.html` in the same commit.

---

## File structure

```
D:/prj/MapsInSheets/
├── src/
│   └── Map.html                                    # MODIFY — add Help anchor + topbar-btn CSS
├── dist/
│   └── Map.html                                    # regenerated
├── docs/
│   └── USAGE.md                                    # NEW — end-user + light-admin guide
└── README.md                                       # MODIFY — one-line reference
```

**Why this split:**

- Single doc file (`docs/USAGE.md`) owns the end-user + best-practices content, cross-linking out to SETUP / MAINTAINER / QUICKSTART for deeper topics.
- Map.html change is minimal: one anchor + one CSS rule.
- README gets a single sentence pointing at USAGE.md alongside the existing install-doc references.

---

## Task 1: Add `❓ Help` anchor and topbar-btn CSS in `Map.html`

**Files:**
- Modify: `D:/prj/MapsInSheets/src/Map.html` — add one CSS rule in the `<style>` block; add one anchor tag in the `#topbar`

- [ ] **Step 1: Add the CSS rule**

In the `<style>` block, locate the existing `#topbar button` rule at line 12:

```css
    #topbar button { padding: 6px 12px; border: 1px solid #ccc; background: white; cursor: pointer; border-radius: 4px; }
```

Replace that line with these two rules (extending the selector to also match `<a class="topbar-btn">`):

```css
    #topbar button, #topbar a.topbar-btn { padding: 6px 12px; border: 1px solid #ccc; background: white; cursor: pointer; border-radius: 4px; text-decoration: none; color: inherit; }
    #topbar a.topbar-btn:hover { background: #f5f5f5; }
```

The existing `button` gets the new `text-decoration: none` and `color: inherit` — harmless for `<button>`, load-bearing for `<a>`.

- [ ] **Step 2: Add the Help anchor to the top bar**

Locate the `#topbar` block (around line 39-46). The current top bar has:

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

Insert the Help anchor between the `fitBtn` button and the `searchBox` input, so the final block reads:

```html
  <div id="topbar">
    <button id="refreshBtn">🔄 Refresh</button>
    <label style="font-size:13px;color:#666;">View:</label>
    <select id="viewSelect" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;"></select>
    <button id="fitBtn" title="Zoom to selection">🎯 Fit</button>
    <a id="helpLink" class="topbar-btn" href="https://github.com/mmackelprang/MapsInSheets/blob/main/docs/USAGE.md" target="_blank" rel="noopener" title="Usage guide and best practices">❓ Help</a>
    <input id="searchBox" type="search" placeholder="Search…">
    <span id="status">Loading…</span>
  </div>
```

- [ ] **Step 3: Rebuild dist/**

Run: `npm run build`

Expected: `dist/Map.html` regenerated.

- [ ] **Step 4: Run tests (sanity)**

Run: `npx vitest run`

Expected: 66 passing (unchanged — Map.html isn't under test).

- [ ] **Step 5: Commit**

```bash
git -C D:/prj/MapsInSheets add src/Map.html dist/Map.html
git -C D:/prj/MapsInSheets commit -m "feat(client): add Help button linking to docs/USAGE.md

A new '❓ Help' anchor in the top bar between Fit and Search opens the
GitHub-rendered docs/USAGE.md in a new tab. Adds a '.topbar-btn' CSS
rule so anchors can share the existing button styling."
```

---

## Task 2: Create `docs/USAGE.md`

**Files:**
- Create: `D:/prj/MapsInSheets/docs/USAGE.md`

- [ ] **Step 1: Write the file**

Create `D:/prj/MapsInSheets/docs/USAGE.md` with EXACTLY this content:

````markdown
# MapsInSheets — Usage Guide

How to read the map, how to switch views, and a short list of best
practices for sheet owners. For install / config / maintenance, see the
links at the bottom.

## Contents

- [What you're looking at](#what-youre-looking-at)
- [Switching views and exploring groups](#switching-views-and-exploring-groups)
- [Best practices for sheet owners](#best-practices-for-sheet-owners)
- [Where to go next](#where-to-go-next)

## What you're looking at

- **Pins on the map.** Each pin is one row in the underlying Google
  Sheet, positioned at the geocoded address.
- **Pin colors** are driven by the sheet's configured `Color column`.
  In the default example, `Status` drives green/yellow/red/gray.
- **Top bar.** Left-to-right:
  - `🔄 Refresh` — reloads data and re-geocodes any changed or
    unmapped addresses.
  - `View:` dropdown — `All` (legend-color mode) or any configured
    group column.
  - `🎯 Fit` — zooms the map to the current selection. In All mode,
    that's every visible pin; in a group view, it's the sub-group
    in focus (or every group member if no pin is focused).
  - `❓ Help` — you're reading it.
  - Search box — filters pins by popup field text.
- **Left sidebar.** In All mode: the color legend (click a color to
  hide / show that group) and any configured column filters (multi-
  select). In a group view: the column's sub-groups with member
  counts. Any addresses that failed to geocode appear at the bottom
  in an `Unmapped` list.
- **Clicking a pin** opens a popup with fields from the sheet.
  - Phone numbers become `tel:` links (tap to call).
  - Email addresses become `mailto:` links.
  - URLs become clickable anchors.
  - A blue `Get Directions` button opens Google Maps with the
    pin's address pre-filled as the destination.

## Switching views and exploring groups

Group columns are extra columns in the sheet whose cells contain
comma-separated group IDs (for example `A, B*, C` means member of A and
C, leader of B). Group columns light up when the owner configures them
in `Map Settings → Group columns`.

When you switch the `View:` dropdown from `All` to a group column:

- **Each pin recolors** to its first sub-group's palette color. Pins
  that aren't in any sub-group for that column dim to a muted gray.
- **Clicking a pin** gives it a thin dark "hero outline" and recolors
  every other pin that shares its sub-group. Non-members dim gray.
- **Clicking the same pin again** cycles to the next sub-group it
  belongs to, re-coloring the map to match.
- **The popup's member list** shows everyone in the focused sub-group,
  leaders at the top (marked with `★`), followed by non-leaders. The
  list scrolls vertically if there are more than ~6 members.
- **Click a name** in the member list to jump the map's focus to that
  pin, preserving the current sub-group focus.
- **Click a blank patch of map** to clear the focus; the sub-group
  coloring reverts to the "first membership" default.

The `🎯 Fit` button works differently in each view:

- **All mode:** fits the map around all currently-visible pins
  (respecting legend hides, column filters, and search).
- **A group view, no pin focused:** fits around pins that have at
  least one membership in the active column (non-members are
  excluded).
- **A group view with a focused pin:** fits around the focused
  sub-group's members, even if legend or column filters would
  normally hide them — you asked for the group, so you get the
  group.

Single-pin selections center at a reasonable zoom instead of zooming
in on a zero-area bounding box.

## Best practices for sheet owners

- **One row per pinnable entity.** One address per row. Put the column
  you want as the popup title (for example `Name` or `Family`) first in
  `Map Settings → Popup columns`.
- **Group IDs: keep them short and stable.** `A`, `B`, `Youth-A`, `2024`
  — anything short and alphanumeric. Append `*` to mark a leader
  (`A*`, or `A, B*, C` for leader of B). Matching is case-insensitive;
  display case is preserved from the sheet.
- **Legend colors serve different purposes from group colors.** Put
  at-a-glance *state* in the legend `Color column` (Active /
  Inactive / Visitor). Let *group membership* use auto-assigned
  palette colors — they're stable across sessions (a hash of the
  sub-group ID picks from the palette).
- **Geocoding caches per row.** `Latitude`, `Longitude`, and
  `Geocoded From` columns are written by the geocoder. Hand-edit
  them if the geocoder lands on the wrong spot — the map will
  respect your manual values. Expect roughly 1000 geocoder calls
  per day (Google's free quota); a warning banner shows if a run
  is interrupted mid-batch.
- **Row count.** Designed for < 1000 rows. Render time scales
  linearly; group indexing scales with rows × memberships.
  Larger sheets work but may feel slow to first-paint.
- **Privacy follows the sheet.** Whoever can open the underlying
  Google Sheet can open the map. There's no public exposure unless
  you explicitly share the sheet to "anyone with the link."
- **Web app URL caveat.** If you deploy the script as a web app for
  `Map → Open in new tab`, the `/exec` URL runs under *your*
  account's auth and serves *your* sheet's data. Don't pre-fill
  `Map Settings → Web app URL` on a template sheet you share —
  every recipient's copy would hit your URL. Leave it blank and
  let each copy deploy its own. See the
  [Maintainer Guide](MAINTAINER.md) for the full story.

## Where to go next

- **Installing / configuring:** see [`SETUP.md`](../SETUP.md) for the
  detailed reference or [`QUICKSTART.md`](../QUICKSTART.md) for the
  one-page walkthrough.
- **Publishing or maintaining a template copy others can use:** see
  [`docs/MAINTAINER.md`](MAINTAINER.md).
- **Troubleshooting:** [`QUICKSTART.md § Troubleshooting quick
  reference`](../QUICKSTART.md#troubleshooting-quick-reference).
````

- [ ] **Step 2: Commit**

```bash
git -C D:/prj/MapsInSheets add docs/USAGE.md
git -C D:/prj/MapsInSheets commit -m "docs: add USAGE.md end-user and best-practices guide

One-page guide covering what the map shows, how group views work, and
light best-practice notes for sheet owners. Cross-links to SETUP,
MAINTAINER, QUICKSTART for deeper topics."
```

---

## Task 3: Surface USAGE.md from `README.md`

**Files:**
- Modify: `D:/prj/MapsInSheets/README.md` — add a one-line reference

- [ ] **Step 1: Insert the reference**

In `README.md`, locate the `## Manual install (technical users, or for updates to an existing copy)` section (currently around line 64). The existing block reads:

```markdown
## Manual install (technical users, or for updates to an existing copy)

1. **Clone or download this repo.**
2. **Follow [QUICKSTART.md](QUICKSTART.md)** — a single-page install + UAT
   walkthrough. You'll paste the contents of `dist/` into your sheet's Apps
   Script editor and click `Map → Open in dialog`.

For the longer version with every option spelled out, see
[SETUP.md](SETUP.md).
```

Replace the trailing paragraph with:

```markdown
For the longer version with every option spelled out, see
[SETUP.md](SETUP.md). For end-users and best-practice tips, see
[`docs/USAGE.md`](docs/USAGE.md).
```

So the full block after the edit reads:

```markdown
## Manual install (technical users, or for updates to an existing copy)

1. **Clone or download this repo.**
2. **Follow [QUICKSTART.md](QUICKSTART.md)** — a single-page install + UAT
   walkthrough. You'll paste the contents of `dist/` into your sheet's Apps
   Script editor and click `Map → Open in dialog`.

For the longer version with every option spelled out, see
[SETUP.md](SETUP.md). For end-users and best-practice tips, see
[`docs/USAGE.md`](docs/USAGE.md).
```

- [ ] **Step 2: Commit**

```bash
git -C D:/prj/MapsInSheets add README.md
git -C D:/prj/MapsInSheets commit -m "docs(readme): link to USAGE.md alongside existing install references"
```

---

## Post-plan checklist

- [ ] `npx vitest run` — 66 passing (unchanged).
- [ ] `npm run build` — clean.
- [ ] Visit the `helpLink` target manually after push: clicking the
      topbar `❓ Help` button in a live sheet opens the GitHub-rendered
      `docs/USAGE.md` page; all in-doc anchor links (`#what-youre-looking-at`,
      etc.) resolve on GitHub; cross-links to `SETUP.md`, `QUICKSTART.md`,
      and `MAINTAINER.md` resolve.
- [ ] `git log --oneline main..HEAD` shows 3 new commits.
- [ ] `git status` clean.

---

## Self-review notes

- **Spec coverage:**
  - In-app link (spec § "In-app link") → Task 1.
  - USAGE.md outline (spec § "docs/USAGE.md content") → Task 2 — all four outline sections present with the spec-listed bullets.
  - Implementation footprint (spec § "Implementation footprint") → Tasks 1–3 together cover Map.html, USAGE.md, README.md.
  - No screenshots / no config row for Help URL — YAGNI-scoped as the spec requires.
- **Placeholders:** none.
- **Type / path consistency:** `#helpLink` id, `.topbar-btn` class, and `docs/USAGE.md` path match between CSS selector, anchor tag, README reference, and in-doc cross-links.
