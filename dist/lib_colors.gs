const NEUTRAL_GRAY = '#9e9e9e';

// Colorblind-friendly palette (Okabe-Ito + a few extensions), 12 entries.
const DEFAULT_PALETTE = [
  '#e69f00', '#56b4e9', '#009e73', '#f0e442',
  '#0072b2', '#d55e00', '#cc79a7', '#999999',
  '#8c564b', '#17becf', '#bcbd22', '#7f7f7f',
];

const NAMED = {
  red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a',
  black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080',
  cyan: '#00ffff', magenta: '#ff00ff', lime: '#00ff00', teal: '#008080',
};

function normalizeHex(hex) {
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const s = hex.slice(1).toLowerCase();
    return '#' + s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  return null;
}

function parseLiteralColor(value) {
  const v = String(value).trim();
  const hex = normalizeHex(v);
  if (hex) return hex;
  const named = NAMED[v.toLowerCase()];
  if (named) return named;
  return null;
}

function hashString(s) {
  let h = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function resolveColor(value, lookup, palette) {
  if (value == null || String(value).trim() === '') return NEUTRAL_GRAY;
  const raw = String(value).trim();

  const literal = parseLiteralColor(raw);
  if (literal) return literal;

  const key = raw.toLowerCase();
  if (lookup && Object.prototype.hasOwnProperty.call(lookup, key)) {
    return lookup[key];
  }

  const idx = hashString(key) % palette.length;
  return palette[idx];
}
