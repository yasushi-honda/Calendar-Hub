import { describe, it, expect, vi } from 'vitest';
import { buildSyncActions, executeSyncActions } from '../lib/timetree-google-sync.js';
import type { CalendarEvent } from '@calendar-hub/shared';
import type { CalendarAdapter } from '@calendar-hub/calendar-sdk';

describe('Sync Logic', () => {
  // ダミーイベント生成ヘルパー
  const createEvent = (overrides?: Partial<CalendarEvent>): CalendarEvent => ({
    id: 'event-1',
    source: 'google' as const,
    originalId: 'original-1',
    calendarId: 'cal-1',
    title: 'Meeting',
    start: new Date('2026-03-24T09:00:00Z'),
    end: new Date('2026-03-24T10:00:00Z'),
    isAllDay: false,
    status: 'confirmed' as const,
    ...overrides,
  });

  describe('buildSyncActions', () => {
    it('should detect new events (not in Google)', () => {
      const ttEvent = createEvent({ originalId: 'tt-1', title: 'TimeTree Event' });
      const ggEvents: CalendarEvent[] = [];
      const taggedGoogleIds = new Set<string>();

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [ttEvent],
        ggEvents,
        taggedGoogleIds,
      );

      expect(toCreate).toHaveLength(1);
      expect(toCreate[0]?.title).toBe('TimeTree Event');
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(0);
    });

    it('should detect updated events (title differs)', () => {
      const ttEvent = createEvent({ title: 'Updated Title', originalId: 'tt-1' });
      const ggEvent = createEvent({ title: 'Old Title', id: 'gg-1' });
      const taggedGoogleIds = new Set<string>(['gg-1']);

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [ttEvent],
        [ggEvent],
        taggedGoogleIds,
      );

      expect(toCreate).toHaveLength(1);
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(1);
    });

    it('should detect matching events (same title and time)', () => {
      const ttEvent = createEvent({
        title: 'Meeting',
        originalId: 'tt-1',
        start: new Date('2026-03-24T09:00:00Z'),
        end: new Date('2026-03-24T10:00:00Z'),
      });
      const ggEvent = createEvent({
        title: 'Meeting',
        id: 'gg-1',
        start: new Date('2026-03-24T09:00:00Z'),
        end: new Date('2026-03-24T10:00:00Z'),
      });
      const taggedGoogleIds = new Set<string>(['gg-1']);

      const { toCreate, toDelete } = buildSyncActions([ttEvent], [ggEvent], taggedGoogleIds);

      expect(toCreate).toHaveLength(0);
      expect(toDelete).toHaveLength(0);
    });

    it('should detect deleted events (in Google but not TimeTree)', () => {
      const ttEvents: CalendarEvent[] = [];
      const ggEvent = createEvent({ title: 'Obsolete Event', id: 'gg-1' });
      const taggedGoogleIds = new Set<string>(['gg-1']);

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        ttEvents,
        [ggEvent],
        taggedGoogleIds,
      );

      expect(toCreate).toHaveLength(0);
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0]?.title).toBe('Obsolete Event');
    });

    it('should ignore untagged Google events', () => {
      const ttEvents: CalendarEvent[] = [];
      const ggEvent = createEvent({ title: 'Untagged Event', id: 'gg-1' });
      const taggedGoogleIds = new Set<string>();

      const { toDelete } = buildSyncActions(ttEvents, [ggEvent], taggedGoogleIds);

      expect(toDelete).toHaveLength(0);
    });

    it('should handle multiple events correctly', () => {
      const ttEvents = [
        createEvent({ title: 'Meeting 1', originalId: 'tt-1' }),
        createEvent({ title: 'Meeting 2', originalId: 'tt-2' }),
        createEvent({
          title: 'Meeting 3',
          originalId: 'tt-3',
          start: new Date('2026-03-24T11:00:00Z'),
          end: new Date('2026-03-24T12:00:00Z'),
        }),
      ];

      const ggEvents = [
        createEvent({ title: 'Meeting 1', id: 'gg-1' }),
        createEvent({ title: 'Meeting 2', id: 'gg-2', description: 'Old description' }),
        createEvent({ title: 'Old Meeting', id: 'gg-3' }),
      ];

      const taggedGoogleIds = new Set(['gg-1', 'gg-2', 'gg-3']);

      const { toCreate, toDelete } = buildSyncActions(ttEvents, ggEvents, taggedGoogleIds);

      expect(toCreate).toHaveLength(1);
      expect(toCreate[0]?.title).toBe('Meeting 3');
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0]?.title).toBe('Old Meeting');
    });
  });

  describe('executeSyncActions', () => {
    it('should handle create action success', async () => {
      const mockAdapter = {
        createEvent: vi.fn().mockResolvedValue({ id: 'new-gg-1' }),
        updateEvent: vi.fn(),
        deleteEvent: vi.fn(),
      } as unknown as CalendarAdapter;

      const actions = {
        toCreate: [
          {
            type: 'create' as const,
            title: 'New Event',
            timetreeId: 'tt-1',
            startTime: new Date('2026-03-24T09:00:00Z'),
            endTime: new Date('2026-03-24T10:00:00Z'),
          },
        ],
        toUpdate: [],
        toDelete: [],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.created).toBe(1);
      expect(stats.updated).toBe(0);
      expect(stats.deleted).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(mockAdapter.createEvent).toHaveBeenCalled();
    });

    it('should increment skipped on create failure', async () => {
      const mockAdapter = {
        createEvent: vi.fn().mockRejectedValue(new Error('API error')),
        updateEvent: vi.fn(),
        deleteEvent: vi.fn(),
      } as unknown as CalendarAdapter;

      const actions = {
        toCreate: [
          {
            type: 'create' as const,
            title: 'Failed Event',
            timetreeId: 'tt-1',
            startTime: new Date(),
            endTime: new Date(),
          },
        ],
        toUpdate: [],
        toDelete: [],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.created).toBe(0);
      expect(stats.skipped).toBe(1);
    });

    it('should handle update action', async () => {
      const mockAdapter = {
        createEvent: vi.fn(),
        updateEvent: vi.fn().mockResolvedValue({ id: 'gg-1' }),
        deleteEvent: vi.fn(),
      } as unknown as CalendarAdapter;

      const actions = {
        toCreate: [],
        toUpdate: [
          {
            type: 'update' as const,
            eventId: 'gg-1',
            title: 'Updated Event',
            timetreeId: 'tt-1',
            startTime: new Date('2026-03-24T10:00:00Z'),
            endTime: new Date('2026-03-24T11:00:00Z'),
          },
        ],
        toDelete: [],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.updated).toBe(1);
      expect(mockAdapter.updateEvent).toHaveBeenCalledWith(
        'cal-1',
        'gg-1',
        expect.objectContaining({ title: 'Updated Event' }),
      );
    });

    it('should handle delete action', async () => {
      const mockAdapter = {
        createEvent: vi.fn(),
        updateEvent: vi.fn(),
        deleteEvent: vi.fn().mockResolvedValue(undefined),
      } as unknown as CalendarAdapter;

      const actions = {
        toCreate: [],
        toUpdate: [],
        toDelete: [
          {
            type: 'delete' as const,
            eventId: 'gg-1',
            title: 'Deleted Event',
            timetreeId: 'tt-1',
            startTime: new Date(),
            endTime: new Date(),
          },
        ],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.deleted).toBe(1);
      expect(mockAdapter.deleteEvent).toHaveBeenCalledWith('cal-1', 'gg-1');
    });

    it('should skip action if eventId is missing', async () => {
      const mockAdapter = {
        createEvent: vi.fn(),
        updateEvent: vi.fn(),
        deleteEvent: vi.fn(),
      } as unknown as CalendarAdapter;

      const actions = {
        toCreate: [],
        toUpdate: [
          {
            type: 'update' as const,
            title: 'No ID Event',
            timetreeId: 'tt-1',
            startTime: new Date(),
            endTime: new Date(),
          },
        ],
        toDelete: [],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.skipped).toBe(1);
      expect(mockAdapter.updateEvent).not.toHaveBeenCalled();
    });
  });
});
