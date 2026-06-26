// Google 予約スケジュール完全反映ミラー (v2) の型定義
// 経緯: docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md

export type BookingMirrorLinkStatus = 'active' | 'paused';

/** Firestore document `bookingMirrorLinks/{linkId}` */
export interface BookingMirrorLink {
  id: string;
  ownerUid: string;
  /** ユーザー表示用タイトル */
  title: string;
  description?: string;
  /** 入力された Google 予約スケジュール URL (短縮 or 完全) */
  sourceUrl: string;
  /** 短縮 URL から解決した完全 schedule ID (cache、空のとき毎回再解決) */
  scheduleId: string;
  /** 予約成立時の通知先メール */
  notificationEmail: string;
  /** 公開日数 (slots 取得の range)。デフォルト 30、最大 60 */
  rangeDays: number;
  status: BookingMirrorLinkStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 公開ページに返す safe subset (ownerUid / scheduleId 等を隠す) */
export interface PublicBookingMirrorLinkInfo {
  id: string;
  title: string;
  description?: string;
  ownerDisplayName: string;
  status: BookingMirrorLinkStatus;
}

/** POST /api/booking-mirror-links 入力 */
export interface CreateBookingMirrorLinkInput {
  sourceUrl: string;
  title?: string;
  description?: string;
  notificationEmail?: string;
  rangeDays?: number;
  expiresAt?: string | null;
}

/** PATCH /api/booking-mirror-links/:linkId 入力 */
export interface UpdateBookingMirrorLinkInput {
  title?: string;
  description?: string | null;
  notificationEmail?: string;
  rangeDays?: number;
  status?: BookingMirrorLinkStatus;
  expiresAt?: string | null;
}

/** 公開 slots API レスポンス 1 件 */
export interface BookingMirrorSlot {
  start: string; // ISO 8601 UTC
  end: string;
  durationMinutes: number;
}

/** POST /api/public/booking-mirror/:linkId/book 入力 */
export interface CreateBookingMirrorInput {
  slotStart: string; // ISO 8601 UTC
  slotEnd: string;
  guestName: string;
  guestEmail?: string;
  guestMessage?: string;
}

/** 既存 `bookings` collection の document に追加するフィールド */
export type BookingLinkType = 'bookingLink' | 'bookingMirrorLink';
