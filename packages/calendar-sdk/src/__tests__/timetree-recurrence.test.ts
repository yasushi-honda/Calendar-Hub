import { describe, it, expect } from 'vitest';
import { expandRecurringEvent, instanceDateSuffix } from '../adapters/timetree-recurrence.js';

describe('expandRecurringEvent', () => {
  const timeMin = new Date('2026-03-01T00:00:00Z');
  const timeMax = new Date('2026-06-01T00:00:00Z');

  it('FREQ=WEEKLY: 週次イベントを期間内に展開する', () => {
    const masterStart = new Date('2026-01-06T07:00:00Z'); // 火曜
    const masterEnd = new Date('2026-01-06T08:00:00Z');
    const recurrences = ['RRULE:FREQ=WEEKLY;BYDAY=TU'];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);

    // 3月〜5月の火曜日（約13週）
    expect(result.length).toBeGreaterThanOrEqual(12);
    expect(result.length).toBeLessThanOrEqual(14);

    // 各インスタンスのdurationは1時間
    for (const instance of result) {
      expect(instance.end.getTime() - instance.start.getTime()).toBe(3600_000);
      expect(instance.start.getUTCDay()).toBe(2); // 火曜
    }
  });

  it('FREQ=WEEKLY with UNTIL: 終了日まで展開する', () => {
    const masterStart = new Date('2026-03-02T10:00:00Z');
    const masterEnd = new Date('2026-03-02T11:00:00Z');
    const recurrences = ['RRULE:FREQ=WEEKLY;UNTIL=20260401'];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);

    // 3/2, 3/9, 3/16, 3/23, 3/30 = 5週
    expect(result.length).toBe(5);
    // UNTILの後のインスタンスがないことを確認
    for (const instance of result) {
      expect(instance.start.getTime()).toBeLessThanOrEqual(
        new Date('2026-04-01T23:59:59Z').getTime(),
      );
    }
  });

  it('FREQ=DAILY: 日次イベントを展開する', () => {
    const masterStart = new Date('2026-03-10T09:00:00Z');
    const masterEnd = new Date('2026-03-10T10:00:00Z');
    const recurrences = ['RRULE:FREQ=DAILY;UNTIL=20260315'];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);

    // 3/10〜3/14 = 5日（UNTIL=20260315は時刻なしで00:00Z扱い、dtstart 09:00より前のため3/15は含まれない）
    expect(result.length).toBe(5);
  });

  it('FREQ=YEARLY: 年次イベントを展開する（誕生日等）', () => {
    // 1981年生まれの誕生日 → 2026年のインスタンスが含まれるか
    const masterStart = new Date('1981-01-28T00:00:00Z');
    const masterEnd = new Date('1981-01-28T00:00:00Z');
    const recurrences = ['RRULE:FREQ=YEARLY'];

    // 1月の範囲では含まれない
    const result1 = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);
    expect(result1.length).toBe(0);

    // 1月を含む範囲なら含まれる
    const janMin = new Date('2026-01-01T00:00:00Z');
    const janMax = new Date('2026-02-01T00:00:00Z');
    const result2 = expandRecurringEvent(recurrences, masterStart, masterEnd, janMin, janMax);
    expect(result2.length).toBe(1);
    expect(result2[0].start.getUTCMonth()).toBe(0); // 1月
    expect(result2[0].start.getUTCDate()).toBe(28);
  });

  it('FREQ=MONTHLY: 月次イベントを展開する', () => {
    const masterStart = new Date('2026-01-15T14:00:00Z');
    const masterEnd = new Date('2026-01-15T15:00:00Z');
    const recurrences = ['RRULE:FREQ=MONTHLY'];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);

    // 3月, 4月, 5月 = 3ヶ月分
    expect(result.length).toBe(3);
    for (const instance of result) {
      expect(instance.start.getUTCDate()).toBe(15);
    }
  });

  it('EXDATE: 除外日を正しく除外する', () => {
    const masterStart = new Date('2026-03-02T07:00:00Z'); // 月曜
    const masterEnd = new Date('2026-03-02T08:00:00Z');
    const recurrences = [
      'RRULE:FREQ=WEEKLY;UNTIL=20260401;BYDAY=MO',
      'EXDATE:20260316T070000Z', // 3/16を除外
    ];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);

    // 3/2, 3/9, 3/23, 3/30 = 4週（3/16除外）
    expect(result.length).toBe(4);
    const startDates = result.map((r) => r.start.toISOString());
    expect(startDates).not.toContain('2026-03-16T07:00:00.000Z');
  });

  it('複数EXDATE: 複数除外日を正しく除外する', () => {
    const masterStart = new Date('2026-03-02T07:00:00Z');
    const masterEnd = new Date('2026-03-02T08:00:00Z');
    const recurrences = [
      'RRULE:FREQ=WEEKLY;UNTIL=20260401;BYDAY=MO',
      'EXDATE:20260309T070000Z',
      'EXDATE:20260323T070000Z',
    ];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);

    // 3/2, 3/16, 3/30 = 3週（3/9, 3/23除外）
    expect(result.length).toBe(3);
  });

  it('空のrecurrencesは空配列を返す', () => {
    const result = expandRecurringEvent([], new Date(), new Date(), timeMin, timeMax);
    expect(result).toEqual([]);
  });

  it('期間外の繰り返しイベントは空配列を返す', () => {
    const masterStart = new Date('2020-01-01T10:00:00Z');
    const masterEnd = new Date('2020-01-01T11:00:00Z');
    const recurrences = ['RRULE:FREQ=WEEKLY;UNTIL=20200301'];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);
    expect(result).toEqual([]);
  });
});

describe('instanceDateSuffix', () => {
  it('全日イベント: _RYYYYMMDD形式', () => {
    const date = new Date('2026-04-15T00:00:00Z');
    expect(instanceDateSuffix(date, true)).toBe('_R20260415');
  });

  it('時間指定イベント: _RYYYYMMDDTHHmmss形式', () => {
    const date = new Date('2026-04-15T07:30:00Z');
    expect(instanceDateSuffix(date, false)).toBe('_R20260415T073000');
  });
});
