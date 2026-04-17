const MAX_ENTRIES = 20;
const KEEP_WHEN_COLLAPSED = 19;
const NO_VALUE_LABEL = '(no value)';
const OTHER_LABEL = 'Other';

function buildLegend({ rows, colorField, lookup, palette }) {
  const counts = new Map();       // lowercase key -> count
  const originals = new Map();    // lowercase key -> first original form
  let blanks = 0;

  for (const r of rows) {
    const raw = r[colorField];
    if (raw == null || String(raw).trim() === '') {
      blanks++;
      continue;
    }
    const display = String(raw).trim();
    const key = display.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!originals.has(key)) originals.set(key, display);
  }

  const lookupKeysInOrder = Object.keys(lookup || {}); // already lowercase by convention
  const lookupSet = new Set(lookupKeysInOrder);

  const entries = [];

  for (const key of lookupKeysInOrder) {
    if (!counts.has(key)) continue;
    entries.push({
      value: originals.get(key),
      color: lookup[key],
      count: counts.get(key),
      source: 'lookup',
    });
  }

  const autoKeys = [...counts.keys()]
    .filter((k) => !lookupSet.has(k))
    .sort((a, b) => originals.get(a).localeCompare(originals.get(b)));

  for (const key of autoKeys) {
    entries.push({
      value: originals.get(key),
      color: resolveColor(originals.get(key), lookup, palette),
      count: counts.get(key),
      source: 'auto',
    });
  }

  let collapsed = false;
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b.count - a.count);
    const kept = entries.slice(0, KEEP_WHEN_COLLAPSED);
    const rest = entries.slice(KEEP_WHEN_COLLAPSED);
    const otherCount = rest.reduce((s, e) => s + e.count, 0);
    kept.push({ value: OTHER_LABEL, color: NEUTRAL_GRAY, count: otherCount, source: 'auto' });
    entries.length = 0;
    entries.push(...kept);
    collapsed = true;
  }

  if (blanks > 0) {
    entries.push({ value: NO_VALUE_LABEL, color: NEUTRAL_GRAY, count: blanks, source: 'none' });
  }

  return { entries, collapsed };
}
