import { getDb } from './firebase-admin.js';
import type { CalendarEvent } from '@calendar-hub/shared';

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
  const snap = await db
    .collection('bookings')
    .where('ownerUid', '==', ownerUid)
    .where('status', '==', 'confirmed')
    .where('slotStart', '>=', timeMin)
    .where('slotStart', '<=', timeMax)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      source: 'google' as const, // CalendarEvent型に合わせるためのダミー値
      originalId: doc.id,
      calendarId: 'booking',
      title: 'Reserved',
      start: data.slotStart.toDate(),
      end: data.slotEnd.toDate(),
      isAllDay: false,
      status: 'confirmed' as const,
    };
  });
}
