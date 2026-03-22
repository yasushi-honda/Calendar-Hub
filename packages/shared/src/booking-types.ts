// Booking Link & Booking types for public scheduling

export type BookingLinkStatus = 'active' | 'paused';

export type BookingStatus = 'confirmed' | 'cancelled_by_owner' | 'cancelled_by_guest';

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
export type DurationOption = (typeof DURATION_OPTIONS)[number];

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
  calendarIdForEvent: string;
  accountIdForEvent: string;
  freeTimeOptions: BookingLinkFreeTimeOptions;
  availableDays: number[];
  rangeDays: number;
  bufferMinutes: number;
  status: BookingLinkStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  calendarIdForEvent: string;
  accountIdForEvent: string;
  freeTimeOptions?: Partial<BookingLinkFreeTimeOptions>;
  availableDays?: number[];
  rangeDays?: number;
  bufferMinutes?: number;
  expiresAt?: string | null;
}

export interface CreateBookingInput {
  slotStart: string; // ISO 8601
  guestName: string;
  guestEmail?: string;
  guestMessage?: string;
}
