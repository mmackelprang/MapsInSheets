import { describe, it, expect } from 'vitest';
import { buildLegend } from '../src/lib/legend.js';
import { DEFAULT_PALETTE } from '../src/lib/colors.js';

function rows(values) {
  return values.map((v) => ({ Status: v }));
}

describe('buildLegend', () => {
  const lookup = { active: '#2ecc71', inactive: '#95a5a6' };

  it('counts distinct values', () => {
    const legend = buildLegend({
      rows: rows(['Active', 'Active', 'Inactive', 'Visitor']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    const byValue = Object.fromEntries(legend.entries.map((e) => [e.value, e.count]));
    expect(byValue).toEqual({ Active: 2, Inactive: 1, Visitor: 1 });
    expect(legend.collapsed).toBe(false);
  });

  it('orders lookup entries in insertion order, then auto alphabetical, then (no value)', () => {
    const legend = buildLegend({
      rows: rows(['Visitor', 'Zeta', 'Alpha', 'Inactive', 'Active', '', '']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    expect(legend.entries.map((e) => e.value)).toEqual([
      'Active', 'Inactive',
      'Alpha', 'Visitor', 'Zeta',
      '(no value)',
    ]);
  });

  it('tags source on each entry', () => {
    const legend = buildLegend({
      rows: rows(['Active', 'Visitor', '']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    const byValue = Object.fromEntries(legend.entries.map((e) => [e.value, e.source]));
    expect(byValue).toEqual({ Active: 'lookup', Visitor: 'auto', '(no value)': 'none' });
  });

  it('omits (no value) when no blanks', () => {
    const legend = buildLegend({
      rows: rows(['Active']),
      colorField: 'Status',
      lookup,
      palette: DEFAULT_PALETTE,
    });
    expect(legend.entries.map((e) => e.value)).toEqual(['Active']);
  });

  it('collapses to top-19 + Other when >20 distinct values', () => {
    const many = [];
    for (let i = 0; i < 25; i++) {
      const copies = i < 19 ? 10 : 1;
      for (let j = 0; j < copies; j++) many.push('V' + i);
    }
    const legend = buildLegend({
      rows: rows(many), colorField: 'Status', lookup: {}, palette: DEFAULT_PALETTE,
    });
    expect(legend.collapsed).toBe(true);
    const other = legend.entries.find((e) => e.value === 'Other');
    expect(other).toBeDefined();
    expect(other.count).toBe(6);
    expect(legend.entries.length).toBe(20);
  });
});
