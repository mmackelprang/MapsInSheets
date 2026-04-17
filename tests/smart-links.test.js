import { describe, it, expect } from 'vitest';
import { classifyValue } from '../src/lib/smart-links.js';

describe('classifyValue', () => {
  it('detects US-style phone numbers', () => {
    expect(classifyValue('(555) 123-4567')).toEqual({
      kind: 'phone', href: 'tel:+15551234567', text: '(555) 123-4567',
    });
    expect(classifyValue('555-123-4567')).toMatchObject({ kind: 'phone' });
    expect(classifyValue('+1 555 123 4567')).toMatchObject({ kind: 'phone' });
  });

  it('detects email addresses', () => {
    expect(classifyValue('alice@example.com')).toEqual({
      kind: 'email', href: 'mailto:alice@example.com', text: 'alice@example.com',
    });
    expect(classifyValue('  BoB+tag@sub.example.co.uk ')).toMatchObject({
      kind: 'email', href: 'mailto:BoB+tag@sub.example.co.uk',
    });
  });

  it('detects http(s) URLs', () => {
    expect(classifyValue('https://example.com/path')).toEqual({
      kind: 'url', href: 'https://example.com/path', text: 'https://example.com/path',
    });
    expect(classifyValue('http://example.com')).toMatchObject({ kind: 'url' });
  });

  it('returns text for non-matching values', () => {
    expect(classifyValue('Active')).toEqual({ kind: 'text', href: null, text: 'Active' });
    expect(classifyValue('')).toEqual({ kind: 'text', href: null, text: '' });
    expect(classifyValue(null)).toEqual({ kind: 'text', href: null, text: '' });
    expect(classifyValue(42)).toEqual({ kind: 'text', href: null, text: '42' });
  });

  it('does not misclassify integers as phone numbers', () => {
    expect(classifyValue('1234')).toMatchObject({ kind: 'text' });
  });
});
