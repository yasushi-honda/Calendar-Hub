import { nanoid } from 'nanoid';
import type { CalendarAdapter, Calendar } from '@calendar-hub/calendar-sdk';
import type { CalendarEvent } from '@calendar-hub/shared';

/**
 * E2E テスト用の in-memory CalendarAdapter.
 *
 * `E2E_CALENDAR_MOCK=1` のときに `adapter-factory` から返される。
 * - listCalendars: 環境変数 `E2E_MOCK_CALENDARS` (JSON 配列) があればそれを返す。なければ単一の "primary" を返す
 * - listEvents: 環境変数 `E2E_MOCK_EVENTS` (JSON 配列) で固定イベントを与えられる。なければ空
 * - createEvent: 受け取った input から id を採番して返す（永続化は呼出元の Firestore 側で行う）
 *
 * E2E 中は OAuth refresh / Google API への接続を一切行わない。
 */
export class MockCalendarAdapter implements CalendarAdapter {
  readonly provider = 'google' as const;

  async listCalendars(): Promise<Calendar[]> {
    const raw = process.env.E2E_MOCK_CALENDARS;
    if (raw) {
      return JSON.parse(raw) as Calendar[];
    }
    return [
      {
        id: 'primary',
        accountId: 'mock-account',
        name: 'Mock Primary Calendar',
        provider: 'google',
        primary: true,
      },
    ];
  }

  async listEvents(_calendarId: string, _timeMin: Date, _timeMax: Date): Promise<CalendarEvent[]> {
    const raw = process.env.E2E_MOCK_EVENTS;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<
      Omit<CalendarEvent, 'start' | 'end'> & { start: string; end: string }
    >;
    return parsed.map((e) => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end),
    }));
  }

  async createEvent(
    calendarId: string,
    event: { title: string; description?: string; start: Date; end: Date; isAllDay: boolean },
  ): Promise<CalendarEvent> {
    const id = `mock_${nanoid(8)}`;
    return {
      id,
      source: 'google',
      originalId: id,
      calendarId,
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
      status: 'confirmed',
    };
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: { title?: string; description?: string; start?: Date; end?: Date; isAllDay?: boolean },
  ): Promise<CalendarEvent> {
    return {
      id: eventId,
      source: 'google',
      originalId: eventId,
      calendarId,
      title: event.title ?? '',
      description: event.description,
      start: event.start ?? new Date(),
      end: event.end ?? new Date(),
      isAllDay: event.isAllDay ?? false,
      status: 'confirmed',
    };
  }

  async deleteEvent(_calendarId: string, _eventId: string): Promise<void> {
    // no-op
  }
}
