import type { DocumentData } from 'firebase-admin/firestore';
import type { BookingMirrorLink } from '@calendar-hub/shared';
import type { GoogleSlot } from './google-booking-mirror.js';

/**
 * Firestore document data から BookingMirrorLink を構築する。
 * Timestamp → Date 変換を一括で行う。
 *
 * 管理 CRUD (`routes/booking-mirror-links.ts`) と公開 API
 * (`routes/public-booking-mirror.ts`) の双方から呼ばれる、唯一の mapper。
 * 旧実装ではこの変換ロジックが2箇所に手書きで重複しており、片方だけへの
 * フィールド追加が「管理画面では保存できるのに予約処理では常に無効」という
 * サイレント障害を生む構造的リスクがあったため、ここに一本化する。
 */
export function buildBookingMirrorLinkFromFirestoreData(data: DocumentData): BookingMirrorLink {
  return {
    id: data.id,
    ownerUid: data.ownerUid,
    title: data.title,
    description: data.description ?? undefined,
    sourceUrl: data.sourceUrl,
    scheduleId: data.scheduleId,
    notificationEmail: data.notificationEmail,
    rangeDays: data.rangeDays,
    status: data.status,
    expiresAt: data.expiresAt?.toDate?.() ?? null,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  };
}

/**
 * gRPC-web から取得した空き slot のうち、Calendar Hub 側で既に確定済みの予約
 * (`bookedRanges`) と重なるものを除外する。
 *
 * Google Appointment Schedule 側は Calendar Hub 経由の予約を認識しないため、
 * 何もしないとミラーページ上で「予約済みのはずの枠」が空きとして表示され続け、
 * 次のゲストが予約しようとすると 409 を返す (自前 DB だけで確実に防げる不整合)。
 *
 * 重なり判定は `start < slotEnd && end > slotStart` (区間の共通部分が存在するか)。
 * 境界がちょうど接するだけ (隣接) は重複として扱わない。
 */
export function excludeOverlappingSlots(
  slots: GoogleSlot[],
  bookedRanges: { start: Date; end: Date }[],
): GoogleSlot[] {
  return slots.filter((slot) => {
    const slotStart = new Date(slot.startUnix * 1000);
    const slotEnd = new Date((slot.startUnix + slot.durationMinutes * 60) * 1000);
    return !bookedRanges.some((range) => range.start < slotEnd && range.end > slotStart);
  });
}
