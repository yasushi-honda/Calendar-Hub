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

export interface EventExtendedProperties {
  private?: Record<string, string>;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  isAllDay?: boolean;
  location?: string;
  timeZone?: string;
  extendedProperties?: EventExtendedProperties;
  /** 'opaque' = Busy (予定あり) / 'transparent' = Free (予定なし)。省略時は Google 側の既定 (opaque) */
  transparency?: 'opaque' | 'transparent';
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  isAllDay?: boolean;
  location?: string;
  timeZone?: string;
  extendedProperties?: EventExtendedProperties;
  transparency?: 'opaque' | 'transparent';
}

export interface CreateEventOptions {
  /** 中断すると実際に下層の HTTP リクエストを abort する (google-booking-mirror.ts の fetchWithTimeout と同じ方針) */
  signal?: AbortSignal;
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
    options?: CreateEventOptions,
  ): Promise<import('@calendar-hub/shared').CalendarEvent>;

  updateEvent(
    calendarId: string,
    eventId: string,
    event: UpdateEventInput,
  ): Promise<import('@calendar-hub/shared').CalendarEvent>;

  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
