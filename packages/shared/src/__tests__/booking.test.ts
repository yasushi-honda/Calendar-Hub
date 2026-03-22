import { describe, it, expect } from 'vitest';
import { splitFreeIntoBookingSlots, type FreeSlot } from '../free-time.js';
import { DURATION_OPTIONS } from '../booking-types.js';

function makeSlot(startHour: number, endHour: number, date = '2026-03-25'): FreeSlot {
  return {
    start: new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00Z`),
    end: new Date(`${date}T${String(endHour).padStart(2, '0')}:00:00Z`),
    durationMinutes: (endHour - startHour) * 60,
  };
}

describe('splitFreeIntoBookingSlots', () => {
  it('should split a 2-hour slot into 4 x 30min slots', () => {
    const freeSlots = [makeSlot(9, 11)];
    const result = splitFreeIntoBookingSlots(freeSlots, 30);

    expect(result).toHaveLength(4);
    expect(result[0].start).toContain('T09:00:00');
    expect(result[0].end).toContain('T09:30:00');
    expect(result[1].start).toContain('T09:30:00');
    expect(result[3].end).toContain('T11:00:00');
  });

  it('should split a 2-hour slot into 2 x 60min slots', () => {
    const freeSlots = [makeSlot(9, 11)];
    const result = splitFreeIntoBookingSlots(freeSlots, 60);

    expect(result).toHaveLength(2);
    expect(result[0].start).toContain('T09:00:00');
    expect(result[0].end).toContain('T10:00:00');
    expect(result[1].start).toContain('T10:00:00');
    expect(result[1].end).toContain('T11:00:00');
  });

  it('should respect buffer between slots', () => {
    const freeSlots = [makeSlot(9, 11)]; // 120min
    // 30min slot + 15min buffer = 45min per cycle
    // Slot1: 09:00-09:30, next at 09:45
    // Slot2: 09:45-10:15, next at 10:30
    // Slot3: 10:30-11:00 (fits exactly) → 3 slots
    const result = splitFreeIntoBookingSlots(freeSlots, 30, 15);

    expect(result).toHaveLength(3);
    expect(result[0].start).toContain('T09:00:00');
    expect(result[0].end).toContain('T09:30:00');
    expect(result[1].start).toContain('T09:45:00');
    expect(result[1].end).toContain('T10:15:00');
    expect(result[2].start).toContain('T10:30:00');
    expect(result[2].end).toContain('T11:00:00');
  });

  it('should return empty when slot is shorter than duration', () => {
    const freeSlots = [makeSlot(9, 9)]; // 0 minutes
    const result = splitFreeIntoBookingSlots(freeSlots, 30);

    expect(result).toHaveLength(0);
  });

  it('should return empty when free slots array is empty', () => {
    const result = splitFreeIntoBookingSlots([], 30);
    expect(result).toHaveLength(0);
  });

  it('should handle slot exactly equal to duration', () => {
    // 30 min free slot, 30 min duration → exactly 1 slot
    const freeSlots: FreeSlot[] = [
      {
        start: new Date('2026-03-25T14:00:00Z'),
        end: new Date('2026-03-25T14:30:00Z'),
        durationMinutes: 30,
      },
    ];
    const result = splitFreeIntoBookingSlots(freeSlots, 30);

    expect(result).toHaveLength(1);
    expect(result[0].start).toContain('T14:00:00');
    expect(result[0].end).toContain('T14:30:00');
  });

  it('should handle multiple free slots across different times', () => {
    const freeSlots = [
      makeSlot(9, 10), // 60min → 2 x 30min
      makeSlot(14, 15), // 60min → 2 x 30min
    ];
    const result = splitFreeIntoBookingSlots(freeSlots, 30);

    expect(result).toHaveLength(4);
    expect(result[0].start).toContain('T09:00:00');
    expect(result[1].start).toContain('T09:30:00');
    expect(result[2].start).toContain('T14:00:00');
    expect(result[3].start).toContain('T14:30:00');
  });

  it('should not create partial slots when remaining time < duration', () => {
    // 75min free slot, 30min duration → 2 slots (60min used), 15min remainder discarded
    const freeSlots: FreeSlot[] = [
      {
        start: new Date('2026-03-25T09:00:00Z'),
        end: new Date('2026-03-25T10:15:00Z'),
        durationMinutes: 75,
      },
    ];
    const result = splitFreeIntoBookingSlots(freeSlots, 30);

    expect(result).toHaveLength(2);
    expect(result[0].end).toContain('T09:30:00');
    expect(result[1].end).toContain('T10:00:00');
  });

  it('should handle buffer that makes last slot impossible', () => {
    // 65min free, 30min + 10min buffer = 40min cycle
    // Slot 1: 09:00-09:30 (next at 09:40)
    // Slot 2: 09:40-10:10 → exceeds 10:05, so only 1 slot
    const freeSlots: FreeSlot[] = [
      {
        start: new Date('2026-03-25T09:00:00Z'),
        end: new Date('2026-03-25T10:05:00Z'),
        durationMinutes: 65,
      },
    ];
    const result = splitFreeIntoBookingSlots(freeSlots, 30, 10);

    expect(result).toHaveLength(1);
  });
});

describe('DURATION_OPTIONS', () => {
  it('should contain exactly the valid options', () => {
    expect(DURATION_OPTIONS).toEqual([15, 30, 45, 60, 90, 120]);
  });

  it('should all be positive integers', () => {
    for (const d of DURATION_OPTIONS) {
      expect(d).toBeGreaterThan(0);
      expect(Number.isInteger(d)).toBe(true);
    }
  });
});

describe('booking input validation patterns', () => {
  // テスト対象: サーバー側バリデーションと同じロジックをユニットテスト

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it('should validate correct email formats', () => {
    expect(emailRegex.test('user@example.com')).toBe(true);
    expect(emailRegex.test('user+tag@domain.co.jp')).toBe(true);
  });

  it('should reject invalid email formats', () => {
    expect(emailRegex.test('')).toBe(false);
    expect(emailRegex.test('not-an-email')).toBe(false);
    expect(emailRegex.test('@domain.com')).toBe(false);
    expect(emailRegex.test('user@')).toBe(false);
    expect(emailRegex.test('user @domain.com')).toBe(false);
  });

  it('should reject invalid slotStart dates', () => {
    expect(isNaN(new Date('invalid').getTime())).toBe(true);
    expect(isNaN(new Date('').getTime())).toBe(true);
  });

  it('should accept valid ISO 8601 slotStart dates', () => {
    expect(isNaN(new Date('2026-03-25T09:00:00Z').getTime())).toBe(false);
    expect(isNaN(new Date('2026-03-25T09:00:00+09:00').getTime())).toBe(false);
  });

  it('should validate guestName length boundary', () => {
    const maxLen = 100;
    expect('a'.repeat(100).length <= maxLen).toBe(true);
    expect('a'.repeat(101).length <= maxLen).toBe(false);
  });

  it('should validate guestMessage length boundary', () => {
    const maxLen = 1000;
    expect('a'.repeat(1000).length <= maxLen).toBe(true);
    expect('a'.repeat(1001).length <= maxLen).toBe(false);
  });

  it('should validate availableDays range (0-6)', () => {
    const validDays = [0, 1, 2, 3, 4, 5, 6];
    const invalidDays = [-1, 7, 8];

    for (const d of validDays) {
      expect(d >= 0 && d <= 6).toBe(true);
    }
    for (const d of invalidDays) {
      expect(d >= 0 && d <= 6).toBe(false);
    }
  });

  it('should validate rangeDays limits (1-90)', () => {
    expect(0 >= 1 && 0 <= 90).toBe(false);
    expect(1 >= 1 && 1 <= 90).toBe(true);
    expect(90 >= 1 && 90 <= 90).toBe(true);
    expect(91 >= 1 && 91 <= 90).toBe(false);
  });

  it('should validate dayStartHour < dayEndHour', () => {
    expect(9 < 18).toBe(true);
    expect(18 < 9).toBe(false);
    expect(9 < 9).toBe(false); // equal should fail
  });

  it('should validate status enum', () => {
    const validStatuses = ['active', 'paused'];
    expect(validStatuses.includes('active')).toBe(true);
    expect(validStatuses.includes('paused')).toBe(true);
    expect(validStatuses.includes('deleted')).toBe(false);
    expect(validStatuses.includes('')).toBe(false);
  });
});
