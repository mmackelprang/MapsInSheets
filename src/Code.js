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
