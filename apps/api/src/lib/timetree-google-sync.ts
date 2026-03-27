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
): Promise<{
  events: CalendarEvent[];
  tagged: Set<string>;
  tagMap: Map<string, CalendarEvent>;
}> {
  const events = await ggAdapter.listEvents(calendarId, timeMin, timeMax);
  const tagged = new Set<string>();
  const tagMap = new Map<string, CalendarEvent>();

  for (const event of events) {
    const timetreeId = event.extendedProperties?.private?.timetreeId;
    if (timetreeId) {
      tagged.add(event.originalId);
      tagMap.set(timetreeId, event);
    }
  }

  return { events, tagged, tagMap };
}

/** イベントのマッチングキー（title + start + end） */
function eventKey(e: CalendarEvent): string {
  if (e.isAllDay) {
    const tz = 'Asia/Tokyo';
    return `${e.title}|${toDateStr(e.start, tz)}|${toDateStr(e.end, tz)}`;
  }
  return `${e.title}|${e.start.getTime()}|${e.end.getTime()}`;
}

/** 全日イベント用: タイムゾーン安全な日付文字列（YYYY-MM-DD） */
function toDateStr(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const dd = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${dd}`;
}

/** Google Meetが自動付与するdescription末尾メタデータを除去 */
function stripGoogleMeetMetadata(desc: string | undefined): string | undefined {
  if (!desc) return desc;
  return desc.replace(/-::~:~::~:~:~:~:~:~:~:~:~:~[\s\S]*$/, '').trim() || undefined;
}

/** イベント内容の差分があるか判定 */
function needsContentUpdate(ttEvent: CalendarEvent, ggEvent: CalendarEvent): boolean {
  if (ttEvent.title !== ggEvent.title) return true;
  if (ttEvent.isAllDay !== ggEvent.isAllDay) return true;

  // description比較: 両側のMeetメタデータを除去して比較
  const ttDesc = stripGoogleMeetMetadata(ttEvent.description) || undefined;
  const ggDesc = stripGoogleMeetMetadata(ggEvent.description) || undefined;
  if (ttDesc !== ggDesc) return true;

  if (ttEvent.isAllDay && ggEvent.isAllDay) {
    const tz = 'Asia/Tokyo';
    return (
      toDateStr(ttEvent.start, tz) !== toDateStr(ggEvent.start, tz) ||
      toDateStr(ttEvent.end, tz) !== toDateStr(ggEvent.end, tz)
    );
  }

  return (
    ttEvent.start.getTime() !== ggEvent.start.getTime() ||
    ttEvent.end.getTime() !== ggEvent.end.getTime()
  );
}

/**
 * TimeTree vs Google の差分検出（2段階マッチング）。
 * 1. timetreeIdタグベースマッチ（一次）
 * 2. title+start+endフォールバックマッチ（二次：未タグイベント用）
 */
export function buildSyncActions(
  ttEvents: CalendarEvent[],
  ggEvents: CalendarEvent[],
  taggedGoogleIds: Set<string>,
  tagMap?: Map<string, CalendarEvent>,
): {
  toCreate: SyncAction[];
  toUpdate: SyncAction[];
  toDelete: SyncAction[];
} {
  const toCreate: SyncAction[] = [];
  const toUpdate: SyncAction[] = [];
  const toDelete: SyncAction[] = [];

  const matchedGoogleOriginalIds = new Set<string>();
  const ttTagMap = tagMap ?? new Map<string, CalendarEvent>();

  // Google側をtitle+start+endで索引（フォールバック用、同一キー複数対応）
  const ggByKey = new Map<string, CalendarEvent[]>();
  for (const e of ggEvents) {
    const k = eventKey(e);
    const arr = ggByKey.get(k);
    if (arr) arr.push(e);
    else ggByKey.set(k, [e]);
  }

  for (const ttEvent of ttEvents) {
    // 一次: timetreeIdタグでマッチ
    const taggedGgEvent = ttTagMap.get(ttEvent.originalId);

    if (taggedGgEvent) {
      matchedGoogleOriginalIds.add(taggedGgEvent.originalId);

      if (needsContentUpdate(ttEvent, taggedGgEvent)) {
        toUpdate.push({
          type: 'update',
          eventId: taggedGgEvent.originalId,
          title: ttEvent.title,
          timetreeId: ttEvent.originalId,
          startTime: ttEvent.start,
          endTime: ttEvent.end,
          description: stripGoogleMeetMetadata(ttEvent.description) || undefined,
          isAllDay: ttEvent.isAllDay,
        });
      }
      continue;
    }

    // 二次: title+start+endフォールバックマッチ（同一キー複数対応）
    const key = eventKey(ttEvent);
    const candidates = ggByKey.get(key) ?? [];
    const ggEvent = candidates.find((e) => !matchedGoogleOriginalIds.has(e.originalId));

    if (ggEvent) {
      matchedGoogleOriginalIds.add(ggEvent.originalId);

      // 未タグイベントにtimetreeIdタグを付与するupdate
      toUpdate.push({
        type: 'update',
        eventId: ggEvent.originalId,
        title: ttEvent.title,
        timetreeId: ttEvent.originalId,
        startTime: ttEvent.start,
        endTime: ttEvent.end,
        description: ttEvent.description,
        isAllDay: ttEvent.isAllDay,
      });
    } else {
      toCreate.push({
        type: 'create',
        title: ttEvent.title,
        timetreeId: ttEvent.originalId,
        startTime: ttEvent.start,
        endTime: ttEvent.end,
        description: ttEvent.description,
        isAllDay: ttEvent.isAllDay,
      });
    }
  }

  // タグ付きGoogleイベントのうちマッチしなかったもの → 削除
  for (const ggEvent of ggEvents) {
    if (
      taggedGoogleIds.has(ggEvent.originalId) &&
      !matchedGoogleOriginalIds.has(ggEvent.originalId)
    ) {
      toDelete.push({
        type: 'delete',
        eventId: ggEvent.originalId,
        title: ggEvent.title,
        timetreeId: ggEvent.originalId,
        startTime: ggEvent.start,
        endTime: ggEvent.end,
        isAllDay: ggEvent.isAllDay,
      });
    }
  }

  return { toCreate, toUpdate, toDelete };
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

  for (const action of actions.toCreate) {
    try {
      await ggAdapter.createEvent(googleCalendarId, {
        title: action.title,
        description: action.description,
        start: action.startTime,
        end: action.endTime,
        isAllDay: action.isAllDay,
        extendedProperties: { private: { timetreeId: action.timetreeId } },
      });
      created++;
    } catch (err) {
      console.error(`Failed to create event ${action.title}:`, err);
      skipped++;
    }
  }

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
        isAllDay: action.isAllDay,
        extendedProperties: { private: { timetreeId: action.timetreeId } },
      });
      updated++;
    } catch (err) {
      console.error(`Failed to update event ${action.eventId}:`, err);
      skipped++;
    }
  }

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
      errorMessage: errorMessage ?? null,
      executedAt: FieldValue.serverTimestamp(),
      durationMs,
    });
}
