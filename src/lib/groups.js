// For Node tests only — build step strips this require; in Apps Script the
// needed symbols are provided by lib_colors.gs in script-scope.
const { hashString, DEFAULT_PALETTE } = require('./colors.js');

function parseGroupCell(value) {
  if (value === null || value === undefined) return [];
  const str = String(value);
  if (str.trim() === '') return [];

  const tokens = str.split(',');
  const seen = new Map(); // lowercase id -> { id, isLeader }
  for (let raw of tokens) {
    let token = raw.trim();
    if (token === '' || token === '*') continue;

    let isLeader = false;
    if (token.endsWith('*')) {
      isLeader = true;
      token = token.slice(0, -1).trim();
      if (token === '') continue; // bare * with trailing whitespace
    }

    const key = token.toLowerCase();
    if (seen.has(key)) {
      if (isLeader) seen.get(key).isLeader = true;
    } else {
      seen.set(key, { id: token, isLeader });
    }
  }

  return Array.from(seen.values());
}

function buildGroupIndex(rows, groupColumns) {
  const index = {};
  for (const column of groupColumns) {
    // First pass: collect members/leaders per sub-group.
    const groups = new Map(); // lowercase id -> { displayId, members, leaders }

    for (const row of rows) {
      const entries = (row.groupMembership && row.groupMembership[column]) || [];
      for (const entry of entries) {
        const key = entry.id.toLowerCase();
        let bucket = groups.get(key);
        if (!bucket) {
          bucket = { displayId: entry.id, members: [], leaders: [] };
          groups.set(key, bucket);
        }
        const popupTitle = row.popup && row.popup.length ? String(row.popup[0].value || '') : '';
        const ref = { rowNumber: row.rowNumber, popupTitle };
        bucket.members.push(ref);
        if (entry.isLeader) bucket.leaders.push(ref);
      }
    }

    // Sort keys alphabetically by displayId to create deterministic order.
    const sortedKeys = Array.from(groups.keys()).sort((a, b) =>
      groups.get(a).displayId.localeCompare(groups.get(b).displayId)
    );

    // Auto-assign colors via hash into DEFAULT_PALETTE.
    const orderedGroups = {};
    const palette = {};
    for (const key of sortedKeys) {
      orderedGroups[key] = groups.get(key);
      palette[key] = DEFAULT_PALETTE[hashString(key) % DEFAULT_PALETTE.length];
    }

    index[column] = { groups: orderedGroups, palette };
  }
  return index;
}

if (typeof module !== 'undefined') {
  module.exports = { parseGroupCell, buildGroupIndex };
}
