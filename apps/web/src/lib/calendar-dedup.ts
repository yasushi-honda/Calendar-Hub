import type { ConnectedAccountPublic } from '@calendar-hub/shared';

export interface CalendarWithAccount {
  id: string;
  name: string;
  accountId: string;
  provider: 'google' | 'timetree';
}

/**
 * 相互共有されたカレンダーは複数アカウント経由で同一 id が重複して返る
 * (`GET /api/calendars` が接続済み各アカウントの listCalendars() をフラット化するため、
 * 例えば hy.unimail.11@gmail.com が yasushi.honda@aozora-cg.com のカレンダーを閲覧共有されて
 * いると、"yasushi.honda@aozora-cg.com" という同じ calendar id が両アカウント経由で返る)。
 *
 * カレンダーの実際の所有アカウント (accountId に紐づく email === calendar id) を優先して
 * 1 件に絞り込む。所有アカウントが見つからない場合は最初の1件を残す。
 */
export function dedupeCalendarsByOwnAccount(
  calendars: CalendarWithAccount[],
  accounts: ConnectedAccountPublic[],
): CalendarWithAccount[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const byCalendarId = new Map<string, CalendarWithAccount[]>();
  for (const cal of calendars) {
    const group = byCalendarId.get(cal.id) ?? [];
    group.push(cal);
    byCalendarId.set(cal.id, group);
  }

  const result: CalendarWithAccount[] = [];
  for (const group of byCalendarId.values()) {
    const owned = group.find((cal) => accountById.get(cal.accountId)?.email === cal.id);
    result.push(owned ?? group[0]);
  }
  return result;
}
