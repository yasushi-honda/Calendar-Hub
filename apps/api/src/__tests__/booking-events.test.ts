import { describe, it, expect } from 'vitest';
import { toOverlappingBookingEvents, hasOverlappingEvent } from '../lib/booking-events.js';

// Firestore Timestamp のダミー実装 (toDate() のみ持てば十分)
function fakeTimestamp(date: Date) {
  return { toDate: () => date };
}

describe('toOverlappingBookingEvents', () => {
  it('timeMin より完全に前で終了している予約は除外する', () => {
    const docs = [
      {
        id: 'b1',
        slotStart: fakeTimestamp(new Date('2026-08-01T08:00:00Z')),
        slotEnd: fakeTimestamp(new Date('2026-08-01T09:00:00Z')),
      },
    ];
    const timeMin = new Date('2026-08-01T10:00:00Z');

    const result = toOverlappingBookingEvents(docs, timeMin);

    expect(result).toEqual([]);
  });

  it('timeMin 開始前から始まりまだ終了していない (進行中の) 予約は含める', () => {
    // 回帰テスト: slotStart >= timeMin だけのクエリではこのケースが漏れ、
    // 該当時間帯の Google slot がそのまま「空き」として返ってしまうバグがあった
    const docs = [
      {
        id: 'b1',
        slotStart: fakeTimestamp(new Date('2026-08-01T10:00:00Z')),
        slotEnd: fakeTimestamp(new Date('2026-08-01T10:30:00Z')),
      },
    ];
    const timeMin = new Date('2026-08-01T10:15:00Z'); // 予約の途中

    const result = toOverlappingBookingEvents(docs, timeMin);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
  });

  it('予約が timeMin ちょうどに終了する場合は除外する (隣接は重複ではない)', () => {
    const docs = [
      {
        id: 'b1',
        slotStart: fakeTimestamp(new Date('2026-08-01T09:00:00Z')),
        slotEnd: fakeTimestamp(new Date('2026-08-01T10:00:00Z')),
      },
    ];
    const timeMin = new Date('2026-08-01T10:00:00Z');

    const result = toOverlappingBookingEvents(docs, timeMin);

    expect(result).toEqual([]);
  });

  it('timeMin 以降に完全に収まる予約は含める', () => {
    const docs = [
      {
        id: 'b1',
        slotStart: fakeTimestamp(new Date('2026-08-01T11:00:00Z')),
        slotEnd: fakeTimestamp(new Date('2026-08-01T12:00:00Z')),
      },
    ];
    const timeMin = new Date('2026-08-01T10:00:00Z');

    const result = toOverlappingBookingEvents(docs, timeMin);

    expect(result).toHaveLength(1);
  });

  it('CalendarEvent への変換内容が正しい', () => {
    const docs = [
      {
        id: 'b1',
        slotStart: fakeTimestamp(new Date('2026-08-01T10:00:00Z')),
        slotEnd: fakeTimestamp(new Date('2026-08-01T11:00:00Z')),
      },
    ];

    const result = toOverlappingBookingEvents(docs, new Date('2026-08-01T00:00:00Z'));

    expect(result[0]).toEqual({
      id: 'b1',
      source: 'google',
      originalId: 'b1',
      calendarId: 'booking',
      title: 'Reserved',
      start: new Date('2026-08-01T10:00:00Z'),
      end: new Date('2026-08-01T11:00:00Z'),
      isAllDay: false,
      status: 'confirmed',
    });
  });
});

describe('hasOverlappingEvent', () => {
  const slotStart = new Date('2026-08-01T10:00:00Z');
  const slotEnd = new Date('2026-08-01T11:00:00Z');

  it('slotと完全に一致する外部イベントは重複とみなす', () => {
    const events = [{ start: slotStart, end: slotEnd }];
    expect(hasOverlappingEvent(events, slotStart, slotEnd)).toBe(true);
  });

  it('slotの一部と重なる外部イベントは重複とみなす', () => {
    const events = [
      { start: new Date('2026-08-01T10:30:00Z'), end: new Date('2026-08-01T12:00:00Z') },
    ];
    expect(hasOverlappingEvent(events, slotStart, slotEnd)).toBe(true);
  });

  it('slot終了時刻ちょうどに始まる隣接イベントは重複とみなさない', () => {
    const events = [{ start: slotEnd, end: new Date('2026-08-01T12:00:00Z') }];
    expect(hasOverlappingEvent(events, slotStart, slotEnd)).toBe(false);
  });

  it('slot開始時刻ちょうどに終わる隣接イベントは重複とみなさない', () => {
    const events = [{ start: new Date('2026-08-01T09:00:00Z'), end: slotStart }];
    expect(hasOverlappingEvent(events, slotStart, slotEnd)).toBe(false);
  });

  it('slotと無関係な時間帯の外部イベントは重複とみなさない', () => {
    const events = [
      { start: new Date('2026-08-01T13:00:00Z'), end: new Date('2026-08-01T14:00:00Z') },
    ];
    expect(hasOverlappingEvent(events, slotStart, slotEnd)).toBe(false);
  });

  it('外部イベントが空配列の場合は重複なし', () => {
    expect(hasOverlappingEvent([], slotStart, slotEnd)).toBe(false);
  });

  it('複数イベント中1件でも重複すればtrueを返す', () => {
    const events = [
      { start: new Date('2026-08-01T13:00:00Z'), end: new Date('2026-08-01T14:00:00Z') },
      { start: new Date('2026-08-01T10:15:00Z'), end: new Date('2026-08-01T10:45:00Z') },
    ];
    expect(hasOverlappingEvent(events, slotStart, slotEnd)).toBe(true);
  });
});
