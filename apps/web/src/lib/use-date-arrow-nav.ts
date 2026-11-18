import { useEffect } from 'react';
import { getAdjacentDate, isTypingTarget } from './date-nav';

interface Options {
  enabled: boolean;
  dates: readonly string[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

/** ← / → キーで日付カードの選択を横に移動する（修飾キー併用・文字入力中は無効） */
export function useDateArrowNav({ enabled, dates, selectedDate, onSelect }: Options) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      const next = getAdjacentDate(dates, selectedDate, e.key === 'ArrowRight' ? 'next' : 'prev');
      if (next === null) return;
      e.preventDefault();
      const fromDateCard = (e.target as HTMLElement | null)?.classList?.contains('date-card');
      onSelect(next);
      // 日付カードにフォーカスがある状態で移動したら、フォーカスも新しい選択に追従させる
      // (追従しないと Enter/Space が元のカードを再選択し、Tab 移動の起点もずれる)
      if (fromDateCard) {
        document
          .querySelector<HTMLElement>(`[data-testid="date-card-${next}"]`)
          ?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, dates, selectedDate, onSelect]);
}
