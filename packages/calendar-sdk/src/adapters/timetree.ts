import type { CalendarEvent } from '@calendar-hub/shared';
import type { Calendar, CalendarAdapter, CreateEventInput, UpdateEventInput } from '../types.js';
import { expandRecurringEvent, instanceDateSuffix } from './timetree-recurrence.js';

const BASE_URL = 'https://timetreeapp.com';
const APP_HEADER = 'web/2.1.0/ja';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export interface TimeTreeSession {
  sessionId: string;
  csrfToken: string;
  expiresAt?: number; // Unix timestamp ms
}

/** Session期限切れ時に再ログインするためのコールバック */
export type TimeTreeReLoginFn = () => Promise<TimeTreeSession>;

interface TimeTreeRawEvent {
  id: string;
  title: string;
  start_at: number; // Unix timestamp in milliseconds
  end_at: number; // Unix timestamp in milliseconds
  all_day: boolean;
  start_timezone: string;
  end_timezone: string;
  note: string;
  location: string;
  location_lat: string;
  location_lon: string;
  category: string;
  calendar_id: string;
  updated_at: number;
  created_at: number;
  recurrences: string[]; // RRULE/EXDATE strings (e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE:20220503T070000Z"])
}

interface TimeTreeV2Calendar {
  id: number;
  alias_code: string;
  name: string;
  author_id: number;
  badge: string;
  purpose: string;
  order: number;
  deactivated_at: string | null;
  updated_at: number;
  created_at: number;
}

/**
 * TimeTree WebアプリのintAPIを使ったCalendarAdapter
 *
 * 注意: 非公式APIを使用。TimeTreeのWebアプリ更新により動作しなくなる可能性あり。
 * 認証: /signin からCSRFトークン取得 → email/passwordログイン → session cookie + CSRFトークンで認証
 */
export class TimeTreeAdapter implements CalendarAdapter {
  readonly provider = 'timetree' as const;
  private sessionId: string;
  private csrfToken: string;
  private expiresAt: number;
  private headers: Record<string, string>;
  private reLoginFn?: TimeTreeReLoginFn;

  constructor(session: TimeTreeSession, reLoginFn?: TimeTreeReLoginFn) {
    this.sessionId = session.sessionId;
    this.csrfToken = session.csrfToken;
    this.expiresAt = session.expiresAt ?? Date.now() + 14 * 24 * 60 * 60 * 1000; // default 14 days
    this.reLoginFn = reLoginFn;
    this.headers = this.buildHeaders(session);
  }

