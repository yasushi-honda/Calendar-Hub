# Calendar Hub ハンドオフ (2026-06-25)

## 2026-06-25 セッション総括 (第 3 編): Issue #145 完全解消 + 教訓 memory 3 件追加

本田様の指示 (`/catchup` → Issue 候補から #145 選択) により、PR #144 で導入された E2E spec のうち CI でのみ flaky だった 2 spec (`booking-polling.spec.ts` AC-E2E-4 / `booking-success.spec.ts` AC-E2E-1) を完全解消。`test.skip(!!CI)` 撤去で 7/7 が CI でも実行可能に。

| PR   | 内容                                                           | 規模               | 結果                                       |
| ---- | -------------------------------------------------------------- | ------------------ | ------------------------------------------ |
| #148 | Issue #145 解消: dummy Firebase env で AuthProvider crash 回避 | 5 files / +119/-11 | ✅ merge + deploy success (CI 3 連続 PASS) |

### 根本原因 (Phase B で確定)

CI ログの `[browser pageerror] (0,_firebase_util...getModularInstance)(...).onAuthStateChanged is not a function` が決め手。当初の最有力仮説 (IPv6 vs IPv4 解決) は probe (127.0.0.1 / localhost / ::1 全 HTTP 200) で否定。真因は以下の 4 段連鎖:

1. `apps/web/src/lib/firebase.ts:19`: `apiKey` 未設定時に `auth = ({} as Auth)` を返す (空 obj cast、CI build 用 guard)
2. `apps/web/src/components/AuthProvider.tsx:24`: `onAuthStateChanged(auth, ...)` で空 obj に対し `getModularInstance({}).onAuthStateChanged` 呼び出し → undefined → throw
3. `apps/web/src/app/layout.tsx`: `<Providers>` (= AuthProvider) で **全 page を wrap** → `/book/[linkId]` も巻き添えで page hydration 全面停止
4. ローカルは `.env.local` 設定済みで迂回されていた

### 修正

`apps/web/playwright.config.ts` の web webServer command に dummy `NEXT_PUBLIC_FIREBASE_*` env を 5 種追加。公開予約ページは Firebase Auth を実際には使わない (callback が発火しない) ため、AuthProvider 初期化さえ通れば動作する。**本番コード変更ゼロ**。

### Phase 進行サマリー

| Phase | 内容                                                                                  | コミット   |
| ----- | ------------------------------------------------------------------------------------- | ---------- |
| A     | 診断強化 (4 種 listener / hostname probe / trace on / skip 一時解除)                  | a3b5514    |
| B     | CI artifact 取得 → pageerror 物証から真因確定                                         | (分析のみ) |
| C     | 修正 (dummy Firebase env 5 種追加)                                                    | cf170bd    |
| D     | 診断設定 revert (probe 削除 / trace 戻す / skip 完全撤去、listener は永続化)          | cf170bd    |
| E     | ハンドオフ archive 追記 + 教訓 memory 3 件 (`docs/handoff/archive/e2e-booking-...md`) | a3380f4    |

### グローバル memory 追加 (汎用原則として抽出)

| ファイル                                     | 教訓                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `feedback_ci_e2e_pageerror_first.md`         | CI 固有 E2E フレークは `page.on('pageerror'/'requestfailed'/'console'/'response')` を最初に取れ。仮説 1 つに賭ける前に物証を取る |
| `feedback_root_provider_public_page_risk.md` | root layout 全 wrap provider (Auth/Context) は公開ページに巻き添えで hydration を壊す。本番依存値の test 環境欠落で表面化        |
| `feedback_e2e_dummy_env_minimal_invasion.md` | E2E 固有 env 差異は test config に dummy 渡す。本番に test 分岐を入れない (死コード増殖回避)                                     |

MEMORY.md index も 2 セクション (Quality Gate / 評価バイアス + 言語/プラットフォーム Pitfall) に 3 entry 追加済み。

### 同根再発スキャン (§ 4.6)

- 本セッション内: `fix(e2e):` PR は #148 のみ。同根候補なし
- 過去 7 日 handoff archive grep (`firebase|auth|hydrat|onAuthStateChanged|pageerror`): `e2e-booking-2026-06-25.md` のみ hit (本セッションで追記したファイル自身)
- 前回 handoff (PR #147) は Dependabot CI failure で別 root cause
- **同根再発なし** ✅

### 対症療法判定 (§ 4.7)

| 基準                                                   | 判定                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1. retry/timeout/fallback/エラー文言のみで調査ログなし | ❌ 該当せず (Phase B で pageerror から真因確定、診断証跡完備)                                      |
| 2. WebSearch/changelog 確認ログなし                    | ❌ 該当せず (内部 guard コード由来で外部 release 起因ではないため WebSearch 不要を Phase B で確定) |
| 3. 同症状 PR が過去 30 日以内に 1 件以上               | ❌ 該当せず (新規事象、PR #144 は元基盤導入で症状の同根ではない)                                   |
| 4. unit/smoke のみで構造的検証なし                     | ❌ 該当せず (CI 3 連続 PASS + ローカル regression なし + 真因 4 段連鎖を言語化)                    |

→ ヒット 0 件、**対症療法疑いなし** ✅

### グローバル memory scope チェック (§ 4.5)

本 PJ git status には memory ファイル変更なし (`~/.claude/memory` は別管理)。本セッションで追加した 3 件は scope 判定済み:

- すべて抽象表現、PR# / Issue# / プロジェクト名 / 人名 / 実機絶対パスを含まず
- 各教訓は framework 横断の汎用原則 (Next.js / React / Playwright 等の framework 名は許容)
- → scope OK ✅

### 構造的整合性チェック (§ 4)

| 項目                               | 判定                      |
| ---------------------------------- | ------------------------- |
| 型・共有ロジック・設定ファイル変更 | ⏭️ なし (E2E config のみ) |
| 新規テーブル/API追加               | ⏭️ なし                   |
| データフロー実装                   | ⏭️ なし                   |

### Deploy 確認

- Deploy run 28166278598: ✅ success (quality / deploy-api / deploy-web 全 PASS、8m3s)

### Issue Net 変化

- Close 数: 1 件 (#145)
- 起票数: 0 件
- **Net: +1 close** (進捗あり)

---

## 次のアクション

### 即着手タスク

なし (本セッションで Phase A〜E すべて完了、Deploy も success)

### 条件待ち (明示 trigger 付き)

| #   | 項目                                                                   | trigger                                                                                | trigger 充足時のタスク                                                                          |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Issue #145 の 3 連続 PASS 厳密化 (本セッションは 2 連続 + 本番 1 連続) | 万一 main 上で flaky 再発                                                              | 再発時に diagnostic PR (Phase A 同様) を起動。listener は既に永続化されているので追加コストなし |
| 2   | Issue #79 (TimeTree session 切れ自動検知と再ログイン手順整備)          | decision-maker から「#79 着手」明示指示 + 自動検知方式 (polling 頻度・通知手段) の指示 | 検知ロジック実装 + ADR 化 + IaC (alert policy) 追加                                             |
| 3   | Issue #81 (ログ保持期間・SLO 定義)                                     | decision-maker から SLO 目標値 (保持期間・可用性閾値等) の確定指示                     | ADR ドラフト + Cloud Logging 設定 + Monitoring ダッシュボード                                   |

### 却下候補 (記録のみ)

| #   | 項目                                        | 着手しない理由                                                                                                                            |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | route group `(public)` で AuthProvider 分離 | C カテゴリ (アーキテクチャ改善は起点 unclear)。`feedback_root_provider_public_page_risk` に記録済みで、再発時に decision-maker が起点判断 |
| 2   | E2E spec の listener を共通 helper に抽出   | A カテゴリ寄り (housekeeping)。現状 spec 2 ファイルにコピペ程度なので DRY 効果限定的、decision-maker 明示指示なし                         |
| 3   | GitHub 脆弱性アラート 21 件の追加対応       | C カテゴリ (起点 unclear)。Dependabot 自動 PR 待ち、もしくは decision-maker からの個別指示                                                |

### 再開可能性判定

| 項目                    | 状態                                               |
| ----------------------- | -------------------------------------------------- |
| OPEN PR                 | 0 件 ✅                                            |
| active Issue            | 2 件 (#79 / #81、両方 decision-maker 起点指示待ち) |
| Git clean               | ✅ (本 PJ 配下)                                    |
| 残留プロセス            | ✅ なし                                            |
| Deploy 状態             | ✅ success (run 28166278598)                       |
| 構造的整合性            | ⏭️ スキップ (該当なし)                             |
| 同根再発                | ✅ なし                                            |
| 対症療法疑い            | ✅ なし                                            |
| グローバル memory scope | ✅ 汎用原則のみ                                    |

---

## 最終結論

🛑 **executor 領分の作業ゼロ、即時終了推奨**

- OPEN PR ゼロ / active Issue 2 件 (両方 decision-maker 起点指示待ち) / Git clean / 即着手 = 0 / 残留プロセスなし
- Issue Net +1 close (進捗あり)、Deploy success、同根再発・対症療法疑いなし
- 次セッションは decision-maker の Issue #79 / #81 起点指示があれば着手、なければ `/catchup` 段階で idle skip 判定推奨
