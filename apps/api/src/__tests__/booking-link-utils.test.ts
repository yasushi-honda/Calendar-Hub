import { describe, it, expect } from 'vitest';
import type { BookingLink } from '@calendar-hub/shared';
import {
  applyBookingLinkDefaults,
  shouldCreateCalendarEvent,
  filterCalendarsByIds,
  validateBookingLinkInvariant,
} from '../lib/booking-link-utils.js';

// Helper: 完成形 BookingLink を組み立てるための baseLink
function buildLink(overrides: Partial<BookingLink>): BookingLink {
  return {
    id: 'l1',
    ownerUid: 'u1',
    title: 't',
    durationMinutes: 60,
    accountIds: ['acc1'],
    calendarIdForEvent: 'cal1',
    accountIdForEvent: 'acc1',
    freeTimeOptions: { dayStartHour: 9, dayEndHour: 18 },
    availableDays: [1, 2, 3, 4, 5],
    rangeDays: 14,
    bufferMinutes: 0,
    status: 'active',
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    autoCreateCalendarEvent: true,
    calendarIdsForAvailability: null,
    ...overrides,
  };
}

describe('applyBookingLinkDefaults', () => {
  it('AC-3: 既存 document に autoCreateCalendarEvent が無ければ true (既存挙動維持)', () => {
    const result = applyBookingLinkDefaults({ title: 'old-link' });
    expect(result.autoCreateCalendarEvent).toBe(true);
  });

  it('AC-4: 既存 document に calendarIdsForAvailability が無ければ null (全カレンダー対象)', () => {
    const result = applyBookingLinkDefaults({ title: 'old-link' });
    expect(result.calendarIdsForAvailability).toBeNull();
  });

  it('明示的に false が指定されていれば false を返す', () => {
    const result = applyBookingLinkDefaults({ autoCreateCalendarEvent: false });
    expect(result.autoCreateCalendarEvent).toBe(false);
  });

  it('明示的に配列が指定されていればその配列を返す', () => {
    const result = applyBookingLinkDefaults({
      calendarIdsForAvailability: ['x@example.com'],
    });
    expect(result.calendarIdsForAvailability).toEqual(['x@example.com']);
  });

  it('calendarIdForEvent / accountIdForEvent が無ければ両方 null', () => {
    const result = applyBookingLinkDefaults({});
    expect(result.calendarIdForEvent).toBeNull();
    expect(result.accountIdForEvent).toBeNull();
  });

  it('calendarIdForEvent / accountIdForEvent が文字列指定ならそれを返す', () => {
    const result = applyBookingLinkDefaults({
      calendarIdForEvent: 'cal1@example.com',
      accountIdForEvent: 'google_acc1',
    });
    expect(result.calendarIdForEvent).toBe('cal1@example.com');
    expect(result.accountIdForEvent).toBe('google_acc1');
  });
});

describe('shouldCreateCalendarEvent', () => {
  it('AC-1: autoCreate=false なら false (event 作成 skip)', () => {
    const link = buildLink({
      autoCreateCalendarEvent: false,
      calendarIdForEvent: null,
      accountIdForEvent: null,
    });
    expect(shouldCreateCalendarEvent(link)).toBe(false);
  });

  it('AC-3 (補完後): autoCreate=true かつ両 ID あれば true', () => {
    const link = buildLink({
      autoCreateCalendarEvent: true,
      calendarIdForEvent: 'cal1',
      accountIdForEvent: 'acc1',
    });
    expect(shouldCreateCalendarEvent(link)).toBe(true);
  });

  it('autoCreate=true でも calendarIdForEvent が null なら false (defensive)', () => {
    const link = buildLink({
      autoCreateCalendarEvent: true,
      calendarIdForEvent: null,
      accountIdForEvent: 'acc1',
    });
    expect(shouldCreateCalendarEvent(link)).toBe(false);
  });

  it('autoCreate=true でも accountIdForEvent が null なら false (defensive)', () => {
    const link = buildLink({
      autoCreateCalendarEvent: true,
      calendarIdForEvent: 'cal1',
      accountIdForEvent: null,
    });
    expect(shouldCreateCalendarEvent(link)).toBe(false);
  });
});

describe('filterCalendarsByIds', () => {
  const calendars = [
    { id: 'cal1', name: 'A' },
    { id: 'cal2', name: 'B' },
    { id: 'cal3', name: 'C' },
  ];

  it('AC-4: filter=null なら全 calendar を返す (既存挙動)', () => {
    const result = filterCalendarsByIds(calendars, null);
    expect(result).toHaveLength(3);
  });

  it('AC-2: filter=[cal2] なら cal2 のみ返す', () => {
    const result = filterCalendarsByIds(calendars, ['cal2']);
    expect(result).toEqual([{ id: 'cal2', name: 'B' }]);
  });

  it('AC-2: filter=[cal1, cal3] なら cal1 と cal3 を返す', () => {
    const result = filterCalendarsByIds(calendars, ['cal1', 'cal3']);
    expect(result).toEqual([
      { id: 'cal1', name: 'A' },
      { id: 'cal3', name: 'C' },
    ]);
  });

  it('filter=[] なら空配列を返す', () => {
    const result = filterCalendarsByIds(calendars, []);
    expect(result).toEqual([]);
  });

  it('filter に存在しない ID が含まれていても無視される', () => {
    const result = filterCalendarsByIds(calendars, ['cal2', 'nonexistent']);
    expect(result).toEqual([{ id: 'cal2', name: 'B' }]);
  });
});

describe('validateBookingLinkInvariant', () => {
  it('AC-5: autoCreate=true で calendarIdForEvent=null だと NG', () => {
    const result = validateBookingLinkInvariant({
      autoCreateCalendarEvent: true,
      calendarIdForEvent: null,
      accountIdForEvent: 'acc1',
    });
    expect(result.ok).toBe(false);
  });

  it('AC-5: autoCreate=true で accountIdForEvent=null だと NG', () => {
    const result = validateBookingLinkInvariant({
      autoCreateCalendarEvent: true,
      calendarIdForEvent: 'cal1',
      accountIdForEvent: null,
    });
    expect(result.ok).toBe(false);
  });

  it('autoCreate=true で両 ID あれば OK', () => {
    const result = validateBookingLinkInvariant({
      autoCreateCalendarEvent: true,
      calendarIdForEvent: 'cal1',
      accountIdForEvent: 'acc1',
    });
    expect(result.ok).toBe(true);
  });

  it('autoCreate=false なら両 ID が null でも OK', () => {
    const result = validateBookingLinkInvariant({
      autoCreateCalendarEvent: false,
      calendarIdForEvent: null,
      accountIdForEvent: null,
    });
    expect(result.ok).toBe(true);
  });

  it('autoCreate=false なら両 ID が undefined でも OK', () => {
    const result = validateBookingLinkInvariant({
      autoCreateCalendarEvent: false,
      calendarIdForEvent: undefined,
      accountIdForEvent: undefined,
    });
    expect(result.ok).toBe(true);
  });
});
