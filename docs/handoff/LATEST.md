# Calendar Hub ハンドオフ (2026-06-27)

> 第 3〜5 編は `archive/2026-06-25_to_26-vol3-to-vol5.md` に分離 (2026-06-26 第 7 編で実施)。第 6 編は `archive/2026-06-26-vol6.md` に分離 (2026-06-27 第 8 編で実施)。LATEST.md は第 7 編以降のみ保持し 500 行制限内を維持する。

## 2026-06-26 セッション総括 (第 7 編): PR #167 ゲスト確認メール改修 + 主催者名 bug 修正 + グローバル memory 追加

第 6 編 final update で次セッション持ち越し判定された **PR #166 候補 2 件** (ゲスト確認メール改修 + 主催者名空欄 bug 修正) を本セッションで全クローズ。あわせてミラー機能の gRPC-web 発見プロセスを抽象化した汎用 reference をグローバル memory に追加し、handoff LATEST.md の archive 整理も実施。

### PR 一覧

| PR   | 内容                                                     | 規模              | 結果                      |
| ---- | -------------------------------------------------------- | ----------------- | ------------------------- |
| #167 | fix(email): ゲスト確認メール改修 + 主催者名空欄 bug 修正 | 6 files / +143/-5 | ✅ merge + Deploy success |
| #168 | (本 PR) docs(handoff): 第 7 編 + archive 整理            | 2 files (想定)    | ⏳ 本セッションで作成中   |

### 主要成果

#### M1: 主催者名空欄 bug 修正 (PR #167)

`getOwnerDisplayName` で `data?.displayName ?? data?.email ?? 'User'` の `??` は `undefined`/`null` のみ fallback するため、Firestore に `displayName: ''` (空文字) が入った場合に空文字をそのまま返し、確認メールで「主催者: 」が空欄になる bug が発生していた。

修正方針:

- pure helper `pickOwnerDisplayName` を `apps/api/src/lib/owner-display-name.ts` に新規作成 (`||` 使用、Why コメント明示)
- `public-booking.ts` + `public-booking-mirror.ts` の重複定義 2 箇所を helper 経由に統一 (DRY 改善は bug 修正の副次効果)
- 単体テスト 8 件 (null / undefined / 空文字 / 空白 / 両ありなし の境界値網羅)

#### M2: ゲスト確認メールに Google カレンダーボタン追加 (PR #167)

PR #165 (owner 通知側) と対称実装。`buildBookingConfirmationHtml` に `buildGoogleCalendarRenderUrl` を活用したボタン追加。

- タイトル: `<linkTitle> - <ownerDisplayName>` (ゲスト視点で「誰との予定か」明示)
- details: 主催者 / 所要時間
- 単体テスト 4 件追加 (URL / title / details / 既存要素維持)

#### M3: グローバル memory 追加 — Network 観察技法の reference

第 6 編 M5 (gRPC-web ブレークスルー) を抽象化し、グローバル `reference_browser_internal_api_observation.md` を新規作成。

- 内容: 公式 API 不在時に Network 観察 → curl 最小化で internal API の公開性を判別する技法
- ガード: 規約評価は decision-maker 領分 / public web client と同じ key/path の実証必須 / `internal` namespace 不安定性は構造化エラー + alert でカバー
- scope 判定: ✅ 汎用原則のみ (プロジェクト固有な人名・組織名・実機絶対パス含まず、CRITICAL §8 準拠)
- MEMORY.md: 「Tool / MCP / Skill / Plugin」セクション末尾に 1 行 index 追加 (136 → 137 行、200 制限内)
- commit 担当: グローバル AI セッション側 (Calendar Hub プロジェクト AI の領分外)

#### M4: MUST 化 vs reference の trade-off 議論 (decision-maker 判断)

本 reference を CLAUDE.md MUST 化するか議論。多角的評価の結果:

| 観点            | 結論                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| MUST 化の効果   | 「絶対に次回も同じ判断に到達」を保証 (push 型強制)                          |
| MUST 化のリスク | Cognitive noise / 過剰拡大解釈 / MUST inflation / 4 原則 §1 衝突            |
| 希少事象 ROI    | 「internal API 発見」は年に数回。日常的に発動する MUST と並列にすべきでない |

