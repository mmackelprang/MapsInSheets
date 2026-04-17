import { describe, it, expect } from 'vitest';
import { needsGeocoding } from '../src/lib/cache.js';

describe('needsGeocoding', () => {
  it('skips empty addresses', () => {
    expect(needsGeocoding({ address: '', lat: 1, lng: 2, geocodedFrom: 'x' })).toBe('skip');
    expect(needsGeocoding({ address: '   ', lat: null, lng: null, geocodedFrom: null })).toBe('skip');
    expect(needsGeocoding({ address: null })).toBe('skip');
  });

  it('geocodes when lat or lng is missing', () => {
    expect(needsGeocoding({ address: '123 Main', lat: null, lng: null, geocodedFrom: null })).toBe('geocode');
    expect(needsGeocoding({ address: '123 Main', lat: 40, lng: null, geocodedFrom: '123 Main' })).toBe('geocode');
    expect(needsGeocoding({ address: '123 Main', lat: null, lng: -74, geocodedFrom: '123 Main' })).toBe('geocode');
    expect(needsGeocoding({ address: '123 Main', lat: '', lng: '', geocodedFrom: '' })).toBe('geocode');
  });

  it('geocodes when address has changed', () => {
    expect(needsGeocoding({ address: '123 Main', lat: 40, lng: -74, geocodedFrom: '456 Elm' })).toBe('geocode');
  });

  it('uses cached when address matches geocodedFrom and lat/lng present', () => {
    expect(needsGeocoding({ address: '123 Main', lat: 40, lng: -74, geocodedFrom: '123 Main' })).toBe('cached');
  });

  it('ignores whitespace differences between address and geocodedFrom', () => {
    expect(needsGeocoding({ address: '  123 Main  ', lat: 40, lng: -74, geocodedFrom: '123 Main' })).toBe('cached');
  });
});
