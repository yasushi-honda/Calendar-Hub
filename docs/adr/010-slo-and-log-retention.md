# ADR-010: SLO 定義とログ保持ポリシー

- Status: Accepted（設計）/ 実装は次フェーズ
- Date: 2026-05-03
- Issue: #81

## Context

本番運用に入った Calendar Hub には以下が未整備で、運用判断の定量的基準と障害解析の前提が欠落している。

1. **SLO (Service Level Objective) 未定義**: 「許容できる不調」の定量的基準がない。サービス停止が短時間でも長時間でもユーザー対応の優先度が変わらない
2. **Error Budget 未定義**: リリース速度と安定性のトレードオフを意思決定する基準がない
3. **ログ保持 30 日（GCP デフォルト）**: 障害解析で「先月の事象」を追えない。監査・規制対応の準備もない
4. **個人情報マスクポリシー未策定**: 介護記録系プロジェクトで適用した ismap 準拠の経験 ([feedback_ismap_gcp_only.md](../../memory/feedback_ismap_gcp_only.md)) を Calendar Hub 文脈で再評価する必要

ADR-006（API 健全性アラート）で「アラート」までは整備済みだが、それを支える SLO/SLI/エラー予算の枠組みが未定義のため、アラートの閾値判断が経験則に頼っている。

## Decision

### 1. SLO（Service Level Objectives）

| サービス                  | SLI                | SLO                    | 計測ウィンドウ  |
| ------------------------- | ------------------ | ---------------------- | --------------- |
| API（`calendar-hub-api`） | HTTP 5xx 率 ≦ 0.5% | **稼働率 99.5%/月**    | rolling 30 日   |
| API レイテンシ            | p95 ≦ 1.0 s        | **p95 1.0 s 以内 95%** | rolling 30 日   |
| Sync ジョブ               | 失敗率 ≦ 1%        | **成功率 99%/日**      | rolling 24 時間 |
| Web（`calendar-hub-web`） | HTTP 5xx 率 ≦ 0.5% | **稼働率 99.5%/月**    | rolling 30 日   |

99.5% は `min-instances=0` の cold start 起動失敗を見越した現実的水準。`min-instances` を上げる場合は SLO 99.9% への引き上げを検討する（引き上げ判断はコスト試算 + Error Budget 実績の振り返りを伴うため別 ADR で記録する）。

### 2. SLI 計測（Cloud Monitoring）

各 SLI は Cloud Monitoring で MQL（Monitoring Query Language）または PromQL で定義。実装は次フェーズで `infra/monitoring/` 配下に terraform/yaml 化予定。

| SLI                | 取得元メトリクス（実装方針）                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API 5xx 率         | `run.googleapis.com/request_count` を `response_code_class` で分類                                                                                                  |
| API p95 レイテンシ | `run.googleapis.com/request_latencies` を `ALIGN_PERCENTILE_95` aligner で集計（ADR-006 の p99 設定と同パターン、`infra/alert-policies/api-latency-p99.yaml` 参照） |
| Sync 成功率        | ログベースメトリクス（`textPayload:"[SYNC-GAP]"` / `"Sync failed for"` を分母に対して分子化）                                                                       |

### 3. Error Budget

**Error Budget（月次）**:

- API: `(1 - 0.995) × 30 days = 3.6 時間`
- Sync: `(1 - 0.99) × 24 hours = 14.4 分/日`

**Error Budget 残量による運用ルール**:

| 残量       | 状態     | 運用判断                                                                 |
| ---------- | -------- | ------------------------------------------------------------------------ |
| 100% – 50% | Healthy  | 通常リリース可                                                           |
| 50% – 25%  | Caution  | リスクの高い変更（DB schema・暗号化キー rotate 等）はレビュー強化        |
| 25% – 0%   | At Risk  | 機能追加よりも信頼性向上を優先（インシデント原因の対処を新規機能に先行） |
| 0% 超過    | Exceeded | 機能リリース凍結、原因の修正と再発防止のみ                               |

「凍結」の判断は ADR で記録し、解除条件（Budget 50% まで回復 / 修正完了）も同時に記載する。

### 4. ログ保持ポリシー

| カテゴリ                                               | バケット名（実装方針）                             | 保持期間      | 用途                             |
| ------------------------------------------------------ | -------------------------------------------------- | ------------- | -------------------------------- |
| sync 関連（`[SYNC-GAP]`/`[RRULE-SKIP]`/`Sync failed`） | `_Default` から sink で `sync-logs` バケットに分離 | **90 日**     | 障害解析・データ整合性の事後検証 |
| 認証関連（`/api/auth/*`、TimeTree session）            | 同上 → `auth-logs` バケット                        | **180 日**    | 不正利用調査・規制対応           |
| その他（`_Default`）                                   | `_Default` バケット                                | 30 日（既定） | 一般デバッグ                     |

**長期保管**: 監査要件が出た時点で BigQuery sink を追加（コスト最小化）。本 ADR では sink 構成のみ設計し、実 BigQuery dataset 作成は将来作業とする。

### 5. 個人情報マスクポリシー

Calendar Hub は予定本文・メールアドレスを扱うが、本番のロギング規則は以下:

- **PII（メール / 名前 / 予定タイトル）はログに書かない**: `console.error('Sync failed for', email)` のような直書きを禁止
- 必要な場合は **userId（Firebase UID）+ accountId** で識別（既存 token-store のパターンを踏襲）
- 例外的に PII を残す場合は、`Sensitive Data Protection (DLP) sink` または Cloud Logging の `Log Field Redaction` を `auth-logs` バケットに適用（具体機能の選定は実装フェーズで再検証）

ismap 準拠は本プロジェクトでは要求されていない（カレンダー連携であり、介護記録のような医療・福祉情報ではない）が、最小権限・GCP 内完結の方針は維持する。

## Consequences

### 期待される効果

- アラート閾値（ADR-006）の根拠が SLO に紐づき、運用議論が定量化される
- Error Budget で「リリース速度 vs 安定性」のトレードオフを意思決定できる
- 90 日 / 180 日のログで「先月のサポート問い合わせ」を解析可能
- マスクポリシーで PII 漏洩リスクを抑制

### コスト影響

- ログ保持延長（30 → 90/180 日）でストレージコスト増（推定数 USD/月、現状規模では微小）
- BigQuery sink を作るとさらにコスト増（クエリ従量）。本 ADR では作らない判断
- Cloud Monitoring SLI は `run.googleapis.com` メトリクスを使うため追加コスト発生せず

## 実装フェーズ（次セッション以降、ユーザー認可必須）

本 ADR は **設計のみ**。以下の実装は別セッションで行う:

1. **ログバケット作成 + sink 設定**: `sync-logs`（90 日）, `auth-logs`（180 日）バケットを作成し、ログフィルタで sink
2. **SLI / SLO の Cloud Monitoring 設定**: terraform / yaml で `monitoring.googleapis.com/v3/services/{service}/serviceLevelObjectives` を定義
3. **ダッシュボード作成**: SLI 4 種を 1 ダッシュボードに集約
4. **Error Budget アラート**: Budget 50% / 25% / 0% で通知ポリシー追加
5. **PII 直書き検知**: PR レビュー時のチェックリスト化、または静的解析で検出

各実装は本番 GCP への変更を伴うため、ユーザーから個別認可を取った上で実施する。

## 関連

- Issue #81
- ADR-006（API 健全性アラート）— SLI/SLO の前段
- ADR-009（TimeTree session management）— 構造化ログプレフィックスの先行例
