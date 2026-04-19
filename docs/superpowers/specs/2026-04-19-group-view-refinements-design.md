# Group-View Refinements & Template Distribution — Design Spec

**Date:** 2026-04-19
**Status:** Approved design, ready for implementation planning
**Builds on:** [2026-04-17-multi-group-views-design.md](./2026-04-17-multi-group-views-design.md)

## Summary

Four refinements to the group-view UX introduced in the 2026-04-17 spec,
plus a distribution path that turns MapsInSheets from a paste-and-pray install
into a one-click "Make a copy" experience:

1. In group view, pin color now carries the sub-group identity instead of
   being a ring overlay on top of the legend color. Pins in multiple
   sub-groups recolor as the user cycles through memberships.
2. Non-members of the active sub-group are muted more aggressively (opacity
   0.15 and desaturated to neutral gray).
3. The popup's member list becomes a fixed-height scroll container showing
   ~6 rows, with leaders sorted to the top.
4. A **🎯 Fit** button in the top bar zooms the map to the current selection
   (all visible pins, the active sub-group, or the focused sub-group's
   members, depending on mode).

Plus a separately-scoped distribution track:

5. Publish a template sheet that recipients can one-click copy, maintained
   via `clasp push` from this repo.

## Goals

- Make the currently-active sub-group visible at a glance from the pin
  palette alone, without scanning for rings.
- Make the popup member list usable when sub-groups have dozens of members.
- Give the user a way to re-fit the map after manual panning/zooming,
  including when they want to recentre on the active sub-group.
- Turn "install the script" from a 10-click paste into a single-click
  copy-template operation.

## Non-goals

- Per-sub-group color customization — still auto-assigned from the palette.
- Changing the All-view rendering — it continues to color pins by the
  configured `Color column`.
- Centralized script updates to recipients' copies — template copies are
  frozen snapshots by design (see "Distribution" section for the tradeoff).
- Publishing to the Google Workspace Marketplace as a formal Add-on.

## Feature 1 — Pin coloring in group view

### Behavior

In `all` mode, pin visuals are unchanged: `pin.color` from the legend column,
opacity 1.

In `group` mode, each pin's visuals are derived from a single concept,
**the active sub-group for this pin right now**:

| Condition | Active sub-group |
|---|---|
| Pin has 0 memberships in the active column | *(none — muted gray)* |
| No pin is focused | Pin's first membership, in sheet-cell order |
| Pin is a member of the focused sub-group | The focused sub-group |
| Pin has memberships but none match the focused sub-group | *(none — muted gray)* |

Rendering:

- **Identified active sub-group:** `color = palette[activeGroupId]`,
  `opacity = 1`. If the pin is a leader of its active sub-group: `★` star
  overlay and `1.5×` scale.
- **No active sub-group:** `color = #9e9e9e` (neutral gray), `opacity = 0.15`.
  No star, default scale.
- **Hero pin** (the pin that was actually clicked to set the focus): thin
  neutral outline (`box-shadow: 0 0 0 2px #333`) in addition to its color
  treatment, so the click anchor is identifiable when many pins share the
  focused sub-group's color.

The colored ring from the previous design is removed entirely. Pin color
now carries the information the ring used to.

### Rationale

- Pin color is a stronger at-a-glance signal than a ring of the same hue.
- With pin color as the primary signal, the ring becomes redundant and adds
  visual noise.
- Falling back to the "first membership in cell order" when no pin is focused
  means a user who picks a group view already sees a meaningful color
  distribution even before any click.
- Muting non-members to gray at 0.15 opacity — rather than keeping their
  legend color at 0.35 — makes the active sub-group pop more and unifies
  the "zero-membership" and "not-in-focused-group" cases visually.

### Implementation scope

- Rewrite the `group`-mode branch of `computePinVisual(pin)` in
  `src/Map.html` to compute the active sub-group per the table above and
  return `{color, opacity, scale, star, heroOutline}`.
- Update `makePinIcon(visual)` to:
  - Remove the ring rendering (the `box-shadow: 0 0 0 Npx <ringColor>` path).
  - Add a `heroOutline` boolean that renders the thin neutral outline when
    truthy.
- No changes to `src/lib/groups.js` or the server side — the data shape is
  already sufficient.

## Feature 2 — Stronger non-member muting

Covered by Feature 1: the "no active sub-group" branch returns
`color = #9e9e9e, opacity = 0.15`. This is a single, unified rule — not a
separate code path — so zero-membership pins and "has memberships but not in
focused group" pins both render identically.

## Feature 3 — Scrollable popup member list

### Behavior

When a pin is focused in group mode, its popup includes a list of every
member of the focused sub-group. Changes:

- **Remove the 20-item truncation.** The list shows all members; no
  "…and N more" line.
