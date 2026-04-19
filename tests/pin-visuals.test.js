import { describe, it, expect } from 'vitest';
import {
  computeGroupPinVisual,
  MUTED_COLOR,
  MUTED_OPACITY,
  LEADER_SCALE,
} from '../src/lib/pin-visuals.js';

function pin(memberships) {
  // memberships: { [column]: [{id, isLeader}, ...] } | null for empty
  return { groupMembership: memberships || {} };
}

const COL = 'Youth';
const PALETTE = {
  a: '#ff0000',
  b: '#00ff00',
  c: '#0000ff',
};

describe('computeGroupPinVisual', () => {
  it('returns muted for pins with no memberships in the active column', () => {
    const p = pin({});
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v).toEqual({
      color: MUTED_COLOR, opacity: MUTED_OPACITY,
      scale: 1, star: false, heroOutline: false,
    });
  });

  it('returns muted for pins with memberships in a different column', () => {
    const p = pin({ 'Committee': [{ id: 'X', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v).toEqual({
      color: MUTED_COLOR, opacity: MUTED_OPACITY,
      scale: 1, star: false, heroOutline: false,
    });
  });

  it('no focus: colors by first membership in cell order', () => {
    const p = pin({ [COL]: [{ id: 'B', isLeader: false }, { id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#00ff00'); // B
    expect(v.opacity).toBe(1);
    expect(v.scale).toBe(1);
    expect(v.star).toBe(false);
    expect(v.heroOutline).toBe(false);
  });

  it('no focus: leader flag drives star and scale', () => {
    const p = pin({ [COL]: [{ id: 'A', isLeader: true }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000');
    expect(v.star).toBe(true);
    expect(v.scale).toBe(LEADER_SCALE);
    expect(v.heroOutline).toBe(false);
  });

  it('focused on self, single membership: heroOutline true', () => {
    const p = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: p, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000');
    expect(v.heroOutline).toBe(true);
    expect(v.star).toBe(false);
  });

  it('focused on self, multiple memberships: cycleIndex picks active sub-group', () => {
    const p = pin({ [COL]: [
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: true },
      { id: 'C', isLeader: false },
    ] });
    const v0 = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 0, palette: PALETTE });
    expect(v0.color).toBe('#ff0000'); // A
    const v1 = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 1, palette: PALETTE });
    expect(v1.color).toBe('#00ff00'); // B
    expect(v1.star).toBe(true);
    expect(v1.scale).toBe(LEADER_SCALE);
    const v2 = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 2, palette: PALETTE });
    expect(v2.color).toBe('#0000ff'); // C
  });

  it('cycleIndex wraps safely for negative and overflow values', () => {
    const p = pin({ [COL]: [{ id: 'A', isLeader: false }, { id: 'B', isLeader: false }] });
    const vNeg = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: -1, palette: PALETTE });
    expect(vNeg.color).toBe('#00ff00'); // B
    const vBig = computeGroupPinVisual(p, { activeColumn: COL, focusedPin: p, cycleIndex: 5, palette: PALETTE });
    expect(vBig.color).toBe('#00ff00'); // index 5 % 2 = 1 → B
  });

  it('focused on other pin: this pin is member of focused sub-group → colored, no hero', () => {
    const focused = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const other   = pin({ [COL]: [{ id: 'A', isLeader: true }, { id: 'B', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000'); // A
    expect(v.opacity).toBe(1);
    expect(v.star).toBe(true); // other is leader of A
    expect(v.scale).toBe(LEADER_SCALE);
    expect(v.heroOutline).toBe(false);
  });

  it('focused on other pin: this pin has memberships but not in focused sub-group → muted', () => {
    const focused = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const other   = pin({ [COL]: [{ id: 'B', isLeader: false }, { id: 'C', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe(MUTED_COLOR);
    expect(v.opacity).toBe(MUTED_OPACITY);
    expect(v.scale).toBe(1);
    expect(v.star).toBe(false);
    expect(v.heroOutline).toBe(false);
  });

  it('id matching is case-insensitive', () => {
    const focused = pin({ [COL]: [{ id: 'a', isLeader: false }] });
    const other   = pin({ [COL]: [{ id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#ff0000');
  });

  it('degenerate: focused pin has no memberships in the active column → falls back to no-focus behavior', () => {
    const focused = pin({}); // no memberships
    const other   = pin({ [COL]: [{ id: 'B', isLeader: false }, { id: 'A', isLeader: false }] });
    const v = computeGroupPinVisual(other, {
      activeColumn: COL, focusedPin: focused, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe('#00ff00'); // first membership = B
    expect(v.heroOutline).toBe(false);
  });

  it('palette missing active id: falls back to MUTED_COLOR', () => {
    const p = pin({ [COL]: [{ id: 'Z', isLeader: false }] });
    const v = computeGroupPinVisual(p, {
      activeColumn: COL, focusedPin: null, cycleIndex: 0, palette: PALETTE,
    });
    expect(v.color).toBe(MUTED_COLOR);
  });
});
