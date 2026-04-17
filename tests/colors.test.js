import { describe, it, expect } from 'vitest';
import { resolveColor, NEUTRAL_GRAY, DEFAULT_PALETTE } from '../src/lib/colors.js';

describe('resolveColor', () => {
  const lookup = { active: '#2ecc71', inactive: '#95a5a6' };

  it('returns neutral gray for empty/blank value', () => {
    expect(resolveColor('', lookup, DEFAULT_PALETTE)).toBe(NEUTRAL_GRAY);
    expect(resolveColor('   ', lookup, DEFAULT_PALETTE)).toBe(NEUTRAL_GRAY);
    expect(resolveColor(null, lookup, DEFAULT_PALETTE)).toBe(NEUTRAL_GRAY);
  });

  it('returns literal hex color when cell contains one', () => {
    expect(resolveColor('#336699', lookup, DEFAULT_PALETTE)).toBe('#336699');
    expect(resolveColor('#ABC', lookup, DEFAULT_PALETTE)).toBe('#aabbcc');
  });

  it('returns named CSS color when cell contains one', () => {
    expect(resolveColor('red', lookup, DEFAULT_PALETTE)).toBe('#ff0000');
    expect(resolveColor('BLUE', lookup, DEFAULT_PALETTE)).toBe('#0000ff');
  });

  it('returns lookup color for matching value (case-insensitive)', () => {
    expect(resolveColor('Active', lookup, DEFAULT_PALETTE)).toBe('#2ecc71');
    expect(resolveColor('INACTIVE', lookup, DEFAULT_PALETTE)).toBe('#95a5a6');
  });

  it('auto-assigns from palette for unknown values, stably', () => {
    const c1 = resolveColor('Tuesday Night', {}, DEFAULT_PALETTE);
    const c2 = resolveColor('Tuesday Night', {}, DEFAULT_PALETTE);
    expect(c1).toBe(c2); // stable
    expect(DEFAULT_PALETTE).toContain(c1);
  });

  it('auto-assign returns different colors for different values (usually)', () => {
    const colors = new Set();
    ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].forEach((v) => {
      colors.add(resolveColor(v, {}, DEFAULT_PALETTE));
    });
    expect(colors.size).toBeGreaterThan(1); // hash spreads across palette
  });

  it('DEFAULT_PALETTE has 12 hex colors', () => {
    expect(DEFAULT_PALETTE).toHaveLength(12);
    DEFAULT_PALETTE.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
  });
});
