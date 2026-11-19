import { describe, it, expect } from 'vitest';
import { calculateBookingSlots, type BookingSlotsInput } from '../free-time.js';
import type { CalendarEvent } from '../index.js';

const JST = 540;
/** JST 表記(+09:00)で時刻を作る。実行環境のタイムゾーンに依存しない */
const jst = (s: string) => new Date(`${s}+09:00`);
const hhmm = (iso: string) =>
  new Date(new Date(iso).getTime() + JST * 60000).toISOString().slice(11, 16);
const ymdhm = (iso: string) =>
  new Date(new Date(iso).getTime() + JST * 60000).toISOString().slice(0, 16).replace('T', ' ');

function ev(start: string, end: string): CalendarEvent {
  return {
    id: `${start}-${end}`,
    source: 'google',
    originalId: 'x',
    calendarId: 'cal',
    title: 'busy',
    start: jst(start),
    end: jst(end),
    isAllDay: false,
    status: 'confirmed',
  };
}

/** /slots と同じ入力の作り方: rangeStart = now(当日)、期間は 3 日 */
function run(nowIso: string, overrides: Partial<BookingSlotsInput> = {}) {
  const now = jst(nowIso);
  return calculateBookingSlots({
    events: [],
    now,
    rangeStart: now,
    rangeEnd: new Date(now.getTime() + 3 * 86400000),
    dayStartHour: 8,
    dayEndHour: 23,
    durationMinutes: 60,
    bufferMinutes: 0,
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    timezoneOffsetMinutes: JST,
    leadMinutes: 30,
    stepMinutes: 30,
    ...overrides,
  });
}
const firstN = (slots: { start: string }[], n: number) =>
  slots.slice(0, n).map((s) => hhmm(s.start));

describe('calculateBookingSlots: 今日の最初の枠の揃え方(Issue #226)', () => {
  it('should start today at 09:30 when it is 08:41 (the reported case)', () => {
    expect(firstN(run('2026-11-19T08:41:17'), 3)).toEqual(['09:30', '10:30', '11:30']);
  });

  it('should start at 09:00 when now + lead is exactly on a boundary (08:30:00)', () => {
    expect(firstN(run('2026-11-19T08:30:00'), 2)).toEqual(['09:00', '10:00']);
  });

  it('should round up when one second past the boundary (08:30:01)', () => {
    expect(firstN(run('2026-11-19T08:30:01'), 1)).toEqual(['09:30']);
  });

  it('should not change anything before opening (07:00 → 08:00 as before)', () => {
    expect(firstN(run('2026-11-19T07:00:00'), 2)).toEqual(['08:00', '09:00']);
  });

  it('should skip to tomorrow 08:00 after closing (22:40)', () => {
    const slots = run('2026-11-19T22:40:00');
    expect(ymdhm(slots[0].start)).toBe('2026-11-20 08:00');
  });

  it('should never offer a slot starting within the lead time', () => {
    const now = jst('2026-11-19T08:41:17');
    for (const s of run('2026-11-19T08:41:17')) {
      expect(new Date(s.start).getTime()).toBeGreaterThanOrEqual(now.getTime() + 30 * 60000);
    }
  });
});

describe('calculateBookingSlots: 予定や翌日以降の枠は変更しない', () => {
  it('should keep a slot that starts right after an event when it already meets the lead time', () => {
    // 08:41。予定が 09:20 に終わり、次の予定は 09:50。30 分枠は 09:20 から取れる(39 分前)
    const slots = run('2026-11-19T08:41:17', {
      durationMinutes: 30,
      events: [
        ev('2026-11-19T08:00:00', '2026-11-19T09:20:00'),
        ev('2026-11-19T09:50:00', '2026-11-19T23:00:00'),
      ],
    });
    expect(ymdhm(slots[0].start)).toBe('2026-11-19 09:20');
  });

  it('should keep a non-aligned start that comes from an event end (not from now)', () => {
    // 予定が 10:10 まで続いている最中。次の空きは 10:10(予定由来)で、揃えない
    const slots = run('2026-11-19T08:41:17', {
      events: [ev('2026-11-19T08:00:00', '2026-11-19T10:10:00')],
    });
    expect(firstN(slots, 2)).toEqual(['10:10', '11:10']);
  });

  it('should drop a slot after an event only when it starts within the lead time', () => {
    // 予定が 08:50 に終わる。08:50 は 08:41 の 9 分後(リード 30 分未満)なので出さない。次は 09:50
    const slots = run('2026-11-19T08:41:17', {
      events: [ev('2026-11-19T08:00:00', '2026-11-19T08:50:00')],
    });
    expect(firstN(slots, 2)).toEqual(['09:50', '10:50']);
  });

  it('should not shift tomorrow when the lead time crosses midnight (23:40, link opens at 00:00)', () => {
    // 00:00 の枠は 23:40 の 20 分後なのでリード内で除外されるが、01:00、02:00… は動かない(00:30、01:30… にならない)
    const slots = run('2026-11-19T23:40:00', { dayStartHour: 0 });
    expect(ymdhm(slots[0].start)).toBe('2026-11-20 01:00');
    expect(firstN(slots, 3)).toEqual(['01:00', '02:00', '03:00']);
  });

  it('should leave future days untouched', () => {
    const slots = run('2026-11-19T08:41:17');
    const tomorrow = slots.filter((s) => ymdhm(s.start).startsWith('2026-11-20'));
    expect(tomorrow.slice(0, 3).map((s) => hhmm(s.start))).toEqual(['08:00', '09:00', '10:00']);
  });
});

