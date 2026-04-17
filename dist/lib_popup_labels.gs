function parsePopupLabels(value) {
  if (value === null || value === undefined) return {};
  const str = String(value);
  if (str.trim() === '') return {};

  const result = {};
  const entries = str.split(',');
  for (const raw of entries) {
    const piece = raw.trim();
    if (!piece) continue;

    let sepIndex = piece.indexOf('→');
    let sepLen = 1;
    if (sepIndex === -1) {
      sepIndex = piece.indexOf('->');
      sepLen = 2;
    }
    if (sepIndex === -1) continue;

    const header = piece.slice(0, sepIndex).trim();
    const label = piece.slice(sepIndex + sepLen).trim();
    if (!header || !label) continue;

    result[header] = label;
  }
  return result;
}
