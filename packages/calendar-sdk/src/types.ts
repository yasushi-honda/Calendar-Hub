import type { CalendarProvider } from '@calendar-hub/shared';

export interface Calendar {
  id: string;
  name: string;
  description?: string;
  color?: string;
  provider: CalendarProvider;
  accountId: string;
  primary?: boolean;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  isAllDay?: boolean;
  location?: string;
  timeZone?: string;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  isAllDay?: boolean;
  location?: string;
  timeZone?: string;
}

export interface CalendarAdapter {
  readonly provider: CalendarProvider;

  listCalendars(): Promise<Calendar[]>;

  listEvents(
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<import('@calendar-hub/shared').CalendarEvent[]>;

  createEvent(
    calendarId: string,
    event: CreateEventInput,
  ): Promise<import('@calendar-hub/shared').CalendarEvent>;

  updateEvent(
    calendarId: string,
    eventId: string,
    event: UpdateEventInput,
  ): Promise<import('@calendar-hub/shared').CalendarEvent>;

  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
