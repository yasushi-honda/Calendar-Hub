import type { CalendarEvent } from '@calendar-hub/shared';
import type { Calendar, CalendarAdapter, CreateEventInput, UpdateEventInput } from '../types.js';

const BASE_URL = 'https://timetreeapp.com';
const APP_HEADER = 'web/2.1.0/ja';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

interface TimeTreeSession {
  sessionId: string;
  csrfToken: string;
}

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
  private headers: Record<string, string>;

  constructor(session: TimeTreeSession) {
    this.sessionId = session.sessionId;
    this.csrfToken = session.csrfToken;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: `_session_id=${session.sessionId}`,
      'User-Agent': BROWSER_UA,
      'X-TimeTreeA': APP_HEADER,
      'X-CSRF-Token': session.csrfToken,
    };
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
    return { sessionId, csrfToken };
  }

  async listCalendars(): Promise<Calendar[]> {
    const res = await fetch(`${BASE_URL}/api/v2/calendars`, {
      headers: this.headers,
    });

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
      const res = await fetch(url, { headers: this.headers });
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

    return allEvents
      .filter((ev) => {
        const start = new Date(ev.start_at); // ms timestamp → Date
        const end = new Date(ev.end_at);
        return start < timeMax && end > timeMin;
      })
      .map((ev) => this.toCalendarEvent(ev, calendarId));
  }

  async createEvent(calendarId: string, event: CreateEventInput): Promise<CalendarEvent> {
    const res = await fetch(`${BASE_URL}/api/v1/calendar/${calendarId}/events`, {
      method: 'POST',
      headers: this.headers,
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

    const res = await fetch(`${BASE_URL}/api/v1/calendar/${calendarId}/events/${eventId}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ event: body }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TimeTree updateEvent failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { event: TimeTreeRawEvent };
    return this.toCalendarEvent(data.event, calendarId);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/v1/calendar/${calendarId}/events/${eventId}`, {
      method: 'DELETE',
      headers: this.headers,
    });

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
