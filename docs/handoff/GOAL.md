---
updated: 2026-07-26
---

## 現在のミッション

booking-mirror C1 拡張(予約成立時に Google カレンダーへ block event を自動作成し、二重予約リスクを縮小する)を実装する。

## 背景・why

Google Appointment Schedule の空き枠をミラーする booking-mirror 機能では、Calendar Hub 経由の予約が Google 側に反映されず、同じ枠が Google 経由で別予約されると二重予約になるリスクがある(仕様書 `docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md` §9.1 で C2=リスク受容として意図的に未実装だったが、2026-07-26 に C1 へ移行済み)。

計画全文: `~/.claude/plans/iterative-riding-hummingbird.md`(PR1/PR2 分割・Phase 0 手順・Acceptance Criteria を含む)。

## 完了の定義

- [x] Phase 0 完了: 対象 Google アカウント(`yasushi.honda@aozora-cg.com`)の OAuth 再連携完了、consent screen の publishing status が本番環境(Testing でない)であることを確認、実機で Busy イベントによる枠消失を確認
- [x] PR2 実装完了: `BookingMirrorLink` に `blockCalendarId`/`blockAccountId`/`autoCreateBlockEvent` 追加、POST `/book` で `createBlockEvent` を同期実行、silent failure 検出(`created`/`created_unverified`/`failed` の3値記録)、キャンセル時の block event 削除を含む(証明: `pnpm test && pnpm lint && pnpm turbo type-check && pnpm turbo build` 全 PASS、PR #206 マージ済み)
- [x] 実機で予約すると Google 予約ページから当該枠が消え、`blockEventStatus='created'` になる(証明: 実機で `yasushi.honda@aozora-cg.com` のカレンダーへ block event 作成 → 実際の Google 予約ページで該当枠消失を確認済み、2026-07-26)
- [ ] 予約をキャンセルすると block event が削除され枠が Google 予約ページに戻る(**ペンディング — decision-maker 明示判断、2026-07-27**。コードレビューでは実装済みを確認済み(`booking-links.ts`)だが実機未検証。`PATCH /bookings/:bookingId/cancel` は `requireAuth` のオーナー専用 API(PR #41 由来、ゲストの自己キャンセルは方針として不可・変更なし)で、UI(ゲスト向け・オーナー向けとも)は一切存在しない。decision-maker からの明示再開指示があるまで着手不要)

## 進行中の tasks

- [x] PR1: mirror の空き枠から自前の確定予約を差し引く + Firestore mapper 一本化(PR #193 マージ済み、2026-07-26)
- [x] Phase 0: OAuth 連携可否・Testing mode 確認・Busy 動作の実測検証(2026-07-26 完了)
- [x] PR2-a〜g: データモデル拡張・`createBlockEvent`(transient/permanent エラー分類・`AbortSignal` によるタイムアウト)・POST `/book` 同期組み込み・キャンセル時削除・管理画面 UI・テスト・仕様書更新(PR #206、2026-07-26 マージ済み)
- [x] 実機検証で発覚した「相互共有カレンダーによる accountId 取り違えバグ」を `calendar-dedup.ts` で修正
- [x] `/code-review medium` 指摘3件(タイムアウト時の重複イベント・PATCH partial update テスト不足・レイテンシ直列化)を修正済み
- [x] API p99 レイテンシアラートの閾値を新しい設計(block event 同期作成で正常系 2〜3秒)に合わせて 3000ms→10000ms へ調整済み
- [ ] AC-8 実機検証: 予約キャンセル → block event 削除 → Google 予約ページで枠復活の確認 — **ペンディング(decision-maker 明示、2026-07-27)。明示再開指示があるまで着手不要**

## 🔄 中断点(in-flight)

なし。PR2 は実装・実機検証(作成側)・レビュー・マージ・本番デプロイまで完了。キャンセル側(AC-8)の実機検証は decision-maker の明示判断によりペンディング(2026-07-27)。次セッションは明示の再開指示があるまで着手不要。
