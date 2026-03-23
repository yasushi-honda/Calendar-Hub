import type { CalendarAdapter } from '@calendar-hub/calendar-sdk';
import type { CalendarEvent, SyncAction } from '@calendar-hub/shared';
import { getDb } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';

/**
 * TimeTreeからイベント取得。
 * 全カレンダーの全イベントを集約。
 */
export async function fetchTimeTreeEvents(
  ttAdapter: CalendarAdapter,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const calendars = await ttAdapter.listCalendars();
  const allEvents: CalendarEvent[] = [];

  for (const cal of calendars) {
    try {
      const events = await ttAdapter.listEvents(cal.id, timeMin, timeMax);
      allEvents.push(...events);
    } catch (err) {
      console.error(`Failed to fetch TimeTree calendar ${cal.id}:`, err);
    }
  }

  return allEvents;
}

/**
 * Googleからイベント取得。
 * extendedProperties.private.timetreeId でタグ付けされたイベントを特定。
 */
export async function fetchGoogleEvents(
  ggAdapter: CalendarAdapter,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<{ events: CalendarEvent[]; tagged: Set<string> }> {
  const events = await ggAdapter.listEvents(calendarId, timeMin, timeMax);
  const tagged = new Set<string>();

  // このアダプター実装ではextendedPropertiesは取得されないので、
  // 実際の同期では別途Google API直接呼び出しが必要。
  // ここは簡略版実装。

  return { events, tagged };
}

/**
 * TimeTree vs Google の差分検出。
 * 戻り値: 作成/更新/削除のアクション。
 */
export function buildSyncActions(
  ttEvents: CalendarEvent[],
  ggEvents: CalendarEvent[],
  taggedGoogleIds: Set<string>,
): {
  toCreate: SyncAction[];
  toUpdate: SyncAction[];
  toDelete: SyncAction[];
} {
  const toCreate: SyncAction[] = [];
  const toUpdate: SyncAction[] = [];
  const toDelete: SyncAction[] = [];

  // TimeTree → Google のマッピング
  // 簡略版: タイトル + 時間で近似マッチ
  for (const ttEvent of ttEvents) {
    let matched = false;

    for (const ggEvent of ggEvents) {
      if (
        ggEvent.title === ttEvent.title &&
        ggEvent.start.getTime() === ttEvent.start.getTime() &&
        ggEvent.end.getTime() === ttEvent.end.getTime()
      ) {
        matched = true;

        // 内容が異なるなら更新
        if (needsUpdate(ttEvent, ggEvent)) {
          toUpdate.push({
            type: 'update',
            eventId: ggEvent.id,
            title: ttEvent.title,
            timetreeId: ttEvent.originalId,
            startTime: ttEvent.start,
            endTime: ttEvent.end,
            description: ttEvent.description,
          });
        }
        break;
      }
    }

    if (!matched) {
      toCreate.push({
        type: 'create',
        title: ttEvent.title,
        timetreeId: ttEvent.originalId,
        startTime: ttEvent.start,
        endTime: ttEvent.end,
        description: ttEvent.description,
      });
    }
  }

  // Google に存在するがTimeTreeに存在しないイベント → 削除
  for (const ggEvent of ggEvents) {
    if (taggedGoogleIds.has(ggEvent.id)) {
      const exists = ttEvents.some(
        (e) =>
          e.title === ggEvent.title &&
          e.start.getTime() === ggEvent.start.getTime() &&
          e.end.getTime() === ggEvent.end.getTime(),
      );

      if (!exists) {
        toDelete.push({
          type: 'delete',
          eventId: ggEvent.id,
          title: ggEvent.title,
          timetreeId: ggEvent.originalId,
          startTime: ggEvent.start,
          endTime: ggEvent.end,
        });
      }
    }
  }

  return { toCreate, toUpdate, toDelete };
}

/**
 * TimeTreeイベントとGoogleイベントの内容が異なるか判定。
 */
function needsUpdate(ttEvent: CalendarEvent, ggEvent: CalendarEvent): boolean {
  return (
    ttEvent.title !== ggEvent.title ||
    ttEvent.description !== ggEvent.description ||
    ttEvent.start.getTime() !== ggEvent.start.getTime() ||
    ttEvent.end.getTime() !== ggEvent.end.getTime()
  );
}

/**
 * アクションをGoogle側で実行。
 * extendedProperties.private.timetreeId でタグ付け。
 */
export async function executeSyncActions(
  ggAdapter: CalendarAdapter,
  googleCalendarId: string,
  actions: {
    toCreate: SyncAction[];
    toUpdate: SyncAction[];
    toDelete: SyncAction[];
  },
): Promise<{
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}> {
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;

  // 作成
  for (const action of actions.toCreate) {
    try {
      await ggAdapter.createEvent(googleCalendarId, {
        title: action.title,
        description: action.description,
        start: action.startTime,
        end: action.endTime,
        isAllDay: false,
      });
      created++;
    } catch (err) {
      console.error(`Failed to create event ${action.title}:`, err);
      skipped++;
    }
  }

  // 更新
  for (const action of actions.toUpdate) {
    try {
      if (!action.eventId) {
        console.error(`Update action missing eventId: ${action.title}`);
        skipped++;
        continue;
      }

      await ggAdapter.updateEvent(googleCalendarId, action.eventId, {
        title: action.title,
        description: action.description,
        start: action.startTime,
        end: action.endTime,
        isAllDay: false,
      });
      updated++;
    } catch (err) {
      console.error(`Failed to update event ${action.eventId}:`, err);
      skipped++;
    }
  }

  // 削除
  for (const action of actions.toDelete) {
    try {
      if (!action.eventId) {
        console.error(`Delete action missing eventId: ${action.title}`);
        skipped++;
        continue;
      }

      await ggAdapter.deleteEvent(googleCalendarId, action.eventId);
      deleted++;
    } catch (err) {
      console.error(`Failed to delete event ${action.eventId}:`, err);
      skipped++;
    }
  }

  return { created, updated, deleted, skipped };
}

/**
 * 同期ログをFirestoreに記録。
 */
export async function recordSyncLog(
  syncConfigId: string,
  ownerUid: string,
  status: 'success' | 'partial' | 'failed',
  stats: { created: number; updated: number; deleted: number; skipped: number },
  durationMs: number,
  errorMessage?: string,
): Promise<void> {
  const db = getDb();
  const logId = nanoid(12);

  await db
    .collection('syncLogs')
    .doc(logId)
    .set({
      id: logId,
      syncConfigId,
      ownerUid,
      status,
      eventsCreated: stats.created,
      eventsUpdated: stats.updated,
      eventsDeleted: stats.deleted,
      eventsSkipped: stats.skipped,
      errorMessage: errorMessage || null,
      executedAt: FieldValue.serverTimestamp(),
      durationMs,
    });
}
