# Calendar Hub ハンドオフ (2026-06-25)

## 2026-06-25 セッション総括: Google 予約スケジュール read-only ミラー化

`https://calendar.app.google/qyKq3kU2sX9e2vid7` (本田様の Google Appointment Schedule) を Calendar Hub の **read-only ミラー** として本田様用に提供する機能を、PR #138 / #139 / #140 の 3 連続 PR で実装・本番化。

| PR   | 内容                                                                                 | 規模               | 結果              |
| ---- | ------------------------------------------------------------------------------------ | ------------------ | ----------------- |
| #138 | Read-only ミラー機能 (`autoCreateCalendarEvent` / `calendarIdsForAvailability` 追加) | 7 files / +852/-59 | ✅ merge + deploy |
| #139 | nodemailer SMTP → Gmail API 移行 (535 認証エラー解消)                                | 7 files / +296/-57 | ✅ merge + deploy |
| #140 | 予約通知メール日時表記 12:00:00 → 12:00                                              | 2 files / +135/-13 | ✅ merge + deploy |

**副次効果**: PR #139 の nodemailer 依存削除により、Dependabot CI failure 1 件 (nodemailer) が自動解消。

### 本田様用予約リンク (本セッション内で本番に作成)

| 項目     | 値                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 公開 URL | https://calendar-hub-web-cu7tz7flqq-an.a.run.app/book/24Q1g69sDJi2                                                                |
| linkId   | `24Q1g69sDJi2`                                                                                                                    |
| 主な設定 | 60 分 / `autoCreateCalendarEvent=false` / `calendarIdsForAvailability=["yasushi.honda@aozora-cg.com"]` / 8-23 時 / 全曜日 / 30 日 |

### 実機検証結果

| AC                                                  | 状態             | 確認方法                                                                                        |
| --------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| AC-6 (空き時間表示)                                 | ✅ PASS          | Playwright で複数日付の枠表示確認                                                               |
| AC-7 (オーナー通知メール `hy.unimail.11@gmail.com`) | ✅ PASS          | 本田様 Gmail スクショで 3 件届いた                                                              |
| 日時表記 fix (12:00:00 → 12:00)                     | ✅ PASS          | 本田様 Gmail スクショで「2026/6/29 14:00 〜 15:00」確認                                         |
| AC-8 (Google Calendar に event 追加なし)            | ⏸ 本田様目視待ち | `yasushi.honda@aozora-cg.com` の Google Calendar で 6/27 10:00 / 6/28 12:00 / 6/29 14:00 を目視 |

テスト予約 3 件 (`VOpHhLeg-XI7` 6/27 10:00 / 6/28 12:00 / 6/29 14:00) が本番 Firestore に残存。予約管理 UI が無いためキャンセル不能 (要別 PR)。

### 同根再発スキャン (§ 4.6)

- PR #139 と PR #140 は同じファイル `apps/api/src/lib/email.ts` を触ったが root cause は別:
  - #139: OAuth scope (`gmail.send`) と nodemailer SMTP (`mail.google.com/` 必要) の不一致
  - #140: `toLocaleString` のオプション未指定で秒まで展開
- 過去 7 日 handoff archive に email/smtp 関連の同根候補なし
- **同根再発なし** ✅

### 対症療法判定 (§ 4.7)

- PR #139: 構造的修正 (nodemailer SMTP → Gmail API への実装方式切替)。retry/fallback ではない。対症療法ではない ✅
- PR #140: cosmetic fix だが root cause (`toLocaleString` のオプション未指定) を直接修正。対症療法ではない ✅

## 最近の完了作業（直近 1 週間）

| PR   | Issue | 内容                                                  |
| ---- | ----- | ----------------------------------------------------- |
| #140 | -     | 予約通知メール日時表記 12:00:00 → 12:00               |
| #139 | -     | nodemailer SMTP → Gmail API 移行 (535 認証エラー解消) |
| #138 | -     | Read-only ミラー機能                                  |

それ以前は前 LATEST.md (2026-05-18 セッション) の「最近の完了作業」テーブル参照。本セッションのコミット範囲外。

## 品質状態

