import { describe, it, expect, vi } from 'vitest';
import type { CalendarAdapter } from '@calendar-hub/calendar-sdk';
import { createBlockEvent } from '../lib/block-event.js';

const SLOT_START = new Date('2026-07-27T01:00:00.000Z');
const SLOT_END = new Date('2026-07-27T02:00:00.000Z');
const SLOT_START_UNIX = Math.floor(SLOT_START.getTime() / 1000);

function buildParams(overrides: {
  createEvent: CalendarAdapter['createEvent'];
  fetchSlots?: (
    scheduleId: string,
    startUnix: number,
    endUnix: number,
  ) => Promise<{ startUnix: number; durationMinutes: number }[]>;
}) {
  const adapter = {
    createEvent: overrides.createEvent,
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  } as unknown as CalendarAdapter;

  return {
    adapter,
    calendarId: 'cal1',
    scheduleId: 'sched1',
    slotStart: SLOT_START,
    slotEnd: SLOT_END,
    fetchSlots: overrides.fetchSlots,
    sleep: vi.fn().mockResolvedValue(undefined), // テストでは実待機しない
  };
}

describe('createBlockEvent', () => {
  it('作成成功 + 枠消失を確認できれば created', async () => {
    const createEvent = vi.fn().mockResolvedValue({ originalId: 'evt1' });
    const fetchSlots = vi.fn().mockResolvedValue([]); // 枠が消えている (空配列)

    const result = await createBlockEvent(buildParams({ createEvent, fetchSlots }));

    expect(result).toEqual({ status: 'created', eventId: 'evt1' });
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      'cal1',
      expect.objectContaining({ transparency: 'opaque', title: '予定あり' }),
    );
  });

  it('作成成功だが枠が残っていれば created_unverified (設定ミスの強いシグナル)', async () => {
    const createEvent = vi.fn().mockResolvedValue({ originalId: 'evt1' });
    // 2回のリトライ (1s, 3s) いずれも枠が残っている
    const fetchSlots = vi
      .fn()
      .mockResolvedValue([{ startUnix: SLOT_START_UNIX, durationMinutes: 60 }]);

    const result = await createBlockEvent(buildParams({ createEvent, fetchSlots }));

    expect(result).toEqual({ status: 'created_unverified', eventId: 'evt1' });
    expect(fetchSlots).toHaveBeenCalledTimes(2);
  });

  it('transient エラー (429) は再試行し、2回目で成功する', async () => {
    const createEvent = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({ originalId: 'evt1' });
    const fetchSlots = vi.fn().mockResolvedValue([]);

    const result = await createBlockEvent(buildParams({ createEvent, fetchSlots }));

    expect(result).toEqual({ status: 'created', eventId: 'evt1' });
    expect(createEvent).toHaveBeenCalledTimes(2);
  });

  it('permanent エラー (401 invalid_grant 相当) は再試行せず即 failed', async () => {
    const createEvent = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('invalid_grant'), { status: 401 }));

    const result = await createBlockEvent(buildParams({ createEvent }));

    expect(result.status).toBe('failed');
    expect(createEvent).toHaveBeenCalledTimes(1);
  });

  it('transient エラーが最大リトライ回数を超えても回復しなければ failed', async () => {
    const createEvent = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('unavailable'), { status: 503 }));

    const result = await createBlockEvent(buildParams({ createEvent }));

    expect(result.status).toBe('failed');
    // 初回 + 再試行2回 = 最大3回
    expect(createEvent).toHaveBeenCalledTimes(3);
  });

  it('タイムアウトは failed (レスポンス無応答で /book が永久に返らないことを防ぐ)', async () => {
    const createEvent = vi.fn().mockImplementation(() => new Promise(() => {})); // 永久に解決しない

    const params = buildParams({ createEvent });
    // withTimeout の setTimeout を実時間で待つと遅いのでフェイクタイマーを使う
    vi.useFakeTimers();
    const resultPromise = createBlockEvent(params);
    await vi.advanceTimersByTimeAsync(8_000 * 3 + 1_000); // create timeout × 最大試行回数分
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result.status).toBe('failed');
  });
});
