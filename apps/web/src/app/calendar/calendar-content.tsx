'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import type { View } from 'react-big-calendar';
import { useAuth } from '../../components/AuthProvider';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { CalendarView } from '../../components/CalendarView';
import { FreeSlotsPanel } from '../../components/FreeSlotsPanel';
import { AppNav } from '../../components/AppNav';
import type { CalendarEvent } from '@calendar-hub/shared';

export function CalendarContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>('week');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    switch (view) {
      case 'month': {
        const ms = startOfMonth(currentDate);
        const me = endOfMonth(currentDate);
        return {
          rangeStart: startOfWeek(ms, { weekStartsOn: 1 }),
          rangeEnd: endOfWeek(me, { weekStartsOn: 1 }),
        };
      }
      case 'week':
        return {
          rangeStart: startOfWeek(currentDate, { weekStartsOn: 1 }),
          rangeEnd: endOfWeek(currentDate, { weekStartsOn: 1 }),
        };
      case 'day':
        return {
          rangeStart: new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate(),
          ),
          rangeEnd: new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate() + 1,
          ),
        };
      default:
        return { rangeStart: startOfWeek(currentDate), rangeEnd: endOfWeek(currentDate) };
    }
  }, [currentDate, view]);

  const { events, loading: eventsLoading, error } = useCalendarEvents(rangeStart, rangeEnd);

  const handleNavigate = useCallback((date: Date) => setCurrentDate(date), []);
  const handleViewChange = useCallback((newView: View) => setView(newView), []);
  const handleSelectEvent = useCallback((event: CalendarEvent) => setSelectedEvent(event), []);

  if (loading) return <div style={s.loading}>Loading...</div>;
  if (!user) return null;

  return (
    <div style={s.page}>
      <AppNav />
      <main style={s.main}>
        {error && <div style={s.error}>{error}</div>}

        <div style={s.grid}>
          <div style={s.calendarWrap}>
            {eventsLoading && <div style={s.loadingBar}>予定を読み込み中...</div>}
            <CalendarView
              events={events}
              currentDate={currentDate}
              view={view}
              onNavigate={handleNavigate}
              onViewChange={handleViewChange}
              onSelectEvent={handleSelectEvent}
            />
          </div>

          <aside style={s.sidebar}>
            <FreeSlotsPanel events={events} rangeStart={rangeStart} rangeEnd={rangeEnd} />

            {selectedEvent && (
              <div style={s.eventDetail}>
                <div style={s.eventHeader}>
                  <span
                    style={{
                      ...s.sourceBadge,
                      background:
                        selectedEvent.source === 'google'
                          ? 'rgba(66,133,244,0.15)'
                          : 'rgba(76,175,80,0.15)',
                      color: selectedEvent.source === 'google' ? '#6ea8fe' : '#81c784',
                    }}
                  >
                    {selectedEvent.source === 'google' ? 'Google' : 'TimeTree'}
                  </span>
                  <button onClick={() => setSelectedEvent(null)} style={s.closeBtn}>
                    ✕
                  </button>
                </div>
                <h3 style={s.eventTitle}>{selectedEvent.title}</h3>
                {selectedEvent.description && (
                  <p style={s.eventDesc}>{selectedEvent.description}</p>
                )}
                {selectedEvent.location && <p style={s.eventLoc}>{selectedEvent.location}</p>}
              </div>
            )}
          </aside>
        </div>

        <div style={s.legend}>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: '#4285f4' }} /> Google
          </span>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: '#4caf50' }} /> TimeTree
          </span>
        </div>
      </main>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--color-bg)' },
  main: { padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' },
  loading: { padding: '2rem', color: 'var(--color-text-muted)' },
  error: {
    padding: '10px 14px',
    background: 'rgba(229,57,53,0.1)',
    border: '1px solid rgba(229,57,53,0.2)',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#ef9a9a',
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' },
  calendarWrap: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    minHeight: '600px',
  },
  loadingBar: {
    textAlign: 'center',
    padding: '8px',
    color: 'var(--color-text-muted)',
    fontSize: '12px',
  },
  sidebar: { display: 'flex', flexDirection: 'column', gap: '16px' },
  eventDetail: {
    padding: '16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  sourceBadge: { fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: 500 },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  eventTitle: {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '6px',
    color: 'var(--color-text)',
  },
  eventDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: '4px 0',
    lineHeight: 1.5,
  },
  eventLoc: { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' },
  legend: {
    display: 'flex',
    gap: '16px',
    marginTop: '12px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px' },
  legendDot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px' },
};
