'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CalendarEvent } from '@calendar-hub/shared';
import { apiGet } from '../lib/api';

interface UseCalendarEventsResult {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCalendarEvents(
  timeMin: Date | null,
  timeMax: Date | null,
): UseCalendarEventsResult {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!timeMin || !timeMax) return;

    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<{ events: CalendarEvent[] }>(
        `/api/calendars/events/merged?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`,
      );
      // Date文字列をDateオブジェクトに変換
      const parsed = data.events.map((e) => ({
        ...e,
        start: new Date(e.start),
        end: new Date(e.end),
      }));
      setEvents(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [timeMin, timeMax]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}
