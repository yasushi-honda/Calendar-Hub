import { describe, it, expect } from 'vitest';
import {
  calculateFreeSlots,
  splitFreeIntoBookingSlots,
  earliestBookableStart,
} from '../free-time.js';
import { BOOKING_LEAD_MINUTES, BOOKING_SLOT_STEP_MINUTES } from '../booking-types.js';

const JST = 540;
const opts = { leadMinutes: 30, stepMinutes: 30, timezoneOffsetMinutes: JST };

/** JST 表記(+09:00)で時刻を作る。実行環境のタイムゾーンに依存しない */
const jst = (s: string) => new Date(`${s}+09:00`);
const hhmm = (d: Date) => new Date(d.getTime() + JST * 60000).toISOString().slice(11, 16);

describe('earliestBookableStart', () => {
  it('should round now + lead up to the next 30-minute boundary', () => {
    // 08:41 + 30分 = 09:11 → 09:30
    expect(hhmm(earliestBookableStart(jst('2026-11-19T08:41:17'), opts))).toBe('09:30');
  });

  it('should keep the time when now + lead is exactly on a boundary', () => {
    // 08:30:00 + 30分 = 09:00:00 → 09:00(境界ちょうどは切り上げない)
    expect(earliestBookableStart(jst('2026-11-19T08:30:00'), opts).toISOString()).toBe(
      jst('2026-11-19T09:00:00').toISOString(),
    );
  });

  it('should round up when now + lead is one second past a boundary', () => {
    expect(hhmm(earliestBookableStart(jst('2026-11-19T08:30:01'), opts))).toBe('09:30');
  });

  it('should round up when now + lead is one millisecond past a boundary', () => {
    expect(
      earliestBookableStart(new Date(jst('2026-11-19T08:30:00').getTime() + 1), opts).toISOString(),
    ).toBe(jst('2026-11-19T09:30:00').toISOString());
  });

  it('should cross the hour boundary', () => {
    expect(hhmm(earliestBookableStart(jst('2026-11-19T09:45:00'), opts))).toBe('10:30');
  });

  it('should cross midnight', () => {
    // 23:50 + 30分 = 00:20(翌日) → 00:30
    expect(earliestBookableStart(jst('2026-11-19T23:50:00'), opts).toISOString()).toBe(
      jst('2026-11-20T00:30:00').toISOString(),
    );
  });

  it('should never return a time earlier than now + lead', () => {
    for (const t of ['08:00:00', '08:00:01', '08:29:59', '08:30:00', '12:15:30', '22:59:59']) {
      const now = jst(`2026-11-19T${t}`);
      const result = earliestBookableStart(now, opts);
      expect(result.getTime()).toBeGreaterThanOrEqual(now.getTime() + 30 * 60000);
      // 切り上げ幅は刻み未満
      expect(result.getTime() - (now.getTime() + 30 * 60000)).toBeLessThan(30 * 60000);
    }
  });

  it('should use the shared constants of 30 minutes for lead and step', () => {
    expect(BOOKING_LEAD_MINUTES).toBe(30);
    expect(BOOKING_SLOT_STEP_MINUTES).toBe(30);
  });
});

describe('予約ページの今日の枠(earliestBookableStart を rangeStart に使う)', () => {
  const free = (nowIso: string) => {
    const now = jst(nowIso);
    const rangeStart = earliestBookableStart(now, opts);
    const rangeEnd = new Date(now.getTime() + 2 * 86400000);
    const slots = calculateFreeSlots([], rangeStart, rangeEnd, {
      dayStartHour: 8,
      dayEndHour: 23,
      minSlotMinutes: 60,
      timezoneOffsetMinutes: JST,
    });
    return splitFreeIntoBookingSlots(slots, 60, 0).map((s) => hhmm(new Date(s.start)));
  };

  it('should start today at 09:30 when it is 08:41 (the reported case)', () => {
    expect(free('2026-11-19T08:41:17').slice(0, 3)).toEqual(['09:30', '10:30', '11:30']);
  });

  it('should start today at 15:00 when it is 14:07 (14:07:30 + 30min = 14:37:30, rounded up)', () => {
    expect(free('2026-11-19T14:07:30').slice(0, 2)).toEqual(['15:00', '16:00']);
  });

  it('should start at the opening hour when it is before opening', () => {
    expect(free('2026-11-19T07:00:00').slice(0, 2)).toEqual(['08:00', '09:00']);
  });

  it('should skip to tomorrow 08:00 when it is after closing', () => {
    // 22:40 + 30分 = 23:10 → 23:30。dayEnd(23:00) を過ぎているので今日の枠は無い
    expect(free('2026-11-19T22:40:00').slice(0, 2)).toEqual(['08:00', '09:00']);
  });

  it('should never offer a slot that starts within the lead time', () => {
    const now = jst('2026-11-19T08:41:17');
    const rangeStart = earliestBookableStart(now, opts);
    const slots = calculateFreeSlots([], rangeStart, new Date(now.getTime() + 86400000), {
      dayStartHour: 8,
      dayEndHour: 23,
      minSlotMinutes: 60,
      timezoneOffsetMinutes: JST,
    });
    for (const s of splitFreeIntoBookingSlots(slots, 60, 0)) {
      expect(new Date(s.start).getTime()).toBeGreaterThanOrEqual(now.getTime() + 30 * 60000);
    }
  });
});
