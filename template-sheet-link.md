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
