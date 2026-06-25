import type { DocumentData } from 'firebase-admin/firestore';
import type { BookingLink } from '@calendar-hub/shared';

/**
 * Firestore document data に新フィールドの default を補完するためのロジック。
 *
 * 既存 document に `autoCreateCalendarEvent` / `calendarIdsForAvailability` が
 * 無い場合、それぞれ `true` / `null` として読み出して既存挙動を維持する。
 */
export function applyBookingLinkDefaults(
  data: Record<string, unknown>,
): Pick<
  BookingLink,
  | 'calendarIdForEvent'
  | 'accountIdForEvent'
  | 'autoCreateCalendarEvent'
  | 'calendarIdsForAvailability'
> {
  return {
    calendarIdForEvent: (data.calendarIdForEvent as string | null | undefined) ?? null,
    accountIdForEvent: (data.accountIdForEvent as string | null | undefined) ?? null,
    autoCreateCalendarEvent: (data.autoCreateCalendarEvent as boolean | undefined) ?? true,
    calendarIdsForAvailability:
      (data.calendarIdsForAvailability as string[] | null | undefined) ?? null,
  };
}

/**
 * Firestore document data から BookingLink を構築する。
 * Timestamp → Date 変換 + 新フィールドの default 補完を一括で行う。
 */
export function buildBookingLinkFromFirestoreData(data: DocumentData): BookingLink {
  return {
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    expiresAt: data.expiresAt?.toDate?.() ?? null,
    ...applyBookingLinkDefaults(data),
  } as BookingLink;
}

/**
 * 予約成立時に Google Calendar への event 自動作成を行うべきかを判定。
 *
 * autoCreate フラグが ON で、かつ書き込み先 (accountIdForEvent / calendarIdForEvent)
 * の両方が設定されている場合のみ true。
 */
export function shouldCreateCalendarEvent(link: BookingLink): boolean {
  return link.autoCreateCalendarEvent && !!link.accountIdForEvent && !!link.calendarIdForEvent;
}

/**
 * `calendarIdsForAvailability` に基づいて calendar 配列を絞り込む。
 * filter が null の場合は全件をそのまま返す (既存挙動)。
 */
export function filterCalendarsByIds<T extends { id: string }>(
  calendars: T[],
  filter: string[] | null,
): T[] {
  return filter ? calendars.filter((cal) => filter.includes(cal.id)) : calendars;
}

/**
 * PATCH リクエスト body から Firestore update object を構築する (Partial Update)。
 *
 * undefined フィールドは update に含めず、Firestore 側で既存値を保持させる。
 * `updatedAt` 等の serverTimestamp は呼出側で別途追加すること。
 */
export function buildBookingLinkPatchUpdate(body: {
  title?: string;
  description?: string | null;
  status?: string;
  availableDays?: number[];
  rangeDays?: number;
  bufferMinutes?: number;
  freeTimeOptions?: { dayStartHour: number; dayEndHour: number };
  expiresAt?: string | null;
  autoCreateCalendarEvent?: boolean;
  calendarIdsForAvailability?: string[] | null;
  calendarIdForEvent?: string | null;
  accountIdForEvent?: string | null;
}): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description ?? null;
  if (body.status !== undefined) update.status = body.status;
  if (body.availableDays !== undefined) update.availableDays = body.availableDays;
  if (body.rangeDays !== undefined) update.rangeDays = body.rangeDays;
  if (body.bufferMinutes !== undefined) update.bufferMinutes = body.bufferMinutes;
  if (body.freeTimeOptions !== undefined) update.freeTimeOptions = body.freeTimeOptions;
  if (body.expiresAt !== undefined)
    update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (body.autoCreateCalendarEvent !== undefined)
    update.autoCreateCalendarEvent = body.autoCreateCalendarEvent;
  if (body.calendarIdsForAvailability !== undefined)
    update.calendarIdsForAvailability = body.calendarIdsForAvailability;
  if (body.calendarIdForEvent !== undefined) update.calendarIdForEvent = body.calendarIdForEvent;
  if (body.accountIdForEvent !== undefined) update.accountIdForEvent = body.accountIdForEvent;
  return update;
}

/**
 * BookingLink 作成/更新入力の不変条件をチェック。
 *
 * `autoCreateCalendarEvent === true` (default) のときは
 * `calendarIdForEvent` と `accountIdForEvent` が必須。false のときは null 許容。
 */
export function validateBookingLinkInvariant(input: {
  autoCreateCalendarEvent: boolean;
  calendarIdForEvent: string | null | undefined;
  accountIdForEvent: string | null | undefined;
}): { ok: true } | { ok: false; error: string } {
  if (input.autoCreateCalendarEvent && (!input.calendarIdForEvent || !input.accountIdForEvent)) {
    return {
      ok: false,
      error:
        'calendarIdForEvent and accountIdForEvent are required when autoCreateCalendarEvent is true',
    };
  }
  return { ok: true };
}
