import { describe, it, expect } from 'vitest';
import { earliestBookableStart } from '../free-time.js';

const JST = 540;
const opts = { leadMinutes: 30, stepMinutes: 30, timezoneOffsetMinutes: JST };

/** JST 表記(+09:00)で時刻を作る。実行環境のタイムゾーンに依存しない */
const jst = (s: string) => new Date(`${s}+09:00`);
const hhmm = (d: Date) => new Date(d.getTime() + JST * 60000).toISOString().slice(11, 16);

describe('earliestBookableStart', () => {
  it('should round now + lead up to the next 30-minute boundary', () => {
    // 08:41 + 30分 = 09:11 → 09:30
    expect(hhmm(earliestBookableStart(jst('2026-11-19T08:41:17'), opts))).toBe('09:30');
  });

  it('should keep the time when now + lead is exactly on a boundary', () => {
    // 08:30:00 + 30分 = 09:00:00 → 09:00(境界ちょうどは切り上げない)
    expect(earliestBookableStart(jst('2026-11-19T08:30:00'), opts).toISOString()).toBe(
      jst('2026-11-19T09:00:00').toISOString(),
    );
  });

  it('should round up when now + lead is one second past a boundary', () => {
    expect(hhmm(earliestBookableStart(jst('2026-11-19T08:30:01'), opts))).toBe('09:30');
  });

  it('should round up when now + lead is one millisecond past a boundary', () => {
    expect(
      earliestBookableStart(new Date(jst('2026-11-19T08:30:00').getTime() + 1), opts).toISOString(),
    ).toBe(jst('2026-11-19T09:30:00').toISOString());
  });

  it('should cross the hour boundary', () => {
    expect(hhmm(earliestBookableStart(jst('2026-11-19T09:45:00'), opts))).toBe('10:30');
  });

  it('should cross midnight', () => {
    // 23:50 + 30分 = 00:20(翌日) → 00:30
    expect(earliestBookableStart(jst('2026-11-19T23:50:00'), opts).toISOString()).toBe(
      jst('2026-11-20T00:30:00').toISOString(),
    );
  });

  it('should never return a time earlier than now + lead', () => {
    for (const t of ['08:00:00', '08:00:01', '08:29:59', '08:30:00', '12:15:30', '22:59:59']) {
      const now = jst(`2026-11-19T${t}`);
      const result = earliestBookableStart(now, opts);
      expect(result.getTime()).toBeGreaterThanOrEqual(now.getTime() + 30 * 60000);
      // 切り上げ幅は刻み未満
      expect(result.getTime() - (now.getTime() + 30 * 60000)).toBeLessThan(30 * 60000);
    }
  });
});

describe('earliestBookableStart: タイムゾーンのオフセット', () => {
  it('should treat the offset as 0 (UTC) when omitted', () => {
    // UTC 08:41 + 30分 = 09:11 → 09:30(UTC)
    expect(
      earliestBookableStart(new Date('2026-11-19T08:41:00Z'), {
        leadMinutes: 30,
        stepMinutes: 30,
      }).toISOString(),
    ).toBe('2026-11-19T09:30:00.000Z');
  });

  it('should align to wall-clock time for an offset that is not a multiple of the step (+05:45)', () => {
    // 壁時計 = UTC + 5:45。UTC 03:00 → 壁時計 08:45。+30分 = 09:15 → 09:30(壁時計) = UTC 03:45
    const r = earliestBookableStart(new Date('2026-11-19T03:00:00Z'), {
      leadMinutes: 30,
      stepMinutes: 30,
      timezoneOffsetMinutes: 345,
    });
    expect(r.toISOString()).toBe('2026-11-19T03:45:00.000Z');
  });

  it('should align to wall-clock time for a negative offset (-05:00)', () => {
    // UTC 13:41 = 壁時計 08:41。+30分 = 09:11 → 09:30(壁時計) = UTC 14:30
    const r = earliestBookableStart(new Date('2026-11-19T13:41:00Z'), {
      leadMinutes: 30,
      stepMinutes: 30,
      timezoneOffsetMinutes: -300,
    });
    expect(r.toISOString()).toBe('2026-11-19T14:30:00.000Z');
  });
});
