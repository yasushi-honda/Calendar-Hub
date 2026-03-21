import type { CalendarEvent } from '@calendar-hub/shared';
import type { Calendar, CalendarAdapter, CreateEventInput, UpdateEventInput } from '../types.js';

const BASE_URL = 'https://timetreeapp.com';

interface TimeTreeSession {
  sessionId: string;
}

interface TimeTreeRawEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  start_timezone: string;
  end_timezone: string;
  note: string;
  location: string;
  location_lat: string;
  location_lon: string;
  category: string;
  calendar_id: string;
  updated_at: string;
  created_at: string;
}

interface TimeTreeRawCalendar {
  id: string;
  name: string;
  color: string;
  description: string;
  image_url: string;
}

/**
 * TimeTree WebアプリのintAPIを使ったCalendarAdapter
 *
 * 注意: 非公式APIを使用。TimeTreeのWebアプリ更新により動作しなくなる可能性あり。
 * 認証: email/passwordでログイン → session cookie取得
 */
export class TimeTreeAdapter implements CalendarAdapter {
  readonly provider = 'timetree' as const;
  private sessionId: string;
  private headers: Record<string, string>;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: `_session_id=${sessionId}`,
      'User-Agent': 'CalendarHub/1.0',
    };
  }

  /**
   * email/passwordでTimeTreeにログインし、session_idを取得
   */
  static async login(email: string, password: string): Promise<TimeTreeSession> {
    const uuid = crypto.randomUUID();
    const res = await fetch(`${BASE_URL}/api/v1/auth/email/signin`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'CalendarHub/1.0',
      },
      body: JSON.stringify({ email, password, uuid }),
      redirect: 'manual',
    });

    if (!res.ok && res.status !== 302) {
      throw new Error(`TimeTree login failed: ${res.status}`);
    }

    const cookies = res.headers.getSetCookie?.() ?? [];
    const sessionCookie = cookies.find((c) => c.startsWith('_session_id='));
    if (!sessionCookie) {
      throw new Error('TimeTree login failed: no session cookie');
    }

    const sessionId = sessionCookie.split('=')[1].split(';')[0];
    return { sessionId };
  }

  async listCalendars(): Promise<Calendar[]> {
    const res = await fetch(`${BASE_URL}/api/v1/calendars?since=0`, {
      headers: this.headers,
    });

    if (!res.ok) throw new Error(`TimeTree listCalendars failed: ${res.status}`);

    const data = (await res.json()) as { calendars: TimeTreeRawCalendar[] };
    return data.calendars.map((cal) => ({
      id: cal.id,
      name: cal.name,
      description: cal.description || undefined,
      color: cal.color || undefined,
      provider: 'timetree',
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
        const start = new Date(ev.start_at);
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
          start_at: event.start.toISOString(),
          end_at: event.end.toISOString(),
          start_timezone: event.timeZone ?? 'Asia/Tokyo',
          end_timezone: event.timeZone ?? 'Asia/Tokyo',
          location: event.location ?? '',
          category: 'schedule',
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
    if (event.start !== undefined) body.start_at = event.start.toISOString();
    if (event.end !== undefined) body.end_at = event.end.toISOString();
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