  private buildHeaders(session: TimeTreeSession): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: `_session_id=${session.sessionId}`,
      'User-Agent': BROWSER_UA,
      'X-TimeTreeA': APP_HEADER,
      'X-CSRF-Token': session.csrfToken,
    };
  }

  /**
   * 認証エラー時に1回だけ再ログインを試みるfetchラッパー
   */
  private async fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    // session期限切れチェック
    if (Date.now() > this.expiresAt) {
      console.warn(
        `[TT-SESSION-EXPIRED] reason=expiresAt url=${url} expiresAt=${new Date(this.expiresAt).toISOString()} reLoginAvailable=${Boolean(this.reLoginFn)}`,
      );
      if (this.reLoginFn) {
        await this.refreshSession();
      }
    }

    const res = await fetch(url, { ...init, headers: { ...this.headers, ...init?.headers } });

    // 401/403で再ログイン試行（1回のみ）
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      console.warn(
        `[TT-SESSION-EXPIRED] reason=httpStatus url=${url} status=${res.status} reLoginAvailable=${Boolean(this.reLoginFn)}`,
      );
      if (this.reLoginFn) {
        await this.refreshSession();
        return fetch(url, { ...init, headers: { ...this.headers, ...init?.headers } });
      }
    }

    return res;
  }

  private async refreshSession(): Promise<void> {
    if (!this.reLoginFn)
      throw new Error('TimeTree session expired and no re-login function provided');
    console.info('[TT-SESSION-RELOGIN-ATTEMPT]');
    try {
      const newSession = await this.reLoginFn();
      this.sessionId = newSession.sessionId;
      this.csrfToken = newSession.csrfToken;
      this.expiresAt = newSession.expiresAt ?? Date.now() + 14 * 24 * 60 * 60 * 1000;
      this.headers = this.buildHeaders(newSession);
      console.info(`[TT-SESSION-RELOGIN-OK] expiresAt=${new Date(this.expiresAt).toISOString()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[TT-SESSION-RELOGIN-FAIL] error=${msg}`);
      throw err;
    }
  }

  /**
   * email/passwordでTimeTreeにログインし、session_id + csrfTokenを取得
   *
   * 手順:
   * 1. /signin ページからCSRFトークンを取得
   * 2. CSRFトークン付きでログインAPI呼び出し
   * 3. レスポンスからsession cookieを取得
   */
  static async login(email: string, password: string): Promise<TimeTreeSession> {
    // Step 1: CSRFトークン取得
    const signinRes = await fetch(`${BASE_URL}/signin`, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!signinRes.ok) {
      throw new Error(`TimeTree signin page failed: ${signinRes.status}`);
    }
    const html = await signinRes.text();
    const csrfMatch = html.match(/csrf-token['"]\s+content=['"](.*?)['"]/);
    if (!csrfMatch) {
      throw new Error('TimeTree login failed: CSRF token not found');
    }
    const csrfToken = csrfMatch[1];

    // signinページのsession cookieを取得
    const signinCookies = signinRes.headers.getSetCookie?.() ?? [];
    const initialSession = signinCookies.find((c) => c.startsWith('_session_id='));
    const initialSessionId = initialSession ? initialSession.split('=')[1].split(';')[0] : '';

    // Step 2: ログインAPI呼び出し
    const uuid = crypto.randomUUID();
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/email/signin`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': BROWSER_UA,
        'X-TimeTreeA': APP_HEADER,
        'X-CSRF-Token': csrfToken,
        Cookie: initialSessionId ? `_session_id=${initialSessionId}` : '',
      },
      body: JSON.stringify({ uid: email, password, uuid }),
      redirect: 'manual',
    });

    if (!loginRes.ok && loginRes.status !== 302) {
      throw new Error(`TimeTree login failed: ${loginRes.status}`);
    }

    // Step 3: session cookie取得
    const cookies = loginRes.headers.getSetCookie?.() ?? [];
    const sessionCookie = cookies.find((c) => c.startsWith('_session_id='));
    if (!sessionCookie) {
      throw new Error('TimeTree login failed: no session cookie');
    }

    const sessionId = sessionCookie.split('=')[1].split(';')[0];

    // expires= からsession有効期限を取得
    const expiresMatch = sessionCookie.match(/expires=([^;]+)/i);
    const expiresAt = expiresMatch ? new Date(expiresMatch[1]).getTime() : undefined;

    return { sessionId, csrfToken, expiresAt };
  }

  async listCalendars(): Promise<Calendar[]> {
    const res = await this.fetchWithRetry(`${BASE_URL}/api/v2/calendars`);

    if (!res.ok) throw new Error(`TimeTree listCalendars failed: ${res.status}`);

    const data = (await res.json()) as { calendars: TimeTreeV2Calendar[] };
    return data.calendars
      .filter((cal) => cal.deactivated_at === null)
      .map((cal) => ({
        id: String(cal.id),
        name: cal.name,
        description: cal.purpose || undefined,
        provider: 'timetree' as const,
        accountId: '',
      }));
  }

  async listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
    const allEvents: TimeTreeRawEvent[] = [];
    let url = `${BASE_URL}/api/v1/calendar/${calendarId}/events/sync`;
    let hasMore = true;

    while (hasMore) {
      const res = await this.fetchWithRetry(url);
      if (!res.ok) throw new Error(`TimeTree listEvents failed: ${res.status}`);

      const data = (await res.json()) as {
        events: TimeTreeRawEvent[];
        chunk?: boolean;
        since?: string;
      };

      allEvents.push(...data.events);

      if (data.chunk && data.since) {
        url = `${BASE_URL}/api/v1/calendar/${calendarId}/events/sync?since=${data.since}`;
      } else {
        hasMore = false;
      }
    }

    const result: CalendarEvent[] = [];

    for (const ev of allEvents) {
      const recurrences = ev.recurrences ?? [];
      const hasRecurrence = recurrences.some((r) => r.startsWith('RRULE:'));

      if (hasRecurrence) {
        // 繰り返しイベント: RRULE展開してインスタンスを生成
        const masterStart = new Date(ev.start_at);
        const masterEnd = new Date(ev.end_at);
        let instances: { start: Date; end: Date }[];
        try {
          instances = expandRecurringEvent(recurrences, masterStart, masterEnd, timeMin, timeMax);
        } catch (err) {
          // 無効なRRULEや日付のイベントはスキップ。同じ失敗の再発検知のため最小情報を残す
          console.error(
            `[RRULE-SKIP] calendar=${calendarId} event=${ev.id} title="${ev.title}" recurrences=${JSON.stringify(
              recurrences,
            )} err=${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        for (const instance of instances) {
          const suffix = instanceDateSuffix(instance.start, ev.all_day);
          result.push({
            id: `timetree_${ev.id}${suffix}`,
            source: 'timetree',
            originalId: `${ev.id}${suffix}`,
            calendarId,
            title: ev.title || '(無題)',
            description: ev.note || undefined,
            start: instance.start,
            end: instance.end,
            isAllDay: ev.all_day,
            status: 'confirmed',
            location: ev.location || undefined,
          });
        }
      } else {
        // 通常イベント: 時間範囲フィルタ
        const start = new Date(ev.start_at);
        const end = new Date(ev.end_at);
        if (start < timeMax && end > timeMin) {
          result.push(this.toCalendarEvent(ev, calendarId));
        }
      }
    }

    return result;
  }

  async createEvent(calendarId: string, event: CreateEventInput): Promise<CalendarEvent> {
    const res = await this.fetchWithRetry(`${BASE_URL}/api/v1/calendar/${calendarId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        event: {
          title: event.title,
          note: event.description ?? '',
          all_day: event.isAllDay ?? false,
          start_at: event.start.getTime(),
          end_at: event.end.getTime(),
          start_timezone: event.timeZone ?? 'Asia/Tokyo',
          end_timezone: event.timeZone ?? 'Asia/Tokyo',
          location: event.location ?? '',
          category: 1,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`TimeTree createEvent failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { event: TimeTreeRawEvent };
    return this.toCalendarEvent(data.event, calendarId);
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: UpdateEventInput,
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};
    if (event.title !== undefined) body.title = event.title;
    if (event.description !== undefined) body.note = event.description;
    if (event.start !== undefined) body.start_at = event.start.getTime();
    if (event.end !== undefined) body.end_at = event.end.getTime();
    if (event.isAllDay !== undefined) body.all_day = event.isAllDay;
    if (event.location !== undefined) body.location = event.location;

    const res = await this.fetchWithRetry(
      `${BASE_URL}/api/v1/calendar/${calendarId}/events/${eventId}`,
      { method: 'PUT', body: JSON.stringify({ event: body }) },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TimeTree updateEvent failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { event: TimeTreeRawEvent };
    return this.toCalendarEvent(data.event, calendarId);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const res = await this.fetchWithRetry(
      `${BASE_URL}/api/v1/calendar/${calendarId}/events/${eventId}`,
      { method: 'DELETE' },
    );

    if (!res.ok) {
      throw new Error(`TimeTree deleteEvent failed: ${res.status}`);
    }
  }

  private toCalendarEvent(raw: TimeTreeRawEvent, calendarId: string): CalendarEvent {
    return {
      id: `timetree_${raw.id}`,
      source: 'timetree',
      originalId: raw.id,
      calendarId,
      title: raw.title || '(無題)',
      description: raw.note || undefined,
      start: new Date(raw.start_at),
      end: new Date(raw.end_at),
      isAllDay: raw.all_day,
      status: 'confirmed',
      location: raw.location || undefined,
    };
  }
}
