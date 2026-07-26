import type { DocumentData } from 'firebase-admin/firestore';
import type { BookingMirrorLink } from '@calendar-hub/shared';
import { validateCalendarTargetInvariant } from './calendar-target-invariant.js';

/**
 * Firestore document data から BookingMirrorLink を構築する。
 * Timestamp → Date 変換を一括で行う。
 *
 * 管理 CRUD (`routes/booking-mirror-links.ts`) と公開 API
 * (`routes/public-booking-mirror.ts`) の双方から呼ばれる、唯一の mapper。
 * 旧実装ではこの変換ロジックが2箇所に手書きで重複しており、片方だけへの
 * フィールド追加が「管理画面では保存できるのに予約処理では常に無効」という
 * サイレント障害を生む構造的リスクがあったため、ここに一本化する。
 *
 * spread ベースにしているのは、将来 `BookingMirrorLink` にフィールドを追加した際
 * (例: C1 拡張の `autoCreateBlockEvent` 等) にこの関数を手で更新し忘れても
 * 素通りで転記されるようにするため (非ミラー版 `buildBookingLinkFromFirestoreData`
 * と同じ方針)。ただし `description` は Firestore 上 `null` で保存されうるのに対し
 * 型は `string | undefined` のため、ここだけは明示的に変換する。
 */
export function buildBookingMirrorLinkFromFirestoreData(data: DocumentData): BookingMirrorLink {
  return {
    ...data,
    description: data.description ?? undefined,
    expiresAt: data.expiresAt?.toDate?.() ?? null,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    ...applyBookingMirrorLinkDefaults(data),
  } as BookingMirrorLink;
}

/**
 * 既存 document (block event 拡張前に作成されたもの) に新フィールドの default を補完する。
 * `autoCreateCalendarEvent` の非mirror版とは逆に、既定は false
 * (稼働中リンクが突然 Google カレンダーへの書き込みを始めるのを防ぐため)。
 */
export function applyBookingMirrorLinkDefaults(
  data: Record<string, unknown>,
): Pick<BookingMirrorLink, 'autoCreateBlockEvent' | 'blockCalendarId' | 'blockAccountId'> {
  return {
    autoCreateBlockEvent: (data.autoCreateBlockEvent as boolean | undefined) ?? false,
    blockCalendarId: (data.blockCalendarId as string | null | undefined) ?? null,
    blockAccountId: (data.blockAccountId as string | null | undefined) ?? null,
  };
}

/**
 * 予約成立時に block event (「予定あり」) を自動作成すべきかを判定。
 * autoCreateBlockEvent が ON で、かつ書き込み先 (blockAccountId / blockCalendarId) の
 * 両方が設定されている場合のみ true (非mirror版 shouldCreateCalendarEvent と同じ考え方)。
 */
export function shouldCreateBlockEvent(link: BookingMirrorLink): boolean {
  return link.autoCreateBlockEvent && !!link.blockAccountId && !!link.blockCalendarId;
}

/**
 * BookingMirrorLink 作成/更新入力の不変条件をチェック。
 * `autoCreateBlockEvent === true` のときは `blockCalendarId` と `blockAccountId` が必須。
 */
export function validateBookingMirrorLinkInvariant(input: {
  autoCreateBlockEvent: boolean;
  blockCalendarId: string | null | undefined;
  blockAccountId: string | null | undefined;
}): { ok: true } | { ok: false; error: string } {
  const result = validateCalendarTargetInvariant({
    enabled: input.autoCreateBlockEvent,
    calendarId: input.blockCalendarId,
    accountId: input.blockAccountId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: 'blockCalendarId and blockAccountId are required when autoCreateBlockEvent is true',
    };
  }
  return result;
}
