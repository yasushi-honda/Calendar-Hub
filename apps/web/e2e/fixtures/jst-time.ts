const JST_OFFSET_HOURS = 9;
const JST_OFFSET_MS = JST_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * JST 基準の「明日」の指定時刻(JST)を返す。
 *
 * UTC の日付に 1 日足すだけだと、JST の午前中(UTC はまだ前日)に「今日」の時刻になってしまう。
 * 今日の枠は現在時刻から始まり揃わない(Issue #226)ため、e2e の予約テストは必ず明日以降の枠を使う。
 */
export function tomorrowAtJst(hourJst: number): Date {
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  return new Date(
    Date.UTC(
      nowJst.getUTCFullYear(),
      nowJst.getUTCMonth(),
      nowJst.getUTCDate() + 1,
      hourJst - JST_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
}
