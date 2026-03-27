import { describe, it, expect } from 'vitest';
import { toDateString } from '../adapters/google.js';

describe('toDateString', () => {
  it('should return correct date in Asia/Tokyo timezone', () => {
    // 2026-03-27T00:00:00+09:00 = 2026-03-26T15:00:00Z
    const d = new Date('2026-03-27T00:00:00+09:00');
    expect(toDateString(d, 'Asia/Tokyo')).toBe('2026-03-27');
  });

  it('should not shift date to previous day for JST midnight', () => {
    // This is the core bug: toISOString().split('T')[0] would return '2026-03-26'
    const d = new Date('2026-03-27T00:00:00+09:00');
    expect(toDateString(d, 'Asia/Tokyo')).not.toBe('2026-03-26');
  });

  it('should handle UTC timezone correctly', () => {
    const d = new Date('2026-03-27T00:00:00Z');
    expect(toDateString(d, 'UTC')).toBe('2026-03-27');
  });

  it('should handle year boundary (Dec 31 JST → Jan 1 UTC)', () => {
    // 2026-12-31T23:30:00+09:00 = 2026-12-31T14:30:00Z (same day in both)
    const d = new Date('2026-12-31T23:30:00+09:00');
    expect(toDateString(d, 'Asia/Tokyo')).toBe('2026-12-31');
  });

  it('should handle new year crossing (Jan 1 JST early morning)', () => {
    // 2027-01-01T00:00:00+09:00 = 2026-12-31T15:00:00Z
    const d = new Date('2027-01-01T00:00:00+09:00');
    expect(toDateString(d, 'Asia/Tokyo')).toBe('2027-01-01');
  });

  it('should handle month boundary correctly', () => {
    // 2026-04-01T00:00:00+09:00 = 2026-03-31T15:00:00Z
    const d = new Date('2026-04-01T00:00:00+09:00');
    expect(toDateString(d, 'Asia/Tokyo')).toBe('2026-04-01');
  });
});