describe('calculateBookingSlots: 所要時間・曜日・範囲', () => {
  it.each([15, 30, 45, 60, 90, 120])(
    'should align only the first slot for a %i minute duration',
    (minutes) => {
      const slots = run('2026-11-19T08:41:17', { durationMinutes: minutes });
      // 先頭は揃う(後続は所要時間の刻みで並ぶため、揃うとは限らない)
      expect(hhmm(slots[0].start)).toBe('09:30');
      // 先頭の次は、所要時間ぶん後
      expect(new Date(slots[1].start).getTime() - new Date(slots[0].start).getTime()).toBe(
        minutes * 60000,
      );
    },
  );

  it('should respect buffer minutes between slots', () => {
    const slots = run('2026-11-19T08:41:17', { bufferMinutes: 15 });
    expect(firstN(slots, 2)).toEqual(['09:30', '10:45']);
  });

  it('should exclude days that are not available (JST weekday)', () => {
    // 2026-11-19 は木曜(4)。金曜(5)だけ許可 → 今日の枠は出ず、金曜 08:00 から
    const slots = run('2026-11-19T08:41:17', { availableDays: [5] });
    expect(ymdhm(slots[0].start)).toBe('2026-11-20 08:00');
  });

  it('should return no slots when the range start is after the range end (different UTC days)', () => {
    const now = jst('2026-11-19T08:41:17');
    const slots = run('2026-11-19T08:41:17', {
      rangeStart: now,
      rangeEnd: new Date(now.getTime() - 86400000),
    });
    expect(slots).toEqual([]);
  });

  it('should return no slots when the range is reversed within the same UTC day', () => {
    // JST 12:30 〜 11:30(同じ UTC 日)。calculateFreeSlots はこのとき日の頭から回して枠を返してしまうので入口で弾く
    const slots = run('2026-11-19T12:30:00', {
      rangeStart: jst('2026-11-19T12:30:00'),
      rangeEnd: jst('2026-11-19T11:30:00'),
    });
    expect(slots).toEqual([]);
  });

  it('should return no slots when the range is empty (start equals end)', () => {
    const now = jst('2026-11-19T12:30:00');
    expect(run('2026-11-19T12:30:00', { rangeStart: now, rangeEnd: now })).toEqual([]);
  });

  it('should not shift slots when the range starts on a future day (e.g. ?date= a later day)', () => {
    // rangeStart が将来の日の頭(切り上げ後の時刻より後)なら、揃え直さない
    const now = jst('2026-11-19T08:41:17');
    const rangeStart = jst('2026-11-25T00:00:00');
    const slots = calculateBookingSlots({
      events: [],
      now,
      rangeStart,
      rangeEnd: new Date(rangeStart.getTime() + 86400000),
      dayStartHour: 8,
      dayEndHour: 23,
      durationMinutes: 60,
      bufferMinutes: 0,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      timezoneOffsetMinutes: JST,
      leadMinutes: 30,
      stepMinutes: 30,
    });
    expect(firstN(slots, 2)).toEqual(['08:00', '09:00']);
  });
});

describe('calculateBookingSlots: rangeStart が「今」に切り詰められていないとき(?date= 指定)', () => {
  // 営業開始が 09:00 のリンク。JST 08:45 に開く。
  // 'date=今日' は UTC の 0 時(= JST 09:00)になり、営業開始ちょうどと偶然一致する
  const opening9 = { dayStartHour: 9 };

  it('should give the same first slot with and without a date filter (opening-time start is not re-anchored)', () => {
    const nowIso = '2026-11-19T08:45:00';
    const without = run(nowIso, opening9); // rangeStart = now
    const withDate = run(nowIso, { ...opening9, rangeStart: jst('2026-11-19T09:00:00') }); // rangeStart = date の UTC 0 時
    // 09:00 は現在 08:45 の 15 分後でリード(30 分)未満。どちらも 10:00 が先頭で、09:30 にずれない
    expect(hhmm(without[0].start)).toBe('10:00');
    expect(hhmm(withDate[0].start)).toBe('10:00');
  });

  it('should still align when the range start was clipped to now (rangeStart equals now)', () => {
    const slots = run('2026-11-19T08:45:00', { dayStartHour: 0 });
    // 空きが「今」から始まっている(営業開始 0 時)。08:45 + 30 分 = 09:15 → 09:30
    expect(hhmm(slots[0].start)).toBe('09:30');
  });
});
