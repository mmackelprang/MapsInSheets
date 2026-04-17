function isBlank(v) {
  return v == null || String(v).trim() === '';
}

function isPresentNumber(v) {
  if (v === null || v === undefined || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n);
}

function needsGeocoding(row) {
  const addr = row && row.address;
  if (isBlank(addr)) return 'skip';
  if (!isPresentNumber(row.lat) || !isPresentNumber(row.lng)) return 'geocode';
  const a = String(addr).trim();
  const g = isBlank(row.geocodedFrom) ? '' : String(row.geocodedFrom).trim();
  if (a !== g) return 'geocode';
  return 'cached';
}
