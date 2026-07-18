# Calendar Hub ハンドオフ (2026-07-19, 第 13 編まで)

> 第 3〜5 編は `archive/2026-06-25_to_26-vol3-to-vol5.md` に分離 (2026-06-26 第 7 編で実施)。第 6 編は `archive/2026-06-26-vol6.md` に分離 (2026-06-27 第 8 編で実施)。第 7〜9 編は `archive/2026-06-26_to_27-vol7-to-vol9.md` に分離 (2026-07-19 第 12 編で実施、60KB 超過のため)。LATEST.md は第 10 編以降のみ保持する。

## 2026-07-18 セッション総括 (第 10 編): catchup 新規検出 — Dependabot critical alert 修正 + PR 3 件マージ

catchup 実行時に新規検出された「守り (修正)」候補 2 件 (第 9 編却下候補 #7 の後継) を decision-maker 承認を得て解消。critical severity の脆弱性 alert が 1 件 → 0 件になった。

### PR 一覧

| PR   | 内容                                                                        | 規模          | 結果                         |
| ---- | --------------------------------------------------------------------------- | ------------- | ---------------------------- |
| #173 | chore(deps): bump actions/setup-java from 4 to 5                            | 1 file        | ✅ merge (CI green 確認済み) |
| #174 | chore(deps): bump actions/checkout from 6 to 7                              | 2 files       | ✅ merge (CI green 確認済み) |
| #175 | chore(deps): bump actions/cache from 4 to 6                                 | 1 file        | ✅ merge (CI green 確認済み) |
| #176 | fix(deps): websocket-driver を 0.7.5 に override して critical 脆弱性を解消 | 2 files +6/-4 | ✅ merge (CI 全 PASS 後)     |

### 主要成果

#### M1: Dependabot critical alert #104 (websocket-driver, CVE-2026-54466, CVSS v4 9.2) を手動 override で解消

`firebase-admin`(devDependency) → `@firebase/database-compat` → `@firebase/database` → `faye-websocket` → `websocket-driver 0.7.4` の推移的依存が対象。Dependabot の自動修正 PR は alert 作成時点 (2026-07-16) で `security_update_not_possible` により失敗していたが、調査の結果、修正版 `websocket-driver@0.7.5` は既に npm に存在し `faye-websocket` の依存範囲 (`>=0.5.1`) にも収まることを確認。既存の `pnpm.overrides` パターン (14 件既存) に倣い `"websocket-driver@<0.7.5": ">=0.7.5"` を追加して解決。scope は development のみ (本番ランタイム非依存)。

#### M2: open Dependabot PR 3 件 (GitHub Actions バージョン bump) をマージ

17 日間放置されていた #173/#174/#175 (いずれも CI green・mergeable 確認済み) を番号単位の明示認可を得てマージ。setup-java v5 は内部で Node 24 へのアップグレードという breaking change を含むが、CI (quality/e2e) が green であることをマージ前に確認済み。

### 検証

- `pnpm install` 実行 → `pnpm why websocket-driver` で 0.7.5 への解決を確認
- `pnpm turbo type-check` 全パッケージ PASS (8/8 successful)
- pre-commit hook (husky + lint-staged) 通過確認
- PR #176 の CI (quality / e2e / GitGuardian / CodeRabbit) 全 PASS を確認してからマージ

### 同根再発スキャン (§ 4.6)

本セッション修正 PR: PR #176 (`fix(deps):`) 1 件。

- 本セッション内の同根候補: PR #173-175 は `chore(deps):` の GitHub Actions バージョン bump で、root cause が異なる (npm パッケージ脆弱性 vs Actions バージョン管理) ため同根ではない
- 過去 7 日 archive を `websocket-driver` / `dependabot` / `CVE-2026` / `security alert` で grep → ヒットなし

→ **同根再発候補 0 件** ✅

### 対症療法判定 (§ 4.7)

| #   | 基準                                              | 判定 (PR #176)                                                                        |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | retry/timeout/fallback/文言修正のみで調査ログなし | ❌ `pnpm.overrides` によるバージョン強制固定 (構造的対応、既存パターンに準拠)         |
| 2   | WebSearch / changelog 確認なし                    | ❌ CVE 詳細確認済み (CVE-2026-54466, 公開日 2026-07-15, 修正版 0.7.5 存在確認)        |
| 3   | 同症状 PR が過去 30 日に 1 件以上                 | ❌ websocket-driver 個別の override は初 (類似パターン 14 件はあるが対象パッケージ別) |
| 4   | smoke のみで構造的検証なし                        | ❌ `pnpm why` で依存解決確認 + `pnpm turbo type-check` 全 PASS                        |

→ **対症療法疑いなし** ✅

### グローバル memory scope (§ 4.5)

memory ファイル変更なし、スキップ。

### 構造的整合性 (§ 4)

`package.json` (`pnpm.overrides`) + `pnpm-lock.yaml` の設定ファイル変更のみ。型・共有ロジック・API 変更なし → ⏭️ スキップ。

### Issue Net 変化 (第 10 編)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0**（Issue の起票・close は本セッションで発生せず、Dependabot alert/PR での対応のみ）

### 次のアクション (第 10 編 update)

#### 即着手タスク

なし。本セッションで catchup 新規検出の 2 項目 (critical alert 対応 + PR 3 件マージ) を全解消。OPEN PR ゼロ。

#### 条件待ち (明示 trigger 付き) — 第 9 編の 5 件は変化なし、新規 1 件追加

| #   | 項目                                                                                           | trigger                                                                                                                                                              | trigger 充足時のタスク                                                                       |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | C1 拡張 (booking-mirror に Google Calendar 自動登録追加)                                       | decision-maker から「C1 着手」明示指示                                                                                                                               | spec §9.1 末尾参照 (第 9 編から継続)                                                         |
| 2   | gRPC-web API 仕様変更時の運用 fallback                                                         | Google 側で `internal` namespace 変更 / API Key 失効                                                                                                                 | `parseSlotResponse` の structured log alert 化 (第 9 編から継続)                             |
| 3   | ADR-010 Future Work 3 件 + ADR-009 既存ロジック強化 3 件                                       | decision-maker 起点指示                                                                                                                                              | 該当 ADR 参照 (第 9 編から継続)                                                              |
| 4   | Issue #145 の 3 連続 PASS 厳密化                                                               | 万一 main 上で flaky 再発                                                                                                                                            | diagnostic PR 起動 (第 9 編から継続)                                                         |
| 5   | book-mirror デスクトップ (≥ 768px) UI レビュー                                                 | decision-maker 起点指示                                                                                                                                              | モバイル改修は desktop 非 touch (第 9 編から継続)                                            |
| 6   | Dependabot alert #102/#103 (js-yaml, medium, CVE-2026-53550, DoS via merge-key) の対応要否判断 | decision-maker の対応要否判断 (修正版 4.2.0 以降が既に存在、devDependency `@typescript-eslint/*` → `eslint` → `@eslint/eslintrc` → `js-yaml 4.1.1` 経由の推移的依存) | `pnpm.overrides` に `"js-yaml@<4.2.0": ">=4.2.0"` 追加を検討 (websocket-driver と同パターン) |

#### 却下候補 (記録のみ)

第 9 編の却下候補 1-7 は変化なし (#7「GitHub 脆弱性アラート 21 件の追加対応」は本セッションで critical 1 件を解消したため部分的に消化、残り high/medium/low は #6 条件待ちとして分離)。#8 (global memory 化見送り) も継続。

### 再開可能性判定 (第 10 編)

| 項目                    | 状態                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| OPEN PR                 | 0 件 ✅ (PR #173/#174/#175/#176 merge 済、本 handoff PR が最後)           |
| active Issue            | 0 件 ✅                                                                   |
| Git clean               | ✅ (本 handoff PR commit 後)                                              |
| 残留プロセス            | ✅ なし                                                                   |
| Security alert          | critical 1 → 0 件 ✅ / high 10・medium 4・low 1 は残存 (js-yaml 2 件含む) |
| 構造的整合性            | ⏭️ スキップ (設定ファイルのみ、型・API 影響なし)                          |
| 同根再発                | ✅ なし                                                                   |
| 対症療法疑い            | ✅ なし                                                                   |
| グローバル memory scope | ⏭️ 変更なし                                                               |

---

## 最終結論 (第 10 編)

✅ **セッション終了可** — catchup 新規検出 2 項目 (Dependabot critical alert #104 修正 + PR 3 件マージ) を decision-maker 承認を得て全解消

- OPEN PR ゼロ (PR #173/#174/#175/#176 merge 済、本 handoff PR が最後)
- active Issue ゼロ
- Git clean
- 即着手タスク = 0 / 条件待ち = 6 件 (全 decision-maker 領分、うち 1 件新規: js-yaml alert)
- Issue Net 変化 = 0 / 0
- 同根再発候補 0 件 / 対症療法疑いなし
- Security alert: critical 1 → 0 件に低減 (残り high/medium/low 15 件は次回 decision-maker 判断待ち)

---

## 2026-07-18 セッション総括 (第 11 編): js-yaml override PR 追加対応 + vite override 機能不全の発見

第 10 編の条件待ち #6 (js-yaml alert #102/#103) を decision-maker の明示指示「js-yaml の override PR も作成して」を受けて即時解消。あわせて依存関係調査の過程で、既存の `vite` override が実際には機能していない (peer dependency 経由のため無効) ことを発見。

### PR 一覧

| PR   | 内容                                                             | 規模           | 結果                     |
| ---- | ---------------------------------------------------------------- | -------------- | ------------------------ |
| #178 | fix(deps): js-yaml を 5.2.1 に override して medium 脆弱性を解消 | 2 files +8/-27 | ✅ merge (CI 全 PASS 後) |

### 主要成果

#### M1: Dependabot alert #102/#103 (js-yaml, CVE-2026-53550, medium) を手動 override で解消

`@typescript-eslint/*` → `eslint` → `@eslint/eslintrc` 経由の推移的依存 (js-yaml 4.1.1) と `firebase-tools` 経由の直接依存 (js-yaml 3.14.2) の両方が対象。`@eslint/eslintrc` の依存範囲 (`^4.1.1`) が修正版 4.2.0 以降もカバーすることを確認し、既存パターンに倣い `"js-yaml@<4.2.0": ">=4.2.0"` を追加。pnpm が範囲内最新の 5.2.1 を解決し、3.14.2/4.1.1 の重複解決も統合されて lockfile が簡素化 (-27/+8 行)。メジャーバージョン 4→5 昇格のため `pnpm lint` + `pnpm turbo type-check` の両方で動作確認。

#### M2: 【重要な発見】既存の `vite` override が機能していない (次回セッション要対応)

CI で「Dependabot Updates workflow: npm_and_yarn in /. for vite - Update」の失敗を検知し調査した結果:

- Dependabot alert #78 (vite, **high**, CVSS v4 8.2, path traversal via Windows NTFS ADS/8.3 short name, CVE-2026-53571) と #77 (vite/launch-editor, medium, NTLM hash 漏洩, CVE-2026-53632) の脆弱性範囲は `>=8.0.0, <=8.0.15` (修正版 `8.0.16`)
- 既存の `pnpm.overrides` には `"vite@>=8.0.0 <=8.0.4": ">=8.0.5"` があるが、これは**別の脆弱性 (8.0.0-8.0.4) 用の古いエントリ**で今回の alert 範囲 (8.0.0-8.0.15) をカバーしていない
- `pnpm why vite` で実際のインストールバージョンを確認したところ **8.0.1 のまま** — 既存 override の範囲 (`>=8.0.0 <=8.0.4`) には該当するはずだが `>=8.0.5` へ解決されていない
- 原因仮説: `vite` は `vitest`/`@vitest/mocker` の **peerDependency** として要求されており、pnpm の `overrides` は通常の dependency 解決には効くが peer dependency 解決には別ロジックが働き、無効化されている可能性がある (未検証、仮説段階)
- **本番ランタイムには影響しない** (vite は vitest 経由の devDependency のみ) が、CVSS 8.2 の high severity かつ既存の防御機構が実効性を持っていないという構造的問題

### 同根再発スキャン (§ 4.6)

本セッション修正 PR: PR #178 (`fix(deps):`) 1 件。

- 本セッション内の同根候補: PR #176 (websocket-driver) と PR #178 (js-yaml) は同一手法 (`pnpm.overrides` 追加) だが、対象パッケージ・CVE が異なる独立した脆弱性対応であり、バグの同根再発ではなく体系的な守り対応の繰り返し適用と判断
- ただし M2 の vite override 機能不全は、「同じ機構 (pnpm.overrides) が特定の依存形態 (peer dependency) で無効化されるケースがある」という**構造的な弱点候補**であり、次回セッションでの検証が必要
- 過去 7 日 archive を `js-yaml` / `websocket-driver` / `pnpm.overrides` / `CVE-2026` で grep → ヒットなし

→ **バグとしての同根再発候補 0 件** ✅ (ただし M2 の構造的弱点は条件待ちへ計上)

### 対症療法判定 (§ 4.7)

| #   | 基準                                              | 判定 (PR #178)                                                             |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | retry/timeout/fallback/文言修正のみで調査ログなし | ❌ `pnpm.overrides` によるバージョン強制固定 (構造的対応)                  |
| 2   | WebSearch / changelog 確認なし                    | ❌ CVE 詳細確認済み (CVE-2026-53550, `@eslint/eslintrc` 依存範囲確認)      |
| 3   | 同症状 PR が過去 30 日に 1 件以上                 | ❌ js-yaml 個別の override は初                                            |
| 4   | smoke のみで構造的検証なし                        | ❌ `pnpm why` で依存解決確認 + `pnpm lint`/`pnpm turbo type-check` 全 PASS |

→ **対症療法疑いなし** ✅ (PR #178 自体は構造的対応。M2 の vite 問題は未解決のまま次回持ち越しであり対症療法ではなく「未着手」)

### グローバル memory scope (§ 4.5)

memory ファイル変更なし、スキップ。

### 構造的整合性 (§ 4)

`package.json` (`pnpm.overrides`) + `pnpm-lock.yaml` の設定ファイル変更のみ。型・共有ロジック・API 変更なし → ⏭️ スキップ。

### Issue Net 変化 (第 11 編)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0**

### 次のアクション (第 11 編 update)

#### 即着手タスク

なし。本セッションで decision-maker 指示の js-yaml override PR 作成・マージまで完了。

#### 条件待ち (明示 trigger 付き) — 第 10 編の 6 件は変化なし、新規 1 件追加

| #   | 項目                                                                                                               | trigger                                                   | trigger 充足時のタスク                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-6 | (第 10 編から継続、内容変化なし: C1 拡張 / gRPC-web fallback / ADR Future Work / Issue #145 / desktop UI レビュー) | 各項目個別 (LATEST.md 第 9-10 編参照)                     | 各項目個別                                                                                                                                                                                                  |
| 7   | **vite override 機能不全 (M2) の原因調査 + 修正**                                                                  | decision-maker の対応要否判断 (high severity CVE 2件対象) | `pnpm why vite` で peer dependency 解決経路を再検証、`.npmrc` の `auto-install-peers`/`resolve-peers-from-workspace-root` 等の設定確認、必要なら `vitest` 自体のバージョンアップ or override 記法変更を検討 |

#### 却下候補 (記録のみ)

第 9-10 編の却下候補は変化なし。

### 再開可能性判定 (第 11 編)

| 項目                    | 状態                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| OPEN PR                 | 0 件 ✅ (PR #178 merge 済)                                                                          |
| active Issue            | 0 件 ✅                                                                                             |
| Git clean               | ✅                                                                                                  |
| 残留プロセス            | ✅ なし                                                                                             |
| Security alert          | critical 0・high 10・medium 2・low 1 (前セッションから medium 2 件減、high 中に vite CVE 2件を含む) |
| 構造的整合性            | ⏭️ スキップ (設定ファイルのみ)                                                                      |
| 同根再発 (バグとして)   | ✅ なし                                                                                             |
| 対症療法疑い            | ✅ なし                                                                                             |
| グローバル memory scope | ⏭️ 変更なし                                                                                         |
| **要注意**              | ⚠️ 既存 vite override が peer dependency 経由で無効化されている可能性 (M2 参照、次回検証必要)       |

---

## 最終結論 (第 11 編)

✅ **セッション終了可** — decision-maker 指示の js-yaml override PR (#178) 作成・マージ完了

- OPEN PR ゼロ、active Issue ゼロ、Git clean
- 即着手タスク = 0 / 条件待ち = 7 件 (全 decision-maker 領分、うち新規 1 件: vite override 機能不全の調査)
- Issue Net 変化 = 0 / 0
- 同根再発候補 0 件 (バグとして) / 対症療法疑いなし
- ⚠️ **次回優先確認事項**: 既存の `vite` override (`pnpm.overrides`) が peer dependency 経由のため無効化されている可能性を発見。対象は high severity (CVSS 8.2) の Windows path traversal 脆弱性 (alert #78) 含む 2 件。本番ランタイム非依存 (dev のみ) だが、構造的な防御漏れの可能性がありセッション終了前に明記

---

## 2026-07-19 セッション総括 (第 12 編): vite override 機能不全の根本解決 + Dependabot alert 20→0 完全解消

catchup の推奨に従い、第 11 編 M2 で発見された vite override 機能不全（条件待ち #7）を含む全 Dependabot open alert（high 13 / medium 6 / low 1 = 20 件）に順次対応。3 PR に分割して段階検証し、全件解消。

### PR 一覧

| PR   | 内容                                                                       | 規模              | 結果                                              |
| ---- | -------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| #180 | fix(deps): vite を devDependencies に直接固定して peer override 不全を解消 | 2 files +150/-117 | ✅ merge (CI 全 PASS 後)                          |
| #181 | fix(deps): esbuild/ws/grpc-js/form-data/qs/uuid の脆弱バージョンを解消     | 2 files +148/-207 | ✅ merge (CI 全 PASS 後)                          |
| #182 | fix(deps): tar を firebase-tools 配下含め >=7.5.16 に override             | 2 files +5/-66    | ✅ merge (CI 全 PASS 後、Deploy success 確認済み) |

### 主要成果

#### M1: 【第 11 編 M2 の根本原因確定】pnpm.overrides はグラフ内で peerDependency としてのみ出現するパッケージには適用されない

第 11 編で「未検証、仮説段階」としていた peer dependency 仮説を、公式 docs (pnpm.io/settings#overrides) + 既知 issue (`pnpm/pnpm#9913`, `vitest-dev/vitest#7520`) で確認。`pnpm why vite` で override 適用後も 8.0.1 のまま解決されないことを実測確認し、根本原因を特定。

**対処法**: 該当パッケージ（vite, esbuild）を `pnpm.overrides` ではなく `devDependencies` に直接固定することで、peer 解決ロジックを経由せず確実に patched バージョンを強制。esbuild は vite/tsx 双方の peer/固定依存として出現しており、同一パターンで発見・修正（tsx 側のネスト pin には併せて override も追加）。

#### M2: Dependabot open alert 20 件 → 0 件（完全解消）

| パッケージ    | 修正内容                                    | 対象 alert                             |
| ------------- | ------------------------------------------- | -------------------------------------- |
| vite          | 8.0.1 → 8.1.5（devDependency 直接固定）     | #19,#20,#21,#77,#78 (high×3, medium×2) |
| esbuild       | 0.27.4 → 0.28.1（同上 + tsx 配下 override） | #75 (low)                              |
| ws            | 8.19.0 (@google/genai runtime) → 8.21.1     | #92,#66 (high, medium)                 |
| @grpc/grpc-js | <1.9.16 → 1.14.3                            | #73,#74 (high×2)                       |
| form-data     | 2.5.5 (@types/request配下) → 4.0.6          | #88 (high)                             |
| qs            | 6.15.0/6.15.1 → 6.15.3                      | #63 (medium)                           |
| uuid          | 8.3.2/9.0.1 → 11.1.1/14.0.1                 | #62 (medium)                           |
| tar           | 6.2.1 (firebase-tools直接依存) → 7.5.16     | #94-#100 (high×6, medium×1)            |

tar は firebase-tools の emulator バイナリ展開に使われる dev ツール依存のため他 6 件と PR を分離し、`firebase emulators:start --only firestore,auth` の実起動（jar ダウンロード・展開含む "All emulators ready!" まで）で個別に安全性を検証してからマージ。

#### M3:【守り(検出)】既存 override 全件の同型弱点スイープ

M1 の発見を受け、既存 20 件の override エントリ全てについて「対象パッケージが peer 経由で無効化されていないか」を `pnpm why` で検出のみ実施。picomatch/yaml は peer 経由で出現するが、実際の resolved バージョンは override target を満たしており、他に無効化されている override は検出されず。

### 同根再発スキャン (§ 4.6)

本セッション修正 PR: PR #180 / #181 / #182 の 3 件（いずれも `fix(deps):`）。

- **同根確定**: PR #180 (vite) と PR #181 内の esbuild 修正は、第 11 編 M2 で仮説段階だった「pnpm.overrides が peerDependency 専有パッケージに無効」という**同一の構造的root causeによる再発**。今回 WebFetch/WebSearch で根本原因を確定させ、同一手法（devDependencies 直接固定）で両方解決したため、根本解決とみなす。
- PR #181 内の ws/@grpc/grpc-js/form-data/qs/uuid、PR #182 の tar は通常の transitive dependency バージョン更新であり、vite/esbuild とは異なる（override が通常通り機能するケース）。相互に同根ではない。
- 過去 7 日 archive を `vite` / `override` / `peer` で grep → 第 11 編（本リポジトリ内、7 日以内）に M2 として記録済み、今回はその直接の解決編。新規の別セッション同根なし。

→ **同根再発 1 件（vite/esbuild、第 11 編 M2 の予告どおり）を根本解決** ✅。M3 のスイープで他の潜伏同根は検出されず。

### 対症療法判定 (§ 4.7)

| #   | 基準                                              | 判定                                                                                                                  |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | retry/timeout/fallback/文言修正のみで調査ログなし | ❌ pnpm.overrides / devDependency 直接固定による構造的対応                                                            |
| 2   | WebSearch / changelog 確認なし                    | ❌ pnpm 公式 docs + `pnpm/pnpm#9913` + `vitest-dev/vitest#7520` を WebFetch/WebSearch で確認、根本原因を実測特定      |
| 3   | 同症状 PR が過去 30 日に 1 件以上                 | ⚠️ 該当（vite/esbuild は同根）だが、今回で根本原因を確定し解決したため「再発」ではなく「解決編」と判定                |
| 4   | smoke のみで構造的検証なし                        | ❌ 全 PR で test/type-check/lint/build 全通過 + tar は emulator 実起動、pnpm-lock diff の無関係変更混入なしを個別確認 |

→ **対症療法疑いなし** ✅（基準3 はヒットするが、今回のセッションで根本原因を確定させ構造的に解決したため、この基準が意図する「原因不明のまま再発を繰り返す」パターンには該当しない）

### グローバル memory scope (§ 4.5)

memory ファイル変更なし、スキップ。

### 構造的整合性 (§ 4)

`package.json` (`pnpm.overrides` / `devDependencies`) + `pnpm-lock.yaml` の設定ファイル変更のみ。型・共有ロジック・API 変更なし → ⏭️ スキップ。

### Issue Net 変化 (第 12 編)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0**

### 次のアクション (第 12 編 update)

#### 即着手タスク

なし。

#### 条件待ち (明示 trigger 付き) — 第 10-11 編の項目のうち #7 (vite override 機能不全) を解消、残り 6 件は変化なし

| #   | 項目                                                                                                                 | trigger                               | trigger 充足時のタスク |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------- |
| 1-6 | (第 9-10 編から継続、内容変化なし: C1 拡張 / gRPC-web fallback / ADR Future Work / Issue #145 / desktop UI レビュー) | 各項目個別 (LATEST.md 第 9-10 編参照) | 各項目個別             |

第 11 編の条件待ち #7（vite override 機能不全）は本セッションで根本解決・完了のため削除。

#### 却下候補 (記録のみ)

第 9-10 編の却下候補は変化なし。

### 再開可能性判定 (第 12 編)

| 項目                        | 状態                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| OPEN PR                     | 0 件 ✅ (PR #180/#181/#182 merge 済)                                                                                       |
| active Issue                | 0 件 ✅                                                                                                                    |
| Git clean                   | ✅                                                                                                                         |
| 残留プロセス                | ⚠️ あり（別プロジェクト sanwa-houkai-app の next dev、本プロジェクト非依存・マシン全体チェックの検出。停止は条件待ち扱い） |
| Security alert (Dependabot) | **0 件**（critical 0・high 0・medium 0・low 0、前セッションから 20 件全解消）                                              |
| Deploy CI                   | ✅ success（#180/#181/#182 の 3 回とも success 確認済み）                                                                  |
| 構造的整合性                | ⏭️ スキップ (設定ファイルのみ)                                                                                             |
| 同根再発                    | ✅ 1 件検出・根本解決済み（vite/esbuild）                                                                                  |
| 対症療法疑い                | ✅ なし                                                                                                                    |
| グローバル memory scope     | ⏭️ 変更なし                                                                                                                |

---

## 最終結論 (第 12 編)

✅ **セッション終了可** — catchup 推奨事項（vite override 機能不全 + Dependabot alert 内訳増加）を両方とも根本解決

- OPEN PR ゼロ、active Issue ゼロ、Git clean
- 即着手タスク = 0 / 条件待ち = 6 件（すべて decision-maker 領分、前セッションの vite override 項目は解消済みで削除）
- Issue Net 変化 = 0 / 0
- Dependabot open alert: **20 件 → 0 件**（critical/high/medium/low 全解消、Deploy CI 3 回とも success）
- 同根再発候補 1 件検出・根本解決済み（vite/esbuild の peer override 不全、pnpm 既知issue で原因確定）／対症療法疑いなし
- ⚠️ 残留プロセスは別プロジェクト（sanwa-houkai-app）の node dev サーバーのみ検出、本プロジェクト非依存につき条件待ち扱い（停止は明示指示があれば対応）

## 2026-07-19 セッション総括 (第 13 編): ADR-009 既存ロジック強化 3 件実装 (PR #184)

catchup 実行時、積み残しタスク・active Issue 共に 0 件で一旦セッション終了推奨だったが、条件待ち 6 件のうち decision-maker が着手可能な 4 件（C1 拡張 / ADR-010 Future Work / ADR-009 既存ロジック強化 / desktop UI レビュー）を提示し、本番 GCP 変更を伴わず TDD で完結できる「ADR-009 既存ロジック強化 3 件」を推奨・選定して実装した。

### PR 一覧

| PR   | 内容                                                                                | 規模            | 結果                     |
| ---- | ----------------------------------------------------------------------------------- | --------------- | ------------------------ |
| #184 | fix(calendar-sdk): TimeTreeAdapter の 401/400/403 エラー分類と reLogin 観測性を改善 | 3 files +103/-8 | ✅ merge (CI 全 PASS 後) |

### 主要成果

ADR-009 (`docs/adr/009-timetree-session-management.md`) の「既存ロジックの強化候補」3 件を全て解消:

1. reLogin 後 retry の `res.ok` 検証追加 + `[TT-SESSION-RELOGIN-INEFFECTIVE]` ログ追加
2. 400/401/403 のエラー分類精緻化（401 のみ reLogin 対象、400/403 は permanent 即返却、`rules/error-handling.md §3` 準拠）
3. reLoginFn 不在時の 401 を `TimeTreeSessionExpiredError`（新規 public エラークラス、`packages/calendar-sdk` からexport）で明示 throw

TDD (Red→Green) で実装: 既存の 400/401/403 混在パラメタライズテストを分割し、新規 4 テストを追加（400/403 で reLogin 未実行確認、401 の `TimeTreeSessionExpiredError` throw 確認、reLogin 後 retry 失敗時の INEFFECTIVE ログ確認）。本番の `adapter-factory.ts` は現状 `reLoginFn` を注入しておらず、既存の呼び出し元・エラーハンドリング（`apps/api/src/routes/sync.ts` の汎用 catch、文字列マッチなし）への影響はないことを Explore agent の事前調査で確認済み。

### 検証

- `pnpm --filter @calendar-hub/calendar-sdk vitest run timetree-adapter` — 35 tests PASS
- `pnpm turbo type-check` — 8/8 packages PASS
- `pnpm lint` — 全 PASS
- `pnpm test`（モノレポ全体） — 246 tests PASS
- `/code-review low` 実施 — findings 0 件
- PR #184 の CI (quality/e2e/GitGuardian/CodeRabbit) 全 PASS を確認後、番号単位の明示認可を得てマージ

### 同根再発スキャン (§ 4.6)

本セッション修正 PR: PR #184 (`fix(calendar-sdk):`) 1 件。

- 本セッション内の同根候補: 他に修正 PR なし
- 過去 7 日 archive を `TimeTreeAdapter` / `reLoginFn` / `TT-SESSION` / `ADR-009` で grep → `archive/2026-06-26_to_27-vol7-to-vol9.md` のみヒット（ADR-009 自体の過去記録であり、バグ再発ではなく ADR に事前記録された改善候補の計画的解消）

→ **同根再発候補 0 件（計画的 debt 解消のため対象外）** ✅

### 対症療法判定 (§ 4.7)

| #   | 基準                                              | 判定 (PR #184)                                                                                        |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | retry/timeout/fallback/文言修正のみで調査ログなし | ❌ transient/permanent 分類の構造的変更 (`rules/error-handling.md §3` 準拠) + 新規エラークラス導入    |
| 2   | WebSearch / changelog 確認なし                    | ⏭️ 該当なし（外部要因起因のバグ修正ではなく、ADR-009 に事前記録済みの設計改善の計画的実装のため不要） |
| 3   | 同症状 PR が過去 30 日に 1 件以上                 | ❌ TimeTreeAdapter のエラー分類変更は初                                                               |
| 4   | smoke のみで構造的検証なし                        | ❌ TDD 新規 4 テスト + 型チェック + lint + 全体テスト (246 件) PASS                                   |

→ **対症療法疑いなし** ✅

### グローバル memory scope (§ 4.5)

memory ファイル変更なし、スキップ。

### 構造的整合性 (§ 4)

`packages/calendar-sdk`（共有ロジック）の変更。正式な `/impact-analysis` スキルは未実行だが、Explore agent で `apps/api` の呼び出し元・エラーハンドリングへの影響を個別調査済み（`adapter-factory.ts` は reLoginFn 未注入、`sync.ts` は汎用 catch でエラーメッセージの文字列マッチなし）→ 影響なしを確認。

### Issue Net 変化 (第 13 編)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0**（ADR 記載済みタスクの実装のため Issue 起票不要）

### 次のアクション (第 13 編 update)

#### 即着手タスク

なし。

#### 条件待ち (明示 trigger 付き) — 第 12 編の 6 件のうち ADR-009 既存ロジック強化 3 件を解消、残り 5 件は変化なし

| #   | 項目                                                                    | trigger                                                        | trigger 充足時のタスク                                           |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | C1 拡張 (booking-mirror に Google Calendar 自動登録追加)                | decision-maker から「C1 着手」明示指示                         | spec §9.1 末尾参照 (第 9 編から継続)                             |
| 2   | gRPC-web API 仕様変更時の運用 fallback                                  | Google 側で `internal` namespace 変更 / API Key 失効           | `parseSlotResponse` の structured log alert 化 (第 9 編から継続) |
| 3   | ADR-010 Future Work 残り 2 件（Error Budget アラート / PII 直書き検知） | decision-maker 起点指示（本番 GCP 変更を伴うため個別認可必須） | ADR-010 実装フェーズ §4-5 参照                                   |
| 4   | Issue #145 の 3 連続 PASS 厳密化                                        | 万一 main 上で flaky 再発                                      | diagnostic PR 起動 (第 9 編から継続)                             |
| 5   | book-mirror デスクトップ (≥ 768px) UI レビュー                          | decision-maker 起点指示                                        | モバイル改修は desktop 非 touch (第 9 編から継続)                |

ADR-009 既存ロジック強化 3 件（旧項目 3 の一部）は本セッションで PR #184 により完全解消。

#### 却下候補 (記録のみ)

第 9-10 編の却下候補は変化なし。

### 再開可能性判定 (第 13 編)

| 項目                    | 状態                                                  |
| ----------------------- | ----------------------------------------------------- |
| OPEN PR                 | 0 件 ✅ (PR #184 merge 済)                            |
| active Issue            | 0 件 ✅                                               |
| Git clean               | ✅                                                    |
| 残留プロセス            | ✅ なし                                               |
| 構造的整合性            | ✅ 確認済み（Explore agent による手動調査、影響なし） |
| 同根再発                | ✅ なし（計画的 debt 解消）                           |
| 対症療法疑い            | ✅ なし                                               |
| グローバル memory scope | ⏭️ 変更なし                                           |

---

## 最終結論 (第 13 編)

✅ **セッション終了可** — ADR-009 既存ロジック強化 3 件を PR #184 で完全解消、CI 全 PASS・マージ済み・Git clean

- OPEN PR ゼロ、active Issue ゼロ、Git clean
- 即着手タスク = 0 / 条件待ち = 5 件（全て decision-maker 領分または外部 trigger 待ち、ADR-009 分は本セッションで解消済みのため削除）
- Issue Net 変化 = 0 / 0
- 同根再発候補 0 件（計画的 debt 解消）／対症療法疑いなし
- 残留プロセスなし
