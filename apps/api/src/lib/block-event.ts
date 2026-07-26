import type { CalendarAdapter } from '@calendar-hub/calendar-sdk';
import { fetchAvailableSlots, type GoogleSlot } from './google-booking-mirror.js';

/**
 * booking-mirror C1: 予約成立時に「予定あり」block event を作成する。
 *
 * `createEvent` の 200 は「API 呼び出しが成功した」ことしか意味せず、実際に
 * Google 予約スケジュール側の枠が塞がったこと (conflict check 対象カレンダーへの
 * 書き込みであること) までは保証しない。そのため作成後に `fetchAvailableSlots`
 * で枠消失を検証し、3値 (created/created_unverified/failed) で結果を返す。
 */

export type BlockEventResult =
  | { status: 'created'; eventId: string }
  | { status: 'created_unverified'; eventId: string }
  | { status: 'failed'; error: string };

const CREATE_TIMEOUT_MS = 8_000;
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_RETRY_DELAY_MS = 500;
// gRPC 側のキャッシュ有無が未検証 (計画書参照) のため、短い間隔で複数回リトライする
const VERIFY_RETRY_DELAYS_MS = [1_000, 3_000];

export interface CreateBlockEventParams {
  adapter: CalendarAdapter;
  calendarId: string;
  scheduleId: string;
  slotStart: Date;
  slotEnd: Date;
  /** テスト用 DI。省略時は google-booking-mirror.fetchAvailableSlots を使う */
  fetchSlots?: (scheduleId: string, startUnix: number, endUnix: number) => Promise<GoogleSlot[]>;
  /** テスト用 DI。省略時は実際に待機する */
  sleep?: (ms: number) => Promise<void>;
  /**
   * テスト用 DI。省略時は `AbortSignal.timeout(CREATE_TIMEOUT_MS)` を使う。
   * google-booking-mirror.ts の fetchWithTimeout と同じく、タイムアウト時に
   * 下層の HTTP リクエストを実際に abort するため (Promise.race による見せかけの
   * タイムアウトだと、タイムアウト後もリクエストが裏で成功し重複イベントが
   * 作られる恐れがある)。
   */
  createTimeoutSignal?: () => AbortSignal;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429/503/タイムアウト(abort)は再試行可能 (transient)、それ以外 (401/403/404 等) は即失敗 (permanent) */
function isTransientError(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  const status = (err as { status?: number })?.status;
  if (code === 429 || code === 503 || status === 429 || status === 503) return true;
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return true;
  }
  if (err instanceof Error && /timed out|timeout|abort/i.test(err.message)) return true;
  return false;
}

export async function createBlockEvent(params: CreateBlockEventParams): Promise<BlockEventResult> {
  const { adapter, calendarId, scheduleId, slotStart, slotEnd } = params;
  const fetchSlots = params.fetchSlots ?? fetchAvailableSlots;
  const sleep = params.sleep ?? defaultSleep;
  const createTimeoutSignal =
    params.createTimeoutSignal ?? (() => AbortSignal.timeout(CREATE_TIMEOUT_MS));

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      const event = await adapter.createEvent(
        calendarId,
        {
          title: '予定あり',
          start: slotStart,
          end: slotEnd,
          isAllDay: false,
          transparency: 'opaque',
        },
        { signal: createTimeoutSignal() },
      );
      return await verifySlotGone(
        event.originalId,
        scheduleId,
        slotStart,
        slotEnd,
        fetchSlots,
        sleep,
      );
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt === MAX_TRANSIENT_RETRIES) {
        break;
      }
      await sleep(TRANSIENT_RETRY_DELAY_MS);
    }
  }
  return {
    status: 'failed',
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

async function verifySlotGone(
  eventId: string,
  scheduleId: string,
  slotStart: Date,
  slotEnd: Date,
  fetchSlots: (scheduleId: string, startUnix: number, endUnix: number) => Promise<GoogleSlot[]>,
  sleep: (ms: number) => Promise<void>,
): Promise<BlockEventResult> {
  const startUnix = Math.floor(slotStart.getTime() / 1000);
  const endUnix = Math.floor(slotEnd.getTime() / 1000) + 60; // 境界に含める (public-booking-mirror.ts と同じ考え方)

  for (const delay of VERIFY_RETRY_DELAYS_MS) {
    await sleep(delay);
    try {
      const slots = await fetchSlots(scheduleId, startUnix, endUnix);
      const stillOpen = slots.some((s) => s.startUnix === startUnix);
      if (!stillOpen) {
        return { status: 'created', eventId };
      }
    } catch {
      // 検証 API 自体の失敗は unverified 扱いにする (event 作成は成功しているため failed にはしない)
    }
  }
  return { status: 'created_unverified', eventId };
}
