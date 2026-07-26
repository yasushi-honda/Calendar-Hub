import { describe, it, expect } from 'vitest';
import { validateCalendarTargetInvariant } from '../lib/calendar-target-invariant.js';

describe('validateCalendarTargetInvariant', () => {
  it('enabled=false なら calendarId/accountId が両方 null でも ok', () => {
    const result = validateCalendarTargetInvariant({
      enabled: false,
      calendarId: null,
      accountId: null,
    });
    expect(result.ok).toBe(true);
  });

  it('enabled=true で calendarId が無ければ NG', () => {
    const result = validateCalendarTargetInvariant({
      enabled: true,
      calendarId: null,
      accountId: 'acc1',
    });
    expect(result.ok).toBe(false);
  });

  it('enabled=true で accountId が無ければ NG', () => {
    const result = validateCalendarTargetInvariant({
      enabled: true,
      calendarId: 'cal1',
      accountId: null,
    });
    expect(result.ok).toBe(false);
  });

  it('enabled=true で両方揃っていれば ok', () => {
    const result = validateCalendarTargetInvariant({
      enabled: true,
      calendarId: 'cal1',
      accountId: 'acc1',
    });
    expect(result.ok).toBe(true);
  });
});
