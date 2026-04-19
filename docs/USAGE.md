# MapsInSheets — Usage Guide

How to read the map, how to switch views, and a short list of best
practices for sheet owners. For install / config / maintenance, see the
links at the bottom.

## Contents

- [What you're looking at](#what-youre-looking-at)
- [Switching views and exploring groups](#switching-views-and-exploring-groups)
- [Best practices for sheet owners](#best-practices-for-sheet-owners)
- [Using the map on a phone](#using-the-map-on-a-phone)
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

## Using the map on a phone

The `Map` custom menu you see in Google Sheets on a desktop browser
isn't executed by the Google Sheets or Drive mobile apps — this is a
Google platform limitation, not a MapsInSheets bug. Custom Apps Script
menus are desktop-only. To use the map on a phone, the sheet owner
deploys the script as a web app, then shares the resulting `/exec` URL.

**What the sheet owner does (once):**

- Deploy the script as a web app following [`QUICKSTART.md §6`](../QUICKSTART.md#optional-web-app-deployment).
- Copy the `/exec` URL from the deployment dialog.
- Paste it into the `Web app URL` row of `Map Settings`.
- Share the `/exec` URL with anyone who'll use the map on a phone.

**What the phone user does:**

- Open the shared `/exec` URL in Safari (iOS) or Chrome (Android).
- Sign in with the same Google account that has access to the sheet.
- **iOS:** tap the Share button, then "Add to Home Screen."
- **Android:** tap the 3-dot menu, then "Install app" (Chrome PWA
  prompt) or "Add to Home screen."
- The new icon launches a standalone view of the map — no browser
  chrome, looks and feels like an app.

**What works / what's different on mobile:**

- Pinch-to-zoom, pan, and tap-a-pin all work as expected.
- `Get Directions` opens the phone's default maps app (Google Maps on
  Android; Apple Maps or Google Maps on iOS) with turn-by-turn nav.
- The sidebar stacks below the map on narrow screens; on tablets it
  appears beside the map.
- No geocoding runs on the phone — the `/exec` URL serves pre-geocoded
  data. Tapping `🔄 Refresh` re-fetches the latest, but new addresses
  need a desktop session (or an Apps Script run) to be geocoded.

**Privacy reminder.** The `/exec` URL runs under whoever deployed it.
If a template maintainer pre-fills `Web app URL` in a shared master,
every recipient's copy would hit the maintainer's URL and see the
maintainer's data. Leave `Web app URL` blank on templates — see
[`MAINTAINER.md`](MAINTAINER.md).

## Where to go next

- **Installing / configuring:** see [`SETUP.md`](../SETUP.md) for the
  detailed reference or [`QUICKSTART.md`](../QUICKSTART.md) for the
  one-page walkthrough.
- **Publishing or maintaining a template copy others can use:** see
  [`docs/MAINTAINER.md`](MAINTAINER.md).
- **Troubleshooting:** [`QUICKSTART.md § Troubleshooting quick
  reference`](../QUICKSTART.md#troubleshooting-quick-reference).
