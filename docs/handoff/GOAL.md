---
updated: 2026-07-26
---

## 現在のミッション

booking-mirror C1 拡張(予約成立時に Google カレンダーへ block event を自動作成し、二重予約リスクを縮小する)を実装する。

## 背景・why

Google Appointment Schedule の空き枠をミラーする booking-mirror 機能では、Calendar Hub 経由の予約が Google 側に反映されず、同じ枠が Google 経由で別予約されると二重予約になるリスクがある(仕様書 `docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md` §9.1 で C2=リスク受容として意図的に未実装)。2026-07-26 セッションで decision-maker が「C1 着手」を明示指示。

C1 実装には対象 Google アカウントの OAuth 再連携(`calendar.events` write 権限)が前提だが、本田様の方針で当該連携は削除済み。この前提確認(Phase 0)が完了するまで PR2(C1 本体)は着手できない。

計画全文: `~/.claude/plans/iterative-riding-hummingbird.md`(PR1/PR2 分割・Phase 0 手順・Acceptance Criteria を含む)。

## 完了の定義

- [ ] Phase 0 完了: 対象 Google アカウントの OAuth 再連携(`calendar.events` write 権限)、consent screen の publishing status が Testing でないこと、Busy イベントで Google 予約ページの枠が消えることを確認済み(証明: 本田様による手動確認 + `curl .../slots` を手動イベント作成の前後で実行し該当枠が消えることを確認)
- [ ] PR2 実装完了: `BookingMirrorLink` に `blockCalendarId`/`blockAccountId`/`autoCreateBlockEvent` 追加、POST `/book` で `createBlockEvent` を同期実行、silent failure 検出(`created`/`created_unverified`/`failed` の3値記録)、キャンセル時の block event 削除を含む(証明: `pnpm test && pnpm lint && pnpm turbo type-check && pnpm turbo build` 全 PASS)
- [ ] 実機で予約すると Google 予約ページから当該枠が消え、`blockEventStatus='created'` になる(証明: `curl .../slots` を予約の前後で実行 → 該当 `start` が消える + Firestore document 確認)
- [ ] 予約をキャンセルすると block event が削除され枠が Google 予約ページに戻る(証明: cancel API 実行 → `curl .../slots` で該当 `start` が復活)

## 進行中の tasks

- [x] PR1: mirror の空き枠から自前の確定予約を差し引く + Firestore mapper 一本化(PR #193 マージ済み、2026-07-26)
- [ ] Phase 0: OAuth 連携可否・Testing mode 確認・Busy 動作の実測検証 — decision-maker 作業(ブラウザでの認証操作を伴う)
- [ ] PR2-a: データモデル追加(`BookingMirrorLink`/`Booking` 型拡張)、`CreateEventInput`/`UpdateEventInput` への `transparency` 追加
- [ ] PR2-b: `createBlockEvent` ロジック実装(transient/permanent エラー分類、adapter DI 可能な形での切り出し)
- [ ] PR2-c: POST `/book` への同期組み込み + silent failure 検出(実行時 slot 再検証)
- [ ] PR2-d: キャンセル時の block event 削除
- [ ] PR2-e: 管理画面 UI(新規作成フォーム + 一覧カードへの設定追加)
- [ ] PR2-f: テスト・ドキュメント更新(仕様書 §9.1 の C2→C1 移行記録)

## 🔄 中断点(in-flight)

なし(PR2 は未着手。Phase 0 が decision-maker 側の確認待ちのため、自然な区切りでセッションを終えている)
