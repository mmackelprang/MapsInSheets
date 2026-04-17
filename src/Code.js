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
