import type { DocumentData } from 'firebase-admin/firestore';
import type { BookingMirrorLink } from '@calendar-hub/shared';

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
  } as BookingMirrorLink;
}
