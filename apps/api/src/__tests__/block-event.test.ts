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
      { signal: expect.any(AbortSignal) },
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

  it('タイムアウト(abort)は transient として再試行し、最終的に failed (レスポンス無応答で /book が永久に返らないことを防ぐ)', async () => {
    // 実際に signal.aborted を見て reject するモックにすることで、
    // withTimeout の見せかけタイムアウトではなく、実際に下層リクエストを
    // abort する経路であることを検証する (Codex review 指摘の回帰防止)。
    const createEvent = vi.fn().mockImplementation((_calendarId, _event, options) => {
      if (options?.signal?.aborted) {
        return Promise.reject(options.signal.reason);
      }
      return new Promise(() => {}); // signal が渡っていなければ永久に解決しない
    });
    // createTimeoutSignal を「即座に abort 済みの signal」にすり替え、
    // 実時間のタイムアウト待ちなしにタイムアウト経路を再現する
    const createTimeoutSignal = () =>
      AbortSignal.abort(new DOMException('timed out', 'TimeoutError'));

    const result = await createBlockEvent({
      ...buildParams({ createEvent }),
      createTimeoutSignal,
    });

    expect(result.status).toBe('failed');
    // 初回 + 再試行2回 = 最大3回
    expect(createEvent).toHaveBeenCalledTimes(3);
  });
});
