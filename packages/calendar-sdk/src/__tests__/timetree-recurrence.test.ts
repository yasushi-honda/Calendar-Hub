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

  it('カンマ区切りEXDATE: 1行に複数除外日をRFC5545準拠で指定', () => {
    // TimeTree APIが実際に返す形式: EXDATE:日付1,日付2,日付3
    const masterStart = new Date('2026-04-14T00:00:00Z'); // 火曜
    const masterEnd = new Date('2026-04-14T01:00:00Z');
    const recurrences = [
      'RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260601',
      'EXDATE:20260421T000000Z,20260505T000000Z,20260519T000000Z',
    ];

    const result = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);

    // 4/14, 4/28, 5/12, 5/26 = 4週（4/21, 5/5, 5/19除外）
    expect(result.length).toBe(4);
    const startDates = result.map((r) => r.start.toISOString());
    expect(startDates).not.toContain('2026-04-21T00:00:00.000Z');
    expect(startDates).not.toContain('2026-05-05T00:00:00.000Z');
    expect(startDates).not.toContain('2026-05-19T00:00:00.000Z');
    expect(startDates).toContain('2026-04-14T00:00:00.000Z');
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

  // === JST 0:00 境界の繰り返しイベント（バグ #日曜→月曜ずれ の再現） ===
  // ADR-008 参照: rrule は dtstart を UTC 基準で扱うため、JST 0:00 開始の予定は
  // UTC 上で前日になり、BYDAY 判定が +1 日ずれる
  describe('JST 0:00 境界の繰り返しイベント (ADR-008)', () => {
    it('日曜 JST 0:00 全日 + BYDAY=SU は日曜に展開される', () => {
      // TimeTree が「日曜 JST 0:00 開始」を保存する形: UTC では土曜 15:00
      const masterStart = new Date('2026-05-02T15:00:00Z'); // 日曜 JST 0:00
      const masterEnd = new Date('2026-05-03T15:00:00Z'); // 月曜 JST 0:00 (24h後)
      const recurrences = ['RRULE:FREQ=WEEKLY;BYDAY=SU'];

      const tMin = new Date('2026-05-01T00:00:00Z');
      const tMax = new Date('2026-05-30T00:00:00Z');
      const result = expandRecurringEvent(recurrences, masterStart, masterEnd, tMin, tMax);

      expect(result.length).toBeGreaterThanOrEqual(3);
      for (const inst of result) {
        // JST で日曜 0:00 (= UTC 土曜 15:00) であること
        const jstDay = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Tokyo',
          weekday: 'short',
        }).format(inst.start);
        expect(jstDay).toBe('Sun');
        const jstHour = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Tokyo',
          hour: '2-digit',
          hour12: false,
        }).format(inst.start);
        expect(jstHour).toBe('00');
      }
    });

    it('月曜 JST 0:30 通常イベント + BYDAY=MO は月曜に展開される', () => {
      // 月曜 JST 0:30 = UTC 日曜 15:30（UTC では日曜）
      const masterStart = new Date('2026-05-03T15:30:00Z');
      const masterEnd = new Date('2026-05-03T16:30:00Z'); // 1時間
      const recurrences = ['RRULE:FREQ=WEEKLY;BYDAY=MO'];

      const tMin = new Date('2026-05-01T00:00:00Z');
      const tMax = new Date('2026-05-30T00:00:00Z');
      const result = expandRecurringEvent(recurrences, masterStart, masterEnd, tMin, tMax);

      expect(result.length).toBeGreaterThanOrEqual(3);
      for (const inst of result) {
        const jstDay = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Tokyo',
          weekday: 'short',
        }).format(inst.start);
        expect(jstDay).toBe('Mon');
      }
    });

    it('EXDATE は JST 日付ベースで除外される', () => {
      // 日曜 JST 0:00 全日週次、JST 5/10 を除外
      const masterStart = new Date('2026-05-02T15:00:00Z');
      const masterEnd = new Date('2026-05-03T15:00:00Z');
      const recurrences = [
        'RRULE:FREQ=WEEKLY;BYDAY=SU',
        'EXDATE:20260510', // JST 2026-05-10 (日曜) を除外したい
      ];

      const tMin = new Date('2026-05-01T00:00:00Z');
      const tMax = new Date('2026-05-30T00:00:00Z');
      const result = expandRecurringEvent(recurrences, masterStart, masterEnd, tMin, tMax);

      // 5/10 が除外されていること（JST 日付で判定）
      const jstDates = result.map((r) =>
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(r.start),
      );
      expect(jstDates).not.toContain('2026-05-10');
      // 他の日曜は含まれること
      expect(jstDates).toContain('2026-05-03');
      expect(jstDates).toContain('2026-05-17');
    });
  });
});

describe('instanceDateSuffix', () => {
  it('全日イベント: _RYYYYMMDD形式 (JST date 基準)', () => {
    // JST 2026-04-15 0:00 (= UTC 2026-04-14 15:00)
    const date = new Date('2026-04-14T15:00:00Z');
    expect(instanceDateSuffix(date, true)).toBe('_R20260415');
  });

  it('時間指定イベント: _RYYYYMMDDTHHmmss形式', () => {
    const date = new Date('2026-04-15T07:30:00Z');
    expect(instanceDateSuffix(date, false)).toBe('_R20260415T073000');
  });

  // ADR-008: suffix を JST 基準にすることで、修正前後で suffix が一致し
  // 既存タグ付き Google 予定との originalId 衝突を回避する
  it('全日イベント: JST 0:00 境界 (UTC 前日) でも JST 日付を返す', () => {
    // 日曜 JST 0:00 (= 土曜 UTC 15:00)
    const date = new Date('2026-05-02T15:00:00Z');
    expect(instanceDateSuffix(date, true)).toBe('_R20260503');
  });

  it('全日イベント: 旧 UTC 基準と新 JST 基準で suffix が一致する移行ケース', () => {
    // バグ修正前は monday JST 0:00 = sunday UTC 15:00 = `2026-05-03T15:00:00Z` で生成され
    // getUTCDate=3 で `_R20260503` となっていた。
    // 修正後は sunday JST 0:00 = saturday UTC 15:00 = `2026-05-02T15:00:00Z` で生成され
    // JST date=3 で `_R20260503` となる。
    const oldBuggyInstance = new Date('2026-05-03T15:00:00Z');
    const newCorrectInstance = new Date('2026-05-02T15:00:00Z');
    expect(instanceDateSuffix(newCorrectInstance, true)).toBe(
      // 旧 suffix を再現するための UTC 計算
      `_R${oldBuggyInstance.getUTCFullYear()}${String(oldBuggyInstance.getUTCMonth() + 1).padStart(2, '0')}${String(oldBuggyInstance.getUTCDate()).padStart(2, '0')}`,
    );
  });
});
