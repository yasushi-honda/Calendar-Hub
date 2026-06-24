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
