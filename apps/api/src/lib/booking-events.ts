import { getDb } from './firebase-admin.js';
import type { CalendarEvent } from '@calendar-hub/shared';

/**
 * `slotStart` だけで区切ったクエリでは検出できない「timeMin より前に始まり、
 * まだ終了していない (進行中の)」予約を取りこぼさないための、クエリ下限の
 * 巻き戻し幅。個人運用規模の予約枠として現実的にありえない長さ (24時間) を
 * 十分に超える値を取り、真の重複判定は `toOverlappingBookingEvents` の
 * `end > timeMin` フィルタで行う。
 */
const OVERLAP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface RawBookingDoc {
  id: string;
  slotStart: { toDate(): Date };
  slotEnd: { toDate(): Date };
}

/**
 * Firestore から取得した確定予約 doc を CalendarEvent[] に変換し、`timeMin`
 * 以降に終了するものだけを残す (`slotStart` の範囲クエリだけでは、timeMin
 * より前に始まってまだ終了していない予約を検出できないため)。
 */
export function toOverlappingBookingEvents(docs: RawBookingDoc[], timeMin: Date): CalendarEvent[] {
  return docs
    .map((doc) => ({
      id: doc.id,
      source: 'google' as const, // CalendarEvent型に合わせるためのダミー値
      originalId: doc.id,
      calendarId: 'booking',
      title: 'Reserved',
      start: doc.slotStart.toDate(),
      end: doc.slotEnd.toDate(),
      isAllDay: false,
      status: 'confirmed' as const,
    }))
    .filter((event) => event.end > timeMin);
}

/**
 * 予約確定直前に再取得した外部カレンダーイベントが、選択された slot と重なるかを判定する。
 *
 * 重なり判定は `start < slotEnd && end > slotStart` (区間の共通部分が存在するか)。
 * 境界がちょうど接するだけ (隣接) は重複として扱わない。mirror側の
 * `excludeOverlappingSlots` と同一ロジック。
 */
export function hasOverlappingEvent(
  events: { start: Date; end: Date }[],
  slotStart: Date,
  slotEnd: Date,
): boolean {
  return events.some((event) => event.start < slotEnd && event.end > slotStart);
}

/**
 * 指定オーナーの確定済み予約 (`bookings` collection, status='confirmed') を
 * ダミーイベントとしてマージするための変換。
 *
 * 予約リンク種別 (`bookingLink` / `bookingMirrorLink`) を問わず同一オーナーの
 * 全予約を対象にする。空き時間計算に混ぜることで、Google Calendar 側にまだ
 * 反映されていない (あるいはそもそも反映されない) 確定予約による二重予約を防止する。
 *
 * `public-booking.ts` (非ミラー版) と `public-booking-mirror.ts` (ミラー版) の
 * 両方から呼ばれる共通ロジック。
 */
export async function getConfirmedBookingEventsForOwner(
  ownerUid: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const db = getDb();
  const queryLowerBound = new Date(timeMin.getTime() - OVERLAP_LOOKBACK_MS);
  const snap = await db
    .collection('bookings')
    .where('ownerUid', '==', ownerUid)
    .where('status', '==', 'confirmed')
    .where('slotStart', '>=', queryLowerBound)
    .where('slotStart', '<=', timeMax)
    .get();

  const rawDocs = snap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, slotStart: data.slotStart, slotEnd: data.slotEnd };
  });
  return toOverlappingBookingEvents(rawDocs, timeMin);
}
