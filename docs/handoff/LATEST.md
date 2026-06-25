# Calendar Hub ハンドオフ (2026-06-26)

## 2026-06-26 セッション総括 (第 5 編): Issue #81 完全完了 + ADR-009 Future Work 実装

第 4 編からの continuation。本田様の `/catchup` → idle 判定 → 「Vertex AI 使ってる?」確認 → 「他にすることは?」→ handoff 提案 (PR #152) → 「Issue #81 / ADR-009 Future Work 起点指示」→ ADR-009 先 (PR #153) → Issue #81 3 PR sequence (a/b/c = #154/#155/#156) の流れ。

### PR 一覧

| PR   | 内容                                                            | 規模               | 結果     |
| ---- | --------------------------------------------------------------- | ------------------ | -------- |
| #152 | docs(handoff): 第 4 編 update (PR #150 本番適用完了)            | 1 file / +41/-14   | ✅ merge |
| #153 | feat: ADR-009 Future Work — per-account TimeTree session alert  | 6 files / +160/-44 | ✅ merge |
| #154 | feat(infra): log retention buckets + sinks (Issue #81 a)        | 1 file / +132/-4   | ✅ merge |
| #155 | feat(infra): Cloud Monitoring SLI/SLO definitions (Issue #81 b) | 8 files / +281/-6  | ✅ merge |
| #156 | feat(infra): SLI/SLO dashboard (Issue #81 c)                    | 3 files / +284/-1  | ✅ merge |

### ADR-009 Future Work 実装 (PR #153)

- `TimeTreeAdapter` constructor を options object 化 (`{ accountId, reLoginFn? }`) + 空文字 guard
- `[TT-SESSION-EXPIRED]` ログに `accountId=...` 埋め込み (prefix 直後)
- log-based metric `calendar_hub_tt_session_expired` に label extractor 後付け (`REGEXP_EXTRACT(textPayload, "accountId=([^ ]+)")`)
- alert policy を per-account 集計 (groupByFields: metric.label.accountId、threshold 1+/24h) に変更
- `setup-monitoring.sh` に旧 displayName policy 削除の冪等 cleanup 追加
- ADR-009 Future Work → 実装済み移動 + Codex / silent-failure-hunter / type-design-analyzer 指摘の修正 audit trail

### Issue #81 完全完了 (PR #154/#155/#156)

ADR-010 §1-4 設計通り 3 段階で実装:

- **(a) Log retention** (PR #154): sync-logs (90d) / auth-logs (180d) buckets + 同名 sinks。`_Default sink` と並行運用 (新 sink は抑止せず、storage コスト延長分のみ加算)
- **(b) SLI/SLO** (PR #155): 4 SLO (API 稼働率 99.5%/月 / API p95 1s / Sync 99%/day / Web 稼働率 99.5%/月) + Custom Monitoring Services 2 つ。gcloud CLI 非対応のため REST API + curl 経由
  - Sync SLO は Pragmatic 実装: 総 sync 数メトリクス未整備のため `windowsBased.metricSumInRange` で 1h 単位 failure 0 件を good window と近似 (将来 `calendar_hub_sync_attempt` 追加後に true 成功率 SLO へ置換予定)
- **(c) Dashboard** (PR #156): 7 widget mosaic dashboard (12 col grid、4 行構成、SLI 4 種 + 関連メトリクス集約)

ADR-010 を「Accepted (設計)」→「Accepted (設計 + 一部実装中)」に更新、Status 進捗を反映。

### /codex review が捕捉した本番 apply blocker 5 件 (記録)

PR #155 / PR #156 で /codex review が schema 不正を検出、merge 前に修正:

- **PR #155**: Custom Service body の `"custom": {}` identifier 欠落 → 追加 (Service POST 400 回避)
- **PR #155**: SLI filter `resource.label.X` / `metric.label.X` → `resource.labels.X` / `metric.labels.X` (複数形必須)
- **PR #155**: Sync SLO の `metricSumInRange` が MetricKind=GAUGE を要求の可能性 → TODO 記録、実機 apply 時 fallback 計画
- **PR #156**: XyChart `thresholds` の `color` / `direction` は schema 不正 → `value` / `label` のみに削減
- **PR #156**: `timeshiftDuration: 0s` は LINE plot のみ、STACKED_AREA で使用不可 → 削除

教訓 (本セッション内 audit trail として記録、global memory 化対象外: REST API + curl IaC pattern は本 PJ 固有):

- gcloud CLI で構文チェック不可な REST API + curl ベース IaC は複数 reviewer (特に Codex の schema 知識) を必ず通す
- Cloud Monitoring filter は `*.labels.X` (複数形) が正規 (PR #154 から学んだ syntax を PR #155/#156 で一貫適用)

### Issue Net 変化 (第 5 編)

- Close 数: **1 件** (#81 — 3 PR 合計で完了)
- 起票数: 0 件
- **Net: -1 (進捗あり)**

本日通算 (第 3-5 編、6/25-6/26): Issue Close **3 件** (#145 / #79 / #81)、PR merge **8 件** (#148/#149/#150/#152/#153/#154/#155/#156)、グローバル memory 3 件追加 (第 3 編)、ADR-009 / ADR-010 実装フェーズ進捗大幅

### 同根再発スキャン (§ 4.6)

本セッション内: PR #152-156 すべて `feat:` / `docs:` 系、修正 PR ゼロ (各 PR 内の review fix commit は同 PR scope 内)、過去 7 日 archive grep で同根 keyword なし。**同根再発候補 0 件** ✅

### 対症療法判定 (§ 4.7)

修正 PR ゼロ → スキップ ✅

### グローバル memory scope (§ 4.5)

git status memory ファイル変更なし → スキップ ✅

### 構造的整合性 (§ 4)

| 項目                               | 判定                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 型・共有ロジック・設定ファイル変更 | ✅ TimeTreeAdapter constructor 変更 (PR #153)、call site 単一 (adapter-factory.ts) のみで全箇所更新済み |
| 新規テーブル / API 追加            | ⏭️ なし (Cloud Monitoring resources 追加のみ、アプリケーション API 変更なし)                            |
| データフロー実装                   | ⏭️ なし                                                                                                 |

---

## 2026-06-25 セッション総括 (第 4 編): PR #150 本番適用

第 3 編で merge 済みだった PR #150 (TimeTree session expired alert) を本田様の手元で `bash infra/setup-monitoring.sh` 実行し本番適用完了。

### 適用結果

| 項目                                                                       | 状態                                        |
| -------------------------------------------------------------------------- | ------------------------------------------- |
| 新規 log metric `calendar_hub_tt_session_expired`                          | ✅ Created                                  |
| 新規 alert policy `[Calendar Hub] TimeTree session expired (24h ≥ 3)`      | ✅ Created (id: 14975889720450637168)       |
| 既存 4 metrics + 7 policies                                                | ✅ Updated (冪等、実質 no-op)               |
| Notification channel `projects/.../11987628746704320713` (hy.unimail.11..) | ✅ 既存 channel 流用 (過去に VERIFIED 済み) |

本セッションでは alert 稼働開始のみ。Vertex AI SDK 移行確認 (catchup 監視中項目) も実施し、`@google/genai` v1.46.0 への移行は完了済み (旧 `@google-cloud/vertexai` 不使用) を確認。

### Issue Net 変化 (第 4 編)

- Close 数: 0 (第 3 編で #145 + #79 既に close)
- 起票数: 0
- **Net: 0 (前セッション分の +2 close は維持)**

### 同根再発 / 対症療法判定 (§ 4)

⏭️ スキップ (本セッションは IaC apply のみ、コード変更なし)

---

## 2026-06-25 セッション総括 (第 3 編 update): Issue #145 + #79 完全解消 + memory 3 件 + ADR-009 Future Work 実装

本田様の `/catchup` → Issue #145 着手 → 完了 → ctx 余裕で memory 追記 + handoff doc → 更に Issue #79 / #81 起点指示 → 実態調査で「両者大部分実装済み」を発見 → #79 alert 1 件のみ最小スコープ着手の流れ。

| PR   | 内容                                                                                  | 規模               | 結果                              |
| ---- | ------------------------------------------------------------------------------------- | ------------------ | --------------------------------- |
| #148 | Issue #145 解消: dummy Firebase env で AuthProvider crash 回避                        | 5 files / +119/-11 | ✅ merge + deploy success         |
| #149 | docs(handoff): 第3セッション handoff doc                                              | 1 file / +87/-220  | ✅ merge                          |
| #150 | feat(monitoring): Issue #79 TimeTree session expired alert (ADR-009 Future Work 実装) | 3 files / +45/-4   | ✅ merge + 本番適用済み (第 4 編) |

### Issue #145 解消の根本原因

CI ログの `[browser pageerror] (0,_firebase_util...getModularInstance)(...).onAuthStateChanged is not a function` が決め手。当初の最有力仮説 (IPv6 vs IPv4 解決) は probe (127.0.0.1 / localhost / ::1 全 HTTP 200) で否定。真因は以下の 4 段連鎖:

1. `apps/web/src/lib/firebase.ts:19`: `apiKey` 未設定時に `auth = ({} as Auth)` を返す (空 obj cast、CI build 用 guard)
2. `apps/web/src/components/AuthProvider.tsx:24`: `onAuthStateChanged(auth, ...)` で空 obj に対し throw
3. `apps/web/src/app/layout.tsx`: `<Providers>` (= AuthProvider) で全 page を wrap → 公開ページも巻き添え
4. ローカルは `.env.local` 設定済みで迂回されていた

修正: `apps/web/playwright.config.ts` の web webServer command に dummy `NEXT_PUBLIC_FIREBASE_*` env を 5 種追加。**本番コード変更ゼロ**。

### Issue #79 解消: 実態調査 → 最小スコープ実装

CRITICAL「未実装確認プロトコル」適用で発見:

- ADR-009 `009-timetree-session-management.md` (2026-05-03 Accepted) で**大部分既に完了**: 観測点プロトコル / 再ログイン運用手順 / Secret 配置
- **真の残作業はログベースメトリクス + alert policy のみ** (Future Work セクションに記載)

PR #150 で実装:

- `infra/alert-policies/tt-session-expired.yaml`: `[Calendar Hub] TimeTree session expired (24h ≥ 3)`、metric `calendar_hub_tt_session_expired`、24h 内 3 件以上で発報
- `infra/setup-monitoring.sh`: metric + alert apply 追加 (既存パターン完全踏襲)
- `docs/adr/009-...md`: Future Work を「実装済み」「残作業」に分離、ユーザー単位識別はログ schema 変更必要なため Future Work 保持

### Issue #81 実態 (調査済み、起点指示あったが未着手)

ADR-010 `010-slo-and-log-retention.md` (2026-05-03 Accepted「設計」) で**設計完了**:

- SLO 定義 (API 稼働率 99.5%/月、p95 1s、Sync 99%/日)、Error Budget、ログ保持 (sync 90 日 / auth 180 日)、PII マスクポリシー → ADR 記載済み
- **真の残作業 3 件**: (a) ログバケット + sink IaC、(b) SLI/SLO Cloud Monitoring 設定、(c) ダッシュボード作成

decision-maker 判断 (本セッション中)「最小スコープ #79 のみ着手」により Issue #81 は次セッション持ち越し。

### グローバル memory 追加 (汎用原則として抽出、PR #149 で反映済み)

| ファイル                                     | 教訓                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `feedback_ci_e2e_pageerror_first.md`         | CI 固有 E2E フレークは `page.on('pageerror'/'requestfailed'/'console'/'response')` を最初に取れ |
| `feedback_root_provider_public_page_risk.md` | root layout 全 wrap provider (Auth/Context) は公開ページに巻き添えで hydration を壊す           |
| `feedback_e2e_dummy_env_minimal_invasion.md` | E2E 固有 env 差異は test config に dummy 渡す (本番に test 分岐入れない)                        |

MEMORY.md index も 2 セクション (Quality Gate / 評価バイアス + 言語/プラットフォーム Pitfall) に 3 entry 追加済み。

### 同根再発スキャン (§ 4.6)

- 本セッション内: `fix(e2e):` PR #148 + `feat(monitoring):` PR #150 + `docs(handoff):` PR #149 = **同根候補ゼロ** (各 PR の root cause は独立: PR #148 = Firebase guard 問題、PR #150 = Future Work 実装、PR #149 = doc 更新)
- 過去 7 日 handoff archive (`docs/handoff/archive/`) grep: 関連症状なし
- 前回 handoff (PR #147) は Dependabot CI failure で別 root cause
- **同根再発なし** ✅

### 対症療法判定 (§ 4.7)

| 基準                                                   | 判定 (PR #148)                                                     | 判定 (PR #150)                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1. retry/timeout/fallback/エラー文言のみで調査ログなし | ❌ Phase B で pageerror から真因確定、診断証跡完備                 | ❌ ADR-009 Future Work の素直な実装、retry 系修正なし         |
| 2. WebSearch/changelog 確認ログなし                    | ❌ 内部 guard コード由来で外部 release 起因ではない                | ❌ ADR 既存設計通りの実装                                     |
| 3. 同症状 PR が過去 30 日以内に 1 件以上               | ❌ 新規事象                                                        | ❌ ADR-009 で初実装、過去なし                                 |
| 4. unit/smoke のみで構造的検証なし                     | ❌ CI 3 連続 PASS + ローカル regression なし + 真因 4 段連鎖言語化 | ❌ shell syntax check + 既存 yaml pattern 完全踏襲 + ADR 反映 |

→ 両 PR とも全 4 基準 ❌、**対症療法疑いなし** ✅

### グローバル memory scope チェック (§ 4.5)

本 PJ git status には memory ファイル変更なし (`~/.claude/memory` は別管理)。本セッションで追加した 3 件は scope 判定済み:

- すべて抽象表現、PR# / Issue# / プロジェクト名 / 人名 / 実機絶対パスを含まず
- 各教訓は framework 横断の汎用原則 (Next.js / React / Playwright 等の framework 名は許容)
- → scope OK ✅

### 構造的整合性チェック (§ 4)

| 項目                               | 判定                                      |
| ---------------------------------- | ----------------------------------------- |
| 型・共有ロジック・設定ファイル変更 | ⏭️ なし (E2E config + IaC + ADR doc のみ) |
| 新規テーブル/API追加               | ⏭️ なし                                   |
| データフロー実装                   | ⏭️ なし                                   |

### Deploy 確認

- Deploy run 28166278598 (PR #148 後): ✅ success (quality / deploy-api / deploy-web 全 PASS、8m3s)
- PR #149 (doc only) / PR #150 (IaC + ADR only) 後の Deploy は Cloud Run 再デプロイ trigger だが、コード変更ゼロのため実質 no-op

### Issue Net 変化

- Close 数: **2 件** (#145 / #79)
- 起票数: 0 件
- **Net: +2 close (進捗あり)**

---

## 次のアクション (第 5 編 update)

### 即着手タスク

なし。本セッションで Issue #81 完全完了 (3 PR)、ADR-009 Future Work 実装 (1 PR)、handoff 更新まで全消化。OPEN PR / active Issue ともゼロ。

### 条件待ち (明示 trigger 付き)

| #   | 項目                                                       | trigger                                                | trigger 充足時のタスク                                                                            |
| --- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1   | PR #153 本番適用 (`bash infra/setup-monitoring.sh`)        | decision-maker 手動実行                                | 適用後 alert policy `(per account, 24h)` 表示確認、旧 `(24h ≥ 3)` 削除確認                        |
| 2   | PR #154 本番適用 (`bash infra/setup-log-retention.sh`)     | decision-maker 手動実行                                | 適用後 buckets (sync-logs 90d / auth-logs 180d) + sinks 2 件確認、writer identity verify          |
| 3   | PR #155 本番適用 (`bash infra/setup-slo.sh`)               | decision-maker 手動実行                                | 適用後 services 2 件 + SLOs 4 件確認。特に sync-success の metricSumInRange validation エラー有無 |
| 4   | PR #156 本番適用 (`bash infra/setup-dashboard.sh`)         | PR #154/#155 適用後、decision-maker 手動実行           | 適用後 dashboard 1 件確認、7 widget 表示確認                                                      |
| 5   | ADR-010 Future Work: Error Budget アラート                 | decision-maker から「Error Budget alert 着手」明示指示 | Budget 50%/25%/0% 残量で通知 policy 追加 (alert-policies/error-budget-\*.yaml)                    |
| 6   | ADR-010 Future Work: PII 直書き検知                        | decision-maker から「PII 検知 着手」明示指示           | PR レビューチェックリスト or 静的解析 (eslint custom rule など) 実装                              |
| 7   | ADR-010 Future Work: Sync SLO true 成功率                  | sync 総数メトリクス (`calendar_hub_sync_attempt`) 追加 | windowsBased → requestBased.goodTotalRatio (good=success/total) に置換                            |
| 8   | ADR-009 既存ロジック強化 3 件 (silent-failure-hunter 指摘) | decision-maker 起点指示                                | reLogin 後 status チェック / 400-403 分類精緻化 / 401 明示 throw                                  |
| 9   | Issue #145 の 3 連続 PASS 厳密化                           | 万一 main 上で flaky 再発                              | listener は永続化済み、再発時に diagnostic PR を起動                                              |

### 却下候補 (記録のみ)

| #   | 項目                                                         | 着手しない理由                                                                                                                 |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | BigQuery sink (Issue #81 任意項目)                           | C カテゴリ。decision-maker 起点なし、コスト発生、現状規模で監査要件不在                                                        |
| 2   | route group `(public)` で AuthProvider 分離                  | C カテゴリ。アーキテクチャ改善は起点 unclear、`feedback_root_provider_public_page_risk` に記録済み                             |
| 3   | E2E spec の listener を共通 helper に抽出                    | A カテゴリ。housekeeping、DRY 効果限定的                                                                                       |
| 4   | GitHub 脆弱性アラート 21 件の追加対応                        | C カテゴリ。Dependabot 自動 PR 待ち                                                                                            |
| 5   | global memory `feedback_rest_iac_codex_review_value.md` 起票 | C カテゴリ。本セッションの教訓 (REST API + curl IaC は Codex 必須) は ADR 内 audit trail で十分、global 化は他 PJ への汎用性低 |

### 再開可能性判定

| 項目                    | 状態                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| OPEN PR                 | 0 件 ✅                                                                         |
| active Issue            | 0 件 ✅ (#81 close 済)                                                          |
| Git clean               | ✅ (本 PJ 配下)                                                                 |
| 残留プロセス            | ✅ なし                                                                         |
| Deploy 状態             | ⏳ in_progress (PR #156 Deploy run 28194672178、コード変更ゼロのため実質 no-op) |
| 構造的整合性            | ✅ TimeTreeAdapter constructor 変更の全 call site 更新済み、その他該当なし      |
| 同根再発                | ✅ なし (本セッション内 / 過去 7 日 archive とも候補 0 件)                      |
| 対症療法疑い            | ✅ なし (修正 PR ゼロ、§ 4.7 スキップ)                                          |
| グローバル memory scope | ✅ memory 変更なし、§ 4.5 スキップ                                              |
| 本番 GCP 適用           | ⏳ 4 件 decision-maker 待ち (PR #153/#154/#155/#156、推奨実行順は順次)          |

---

## 最終結論

🛑 **executor 領分の作業ゼロ、即時終了推奨**

- OPEN PR ゼロ / active Issue ゼロ / Git clean / 即着手 = 0 / 残留プロセスなし
- Issue Net **-1 close** (#81)、本日通算 (第 3-5 編) Issue Close **3 件** (#145/#79/#81)、PR merge **8 件**
- 同根再発候補 0 件 / 対症療法疑いなし (修正 PR ゼロ)
- 本セッション最大成果: Issue #81 (ADR-010 設計 3 件) 完全実装 + ADR-009 Future Work (per-account alert) 実装。**本番適用 4 件のみ decision-maker 手動実行待ち**
