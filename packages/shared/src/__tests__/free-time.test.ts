import { describe, it, expect } from 'vitest';
import { calculateFreeSlots } from '../free-time.js';
import type { CalendarEvent } from '../index.js';

function makeEvent(start: string, end: string, overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'test',
    source: 'google',
    originalId: 'test',
    calendarId: 'cal1',
    title: 'Test Event',
    start: new Date(start),
    end: new Date(end),
    isAllDay: false,
    status: 'confirmed',
    ...overrides,
  };
}

describe('calculateFreeSlots', () => {
  const dayStart = new Date('2026-03-21T00:00:00');
  const dayEnd = new Date('2026-03-22T00:00:00');

  it('should return full day as free when no events', () => {
    const slots = calculateFreeSlots([], dayStart, dayEnd);
    expect(slots).toHaveLength(1);
    expect(slots[0].start.getHours()).toBe(8); // dayStartHour default
    expect(slots[0].end.getHours()).toBe(22); // dayEndHour default
    expect(slots[0].durationMinutes).toBe(14 * 60); // 8:00-22:00 = 14h
  });

  it('should calculate free slots around a single event', () => {
    const events = [makeEvent('2026-03-21T10:00:00', '2026-03-21T11:00:00')];
    const slots = calculateFreeSlots(events, dayStart, dayEnd);
    expect(slots).toHaveLength(2);
    // 8:00-10:00
    expect(slots[0].start.getHours()).toBe(8);
    expect(slots[0].end.getHours()).toBe(10);
    expect(slots[0].durationMinutes).toBe(120);
    // 11:00-22:00
    expect(slots[1].start.getHours()).toBe(11);
    expect(slots[1].end.getHours()).toBe(22);
    expect(slots[1].durationMinutes).toBe(660);
  });

  it('should filter out slots shorter than minSlotMinutes', () => {
    const events = [
      makeEvent('2026-03-21T08:00:00', '2026-03-21T08:20:00'), // leaves 20min gap
      makeEvent('2026-03-21T08:40:00', '2026-03-21T22:00:00'), // fills rest
    ];
    // 08:20-08:40 = 20min < 30min default → excluded
    const slots = calculateFreeSlots(events, dayStart, dayEnd);
    expect(slots).toHaveLength(0);
  });

  it('should handle overlapping events', () => {
    const events = [
      makeEvent('2026-03-21T09:00:00', '2026-03-21T11:00:00'),
      makeEvent('2026-03-21T10:00:00', '2026-03-21T12:00:00'), // overlaps
    ];
    const slots = calculateFreeSlots(events, dayStart, dayEnd);
    expect(slots).toHaveLength(2);
    // 8:00-9:00, 12:00-22:00
    expect(slots[0].durationMinutes).toBe(60);
    expect(slots[1].start.getHours()).toBe(12);
  });

  it('should treat all-day events as busy for the entire day (Issue #194: 終日予定を空き扱いすると二重予約になる)', () => {
    const events = [makeEvent('2026-03-21T00:00:00', '2026-03-22T00:00:00', { isAllDay: true })];
    const slots = calculateFreeSlots(events, dayStart, dayEnd);
    expect(slots).toHaveLength(0);
  });

  it('should block only the days actually covered by a multi-day all-day event', () => {
    const rangeEnd = new Date('2026-03-24T00:00:00'); // 21, 22, 23日の3日分
    // Google Calendar の all-day event 仕様: end.date は exclusive なので
    // 21日〜22日の2日間の終日予定は end が23日になる
    const events = [makeEvent('2026-03-21T00:00:00', '2026-03-23T00:00:00', { isAllDay: true })];
    const slots = calculateFreeSlots(events, dayStart, rangeEnd);
    // 21日・22日はブロックされ、23日のみ終日空き
    expect(slots).toHaveLength(1);
    expect(slots[0].start.getDate()).toBe(23);
    expect(slots[0].durationMinutes).toBe(14 * 60);
  });

  it('should combine all-day event blocking with timed events on other days', () => {
    const rangeEnd = new Date('2026-03-23T00:00:00'); // 21, 22日の2日分
    const events = [
      makeEvent('2026-03-21T00:00:00', '2026-03-22T00:00:00', { isAllDay: true }), // 21日を終日ブロック
      makeEvent('2026-03-22T10:00:00', '2026-03-22T11:00:00'), // 22日の通常予定
    ];
    const slots = calculateFreeSlots(events, dayStart, rangeEnd);
    // 21日は0件、22日は 8-10, 11-22 の2件
    expect(slots).toHaveLength(2);
    expect(slots[0].start.getDate()).toBe(22);
    expect(slots[0].end.getHours()).toBe(10);
    expect(slots[1].start.getHours()).toBe(11);
  });

  it('should respect custom dayStartHour and dayEndHour', () => {
    const slots = calculateFreeSlots([], dayStart, dayEnd, {
      dayStartHour: 9,
      dayEndHour: 17,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].durationMinutes).toBe(8 * 60); // 9:00-17:00
  });

  it('should handle multiple days', () => {
    const rangeEnd = new Date('2026-03-23T00:00:00');
    const slots = calculateFreeSlots([], dayStart, rangeEnd);
    expect(slots).toHaveLength(2); // 2 days
  });

  it('should handle events that span across dayEnd boundary', () => {
    const events = [makeEvent('2026-03-21T20:00:00', '2026-03-21T23:00:00')];
    const slots = calculateFreeSlots(events, dayStart, dayEnd);
    // 8:00-20:00 free, 20:00-23:00 event (clipped to 22:00)
    expect(slots).toHaveLength(1);
    expect(slots[0].durationMinutes).toBe(12 * 60); // 8:00-20:00
  });

  describe('rangeStart が当日の途中の場合 (Issue #198: 過去枠の除外)', () => {
    it('should start the first day free slot from rangeStart, not dayStartHour, when rangeStart is later in the day', () => {
      const rangeStart = new Date('2026-03-21T14:00:00'); // dayStartHour(8時)より後
      const slots = calculateFreeSlots([], rangeStart, dayEnd);
      expect(slots).toHaveLength(1);
      expect(slots[0].start.getHours()).toBe(14);
      expect(slots[0].end.getHours()).toBe(22);
      expect(slots[0].durationMinutes).toBe(8 * 60);
    });

    it('should not shift cursor when rangeStart is exactly at dayStartHour (boundary, not "later")', () => {
      const rangeStart = new Date('2026-03-21T08:00:00');
      const slots = calculateFreeSlots([], rangeStart, dayEnd);
      expect(slots).toHaveLength(1);
      expect(slots[0].start.getHours()).toBe(8);
      expect(slots[0].durationMinutes).toBe(14 * 60);
    });

    it('should produce no slots for the first day when rangeStart is after dayEndHour', () => {
      const rangeStart = new Date('2026-03-21T23:00:00'); // dayEndHour(22時)より後
      const rangeEnd = new Date('2026-03-23T00:00:00'); // 21, 22日の2日分
      const slots = calculateFreeSlots([], rangeStart, rangeEnd);
      // 21日は0件(rangeStartがdayEndを過ぎている)、22日は通常通り8-22
      expect(slots).toHaveLength(1);
      expect(slots[0].start.getDate()).toBe(22);
      expect(slots[0].durationMinutes).toBe(14 * 60);
    });

    it('should only affect the first day, leaving subsequent days at the normal dayStartHour', () => {
      const rangeStart = new Date('2026-03-21T14:00:00');
      const rangeEnd = new Date('2026-03-23T00:00:00'); // 21, 22日の2日分
      const slots = calculateFreeSlots([], rangeStart, rangeEnd);
      expect(slots).toHaveLength(2);
      // 21日: 14:00-22:00 (過去枠を除外)
      expect(slots[0].start.getDate()).toBe(21);
      expect(slots[0].start.getHours()).toBe(14);
      // 22日: 8:00-22:00 (通常通り)
      expect(slots[1].start.getDate()).toBe(22);
      expect(slots[1].start.getHours()).toBe(8);
    });

    it('should still exclude a busy event even when it starts before rangeStart (in-progress event)', () => {
      const rangeStart = new Date('2026-03-21T14:00:00');
      const events = [makeEvent('2026-03-21T13:00:00', '2026-03-21T15:00:00')]; // rangeStart時点で進行中
      const slots = calculateFreeSlots(events, rangeStart, dayEnd);
      // 14:00時点でまだイベント中 → cursorはevent.endの15:00まで進む、15:00-22:00のみ空き
      expect(slots).toHaveLength(1);
      expect(slots[0].start.getHours()).toBe(15);
      expect(slots[0].end.getHours()).toBe(22);
    });
  });
});
