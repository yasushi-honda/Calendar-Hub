// Booking Link & Booking types for public scheduling

export type BookingLinkStatus = 'active' | 'paused';

export type BookingStatus = 'confirmed' | 'cancelled_by_owner' | 'cancelled_by_guest';

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
export type DurationOption = (typeof DURATION_OPTIONS)[number];

export const BOOKING_LINK_STATUSES: readonly BookingLinkStatus[] = ['active', 'paused'];

export interface BookingLinkFreeTimeOptions {
  dayStartHour: number;
  dayEndHour: number;
}

export interface BookingLink {
  id: string;
  ownerUid: string;
  title: string;
  description?: string;
  durationMinutes: DurationOption;
  accountIds: string[];
  calendarIdForEvent: string | null;
  accountIdForEvent: string | null;
  freeTimeOptions: BookingLinkFreeTimeOptions;
  availableDays: number[];
  rangeDays: number;
  bufferMinutes: number;
  status: BookingLinkStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  autoCreateCalendarEvent: boolean;
  calendarIdsForAvailability: string[] | null;
}

/** Public-safe subset — no ownerUid, accountIds, calendarId */
export interface PublicBookingLinkInfo {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  ownerDisplayName: string;
  availableDays: number[];
  rangeDays: number;
  status: BookingLinkStatus;
}

/** block event (「予定あり」) 自動作成の結果。'skipped' = autoCreateBlockEvent が無効 */
export type BlockEventStatus = 'skipped' | 'created' | 'created_unverified' | 'failed';

export interface Booking {
  id: string;
  linkId: string;
  ownerUid: string;
  guestName: string;
  guestEmail?: string;
  guestMessage?: string;
  slotStart: Date;
  slotEnd: Date;
  status: BookingStatus;
  calendarEventId?: string;
  notificationSentToOwner: boolean;
  notificationSentToGuest: boolean;
  createdAt: Date;
  /** block event 自動作成の結果。非mirrorリンクの予約や旧document では undefined */
  blockEventStatus?: BlockEventStatus;
  /** 作成された Google event の素の id (google_ プレフィックスなし)。delete に使う */
  blockEventId?: string | null;
  /** block event 書き込み先の calendar ID (link からのスナップショット) */
  blockCalendarId?: string | null;
  /** block event 書き込みに使った連携アカウント ID (link からのスナップショット) */
  blockAccountId?: string | null;
  blockEventError?: string;
}

/** Public-safe booking confirmation */
export interface PublicBookingConfirmation {
  id: string;
  slotStart: string;
  slotEnd: string;
  guestName: string;
  linkTitle: string;
  ownerDisplayName: string;
}

export interface BookingSlot {
  start: string; // ISO 8601
  end: string;
}

export interface CreateBookingLinkInput {
  title: string;
  description?: string;
  durationMinutes: DurationOption;
  accountIds: string[];
  calendarIdForEvent?: string | null;
  accountIdForEvent?: string | null;
  freeTimeOptions?: Partial<BookingLinkFreeTimeOptions>;
  availableDays?: number[];
  rangeDays?: number;
  bufferMinutes?: number;
  expiresAt?: string | null;
  autoCreateCalendarEvent?: boolean;
  calendarIdsForAvailability?: string[] | null;
}

export interface CreateBookingInput {
  slotStart: string; // ISO 8601
  guestName: string;
  guestEmail?: string;
  guestMessage?: string;
}
