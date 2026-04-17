import { describe, it, expect } from 'vitest';
import { parseGroupCell, buildGroupIndex } from '../src/lib/groups.js';
import { DEFAULT_PALETTE, hashString } from '../src/lib/colors.js';

describe('parseGroupCell', () => {
  it('returns [] for empty/nullish/whitespace inputs', () => {
    expect(parseGroupCell('')).toEqual([]);
    expect(parseGroupCell('   ')).toEqual([]);
    expect(parseGroupCell(null)).toEqual([]);
    expect(parseGroupCell(undefined)).toEqual([]);
  });

  it('stringifies non-string inputs', () => {
    expect(parseGroupCell(42)).toEqual([{ id: '42', isLeader: false }]);
    expect(parseGroupCell(true)).toEqual([{ id: 'true', isLeader: false }]);
  });

  it('parses a single ID', () => {
    expect(parseGroupCell('A')).toEqual([{ id: 'A', isLeader: false }]);
  });

  it('parses CSV with and without spaces', () => {
    expect(parseGroupCell('A,B')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: false },
    ]);
    expect(parseGroupCell(' A , B ')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: false },
    ]);
  });

  it('handles leader-suffix variants', () => {
    expect(parseGroupCell('A*')).toEqual([{ id: 'A', isLeader: true }]);
    expect(parseGroupCell('A *')).toEqual([{ id: 'A', isLeader: true }]);
    expect(parseGroupCell('A  *')).toEqual([{ id: 'A', isLeader: true }]);
  });

  it('parses mixed member + leader', () => {
    expect(parseGroupCell('A, B*, C')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: true },
      { id: 'C', isLeader: false },
    ]);
  });

  it('skips bare * tokens as data bugs', () => {
    expect(parseGroupCell('*')).toEqual([]);
    expect(parseGroupCell('*, A')).toEqual([{ id: 'A', isLeader: false }]);
    expect(parseGroupCell('A, *, B')).toEqual([
      { id: 'A', isLeader: false },
      { id: 'B', isLeader: false },
    ]);
  });

  it('treats *A as literal ID (prefix * is not a leader marker)', () => {
    expect(parseGroupCell('*A')).toEqual([{ id: '*A', isLeader: false }]);
  });

  it('dedupes within one cell, leader wins', () => {
    expect(parseGroupCell('A, A, A*')).toEqual([{ id: 'A', isLeader: true }]);
    expect(parseGroupCell('A*, A')).toEqual([{ id: 'A', isLeader: true }]);
  });

  it('preserves case for display but treats IDs as case-insensitive for dedupe', () => {
    expect(parseGroupCell('Tuesday, tuesday')).toEqual([{ id: 'Tuesday', isLeader: false }]);
    expect(parseGroupCell('MixedCase')).toEqual([{ id: 'MixedCase', isLeader: false }]);
  });
});

describe('buildGroupIndex', () => {
  function row(rowNumber, title, membership) {
    return { rowNumber, popup: [{ name: 'Name', value: title }], groupMembership: membership };
  }

  it('returns empty object when no group columns configured', () => {
    const idx = buildGroupIndex([row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }] })], []);
    expect(idx).toEqual({});
  });

  it('groups rows by sub-group within each column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }] }),
      row(3, 'Jones', { Youth: [{ id: 'A', isLeader: true }] }),
      row(4, 'Lee',   { Youth: [{ id: 'B', isLeader: false }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth']);
    expect(Object.keys(idx)).toEqual(['Youth']);
    expect(Object.keys(idx.Youth.groups)).toEqual(['a', 'b']); // alphabetical
    expect(idx.Youth.groups.a.displayId).toBe('A');
    expect(idx.Youth.groups.a.members.map((m) => m.rowNumber)).toEqual([2, 3]);
    expect(idx.Youth.groups.a.leaders.map((m) => m.rowNumber)).toEqual([3]);
    expect(idx.Youth.groups.b.members.map((m) => m.rowNumber)).toEqual([4]);
    expect(idx.Youth.groups.b.leaders).toEqual([]);
  });

  it('handles rows with multiple sub-groups in one column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }, { id: 'B', isLeader: true }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth']);
    expect(idx.Youth.groups.a.members.map((m) => m.rowNumber)).toEqual([2]);
    expect(idx.Youth.groups.b.members.map((m) => m.rowNumber)).toEqual([2]);
    expect(idx.Youth.groups.b.leaders.map((m) => m.rowNumber)).toEqual([2]);
  });

  it('builds an index across multiple columns, scoping IDs per column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }], Committee: [{ id: 'A', isLeader: true }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth', 'Committee']);
    expect(Object.keys(idx)).toEqual(['Youth', 'Committee']);
    expect(idx.Youth.groups.a.leaders).toEqual([]); // not a leader in Youth
    expect(idx.Committee.groups.a.leaders.map((m) => m.rowNumber)).toEqual([2]);
  });

  it('produces stable palette assignment', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }] }),
      row(3, 'Jones', { Youth: [{ id: 'B', isLeader: false }] }),
    ];
    const idx1 = buildGroupIndex(rows, ['Youth']);
    const idx2 = buildGroupIndex(rows, ['Youth']);
    expect(idx1.Youth.palette.a).toBe(idx2.Youth.palette.a);
    expect(idx1.Youth.palette.b).toBe(idx2.Youth.palette.b);
    expect(DEFAULT_PALETTE).toContain(idx1.Youth.palette.a);
  });

  it('popupTitle comes from first popup column', () => {
    const rows = [
      { rowNumber: 2, popup: [{ name: 'Name', value: 'Smith Family' }], groupMembership: { Youth: [{ id: 'A', isLeader: false }] } },
    ];
    const idx = buildGroupIndex(rows, ['Youth']);
    expect(idx.Youth.groups.a.members[0].popupTitle).toBe('Smith Family');
  });

  it('skips rows with no membership in a given column', () => {
    const rows = [
      row(2, 'Smith', { Youth: [{ id: 'A', isLeader: false }], Committee: [] }),
      row(3, 'Jones', { Youth: [],                                Committee: [{ id: 'Finance', isLeader: false }] }),
    ];
    const idx = buildGroupIndex(rows, ['Youth', 'Committee']);
    expect(Object.keys(idx.Youth.groups)).toEqual(['a']);
    expect(Object.keys(idx.Committee.groups)).toEqual(['finance']);
  });
});
