'use client';

import { useMemo } from 'react';
import type { CalendarEvent } from '@calendar-hub/shared';
import { calculateFreeSlots, type FreeSlot } from '@calendar-hub/shared/free-time';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface FreeSlotsPanelProps {
  events: CalendarEvent[];
  rangeStart: Date;
  rangeEnd: Date;
}

export function FreeSlotsPanel({ events, rangeStart, rangeEnd }: FreeSlotsPanelProps) {
  const freeSlots = useMemo(
    () => calculateFreeSlots(events, rangeStart, rangeEnd),
    [events, rangeStart, rangeEnd],
  );

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, FreeSlot[]>();
    for (const slot of freeSlots) {
      const key = format(slot.start, 'yyyy-MM-dd');
      const existing = groups.get(key) ?? [];
      existing.push(slot);
      groups.set(key, existing);
    }
    return groups;
  }, [freeSlots]);

  const totalFreeMinutes = useMemo(
    () => freeSlots.reduce((sum, s) => sum + s.durationMinutes, 0),
    [freeSlots],
  );

  return (
    <div style={s.panel}>
      <h3 style={s.title}>
        空き時間
        <span style={s.total}>
          合計 {Math.floor(totalFreeMinutes / 60)}h {totalFreeMinutes % 60}m
        </span>
      </h3>

      {freeSlots.length === 0 ? (
        <p style={s.empty}>空き時間がありません</p>
      ) : (
        <div style={s.scrollArea}>
          {Array.from(groupedSlots.entries()).map(([dateKey, slots]) => (
            <div key={dateKey} style={s.dateGroup}>
              <div style={s.dateLabel}>{format(new Date(dateKey), 'M/d (E)', { locale: ja })}</div>
              {slots.map((slot, i) => (
                <div key={i} style={s.slotItem}>
                  {format(slot.start, 'HH:mm')} - {format(slot.end, 'HH:mm')}
                  <span style={s.duration}>({slot.durationMinutes}分)</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    padding: '16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
  },
  title: { marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' },
  total: { fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '8px', fontSize: '12px' },
  empty: { color: 'var(--color-text-muted)', fontSize: '13px' },
  scrollArea: { maxHeight: '400px', overflowY: 'auto' },
  dateGroup: { marginBottom: '14px' },
  dateLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
  },
  slotItem: {
    padding: '6px 10px',
    marginBottom: '4px',
    background: 'rgba(224,120,80,0.06)',
    borderRadius: '6px',
    fontSize: '13px',
    borderLeft: '3px solid var(--color-accent)',
    color: 'var(--color-text)',
  },
  duration: { color: 'var(--color-text-muted)', marginLeft: '8px', fontSize: '12px' },
};
