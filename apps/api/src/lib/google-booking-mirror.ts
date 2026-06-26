/**
 * Google 予約スケジュール公開ページが内部で叩く gRPC-web API を直接叩く。
 *
 * 経緯: docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md
 *
 * セキュリティ: API Key は env `GOOGLE_BOOKING_MIRROR_API_KEY` から取得。
 *   ログ出力時は値をマスクすること。
 */

const GRPC_ENDPOINT_BASE = 'https://calendar-pa.clients6.google.com/$rpc';
const APPT_SERVICE = 'google.internal.calendar.v1.AppointmentBookingService';
const DEFAULT_TIMEOUT_MS = 8_000;

const SHORT_URL_HOST = 'calendar.app.google';
const FULL_URL_HOST = 'calendar.google.com';

export interface GoogleSlot {
  startUnix: number; // 秒
  durationMinutes: number;
}

export type ParseErrorKind = 'invalid_shape' | 'empty_slots' | 'google_error_payload' | 'non_json';

export class BookingMirrorError extends Error {
  constructor(
    public readonly kind: 'parse' | 'http' | 'timeout' | 'resolve' | 'invalid_input',
    public readonly subKind: ParseErrorKind | string,
    message: string,
  ) {
    super(message);
    this.name = 'BookingMirrorError';
  }
}

function getApiKey(): string {
  const key = process.env.GOOGLE_BOOKING_MIRROR_API_KEY;
  if (!key) {
    throw new BookingMirrorError(
      'invalid_input',
      'missing_api_key',
      'GOOGLE_BOOKING_MIRROR_API_KEY is not configured',
    );
  }
  return key;
}

/**
 * 短縮 URL or 完全 URL から schedule ID を抽出する。
 *
 * - 完全 URL: `https://calendar.google.com/calendar/u/0/appointments/schedules/<id>` から ID を抽出
 * - 短縮 URL: `https://calendar.app.google/<short>` を HEAD/GET fetch してリダイレクト先 URL から抽出
 */
export async function resolveScheduleId(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new BookingMirrorError('invalid_input', 'empty', 'shortUrl is empty');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BookingMirrorError('invalid_input', 'not_url', `not a valid URL: ${trimmed}`);
  }

  if (url.host === FULL_URL_HOST && url.pathname.includes('/appointments/schedules/')) {
    const idx = url.pathname.indexOf('/appointments/schedules/');
    const tail = url.pathname.slice(idx + '/appointments/schedules/'.length);
    const id = tail.split('/')[0];
    if (!id) {
      throw new BookingMirrorError(
        'resolve',
        'no_id_in_path',
        `no schedule id in path: ${url.pathname}`,
      );
    }
    return id;
  }

  if (url.host !== SHORT_URL_HOST) {
    throw new BookingMirrorError(
      'invalid_input',
      'unsupported_host',
      `unsupported host: ${url.host}. expect ${SHORT_URL_HOST} or ${FULL_URL_HOST}`,
    );
  }

  const res = await fetchWithTimeout(trimmed, { method: 'GET', redirect: 'follow' });
  const finalUrl = new URL(res.url);
  if (finalUrl.host !== FULL_URL_HOST || !finalUrl.pathname.includes('/appointments/schedules/')) {
    throw new BookingMirrorError(
      'resolve',
      'unexpected_redirect',
      `short URL did not redirect to expected schedule URL: ${res.url}`,
    );
  }
  const idx = finalUrl.pathname.indexOf('/appointments/schedules/');
  const tail = finalUrl.pathname.slice(idx + '/appointments/schedules/'.length);
  const id = tail.split('/')[0];
  if (!id) {
    throw new BookingMirrorError(
      'resolve',
      'no_id_after_redirect',
      `no schedule id after redirect: ${res.url}`,
    );
  }
  return id;
}

/**
 * gRPC-web 経由で空き枠を取得する。
 *
 * @param scheduleId 完全 schedule ID
 * @param startUnix 取得範囲開始 (Unix 秒)
 * @param endUnix 取得範囲終了 (Unix 秒)
 */
export async function fetchAvailableSlots(
  scheduleId: string,
  startUnix: number,
  endUnix: number,
): Promise<GoogleSlot[]> {
  const key = getApiKey();
  const url = `${GRPC_ENDPOINT_BASE}/${APPT_SERVICE}/ListAvailableSlots?key=${encodeURIComponent(key)}`;
  const body = JSON.stringify([null, null, scheduleId, null, [[startUnix], [endUnix]]]);

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'X-User-Agent': 'grpc-web-javascript/0.1',
      'X-Goog-AuthUser': '0',
      Origin: 'https://calendar.google.com',
      Referer: 'https://calendar.google.com/',
    },
    body,
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // non-JSON error body は無視
    }
    throw new BookingMirrorError(
      'http',
      `status_${res.status}`,
      `gRPC-web ListAvailableSlots failed: ${res.status} ${JSON.stringify(payload)}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new BookingMirrorError('parse', 'non_json', 'response is not JSON');
  }

  return parseSlotResponse(data);
}

/**
 * gRPC-web レスポンス body を GoogleSlot[] に変換する。
 *
 * 期待形式: `[[ [[<unix-string>], <duration-min>], ... ]]`
 */
export function parseSlotResponse(data: unknown): GoogleSlot[] {
  // エラーペイロード形式の検出
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'error' in (data as Record<string, unknown>)
  ) {
    throw new BookingMirrorError('parse', 'google_error_payload', JSON.stringify(data));
  }
  if (!Array.isArray(data)) {
    throw new BookingMirrorError('parse', 'invalid_shape', `top-level is not array`);
  }
  const outer = data[0];
  if (outer === null || outer === undefined) {
    // 空の予約枠 (営業時間外、全予定埋まり) は valid な空配列扱い
    return [];
  }
  if (!Array.isArray(outer)) {
    throw new BookingMirrorError('parse', 'invalid_shape', `data[0] is not array`);
  }

  const slots: GoogleSlot[] = [];
  for (const slotWrap of outer) {
    if (!Array.isArray(slotWrap) || slotWrap.length === 0) continue;
    const inner = slotWrap[0];
    if (!Array.isArray(inner) || inner.length < 2) continue;
    const tsWrap = inner[0];
    const duration = inner[1];
    if (!Array.isArray(tsWrap) || tsWrap.length === 0) continue;
    const tsStr = tsWrap[0];
    if (typeof tsStr !== 'string') continue;
    if (typeof duration !== 'number') continue;
    const startUnix = parseInt(tsStr, 10);
    if (!Number.isFinite(startUnix)) continue;
    slots.push({ startUnix, durationMinutes: duration });
  }
  return slots;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  // Node.js 18+ / undici は AbortSignal.timeout をサポート
  const signal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new BookingMirrorError('timeout', 'fetch_timeout', `request timed out: ${input}`);
    }
    throw err;
  }
}
