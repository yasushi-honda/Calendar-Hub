'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import type { View } from 'react-big-calendar';
import { useAuth } from '../../components/AuthProvider';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { CalendarView } from '../../components/CalendarView';
import { FreeSlotsPanel } from '../../components/FreeSlotsPanel';
import type { CalendarEvent } from '@calendar-hub/shared';

export function CalendarContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>('week');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // ビューに応じた表示範囲を計算
  const { rangeStart, rangeEnd } = useMemo(() => {
    switch (view) {
      case 'month': {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          rangeStart: startOfWeek(monthStart, { weekStartsOn: 1 }),
          rangeEnd: endOfWeek(monthEnd, { weekStartsOn: 1 }),
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

  const handleNavigate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
  }, []);

  if (loading) return <main style={{ padding: '2rem' }}>Loading...</main>;
  if (!user) return null;

  return (
    <main style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h1 style={{ fontSize: '20px', margin: 0 }}>Calendar Hub</h1>
        <nav style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <a href="/settings" style={{ color: '#666', fontSize: '14px' }}>
            設定
          </a>
          <span style={{ color: '#999', fontSize: '13px' }}>{user.email}</span>
        </nav>
      </header>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: '#fee',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem' }}>
        <div>
          {eventsLoading && (
            <div style={{ textAlign: 'center', padding: '8px', color: '#666', fontSize: '13px' }}>
              予定を読み込み中...
            </div>
          )}
          <CalendarView
            events={events}
            currentDate={currentDate}
            view={view}
            onNavigate={handleNavigate}
            onViewChange={handleViewChange}
            onSelectEvent={handleSelectEvent}
          />
        </div>

        <aside>
          <FreeSlotsPanel events={events} rangeStart={rangeStart} rangeEnd={rangeEnd} />

          {selectedEvent && (
            <div
              style={{
                marginTop: '1rem',
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
              }}
            >
              <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>{selectedEvent.title}</h3>
              <p style={{ fontSize: '12px', color: '#666' }}>
                {selectedEvent.source === 'google' ? 'Google Calendar' : 'TimeTree'}
              </p>
              {selectedEvent.description && (
                <p style={{ fontSize: '12px', color: '#333', marginTop: '4px' }}>
                  {selectedEvent.description}
                </p>
              )}
              {selectedEvent.location && (
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {selectedEvent.location}
                </p>
              )}
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  background: '#fff',
                }}
              >
                閉じる
              </button>
            </div>
          )}
        </aside>
      </div>

      <div
        style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px', color: '#666' }}
      >
        <span>
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              background: '#4285f4',
              marginRight: '4px',
            }}
          />
          Google
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              background: '#4caf50',
              marginRight: '4px',
            }}
          />
          TimeTree
        </span>
      </div>
    </main>
  );
}
