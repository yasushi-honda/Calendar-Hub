import { google, type calendar_v3 } from 'googleapis';
import type { CalendarEvent } from '@calendar-hub/shared';
import type { Calendar, CalendarAdapter, CreateEventInput, UpdateEventInput } from '../types.js';

export class GoogleCalendarAdapter implements CalendarAdapter {
  readonly provider = 'google' as const;
  private calendar: calendar_v3.Calendar;

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async listCalendars(): Promise<Calendar[]> {
    const res = await this.calendar.calendarList.list();
    return (res.data.items ?? []).map((item) => ({
      id: item.id!,
      name: item.summary ?? '',
      description: item.description ?? undefined,
      color: item.backgroundColor ?? undefined,
      provider: 'google',
      accountId: '',
      primary: item.primary ?? false,
    }));
  }

  async listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
    const res = await this.calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    return (res.data.items ?? []).map((item) => this.toCalendarEvent(item, calendarId));
  }

  async createEvent(calendarId: string, event: CreateEventInput): Promise<CalendarEvent> {
    const res = await this.calendar.events.insert({
      calendarId,
      requestBody: this.toGoogleEvent(event),
    });
    return this.toCalendarEvent(res.data, calendarId);
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: UpdateEventInput,
  ): Promise<CalendarEvent> {
    const res = await this.calendar.events.patch({
      calendarId,
      eventId,
      requestBody: this.toGoogleEvent(event),
    });
    return this.toCalendarEvent(res.data, calendarId);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.calendar.events.delete({ calendarId, eventId });
  }

  private toCalendarEvent(item: calendar_v3.Schema$Event, calendarId: string): CalendarEvent {
    const isAllDay = !item.start?.dateTime;
    const startStr = isAllDay ? (item.start?.date ?? '') : (item.start?.dateTime ?? '');
    const endStr = isAllDay ? (item.end?.date ?? '') : (item.end?.dateTime ?? '');
    const start = isAllDay ? new Date(startStr + 'T00:00:00') : new Date(startStr);
    const end = isAllDay ? new Date(endStr + 'T00:00:00') : new Date(endStr);

    return {
      id: `google_${item.id}`,
      source: 'google',
      originalId: item.id!,
      calendarId,
      title: item.summary ?? '(無題)',
      description: item.description ?? undefined,
      start,
      end,
      isAllDay,
      status: item.status === 'cancelled' ? 'cancelled' : 'confirmed',
      location: item.location ?? undefined,
    };
  }

  private toGoogleEvent(event: CreateEventInput | UpdateEventInput): calendar_v3.Schema$Event {
    const body: calendar_v3.Schema$Event = {};
    if (event.title !== undefined) body.summary = event.title;
    if (event.description !== undefined) body.description = event.description;
    if (event.location !== undefined) body.location = event.location;

    const tz = (event as CreateEventInput).timeZone ?? 'Asia/Tokyo';

    if (event.start && event.end) {
      if ((event as CreateEventInput).isAllDay) {
        body.start = { date: toDateString(event.start) };
        body.end = { date: toDateString(event.end) };
      } else {
        body.start = { dateTime: event.start.toISOString(), timeZone: tz };
        body.end = { dateTime: event.end.toISOString(), timeZone: tz };
      }
    }

    return body;
  }
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}
