import { describe, it, expect } from 'vitest';
import { parsePopupLabels } from '../src/lib/popup-labels.js';

describe('parsePopupLabels', () => {
  it('returns {} for empty/nullish/whitespace inputs', () => {
    expect(parsePopupLabels('')).toEqual({});
    expect(parsePopupLabels('   ')).toEqual({});
    expect(parsePopupLabels(null)).toEqual({});
    expect(parsePopupLabels(undefined)).toEqual({});
  });

  it('parses a single arrow entry', () => {
    expect(parsePopupLabels('Phone → ☎ Mobile')).toEqual({ Phone: '☎ Mobile' });
  });

  it('accepts ASCII -> as an alternative separator', () => {
    expect(parsePopupLabels('Phone -> Mobile')).toEqual({ Phone: 'Mobile' });
  });

  it('parses multiple entries separated by commas', () => {
    expect(parsePopupLabels('Phone → ☎, Email → ✉')).toEqual({
      Phone: '☎',
      Email: '✉',
    });
  });

  it('trims whitespace around keys and values', () => {
    expect(parsePopupLabels('  Phone   →   Mobile  ')).toEqual({ Phone: 'Mobile' });
  });

  it('drops malformed entries (no separator)', () => {
    expect(parsePopupLabels('Phone Mobile, Email → ✉')).toEqual({ Email: '✉' });
  });

  it('drops entries with empty header or empty label', () => {
    expect(parsePopupLabels(' → something, Phone → , Email → Valid')).toEqual({
      Email: 'Valid',
    });
  });

  it('later entries with the same header win', () => {
    expect(parsePopupLabels('Phone → Old, Phone → New')).toEqual({ Phone: 'New' });
  });
});
