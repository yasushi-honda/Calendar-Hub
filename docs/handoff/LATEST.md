# Calendar Hub ハンドオフ (2026-06-25)

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

## 次のアクション

### 即着手タスク

なし (本セッションで Phase 完了、両 Issue close、handoff/memory 更新済み)

### 条件待ち (明示 trigger 付き)

| #   | 項目                                                    | trigger                                                | trigger 充足時のタスク                                                                                |
| --- | ------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | ~~PR #150 本番適用 (`bash infra/setup-monitoring.sh`)~~ | ~~decision-maker が手動実行~~                          | ✅ 完了 (第 4 編、2026-06-25)                                                                         |
| 2   | Issue #81 残作業 (IaC 3 件)                             | decision-maker から「#81 着手」明示指示                | (a) ログバケット + sink、(b) SLI/SLO Cloud Monitoring 設定、(c) ダッシュボード作成 (ADR-010 設計通り) |
| 3   | Issue #145 の 3 連続 PASS 厳密化                        | 万一 main 上で flaky 再発                              | listener は永続化済み、再発時に diagnostic PR (Phase A 同様) を起動                                   |
| 4   | ADR-009 Future Work: 単一ユーザー単位 alert             | decision-maker から「ユーザー単位 alert 実装」明示指示 | `TimeTreeAdapter` constructor で accountId を受け取り、ログ schema 変更 + alert filter 更新           |

### 却下候補 (記録のみ)

| #   | 項目                                                           | 着手しない理由                                                                                      |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | route group `(public)` で AuthProvider 分離                    | C カテゴリ (アーキテクチャ改善は起点 unclear)。`feedback_root_provider_public_page_risk` に記録済み |
| 2   | E2E spec の listener を共通 helper に抽出                      | A カテゴリ (housekeeping)。現状 spec 2 ファイルにコピペ程度なので DRY 効果限定的                    |
| 3   | GitHub 脆弱性アラート 21 件の追加対応                          | C カテゴリ (起点 unclear)。Dependabot 自動 PR 待ち                                                  |
| 4   | ADR-009 既存ロジック強化候補 3 件 (silent-failure-hunter 指摘) | 別 Issue 化候補として ADR-009 に記録済み、decision-maker 明示指示なし                               |

### 再開可能性判定

| 項目                    | 状態                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| OPEN PR                 | 0 件 ✅                                                                  |
| active Issue            | 1 件 (#81、decision-maker 起点指示待ち)                                  |
| Git clean               | ✅ (本 PJ 配下)                                                          |
| 残留プロセス            | ✅ なし                                                                  |
| Deploy 状態             | ✅ success (PR #148 後の run 28166278598、PR #149/#150 はコード変更なし) |
| 構造的整合性            | ⏭️ スキップ (該当なし)                                                   |
| 同根再発                | ✅ なし                                                                  |
| 対症療法疑い            | ✅ なし (両 PR とも全 4 基準 ❌)                                         |
| グローバル memory scope | ✅ 汎用原則のみ                                                          |
| 本番 GCP 適用           | ✅ 完了 (第 4 編、2026-06-25 `bash infra/setup-monitoring.sh`)           |

---

## 最終結論

🛑 **executor 領分の作業ゼロ、即時終了推奨**

- OPEN PR ゼロ / active Issue 1 件 (#81、decision-maker 起点指示待ち) / Git clean / 即着手 = 0 / 残留プロセスなし
- Issue Net **+2 close** (#145 + #79、進捗大)、同根再発・対症療法疑いなし
- 本日通算 (第 3 編 + 第 4 編): 3 PR merge (#148/#149/#150) + PR #150 本番適用、グローバル memory 3 件追加、ADR-009 Future Work セクション実装 + 稼働開始
- 次セッションは decision-maker の「Issue #81 起点指示」「ADR-009 Future Work 単一ユーザー alert 着手指示」のいずれかがあれば着手、なければ `/catchup` 段階で idle skip 判定推奨
