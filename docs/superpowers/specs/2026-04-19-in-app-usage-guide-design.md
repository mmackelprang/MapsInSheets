# In-App Usage Guide — Design Spec

**Date:** 2026-04-19
**Status:** Approved design, ready for implementation planning
**Implements:** a `❓ Help` link in the map top bar pointing at a new end-user-and-light-admin facing `docs/USAGE.md`.

## Summary

Add a `❓ Help` button to the top bar of the MapsInSheets map UI. The button opens a new tab to a new `docs/USAGE.md` in this repo, rendered by GitHub. The guide is short (~1–2 pages), covers what end users see plus best-practice notes for sheet owners, and cross-links to the existing `SETUP.md`, `MAINTAINER.md`, and `QUICKSTART.md` for deeper topics.

## Goals

- Give end users (people looking at the map; not the sheet installer) a single obvious place to learn what the pins, colors, and view modes mean.
- Give sheet owners a lightweight best-practice reference (data shape, group ID conventions, geocoder gotchas) without duplicating `SETUP.md`.
- Avoid building infrastructure — no Pages site, no embedded in-app docs, no config surface for the link target. Plain GitHub-rendered markdown is enough.

## Non-goals

- Full feature reference (that's `SETUP.md`).
- Install walkthrough (that's `QUICKSTART.md`).
- Template publishing (that's `docs/MAINTAINER.md`).
- Per-sheet configurable Help URL — hardcode the GitHub URL; owners who fork can edit the source.
- Screenshots or diagrams in v1 — keep `USAGE.md` text-only for easy editing and no image-host concerns.
- Offline / private-repo support — the link assumes the repo remains public.

## Audience decisions

- **One link for both audiences** (end users and sheet owners). The doc leads with end-user content because that's the more common first-touch, then moves to best practices.
- **One doc**, not a set per audience. Cross-links send owners to `SETUP.md` / `MAINTAINER.md` when they need more.

## In-app link

### Placement

A new `<a>` element in the `#topbar`, between the `🎯 Fit` button and the `searchBox` input:

```html
<a id="helpLink"
   class="topbar-btn"
   href="https://github.com/mmackelprang/MapsInSheets/blob/main/docs/USAGE.md"
   target="_blank"
   rel="noopener"
   title="Usage guide and best practices">❓ Help</a>
```

### Styling

A new CSS rule in `#topbar` styles anchors to match the existing button look:

```css
#topbar a.topbar-btn { padding: 6px 12px; border: 1px solid #ccc;
                       background: white; border-radius: 4px;
                       text-decoration: none; color: inherit; cursor: pointer; }
#topbar a.topbar-btn:hover { background: #f5f5f5; }
```

This keeps the styles de-duplicated instead of inline-pasting the button styles onto the anchor.

### Behavior

- Always visible in the top bar.
- Left-click opens the USAGE.md page in a new tab (standard anchor behavior, no JS required).
- Middle-click / Ctrl-click honored by the browser (user can open in background tab).
- No popup-blocker workaround needed — this is a direct user click on a static URL, not a scripted `window.open`.

### Why hardcode the URL

Per YAGNI. If a fork wants to override, they edit one string in `Map.html`. A configurable row in Map Settings would add UI, config parsing, and documentation overhead for a case that affects a minority of users.

## `docs/USAGE.md` content

Single markdown file, GitHub-renderable, ~1–2 pages. Table of contents at top linking to each section.

### Outline

1. **What you're looking at** (end user, ~1 screen)
   - The map, pins, and colors at a glance.
   - The top bar: `🔄 Refresh`, `View:` dropdown, `🎯 Fit`, `Search`, `❓ Help`.
   - Left sidebar: Legend (and click-to-hide), column filters, Unmapped list.
   - Clicking a pin: popup content, smart links (phone → tel:, email → mailto:, URL → anchor), `Get Directions`.

2. **Switching views and exploring groups** (end user, ~1 screen)
   - What the `View:` dropdown does; `All` vs. a group column.
   - Group view at a glance: pins recolor to sub-group colors; non-members muted gray; `🎯 Fit` refits to the active selection.
   - Clicking a pin in a group view: hero outline on the clicked pin, sub-group members share color, repeat-click cycles through multiple memberships.
   - Popup member list in group view: leaders at top, scroll for more, click-to-jump to another member's pin.

3. **Best practices** (sheet owner, ~1 screen, inline section)
   - **Data shape.** One row per pinnable entity. One address column. Put the column you want as the popup title (`Name` / `Family`) first in `Popup columns`.
   - **Group IDs.** Short and stable (`A`, `B`, `Youth-A`). Append `*` to mark a leader (`A*`, or `A, B*` for leader of B). Case-insensitive match; display case is preserved.
   - **Colors.** Use the legend `Color column` for at-a-glance state (e.g., `Status`). Let group colors auto-assign — they're stable across sessions (hashed from the sub-group ID into the palette).
   - **Geocoding.** Results cache per row in `Latitude` / `Longitude` / `Geocoded From`. Hand-edit when the geocoder lands on the wrong spot. Expect ~1000 geocoder calls/day (Google quota); tools will display a warning banner when interrupted mid-batch.
   - **Row count.** Designed for <1000 rows. Render time scales linearly; group indexing scales with rows × sub-group memberships.
   - **Privacy.** The map inherits the sheet's sharing. Whoever can open the sheet can open the map. A web-app deployment (for `Map → Open in new tab`) runs under the *deployer's* auth and exposes the *deployer's* sheet data — don't set `Web app URL` on the master of a shared template (see `docs/MAINTAINER.md`).

4. **Where to go next** (pointers)
   - Installing / configuring: [`SETUP.md`](../SETUP.md) for the detailed reference, [`QUICKSTART.md`](../QUICKSTART.md) for the one-page walkthrough.
   - Publishing / maintaining a template copy for others: [`docs/MAINTAINER.md`](MAINTAINER.md).
   - Troubleshooting table: [`QUICKSTART.md` § Troubleshooting](../QUICKSTART.md#troubleshooting-quick-reference).

### What `USAGE.md` explicitly does NOT contain

- Apps Script installation or editing.
- Full reference of every `Map Settings` row — that lives in `SETUP.md`.
- Template publishing workflow (belongs in `MAINTAINER.md`).
- Development / contributing instructions (belong in `README.md`).

This keeps each doc's ownership clear and avoids drift.

## Implementation footprint

### `src/Map.html`

- Insert the `❓ Help` anchor in `#topbar` between `#fitBtn` and `#searchBox`. (Relative ordering: Refresh → View → Fit → Help → Search → status.)
- Add `#topbar a.topbar-btn` and hover rules to the `<style>` block.
- No JavaScript changes. No new handlers.

### New file: `docs/USAGE.md`

- Content per the outline above. No images in v1.
- Cross-links to `SETUP.md`, `MAINTAINER.md`, `QUICKSTART.md` via relative paths so they work in GitHub and in any cloned copy.

### `README.md`

- One-line reference in the existing install/docs section: "For end-users and best-practice tips: [`docs/USAGE.md`](docs/USAGE.md)."

### `dist/`

- `dist/Map.html` regenerates via `npm run build` after the source change.

## Testing

- No new unit tests — the anchor is static.
- Manual UAT (to be added to `QUICKSTART.md` in the implementation plan):
  - Help button is visible in the top bar.
  - Click opens `docs/USAGE.md` on GitHub in a new tab.
  - USAGE.md renders correctly on GitHub and all internal cross-links resolve.
  - Middle-click and Ctrl-click open in background tab (standard browser behavior).

## Rollout and branching

- This work ships on a separate branch `docs/in-app-usage-guide` after `feat/group-view-refinements` merges. Keeping it off the current feature branch avoids widening that PR's scope.
- One or two commits: Map.html + README update in one, new USAGE.md in another — or a single combined commit, whichever reviewer prefers.

## Deferred follow-ups

- **Screenshots / diagrams** in USAGE.md — add if the text-only version leaves common questions unanswered.
- **Configurable Help URL** via Map Settings — revisit only if a fork or customized deployment requests it.
- **In-app modal variant (Design option D from brainstorming)** — short embedded blurb + link-out to USAGE.md. Adds value for users who won't click through to GitHub. Revisit if the link-out feels too heavyweight in practice.
