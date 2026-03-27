import { describe, it, expect, vi } from 'vitest';
import { buildSyncActions, executeSyncActions } from '../lib/timetree-google-sync.js';
import type { CalendarEvent } from '@calendar-hub/shared';
import type { CalendarAdapter } from '@calendar-hub/calendar-sdk';

describe('Sync Logic', () => {
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

  describe('buildSyncActions - fallback matching (no tagMap)', () => {
    it('should detect new events (not in Google)', () => {
      const ttEvent = createEvent({ originalId: 'tt-1', title: 'TimeTree Event' });

      const { toCreate, toUpdate, toDelete } = buildSyncActions([ttEvent], [], new Set<string>());

      expect(toCreate).toHaveLength(1);
      expect(toCreate[0]?.title).toBe('TimeTree Event');
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(0);
    });

    it('should generate tag-update for untagged matching events', () => {
      const ttEvent = createEvent({ originalId: 'tt-1' });
      const ggEvent = createEvent({ id: 'gg-1', originalId: 'gg-orig-1' });

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [ttEvent],
        [ggEvent],
        new Set<string>(),
      );

      expect(toCreate).toHaveLength(0);
      expect(toUpdate).toHaveLength(1);
      expect(toUpdate[0]?.timetreeId).toBe('tt-1');
      expect(toDelete).toHaveLength(0);
    });

    it('should detect deleted tagged events (in Google but not TimeTree)', () => {
      const ggEvent = createEvent({ id: 'gg-1', originalId: 'gg-orig-1' });

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [],
        [ggEvent],
        new Set(['gg-orig-1']),
      );

      expect(toCreate).toHaveLength(0);
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0]?.title).toBe('Meeting');
    });

    it('should ignore untagged Google events for deletion', () => {
      const ggEvent = createEvent({ id: 'gg-1' });

      const { toDelete } = buildSyncActions([], [ggEvent], new Set<string>());

      expect(toDelete).toHaveLength(0);
    });
  });

  describe('buildSyncActions - tagMap matching (timetreeId-based)', () => {
    it('should match by timetreeId and skip when no content change', () => {
      const ttEvent = createEvent({ originalId: 'tt-1' });
      const ggEvent = createEvent({ id: 'gg-1', originalId: 'gg-orig-1' });
      const tagMap = new Map([['tt-1', ggEvent]]);

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [ttEvent],
        [ggEvent],
        new Set(['gg-orig-1']),
        tagMap,
      );

      expect(toCreate).toHaveLength(0);
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(0);
    });

    it('should update when title changes (matched by timetreeId)', () => {
      const ttEvent = createEvent({ originalId: 'tt-1', title: 'New Title' });
      const ggEvent = createEvent({ id: 'gg-1', originalId: 'gg-orig-1', title: 'Old Title' });
      const tagMap = new Map([['tt-1', ggEvent]]);

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [ttEvent],
        [ggEvent],
        new Set(['gg-orig-1']),
        tagMap,
      );

      expect(toCreate).toHaveLength(0);
      expect(toUpdate).toHaveLength(1);
      expect(toUpdate[0]?.title).toBe('New Title');
      expect(toUpdate[0]?.eventId).toBe('gg-orig-1');
      expect(toDelete).toHaveLength(0);
    });

    it('should update when time changes (matched by timetreeId)', () => {
      const ttEvent = createEvent({
        originalId: 'tt-1',
        start: new Date('2026-03-24T11:00:00Z'),
        end: new Date('2026-03-24T12:00:00Z'),
      });
      const ggEvent = createEvent({ id: 'gg-1', originalId: 'gg-orig-1' });
      const tagMap = new Map([['tt-1', ggEvent]]);

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [ttEvent],
        [ggEvent],
        new Set(['gg-orig-1']),
        tagMap,
      );

      expect(toCreate).toHaveLength(0);
      expect(toUpdate).toHaveLength(1);
      expect(toDelete).toHaveLength(0);
    });

    it('should delete tagged event when removed from TimeTree', () => {
      const ggEvent = createEvent({ id: 'gg-1', originalId: 'gg-orig-1' });
      const tagMap = new Map([['tt-1', ggEvent]]);

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        [],
        [ggEvent],
        new Set(['gg-orig-1']),
        tagMap,
      );

      expect(toCreate).toHaveLength(0);
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(1);
    });

    it('should handle mixed tagged and untagged events', () => {
      const ttEvents = [
        createEvent({ title: 'Tagged Event', originalId: 'tt-1' }),
        createEvent({
          title: 'New Event',
          originalId: 'tt-2',
          start: new Date('2026-03-24T14:00:00Z'),
          end: new Date('2026-03-24T15:00:00Z'),
        }),
      ];

      const ggEvents = [
        createEvent({ title: 'Tagged Event', id: 'gg-1', originalId: 'gg-orig-1' }),
        createEvent({ title: 'Orphaned', id: 'gg-2', originalId: 'gg-orig-2' }),
      ];

      const tagMap = new Map([['tt-1', ggEvents[0]]]);

      const { toCreate, toUpdate, toDelete } = buildSyncActions(
        ttEvents,
        ggEvents,
        new Set(['gg-orig-1', 'gg-orig-2']),
        tagMap,
      );

      expect(toCreate).toHaveLength(1);
      expect(toCreate[0]?.title).toBe('New Event');
      expect(toUpdate).toHaveLength(0);
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0]?.title).toBe('Orphaned');
    });
  });

  describe('buildSyncActions - all-day events', () => {
    it('should include isAllDay flag in create actions', () => {
      const ttEvent = createEvent({
        originalId: 'tt-1',
        title: 'Holiday',
        isAllDay: true,
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
      });

      const { toCreate } = buildSyncActions([ttEvent], [], new Set<string>());

      expect(toCreate).toHaveLength(1);
      expect(toCreate[0]?.isAllDay).toBe(true);
    });

    it('should include isAllDay flag in update actions (tagMap match)', () => {
      const ttEvent = createEvent({
        originalId: 'tt-1',
        title: 'Updated Holiday',
        isAllDay: true,
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
      });
      const ggEvent = createEvent({
        id: 'gg-1',
        originalId: 'gg-orig-1',
        title: 'Old Holiday',
        isAllDay: true,
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
      });
      const tagMap = new Map([['tt-1', ggEvent]]);

      const { toUpdate } = buildSyncActions([ttEvent], [ggEvent], new Set(['gg-orig-1']), tagMap);

      expect(toUpdate).toHaveLength(1);
      expect(toUpdate[0]?.isAllDay).toBe(true);
    });

    it('should detect isAllDay change as content update', () => {
      const ttEvent = createEvent({
        originalId: 'tt-1',
        isAllDay: true,
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
      });
      const ggEvent = createEvent({
        id: 'gg-1',
        originalId: 'gg-orig-1',
        isAllDay: false,
        start: new Date('2026-03-24T00:00:00Z'),
        end: new Date('2026-03-25T00:00:00Z'),
      });
      const tagMap = new Map([['tt-1', ggEvent]]);

      const { toUpdate } = buildSyncActions([ttEvent], [ggEvent], new Set(['gg-orig-1']), tagMap);

      expect(toUpdate).toHaveLength(1);
      expect(toUpdate[0]?.isAllDay).toBe(true);
    });

    it('should preserve isAllDay: false for timed events', () => {
      const ttEvent = createEvent({ originalId: 'tt-1', isAllDay: false });

      const { toCreate } = buildSyncActions([ttEvent], [], new Set<string>());

      expect(toCreate).toHaveLength(1);
      expect(toCreate[0]?.isAllDay).toBe(false);
    });
  });

  describe('executeSyncActions', () => {
    it('should create all-day event with isAllDay: true', async () => {
      const mockAdapter = {
        createEvent: vi.fn().mockResolvedValue({ id: 'new-gg-1' }),
        updateEvent: vi.fn(),
        deleteEvent: vi.fn(),
      } as unknown as CalendarAdapter;

      const actions = {
        toCreate: [
          {
            type: 'create' as const,
            title: 'Holiday',
            timetreeId: 'tt-1',
            startTime: new Date('2026-03-24T00:00:00Z'),
            endTime: new Date('2026-03-25T00:00:00Z'),
            isAllDay: true,
          },
        ],
        toUpdate: [],
        toDelete: [],
      };

      await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(mockAdapter.createEvent).toHaveBeenCalledWith(
        'cal-1',
        expect.objectContaining({
          isAllDay: true,
        }),
      );
    });

    it('should update all-day event with isAllDay: true', async () => {
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
            title: 'Holiday',
            timetreeId: 'tt-1',
            startTime: new Date('2026-03-24T00:00:00Z'),
            endTime: new Date('2026-03-25T00:00:00Z'),
            isAllDay: true,
          },
        ],
        toDelete: [],
      };

      await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(mockAdapter.updateEvent).toHaveBeenCalledWith(
        'cal-1',
        'gg-1',
        expect.objectContaining({
          isAllDay: true,
        }),
      );
    });

    it('should pass extendedProperties with timetreeId on create', async () => {
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
            isAllDay: false,
          },
        ],
        toUpdate: [],
        toDelete: [],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.created).toBe(1);
      expect(mockAdapter.createEvent).toHaveBeenCalledWith(
        'cal-1',
        expect.objectContaining({
          extendedProperties: { private: { timetreeId: 'tt-1' } },
        }),
      );
    });

    it('should pass extendedProperties with timetreeId on update', async () => {
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
            isAllDay: false,
          },
        ],
        toDelete: [],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.updated).toBe(1);
      expect(mockAdapter.updateEvent).toHaveBeenCalledWith(
        'cal-1',
        'gg-1',
        expect.objectContaining({
          extendedProperties: { private: { timetreeId: 'tt-1' } },
        }),
      );
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
            isAllDay: false,
          },
        ],
        toUpdate: [],
        toDelete: [],
      };

      const stats = await executeSyncActions(mockAdapter, 'cal-1', actions);

      expect(stats.created).toBe(0);
      expect(stats.skipped).toBe(1);
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
            isAllDay: false,
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
            isAllDay: false,
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
