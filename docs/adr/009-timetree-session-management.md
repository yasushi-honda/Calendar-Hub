# ADR-009: TimeTree session 切れの可視化と運用手順

- Status: Accepted
- Date: 2026-05-03
- Issue: #79

## Context

TimeTree は非公式 Web API 利用のため、`_session_id` cookie が約 14 日で期限切れになる。session 切れの兆候は `TimeTreeAdapter` 内では既に 401/403/400 を捕捉して再ログイン経路を持つが、本番運用上以下が未整備だった。

1. **可視化欠落**: 401/403 検出時のログが無く、Cloud Logging から「session 切れ」を抽出できない
2. **再ログインの実行経路が不明瞭**: `reLoginFn` を渡せる API 設計だが、`apps/api/src/lib/adapter-factory.ts:36` では `new TimeTreeAdapter(session)` と `reLoginFn` 未注入
3. **構造的制約**: `/connect/timetree` 経由の本番認証は **ユーザーが email/password を都度入力** する設計で、password は永続化しない（`apps/api/src/routes/auth.ts:162-176`）。したがって session 切れ時の **自動再ログインは技術的に不可能**

### 採れない選択肢

- ❌ password を Firestore に encrypted で保存して reLoginFn 経由で再ログイン
  → 不可逆な認証情報の長期保管はリスク増、既存設計の意図とも反する
- ❌ password を Secret Manager で集約管理
  → ユーザーごとに異なる、Secret Manager の用途と合わない

## Decision

### 1. 観測点プロトコル

`TimeTreeAdapter.fetchWithRetry` / `refreshSession` で以下の構造化ログを必ず出力する。

| ログプレフィックス             | レベル | 出力タイミング                      | 含めるフィールド                                                                   |
| ------------------------------ | ------ | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `[TT-SESSION-EXPIRED]`         | warn   | `expiresAt` 経過 / 400/401/403 受信 | `reason=expiresAt\|httpStatus`, `url`, `status`(httpStatus 時), `reLoginAvailable` |
| `[TT-SESSION-RELOGIN-ATTEMPT]` | info   | `reLoginFn` 起動直前                | —                                                                                  |
| `[TT-SESSION-RELOGIN-OK]`      | info   | `reLoginFn` 成功                    | `expiresAt`                                                                        |
| `[TT-SESSION-RELOGIN-FAIL]`    | error  | `reLoginFn` 失敗                    | `error` メッセージ                                                                 |

ログは `console.warn/info/error` で stdout/stderr に出し、Cloud Logging に自動収集される（既存の `[RRULE-SKIP]` パターンを踏襲）。

### 2. 本番運用手順（再ログイン）

session 切れが検出された場合のユーザー対応フロー:

1. ユーザーが Web アプリ「連携アカウント設定」画面を開く
2. TimeTree アカウントを **再連携**（既存の `/connect/timetree` ルートが新規 session を上書き保存）
3. session 切れ後の同期ジョブは次回スケジューリング時に新 session で復帰

### 3. Secret 配置

| Secret 名           | 用途                          | 補足                                   |
| ------------------- | ----------------------------- | -------------------------------------- |
| `timetree-password` | 開発/管理者テストアカウント用 | プロダクション一般ユーザーには使わない |
| ユーザー password   | **永続化しない**              | `/connect/timetree` で都度入力         |

### 4. reLoginFn の wiring 方針（現状）

`apps/api/src/lib/adapter-factory.ts` では `reLoginFn` を **意図的に渡さない**（永続化された再ログイン情報がないため）。`refreshSession` は呼ばれず、上位レイヤー（sync ジョブ）で 401 由来の例外をハンドリングし、ユーザー再連携を待つ運用とする。

将来、管理者テストアカウント用に `timetree-password` を使った reLoginFn を限定的に注入する場合は、accountId 単位で識別したうえで wiring する。

## Consequences

### 期待される効果

- Cloud Logging で `[TT-SESSION-EXPIRED]` を抽出すれば期限切れ件数を時系列で把握できる
- ログベースメトリクス + アラートポリシー（次セッション以降で実装）の前提が整う
- ADR 化により再ログイン UI 経路がコード読まずに把握できる

### トレードオフ

- 自動再ログインは依然不可能（password 永続化しない設計の延長）
- ユーザーには 14 日ごとの再連携が暗黙的に必要

## 実装済み (本 ADR の後続作業)

- ✅ ログベースメトリクス `calendar_hub_tt_session_expired` 作成 (PR #150、`infra/setup-monitoring.sh`)
- ✅ アラートポリシー (`infra/alert-policies/tt-session-expired.yaml`)
  - 初期実装 (PR #150): プロジェクト全体集計、24h 内 3 件以上で発報、displayName `(24h ≥ 3)`
  - **per-account 化 (本 ADR Future Work 実装、後続 PR)**: ログに `accountId=...` を追加し、`metric.label.accountId` で groupBy。閾値を 1+/24h、displayName `(per account, 24h)` に変更
- ✅ `TimeTreeAdapter` constructor の options object 化 (`{ accountId: string; reLoginFn?: TimeTreeReLoginFn }`)
  - 設計判断: required `accountId` を後付けする際、第3引数に required を置くと TypeScript で `(s, reLoginFn?, accountId)` が型として破綻するため options object を採用。将来 `userId` / `logger` 追加時の拡張性も確保 (Codex review 指摘)
- ✅ log-based metric への label extractor 後付け
  - `labelExtractors.accountId: REGEXP_EXTRACT(textPayload, "accountId=([^ ]+)")` で抽出
  - GCP 仕様: 既存ラベルは追加可能・削除/変更不可。本実装は新規ラベル追加のみで非破壊更新
  - `setup-monitoring.sh` の `create_or_update_metric` を 4 引数化 (第4引数 `labels_yaml` で labelExtractors + metricDescriptor.labels を `--config-from-file` 経由で適用)
- ✅ 旧 alert policy の冪等 cleanup
  - displayName 変更を伴うため、`setup-monitoring.sh` に `cleanup_legacy_policy` 関数を追加。1 回目で旧 displayName `(24h ≥ 3)` を削除、2 回目以降は no-op

## Future Work

- Web UI の連携アカウント設定画面で **session 残日数バッジ**表示 (`expiresAt` を Firestore に保存して算出)
- session 切れ通知メール (任意機能、admin 宛 alert からエンドユーザー直接通知への展開)

### 既存ロジックの強化候補（本 ADR スコープ外、将来検討）→ ✅ 実装完了 (PR #184、2026-07-19)

PR #111 のレビューで silent-failure-hunter が指摘した既存実装の改善候補。

- ✅ **再ログイン後 fetch のステータスチェック追加**: `fetchWithRetry` の再試行側で `res.ok` を検証し、失敗時は `[TT-SESSION-RELOGIN-INEFFECTIVE]` をログ出力するよう変更
- ✅ **400/401/403 のエラー分類精緻化**: reLogin 試行を `401` 限定に変更。`400`(request malformed)/`403`(権限不足) は permanent error として即座に返却し、`rules/error-handling.md §3` の transient/permanent 分類に整合
- ✅ **reLoginFn 不在時の 401 を明示 throw**: `TimeTreeSessionExpiredError`（`packages/calendar-sdk` の public export）を新設し throw。上位レイヤーが汎用エラーと区別して「session 失効」を識別可能に

## 関連

- Issue #79
- 過去 Issue #24（closed）: TimeTree session 有効期限管理の初期検討
- PR #184: 既存ロジックの強化候補 3 件の実装