→ **case A 採用** (現状の reference + MEMORY.md index、pull 型運用)。CLAUDE.md は触らない。

#### M5: handoff LATEST.md archive 整理 (本 PR)

LATEST.md 487 行 (500 行目標を逸脱寸前) のため、第 3〜5 編 (2026-06-25〜26、line 220-424) を `archive/2026-06-25_to_26-vol3-to-vol5.md` に分離。第 6 編 + 第 7 編のみ保持し、~280 行に圧縮。

### Issue Net 変化 (第 7 編)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0** (active Issue ゼロ維持)

本日通算 (第 6 編 + 第 7 編): PR merge **9 件** (#158-#163, #164, #165, #167)、グローバル memory **1 件追加** (`reference_browser_internal_api_observation.md`)、active Issue 0 件維持。

### 同根再発スキャン (§ 4.6)

本セッション修正 PR: PR #167 (`fix(email):`) 1 件。

- 同根 keyword grep (`email` / `displayName` / `getOwnerDisplayName`): 過去 7 日 archive ヒットなし
- PR #165 (owner 通知側 feat) は **意図的な対称実装**で同根バグではない
- 同 util / 同 middleware / 同依存共有 PR: なし

→ **同根再発候補 0 件** ✅

### 対症療法判定 (§ 4.7)

| #   | 基準                                              | 判定 (PR #167)                                                |
| --- | ------------------------------------------------- | ------------------------------------------------------------- |
| 1   | retry/timeout/fallback/文言修正のみで調査ログなし | ❌ 構造的修正 (`??` → `\|\|` + helper 集約 + DRY 改善)        |
| 2   | WebSearch / changelog 確認なし                    | ❌ JS 仕様 (`??` vs `\|\|`) は確定挙動、外部要因起因ではない  |
| 3   | 同症状 PR が過去 30 日に 1 件以上                 | ❌ 新規発見 bug                                               |
| 4   | smoke のみで構造的検証なし                        | ❌ unit test 12 件追加 + lint + type-check + e2e 7 件 全 PASS |

→ **対症療法疑いなし** ✅

### グローバル memory scope (§ 4.5)

`~/.claude/memory/` 配下に変更 2 件 (`reference_browser_internal_api_observation.md` 新規 + `MEMORY.md` index 追加)。

- scope 判定: ✅ 汎用原則のみ、プロジェクト固有要素含まず
- commit 担当: ⏭️ Calendar Hub プロジェクト AI 領分外、グローバル AI セッション側で処理

### 構造的整合性 (§ 4)

| 項目                               | 判定                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 型・共有ロジック・設定ファイル変更 | ✅ `pickOwnerDisplayName` helper 新規、call site (`public-booking.ts` + `public-booking-mirror.ts`) 全更新済 |
| 新規テーブル / API 追加            | ⏭️ なし                                                                                                      |
| データフロー実装                   | ⏭️ なし                                                                                                      |

### Quality Gate (PR #167)

| 項目                                        | 結果                                       |
| ------------------------------------------- | ------------------------------------------ |
| `pnpm vitest run` (API)                     | ✅ 150 tests pass (helper 8 + html 4 追加) |
| `pnpm test` (全パッケージ)                  | ✅ 243 tests pass (15 files)               |
| `pnpm --filter @calendar-hub/api lint`      | ✅                                         |
| `pnpm turbo type-check`                     | ✅ 8 packages successful                   |
| `/safe-refactor`                            | ✅ 自動修正対象なし                        |
| `/code-review low`                          | ✅ findings 0                              |
| CI quality / e2e / GitGuardian / CodeRabbit | ✅ all pass                                |
| Deploy workflow (calendar-hub-api + web)    | ✅ success (9m6s)                          |

### 本セッションで実施した運用議論 (記録)

1. **MEMORY.md 200 行制限の認識共有** — `MEMORY.md is always loaded into your conversation context — lines after 200 will be truncated`。今後追記時は (1) 既存行数確認、(2) 200 接近時は統合・圧縮検討、(3) 純粋追加は 1 行 / ~150 chars、(4) memory body は別ファイル + index 1 行リンク
2. **グローバル設定の commit scope** — `~/.claude/` 配下の commit はグローバル AI セッションの領分。プロジェクト AI (本セッション) は memory ファイル作成までを executor として実施し、commit は別 scope で処理
3. **MUST 化の trade-off** — MUST は強制力高いが、希少事象に適用すると cognitive noise を生む。pull 型 (reference + index) と push 型 (MUST) の使い分け原則を再確認

### 次のアクション (第 7 編 final)

#### 即着手タスク

なし。本セッションで PR #167 merge + Deploy 完了、handoff PR (#168 想定) 作成中。

#### 条件待ち (明示 trigger 付き)

| #   | 項目                                                 | trigger                                            | 充足時のタスク                                               |
| --- | ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| 1   | グローバル memory `~/.claude/` 側の commit/push      | グローバル AI セッション起動                       | 同セッションで `git status` → commit → push                  |
| 2   | PR #167 本番動作確認 (実機)                          | decision-maker 手動 E2E                            | 「主催者: 本田泰」表示 + Google カレンダーボタンクリック確認 |
| 3   | C1 拡張 (booking-mirror に Google Calendar 自動登録) | decision-maker 起点指示                            | spec §9.1 末尾参照                                           |
| 4   | gRPC-web API 仕様変更時の運用 fallback               | Google 側 `internal` namespace 変更 / API Key 失効 | `parseSlotResponse` の structured log alert 化               |

#### 却下候補 (記録のみ)

| #   | 項目                                                                        | 着手しない理由                                                                                                                                 |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `~/.claude/CLAUDE.md` に Network 観察 MUST 追加                             | 多角的評価の結果 MUST 化は逆効果リスク大 (cognitive noise / 4 原則衝突)。reference + index で 70% 効果、残り 30% を取りに行くコスト > メリット |
| 2   | v1 bookingLink 機能の完全廃止                                               | 共存可能、廃止は decision-maker 起点指示で別途                                                                                                 |
| 3   | `firebase.json` + `firestore.indexes.json` フルセット導入                   | 整理・点検カテゴリ、既存 PR #163 で最小カバー済                                                                                                |
| 4   | gRPC-web API レスポンスの protobuf-typed parser                             | 新規価値創出、現状の defensive parser で十分稼働                                                                                               |
| 5   | global memory 追加候補 (Cloud Run env 二重管理 / soft vs hard delete UX 等) | 別セッションで本田様確認、グローバル AI 側の領分                                                                                               |

### 再開可能性判定 (第 7 編)

| 項目                        | 状態                                   |
| --------------------------- | -------------------------------------- |
| OPEN PR                     | 1 件 (本 handoff PR #168、最後の PR)   |
| active Issue                | 0 件 ✅                                |
| Git clean (本 PR commit 後) | ✅                                     |
| 残留プロセス                | ✅ なし                                |
| Deploy 状態                 | ✅ PR #167 本番反映完了                |
| 構造的整合性                | ✅ helper 集約完了、call site 全更新   |
| 同根再発                    | ✅ なし                                |
| 対症療法疑い                | ✅ なし                                |
| グローバル memory scope     | ✅ 汎用、commit はグローバル AI 側     |
| MEMORY.md 行数              | ✅ 137 / 200                           |
| LATEST.md 行数              | ✅ ~430 / 500 (archive 分離で余裕確保) |

### 最終結論 (第 7 編)

✅ **セッション終了可** — PR #167 merge + Deploy + memory 追加 + handoff archive 整理まで完了

- OPEN PR: 1 件 (本 handoff PR)
- active Issue: 0 件
- 即着手タスク: 0 件 / 条件待ち: 4 件 (全 decision-maker 領分)
- 同根再発候補 0 件 / 対症療法疑いなし
- 本セッション最大成果: handoff 第 6 編「次セッション持ち越し判定」項目をすべてクローズ + gRPC-web 発見プロセスを汎用 reference 化

---

## 2026-06-27 セッション総括 (第 8 編): PR #169 book-mirror モバイル UI 大幅改善 (media query bug 修正)

decision-maker から本番 URL のモバイル表示スクリーンショット提示 + `/fd` skill 起点で改善依頼。`book-mirror` ページの 390px モバイル表示が著しく使いにくかった問題を構造的に修正し、本番反映 + 実機 UI 確認まで完了。

### PR 一覧

| PR   | 内容                                                          | 規模           | 結果                       |
| ---- | ------------------------------------------------------------- | -------------- | -------------------------- |
| #169 | fix(book-mirror): モバイル UI 大幅改善 (media query bug 修正) | 1 file +89/-14 | ✅ merge + Deploy 9m25s OK |

### 主要成果

#### M1: 根本 bug — `@media (max-width: 768px)` が機能していなかった

`keyframes` 内に書かれていた media query は className `book-layout` / `book-info-panel` を対象にしていたが、JSX 側に **該当 className 未付与**。`style` 属性のみで実装されており、media query セレクタが一切マッチせず、モバイル (390px) でも 2 カラム横並び (info 38.2% / content 61.8%) が押し込まれていた。

修正方針:

- JSX 側 13 箇所に className 付与 (`book-layout` / `book-info-panel` / `book-content-panel` / `book-slots-grid` / `book-slot-btn` / `book-date-card` / `book-input` / `book-submit-btn` / `book-meeting-title` / `book-description` / `book-divider` / `book-steps` / `book-step`)
- `@media (max-width: 767px)` を mobile-first 思想で再設計

#### M2: モバイル UX 改善 (≤ 767px)

- 縦並びレイアウト + `min-height: auto !important` で空白除去
- info panel を compact 化、step indicator を inline 横並び
- content panel `max-height: 80vh` 解除でスムーススクロール
- 時間枠 grid を `repeat(2, 1fr)` 強制 2 列化 (従来 autofit で実質 1 列)
- touch target 44x44px 以上確保 (date-card 64x76 / slot-btn 48 / input 44 + font-size 16px で iOS Safari zoom 抑止 / submit-btn 52 + sticky bottom)

### 検証

- pnpm lint ✅ / type-check ✅ / next build ✅ (16 pages, book-mirror/[linkId] 含む)
- code-review low ✅ (findings なし)
- 本番デプロイ後の実機確認: iPhone 12 Pro viewport で縦並び + step inline + 日付横スクロール + 時間枠 2 列 + 44px touch target すべて反映確認 ([Image #3])

### 同根再発スキャン (§ 4.6)

- 本セッション内 / 過去 7 日 archive とも候補 0 件
- PR #169 は CSS / className のみ、共有 util / middleware / 外部 API 経由なし

### 対症療法判定 (§ 4.7)

- 該当なし (retry / fallback / 文言修正のみではなく、media query セレクタと JSX className 不整合という root cause を特定 + 修正)

### グローバル memory scope チェック (§ 4.5)

- memory ファイル変更なし、スキップ

### 教訓 (今回特に新 memory 化はせず、handoff のみで記録)

- inline `style` と CSS class を併用する component で media query が効かない場合、まず JSX 側の className 付与漏れを疑う (これは React 一般の pitfall で、Calendar Hub プロジェクト固有ではないが、頻度低なので global memory 化は見送り)

---

## 次のアクション (第 8 編 update)

### 即着手タスク

なし。本セッション (第 8 編) で PR #169 (book-mirror モバイル UI 改善) を merge + 本番反映 + 実機確認まで完了。OPEN PR ゼロ。

### 条件待ち (明示 trigger 付き)

| #   | 項目                                                     | trigger                                              | trigger 充足時のタスク                                                                                                                                 |
| --- | -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | C1 拡張 (booking-mirror に Google Calendar 自動登録追加) | decision-maker から「C1 着手」明示指示               | 対象カレンダーを CalendarHub OAuth 連携、`BookingMirrorLink` に `blockCalendarId` 等追加、POST `/book` に `createBlockEvent` 追加 (spec §9.1 末尾参照) |
| 2   | gRPC-web API 仕様変更時の運用 fallback                   | Google 側で `internal` namespace 変更 / API Key 失効 | `parseSlotResponse` の structured log を Cloud Logging で alert 化、Codex review High #1 の継続対応                                                    |
| 3   | global memory 追加 (第 6 編教訓 4 件)                    | 別セッションで本田様確認                             | Cloud Run env 二重管理 / Google 内部 API Playwright 解析 / soft vs hard delete UX / Codex verdict ワークフロー                                         |
| 4   | PR #153 本番適用 (`bash infra/setup-monitoring.sh`)      | decision-maker 手動実行 (第 5 編からの継続)          | 適用後 alert policy 表示確認                                                                                                                           |
| 5   | PR #154/#155/#156 本番適用                               | decision-maker 手動実行 (第 5 編からの継続)          | 適用後 各リソース確認 (buckets / SLOs / dashboard)                                                                                                     |
| 6   | ADR-010 Future Work 3 件 + ADR-009 既存ロジック強化 3 件 | decision-maker 起点指示 (第 5 編からの継続)          | 該当指示時に着手                                                                                                                                       |
| 7   | Issue #145 の 3 連続 PASS 厳密化                         | 万一 main 上で flaky 再発                            | listener は永続化済み、再発時に diagnostic PR を起動                                                                                                   |
| 8   | book-mirror デスクトップ (≥ 768px) UI レビュー           | decision-maker 起点指示                              | モバイル改修で desktop は touch せず、layout 維持。要望あれば確認                                                                                      |

### 却下候補 (記録のみ)

| #   | 項目                                                          | 着手しない理由                                                                                        |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | v1 bookingLink 機能の完全廃止                                 | 共存可能、廃止は decision-maker 起点指示で別途                                                        |
| 2   | `firebase.json` + `firestore.indexes.json` フルセット導入     | 整理・点検カテゴリ。既存 index export → JSON 化が必要、PR #163 で最小カバー済み、本セッションの範囲外 |
| 3   | gRPC-web API レスポンスの protobuf-typed parser               | 新規価値創出。現状の defensive parser で十分稼働、Codex 指摘外                                        |
| 4   | BigQuery sink (Issue #81 任意項目、第 5 編から継続)           | 新規価値創出。decision-maker 起点なし                                                                 |
| 5   | route group `(public)` で AuthProvider 分離 (第 5 編から継続) | 新規価値創出。アーキテクチャ改善は起点 unclear                                                        |
| 6   | E2E spec の listener を共通 helper に抽出 (第 5 編から継続)   | 整理・点検。DRY 効果限定的                                                                            |
| 7   | GitHub 脆弱性アラート 21 件の追加対応                         | 守り (修正)。Dependabot 自動 PR 待ち                                                                  |

### 再開可能性判定

| 項目                    | 状態                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| OPEN PR                 | 0 件 ✅ (PR #169 merge 済、本 handoff PR が最後)                    |
| active Issue            | 0 件 ✅                                                             |
| Git clean               | ✅ (本 handoff PR commit 後)                                        |
| 残留プロセス            | ✅ なし                                                             |
| Deploy 状態             | ✅ PR #169 本番反映完了 (Deploy 9m25s success)、実機 UI 確認済      |
| 構造的整合性            | ✅ 1 file CSS / className 変更のみ、API・型・データフロー影響なし   |
| 同根再発                | ✅ なし (本セッション内 / 過去 7 日 archive とも候補 0 件)          |
| 対症療法疑い            | ✅ なし (root cause = className 未付与 を特定 + 構造的修正)         |
| グローバル memory scope | ✅ memory 変更なし、§ 4.5 スキップ                                  |
| 本番 UI 動作確認        | ✅ iPhone 12 Pro viewport で縦並び + 2 列 grid + 44px touch (Image) |

---

## 最終結論

✅ **セッション終了可** — PR #169 (book-mirror モバイル UI 大幅改善) が本番反映 + 実機 UI 確認まで完了

- OPEN PR ゼロ (PR #169 merge 済、本 handoff PR が最後)
- active Issue ゼロ
- Git clean (本 handoff PR commit 後)
- 即着手タスク = 0 / 残留プロセスなし
- Issue Net 変化 = 0 / 0
- 同根再発候補 0 件 / 対症療法疑いなし
- 本セッション成果: モバイル予約 UX を「使いにくくて見づらい」状態 → 縦並び + 2 列 grid + touch target 44px+ の usable な状態へ
- 次セッション候補: 第 7 編「条件待ち」リストは引き続き有効。decision-maker 起点指示があるまで AI 側からの能動着手なし
