import { describe, it, expect, afterEach, vi } from 'vitest';
import { tomorrowAtJst } from './jst-time';

afterEach(() => {
  vi.useRealTimers();
});

/** JST の指定日時で現在時刻を固定する */
function setNowJst(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${iso}+09:00`));
}

describe('tomorrowAtJst', () => {
  it('should return tomorrow 14:00 JST when called in the JST morning (UTC is still yesterday)', () => {
    // JST 08:26 = UTC 前日 23:26。UTC の日付に +1 すると「今日」になってしまう境界
    setNowJst('2026-11-19T08:26:00');
    expect(tomorrowAtJst(14).toISOString()).toBe('2026-11-20T05:00:00.000Z');
  });

  it('should return tomorrow 14:00 JST when called in the JST afternoon', () => {
    setNowJst('2026-11-19T14:07:30');
    expect(tomorrowAtJst(14).toISOString()).toBe('2026-11-20T05:00:00.000Z');
  });

  it('should return tomorrow 14:00 JST when called late at night just before JST midnight', () => {
    setNowJst('2026-11-19T23:59:59');
    expect(tomorrowAtJst(14).toISOString()).toBe('2026-11-20T05:00:00.000Z');
  });

  it('should return tomorrow 14:00 JST when called just after JST midnight', () => {
    setNowJst('2026-11-20T00:00:01');
    expect(tomorrowAtJst(14).toISOString()).toBe('2026-11-21T05:00:00.000Z');
  });

  it('should handle an hour earlier than 09:00 JST (UTC previous day)', () => {
    setNowJst('2026-11-19T10:00:00');
    // 翌日 08:00 JST = 当日(JST 翌日)の前日 23:00 UTC
    expect(tomorrowAtJst(8).toISOString()).toBe('2026-11-19T23:00:00.000Z');
  });

  it('should roll over the month and year boundary', () => {
    setNowJst('2026-12-31T10:00:00');
    expect(tomorrowAtJst(14).toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('should always be in the future for any current time of day', () => {
    for (const hour of [0, 3, 8, 9, 12, 14, 18, 23]) {
      const hh = String(hour).padStart(2, '0');
      setNowJst(`2026-11-19T${hh}:30:00`);
      expect(tomorrowAtJst(14).getTime()).toBeGreaterThan(Date.now());
    }
  });
});
