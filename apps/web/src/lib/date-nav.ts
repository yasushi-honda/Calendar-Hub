export type DateNavDirection = 'prev' | 'next';

/**
 * 日付リスト(昇順)上で、選択中の日付の隣を返す。端では null（ループしない）。
 * 未選択または一覧に無い日付のときは、next なら先頭・prev なら末尾を返す。
 */
export function getAdjacentDate(
  dates: readonly string[],
  current: string | null,
  direction: DateNavDirection,
): string | null {
  if (dates.length === 0) return null;
  const index = current === null ? -1 : dates.indexOf(current);
  if (index === -1) {
    return direction === 'next' ? dates[0] : dates[dates.length - 1];
  }
  const nextIndex = direction === 'next' ? index + 1 : index - 1;
  return dates[nextIndex] ?? null;
}

/** 文字入力中の要素か（矢印キーをカーソル移動に使わせるため、日付移動を無効にする判定） */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
  );
}

/**
 * 空き状況の再取得などで選択中の日付が消えたときに、選択を先頭の日付へ寄せる。
 * 選択中の日付が引き続き存在するならそのまま返す。
 */
export function reconcileSelectedDate(
  dates: readonly string[],
  current: string | null,
): string | null {
  if (current !== null && dates.includes(current)) return current;
  return dates[0] ?? null;
}
