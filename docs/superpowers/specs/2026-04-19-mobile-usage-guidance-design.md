# Mobile Usage Guidance — Design Spec

**Date:** 2026-04-19
**Status:** Approved design, ready for implementation planning
**Depends on:** [2026-04-19-in-app-usage-guide-design.md](./2026-04-19-in-app-usage-guide-design.md) — adds content to `docs/USAGE.md`, which that spec creates. Implementation branch must merge *after* the in-app-usage-guide branch lands.

## Summary

Document how to use MapsInSheets on a phone. The Google Sheets and Drive mobile apps don't execute Apps Script custom menus (platform limitation), so the `Map` menu is invisible there. The workaround is the deployed web-app `/exec` URL, which works in any mobile browser and can be added to the home screen for a pseudo-app experience.

A new section is added to `docs/USAGE.md` covering the reality check, owner setup, phone-user steps (including iOS and Android home-screen add), and the on-mobile behavior that differs from desktop. A short UAT subsection is added to `QUICKSTART.md` under the existing "Optional: web app deployment" so sheet owners can verify the mobile path works.

## Goals

- Make it obvious to phone users that the `Map` menu doesn't exist on mobile (and why).
- Give sheet owners a clear, tested path to "deploy + share a URL the phone user can bookmark."
- Make the mobile experience feel like a real app, not a browser tab, via home-screen install.
- Avoid duplicating the web-app deploy walkthrough that already lives in `QUICKSTART.md §6`.

## Non-goals

- Building a native iOS/Android app, PWA manifest, or custom app shell.
- Any JavaScript, CSS, or `Map.html` change. The UI is already Leaflet-responsive and works on phones today; this is docs-only.
- Adding mobile-specific features (tap-and-hold menus, swipe gestures, etc.).
- Offline support, service workers, caching.
- A separate `docs/MOBILE.md` — a section inside `USAGE.md` is sufficient.

## Content placement

- **Primary:** new section `## Using the map on a phone` in `docs/USAGE.md`, positioned between the existing `## Best practices for sheet owners` and `## Where to go next`. A link is added to the in-doc Table of Contents at the top.
- **Secondary:** new UAT subsection `### Mobile usage` in `QUICKSTART.md`, positioned after the existing `### Optional: web app deployment` subsection in `## 5 · UAT checklist`.

## `docs/USAGE.md` — new section

Section heading: `## Using the map on a phone`

Content outline (approx. 1 screen):

1. **Reality check (one paragraph).** Custom menus like the `Map` menu aren't executed by the Google Sheets / Drive mobile apps — this is a Google platform limitation, not a MapsInSheets bug. To use the map on a phone, the sheet owner deploys the script as a web app, then shares the resulting `/exec` URL with phone users.

2. **What the sheet owner does (once).**
   - Deploy the script as a web app per [`QUICKSTART.md §6`](../QUICKSTART.md#optional-web-app-deployment) (no change to that section).
   - Copy the `/exec` URL from the deployment dialog.
   - Paste it into the `Web app URL` row of `Map Settings`.
   - Share the `/exec` URL with anyone who will use the map on a phone.

3. **What the phone user does.**
   - Open the shared `/exec` URL in Safari (iOS) or Chrome (Android).
   - Sign in with the same Google account that has access to the sheet.
   - **iOS:** tap the Share button, then "Add to Home Screen."
   - **Android:** tap the 3-dot menu, then "Install app" (Chrome PWA prompt) or "Add to Home screen."
   - The new icon launches a standalone view of the map.

4. **What works / what's different on mobile.**
   - Pinch-to-zoom, pan, and tap-a-pin all work.
   - The `Get Directions` button opens the phone's default maps app (Google Maps / Apple Maps) with turn-by-turn navigation.
   - The sidebar stacks below the map on narrow screens; on tablets it appears beside the map.
   - No geocoding runs on the phone — the `/exec` URL serves pre-geocoded data. Tapping `🔄 Refresh` on the phone re-fetches the latest, but new addresses are geocoded from a desktop session or Apps Script run.

5. **Privacy reminder.** The `/exec` URL runs under whoever deployed it. If a template maintainer pre-fills `Web app URL` in the shared master, every recipient's copy would hit the maintainer's URL and see the maintainer's data. Leave `Web app URL` blank on templates — see [`MAINTAINER.md`](MAINTAINER.md).

## `QUICKSTART.md` — new UAT subsection

Inserted after the existing `### Optional: web app deployment` subsection, at the same `###` heading level. Three checkbox items:

```markdown
### Mobile usage

- [ ] After deploying the web app and pasting the `/exec` URL in
      `Map Settings → Web app URL`, open the same URL on a phone.
      Map loads; pins are placed correctly.
- [ ] **iOS:** Share → "Add to Home Screen." **Android:** 3-dot menu →
      "Install app" or "Add to Home screen." The new icon launches a
      standalone map view (no browser chrome).
- [ ] Tap a pin on the phone. Popup renders. `Get Directions` opens the
      phone's default maps app with the destination prefilled.
```

## Implementation footprint

- **Modify `docs/USAGE.md`:** add the new section and update its Table of Contents.
- **Modify `QUICKSTART.md`:** add the new UAT subsection.
- **No code changes.** Map.html, Code.js, `src/lib/`, `dist/`, tests — all unchanged.
- **No build step needed** since only docs change.

## Branching

- Branch name: `docs/mobile-usage-guidance`.
- Branches off `main` **after `docs/in-app-usage-guide` (PR #2) merges** — this branch modifies `docs/USAGE.md`, which that PR creates.
- Two commits expected: one for `USAGE.md`, one for `QUICKSTART.md`. Or one combined commit; either is fine.

## Testing

- No unit tests (docs-only).
- Manual verification on a live phone per the new `QUICKSTART.md § Mobile usage` subsection.
- All three UAT items are the full test plan.

## Deferred follow-ups

- **Proper PWA manifest** (icon, theme-color, standalone display mode) — would make the home-screen install nicer but adds real code and requires iconography. Revisit if users report that the current bookmark install looks too plain.
- **Mobile-specific UI tweaks** (larger tap targets, collapsible sidebar on small screens) — Leaflet's defaults are usable today. Revisit if mobile feedback highlights specific pain points.
- **Screenshots** in the new section — add if the text-only instructions confuse users. The iOS/Android home-screen add dialogs change often enough that screenshots would go stale quickly.
