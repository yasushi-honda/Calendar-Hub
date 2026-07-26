/**
 * 「有効化されているなら書き込み先 (calendarId/accountId) が必須」という不変条件の汎用版。
 * 非mirrorの booking-link-utils.validateBookingLinkInvariant と mirrorの
 * shouldCreateBlockEvent 系検証の両方から使う共通ロジック。
 */
export function validateCalendarTargetInvariant(input: {
  enabled: boolean;
  calendarId: string | null | undefined;
  accountId: string | null | undefined;
}): { ok: true } | { ok: false; error: string } {
  if (input.enabled && (!input.calendarId || !input.accountId)) {
    return {
      ok: false,
      error: 'calendarId and accountId are required when enabled is true',
    };
  }
  return { ok: true };
}
