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
