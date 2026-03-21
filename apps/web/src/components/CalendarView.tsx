'use client';

import { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { CalendarEvent } from '@calendar-hub/shared';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = { ja };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

interface CalendarViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  view: View;
  onNavigate: (date: Date) => void;
  onViewChange: (view: View) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
}

interface BigCalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarEvent;
}

const SOURCE_COLORS: Record<string, string> = {
  google: '#4285f4',
  timetree: '#4caf50',
};

export function CalendarView({
  events,
  currentDate,
  view,
  onNavigate,
  onViewChange,
  onSelectEvent,
}: CalendarViewProps) {
  const bigCalEvents: BigCalEvent[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start instanceof Date ? e.start : new Date(e.start),
        end: e.end instanceof Date ? e.end : new Date(e.end),
        allDay: e.isAllDay,
        resource: e,
      })),
    [events],
  );

  const eventStyleGetter = useCallback((event: BigCalEvent) => {
    const color = SOURCE_COLORS[event.resource.source] ?? '#666';
    return {
      style: {
        backgroundColor: color,
        borderRadius: '4px',
        border: 'none',
        color: '#fff',
        fontSize: '12px',
      },
    };
  }, []);

  const handleSelectEvent = useCallback(
    (event: BigCalEvent) => {
      onSelectEvent?.(event.resource);
    },
    [onSelectEvent],
  );

  return (
    <div style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
      <Calendar<BigCalEvent>
        localizer={localizer}
        events={bigCalEvents}
        date={currentDate}
        view={view}
        onNavigate={onNavigate}
        onView={onViewChange}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventStyleGetter}
        views={['month', 'week', 'day']}
        messages={{
          today: '今日',
          previous: '前',
          next: '次',
          month: '月',
          week: '週',
          day: '日',
          noEventsInRange: '予定はありません',
        }}
        culture="ja"
        step={30}
        timeslots={2}
      />
    </div>
  );
}
