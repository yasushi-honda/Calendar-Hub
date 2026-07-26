import type { GoogleSlot } from './google-booking-mirror.js';

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
