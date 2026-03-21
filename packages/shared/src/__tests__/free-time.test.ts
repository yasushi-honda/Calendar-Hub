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

  it('should skip all-day events', () => {
    const events = [makeEvent('2026-03-21T00:00:00', '2026-03-22T00:00:00', { isAllDay: true })];
    const slots = calculateFreeSlots(events, dayStart, dayEnd);
    expect(slots).toHaveLength(1); // All-day events are filtered out
    expect(slots[0].durationMinutes).toBe(14 * 60);
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
});