- テスト: **305 件 PASS** (今セッション +35 件追加: AC-1〜AC-5 + `buildMimeMessage` + `formatJst*` + Booking builders + Partial Update + Gaxios エラー分類)
- ビルド: 全 5 パッケージ成功
- CI: GitHub Actions グリーン (最新: `2943b9e` / 2026-06-25)
- main HEAD: `2943b9e fix(email): 予約通知メールの日時表記から秒を削除 (#140)`

## 本番環境

| サービス | URL                                              |
| -------- | ------------------------------------------------ |
| Web      | https://calendar-hub-web-cu7tz7flqq-an.a.run.app |
| API      | https://calendar-hub-api-cu7tz7flqq-an.a.run.app |

- GCP: `calendar-hub-prod` / asia-northeast1
- 本セッション内 Deploy run: 3 回成功 (PR #138 / #139 / #140 マージ各タイミング)
- メール送信: Gmail API (`gmail.users.messages.send`) 経由。OAuth scope は既存の `gmail.send` のまま動作 (PR #139 以降)

## オープン Issue

### Active

- [#79](https://github.com/yasushi-honda/Calendar-Hub/issues/79) [P2] TimeTree session 切れの自動検知と再ログイン手順整備 (Phase A 完了)
- [#81](https://github.com/yasushi-honda/Calendar-Hub/issues/81) [P2] ログ保持期間・SLO 定義 (設計フェーズ完了)

### Postponed

- [#75](https://github.com/yasushi-honda/Calendar-Hub/issues/75) [P1] 公開予約ページ E2E テスト (decision-maker 判断で保留継続)

**本セッションで Issue 起票・close なし** (Issue Net: 0)。

## 本セッション中に判明した残課題

| 課題                                               | A/B/C      | 着手条件                                                 |
| -------------------------------------------------- | ---------- | -------------------------------------------------------- |
| AC-8 verify (Google Calendar に event 追加なし)    | A 確認     | 本田様の目視確認のみ                                     |
| **予約管理 UI 追加** (テスト予約 3 件のキャンセル) | C 起点待ち | decision-maker の明示指示                                |
| `ownerDisplayName` 空文字 bug                      | C 起点待ち | decision-maker の明示指示 (実害低)                       |
| vitest が `dist/` を拾う問題                       | C 起点待ち | decision-maker の明示指示 (`dist/` 削除で回避可)         |
| Dependabot ws CI failure                           | C 起点待ち | decision-maker の明示指示 (overrides 等の手動介入が必要) |

## 次セッションのアクション (§ 2.5 3 分割構造)

### 即着手タスク

**なし** — 本セッション内で executor 領分の作業はすべて完了。

### 条件待ち (明示 trigger 付き)

| #   | 項目                           | trigger                                                                                                                          | 充足時のタスク                                                                                                     |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | AC-8 verify                    | 本田様の `yasushi.honda@aozora-cg.com` Google Calendar で 6/27 10:00 / 6/28 12:00 / 6/29 14:00 に event が**ない**ことを目視確認 | 結果報告 → セッション完全終了宣言                                                                                  |
| 2   | テスト予約 3 件のキャンセル    | 予約管理 UI 実装後 (#3 によって解消されてから)                                                                                   | 管理画面から手動キャンセル                                                                                         |
| 3   | Issue #79 Phase B 着手指示     | decision-maker からの「Phase B 進めて」明示指示                                                                                  | log-based metric `calendar_hub_timetree_session_expired` + alert policy 追加。ADR-009 Future Work 参照             |
| 4   | Issue #81 実装フェーズ着手指示 | decision-maker からの「#81 実装」明示指示                                                                                        | 5 サブタスク (バケット作成 / SLI/SLO 設定 / ダッシュボード / Budget アラート / PII 検知)。ADR-010 実装フェーズ参照 |

### 却下候補 (記録のみ)

| 項目                                         | 理由                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 予約管理 UI 追加                             | C カテゴリ (起点アイデア decision-maker 領分)。明示指示なき限り着手不可                    |
| `ownerDisplayName` 空文字 bug 修正           | C カテゴリ。実害低 (表示空のまま動作継続、UX 影響軽微)                                     |
| vitest が `dist/` を拾う問題                 | C カテゴリ。`dist/` 削除で回避可能、CI 環境では dist 生成しないため影響なし                |
| Dependabot ws (security_update_not_possible) | C カテゴリ + pnpm overrides の手動設計が必要、影響は dev-only                              |
| Node.js 20 → 24 移行 (2026-09-16 まで)       | 前 LATEST.md 持ち越し、decision-maker 領分                                                 |
| `[MAIL-FAIL] kind=AUTH` 発生時の UI 通知昇格 | 前 LATEST.md 持ち越し、Issue #74 関連 (現状: PR #139 で AUTH エラー自体が発生しなくなった) |

## Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0 件**

triage 基準 (CLAUDE.md GitHub Issues §) に照らし、起票見送り判断:

- 予約管理 UI / `ownerDisplayName` / vitest dist / Dependabot ws はいずれも rating 5-6 相当の改善提案。実害基準 (#1) / 再現バグ基準 (#2) / CI 破壊基準 (#3) / rating ≥7 confidence ≥80 基準 (#4) / ユーザー明示指示基準 (#5) のいずれも満たさない
- AC-8 verify は本田様目視タスクで Issue 化不要

## 最終結論

✅ **セッション終了可**

- OPEN PR: 0 件 (#138/#139/#140 全 merge + deploy 完了)
- main clean (HEAD = `2943b9e`)
- 残留プロセスなし
- 即着手タスク: 0 件
- 条件待ち: 4 件 (すべて trigger 未充足、decision-maker 判断待ち)
- 実機 verify: AC-6 / AC-7 / 日時表記 fix ✅、AC-8 のみ本田様目視待ち (executor 領分外)
- § 4.6 同根再発スキャン: 該当なし
- § 4.7 対症療法判定: 該当なし

---

# 以下、過去セッション (2026-05-18 まで) の参照情報

## MVP 実装状況

| 機能                                 | 状態              |
| ------------------------------------ | ----------------- |
| Firebase Auth + Google OAuth         | ✅ 完了           |
| Google Calendar / TimeTree 統合      | ✅ 完了           |
| 統合カレンダー UI                    | ✅ 完了           |
| Vertex AI 提案 (Gemini 2.5 Flash)    | ✅ 完了           |
| メール通知 (Gmail API 経由、PR #139) | ✅ 完了           |
| 公開予約リンク (Calendly ライク)     | ✅ 完了           |
| Google 予約 read-only ミラー化       | ✅ 完了 (PR #138) |
| カレンダー同期 (extendedProps)       | ✅ 完了           |
| 全日イベント同期 (TZ 対応)           | ✅ 完了 (#58/#59) |
| syncIntervalMinutes スケジューラ     | ✅ 完了 (#53)     |
| timeMax 月末バグ                     | ✅ 完了 (dd241df) |
| 繰り返しイベント同期 (RRULE 展開)    | ✅ 完了 (#61/#64) |

## 過去セッションの技術メモ参照先

過去セッションの技術メモ (gcloud JMESPath 風 filter pitfall / TimeTree 2 日間終日 / Dependabot 運用 / rrule 座標系 / Cloud Run built-in metrics / Gmail 送信失敗可視化 / Firestore Backup / アラート E2E / RRULE 展開実装) は本ファイルの過去版 (`git log -- docs/handoff/LATEST.md`) で参照可能。

主要 ADR:

- ADR-005: CI/CD 自動デプロイ + `promote-traffic.sh` (PR #126 で trafficSplit 昇格保証)
- ADR-006: Monitoring (7 alert policies)
- ADR-007: Firestore PITR + バックアップ
- ADR-008: RRULE JST wall-clock 座標系
- ADR-009: TimeTree session management
- ADR-010: SLO + ログ保持 (設計フェーズ)
- ADR-011: TimeTree 2 日間終日「判別不能」確定

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In 有効化済み
- gcloud named config: `calendar-hub`

## 運用メモ

- **GCP アカウント**: gcloud 操作時は `hy.unimail.11@gmail.com` に切り替え必要 (本プロジェクトは `.envrc` で `calendar-hub` named config が自動 active)
- **デプロイ**: main push → `.github/workflows/deploy.yml` (quality → deploy-api → deploy-web) → `infra/promote-traffic.sh` で LATEST 昇格 + jq 検証
