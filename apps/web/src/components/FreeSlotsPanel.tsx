'use client';

import { useMemo } from 'react';
import type { CalendarEvent } from '@calendar-hub/shared';
import { calculateFreeSlots, type FreeSlot } from '@calendar-hub/shared/dist/free-time.js';
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

  // 日付ごとにグループ化
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
    <div style={panelStyle}>
      <h3 style={{ marginBottom: '8px', fontSize: '14px' }}>
        空き時間
        <span style={{ fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
          合計 {Math.floor(totalFreeMinutes / 60)}h {totalFreeMinutes % 60}m
        </span>
      </h3>

      {freeSlots.length === 0 ? (
        <p style={{ color: '#999', fontSize: '13px' }}>空き時間がありません</p>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {Array.from(groupedSlots.entries()).map(([dateKey, slots]) => (
            <div key={dateKey} style={{ marginBottom: '12px' }}>
              <div
                style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}
              >
                {format(new Date(dateKey), 'M/d (E)', { locale: ja })}
              </div>
              {slots.map((slot, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 8px',
                    marginBottom: '4px',
                    background: '#f0f7ff',
                    borderRadius: '4px',
                    fontSize: '13px',
                    borderLeft: '3px solid #4285f4',
                  }}
                >
                  {format(slot.start, 'HH:mm')} - {format(slot.end, 'HH:mm')}
                  <span style={{ color: '#666', marginLeft: '8px' }}>
                    ({slot.durationMinutes}分)
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: '12px',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  background: '#fafafa',
};
