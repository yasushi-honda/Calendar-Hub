import { describe, it, expect } from 'vitest';
import { toOverlappingBookingEvents } from '../lib/booking-events.js';

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
