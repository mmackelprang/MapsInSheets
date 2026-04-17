function lettersToIndex(letters) {
  if (!/^[A-Za-z]{1,3}$/.test(letters)) return null;
  const upper = letters.toUpperCase();
  let n = 0;
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64);
  }
  return n;
}

function resolveColumn(spec, headerRow) {
  if (typeof spec !== 'string' || spec.trim() === '') return null;
  const needle = spec.trim().toLowerCase();

  // Header match wins if present.
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').trim().toLowerCase();
    if (h && h === needle) return i + 1;
  }

  // Fall back to letter interpretation.
  return lettersToIndex(spec.trim());
}

if (typeof module !== 'undefined') {
  module.exports = { resolveColumn, lettersToIndex };
}