- **Sort leaders to the top**, stable within each segment: leaders appear in
  their source order, followed by non-leaders in their source order.
- **Wrap the rows in a scroll container.** `max-height` ≈ **6 rows**
  (≈126px at the current row height of ~21px), `overflow-y: auto`.
- The header row ("District: David — 50 members, 1 leader") stays **outside**
  the scroll container so it's always visible.
- Leader rows keep the `★` prefix and all rows keep the existing
  click-to-jump link behavior.

Popup `maxWidth: 320` is unchanged.

### Implementation scope

- Modify `buildInfoHtml(p)` in `src/Map.html`:
  - Compute leaders and non-leaders separately, concatenate with leaders
    first, then render all rows.
  - Wrap rows in `<div style="max-height:126px; overflow-y:auto;">`.
  - Delete the `MAX = 20` slice and the "…and N more" line.

## Feature 4 — Zoom-to-selection button

### Behavior

A new `🎯 Fit` button sits in the top bar immediately after the `View:`
dropdown. Tooltip: `Zoom to selection`.

Clicking it calls `fitToSelection()`, which computes a "selection" set from
current state and fits the map to it:

| Mode | Focused pin? | Selection set |
|---|---|---|
| All | — | All currently-visible pins (after search/legend/column filters) |
| Group | No | All visible pins with ≥1 membership in the active column |
| Group | Yes | All pins in the focused sub-group (visible or muted — the user asked for the selection; filters don't narrow it further) |

Edge cases:

- **Zero pins in selection:** button does nothing silently (no error, no
  disabled state). Simpler to implement and the user can see the map hasn't
  moved.
- **One pin in selection:** `map.setView([lat, lng], 16)` — avoids zooming
  in absurdly on a degenerate bounding box.
- **Multiple pins:** `map.fitBounds(bounds.pad(0.1))`, matching the initial
  fit behaviour in `rebuildMarkers`.

### Implementation scope

- Add `<button id="fitBtn">🎯 Fit</button>` to the top bar in `src/Map.html`,
  with a `title` attribute for the tooltip.
- Add a `fitToSelection()` function computing the selection set per the
  table and calling `fitBounds` / `setView` appropriately.
- Wire the button's click handler.

## Code touch points (features 1–4)

All changes are in `src/Map.html`. No changes to `src/Code.js` or
`src/lib/`.

Functions modified:

- `computePinVisual(pin)` — rewrite group-mode branch.
- `makePinIcon(visual)` — remove ring rendering; add hero outline.
- `buildInfoHtml(p)` — leader sort, remove 20-item truncation, wrap in
  scroll container.

Functions added:

- `fitToSelection()` — computes selection and fits map.

DOM additions:

- `<button id="fitBtn">` in `#topbar`.

## Testing

- No new unit tests. The existing 29 tests in `tests/` cover pure-logic
  modules (`lib/colors.js`, `lib/groups.js`, etc.) which are unchanged.
- Manual UAT: extend `QUICKSTART.md §5` with new checklist items covering:
  - Switching to a group view recolors all pins to their first sub-group's
    colour; zero-membership pins go muted gray.
  - Clicking a multi-membership pin cycles through its groups and the
    whole-map palette shifts accordingly.
  - Non-members of a focused sub-group render at ≈0.15 opacity in neutral
    gray (vs. the prior 0.35 opacity in legend color).
  - Popup member list scrolls after ~6 rows; leaders appear at the top.
  - **Fit** button in All mode refits to all visible pins after a manual
    pan/zoom.
  - **Fit** button in group mode (no focus) refits to pins with ≥1
    membership in the active column.
  - **Fit** button with a focused sub-group refits to that sub-group's
    members, including ones that legend/column filters had hidden.

## Feature 5 — Template distribution + clasp workflow

### Distribution model

A new dimension of the project: rather than every end-user pasting `dist/`
files into their sheet, the maintainer publishes a **template sheet** and
recipients one-click copy it into their own Drive.

- The template sheet lives in the maintainer's Google account and has
  MapsInSheets pre-installed (script bound, `Map Settings` pre-filled with
  reasonable defaults).
- It is shared as **Anyone with the link → Viewer** with "Viewers and
  commenters can see the option to download, print, and copy" enabled.
- The share URL exposed to users is of the form
  `https://docs.google.com/spreadsheets/d/<FILE_ID>/copy`, which auto-opens
  Google's "Make a copy" dialog.
- When a recipient copies the sheet, Google copies the **bound script**
  along with it. The copy becomes an **independent** Apps Script project in
  the recipient's Drive — the maintainer does not (and cannot) control it
  thereafter.

### What this model delivers

- **One-click install** for recipients — `copy` URL → name the copy → done.
- **Sealed master** — because the template is shared read-only, no recipient
  can modify the maintainer's original. "Only I can update the backend
  scripts" is satisfied for the **master**.
- **Private recipient data** — the copy runs in the recipient's Drive under
  their own auth; the maintainer has no access to recipient data.

### What this model does NOT deliver

- **Centralized updates.** Copies are frozen snapshots of the script at
  the moment of copy. Later updates to the master template don't
  retroactively reach existing copies. Recipients who want updates must
  either make a fresh copy and migrate their data, or follow
  `QUICKSTART.md §2` to manually paste the new `dist/` files into their
  copy.
- **Enforced script integrity on copies.** Once a recipient owns a copy,
  they have full edit rights to its bound script. This is inherent to
  Google Sheets' sharing model — not fixable without switching to a
  Library or Workspace Add-on architecture (see "Deferred alternatives"
  below).

### Web-app URL caveat (important)

The `doGet()` entry point and its `/exec` URL are tied to the *deploying*
script and run under the *deployer's* auth. `SpreadsheetApp.getActiveSpreadsheet()`
inside `doGet()` returns the spreadsheet that **owns the bound script**
— for the master, that's the maintainer's template sheet.

**Consequence:** if the maintainer pre-fills `Web app URL` in the master
template's `Map Settings` tab, every recipient's copy that hasn't re-deployed
would hit the maintainer's `/exec` URL and see the maintainer's sheet data.
This is a privacy and correctness bug.

**Mitigation:** leave the `Web app URL` cell **blank** in the master
template. Recipients who want "Open in new tab" on their copy must deploy
their own web app and paste their own `/exec` URL — the existing
"New-tab map not configured" modal already walks them through this.

### Author publish workflow (one-time)

1. Create a Google Sheet named e.g. `MapsInSheets — Template` in the
   maintainer's account.
2. Populate with the 5-row sample data from `QUICKSTART.md §1`.
3. Install current `dist/` into its bound script (via paste the first time,
   or `clasp push` once the clasp workflow below is set up).
4. Fill in `Map Settings` per `QUICKSTART.md §4`. **Leave the `Web app URL`
   row blank** (see caveat above).
5. Run **Map → Open in dialog** once, authorize, confirm the map renders.
6. Share: **Anyone with the link → Viewer**, enable "Viewers and commenters
   can see the option to download, print, and copy" in the sharing dialog's
   advanced settings.
7. Construct the one-click copy URL:
   `https://docs.google.com/spreadsheets/d/<FILE_ID>/copy`
8. Paste that URL into `template-sheet-link.md`, replacing the
   `TEMPLATE_SHEET_URL = <not published yet>` placeholder.

### Author update workflow (with clasp)

1. Install clasp: `npm install -g @google/clasp`.
2. Log in: `clasp login` (once per Google account).
3. Open the template sheet's Apps Script editor; copy the Script ID from
   **Project Settings → IDs → Script ID**.
4. In the repo root, create `.clasp.json`:

   ```json
   { "scriptId": "<SCRIPT_ID>", "rootDir": "./dist" }
   ```

   This file is safe to commit — the script ID is not a secret (the
   script itself is open-source in this repo).
5. Update workflow:

   ```bash
   npm run build     # regenerate dist/ from src/
   clasp push        # upload dist/ to the template sheet's script
   ```

6. New copies made from the template after `clasp push` get the latest.
   Existing copies remain frozen.

### Docs changes

- `template-sheet-link.md` — flesh out with the publish workflow and
  replace the placeholder URL once the template is live.
- `README.md` — add a "Quick install (recommended)" section at the top
  pointing to the one-click copy URL. Keep `QUICKSTART.md` as the manual
  fallback.
- `QUICKSTART.md` — add a short intro note that a template copy exists for
  users who want it. The manual paste flow stays as the fallback and as
  the upgrade path for recipients who want post-copy script updates.
- New file `docs/MAINTAINER.md` — clasp setup + push workflow in one place,
  for the maintainer's reference.

### Deferred alternatives

- **Apps Script Library.** Recipients could reference a central library by
  Script ID, and library updates would flow to everyone. But libraries
  can't install UI (menus) automatically — each recipient still needs to
  paste an `onOpen` wrapper. And version pinning requires manual bumps.
  Not obviously better than the template model.
- **Google Workspace Add-on / Marketplace.** True one-click install from a
  sidebar with centralized updates. But it requires a GCP project, an
  OAuth consent screen configuration, and Google verification once usage
  passes 100 users. Too much infrastructure for this project's scale.

## Open questions

None — all questions resolved during brainstorming.

## Rollout

Features 1–4 ship as a single build of `dist/` pushed to both this repo
and, via `clasp push`, to the template sheet once it exists. Feature 5
is sequenced after 1–4 so the template ships with the refined UX.
