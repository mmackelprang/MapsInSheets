import { describe, it, expect } from 'vitest';
import { resolveColumn } from '../src/lib/columns.js';

describe('resolveColumn', () => {
  const headers = ['Name', 'Phone', 'Address', 'Small Group', 'Status'];

  it('resolves single-letter column', () => {
    expect(resolveColumn('A', headers)).toBe(1);
    expect(resolveColumn('e', headers)).toBe(5);
  });

  it('resolves multi-letter column', () => {
    expect(resolveColumn('AA', headers)).toBe(27);
    expect(resolveColumn('AZ', headers)).toBe(52);
  });

  it('resolves header name (case-insensitive, trimmed)', () => {
    expect(resolveColumn('Address', headers)).toBe(3);
    expect(resolveColumn('  address ', headers)).toBe(3);
    expect(resolveColumn('SMALL GROUP', headers)).toBe(4);
  });

  it('prefers header match over letter when header starts with a letter-like string', () => {
    // "Name" header exists; column letter "Name" is not valid.
    // "A" is a valid column letter and also — hypothetically — a header.
    const hdr = ['A', 'B', 'C'];
    expect(resolveColumn('A', hdr)).toBe(1);  // header wins if present
  });

  it('falls back to letter when no header matches', () => {
    expect(resolveColumn('B', headers)).toBe(2); // no "B" header, letter wins
  });

  it('handles the Google Sheets 3-letter column boundary', () => {
    expect(resolveColumn('ZZZ', headers)).toBe(18278); // max column in Sheets
    expect(resolveColumn('AAAA', headers)).toBeNull(); // 4+ letters rejected
  });

  it('returns null for missing header and invalid letter', () => {
    expect(resolveColumn('Nope', headers)).toBeNull();
    expect(resolveColumn('', headers)).toBeNull();
    expect(resolveColumn(null, headers)).toBeNull();
    expect(resolveColumn('A1', headers)).toBeNull(); // not a pure letter spec
  });
});
