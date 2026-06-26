# Calendar Hub ハンドオフ (2026-06-26)

> 第 3〜5 編は `archive/2026-06-25_to_26-vol3-to-vol5.md` に分離 (2026-06-26 第 7 編で実施)。LATEST.md は第 6 編以降のみ保持し 500 行制限内を維持する。

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

## 2026-06-26 セッション総括 (第 6 編): UX 修正 → 仕様根本見直し → Google 予約スケジュール完全反映ミラー実装 (PR #158-#163)

第 5 編完了後の idle 状態から、本田様の `/catchup` → idle 判定 → 予約スケジュール `/book/<linkId>` の表示 vs Google 予約スケジュール公開ページの不一致報告 → UX 修正 (PR #158) → 仕様根本見直し → OAuth 復旧 (PR #159/#160) → アカウント hard delete (PR #161) → **gRPC-web 公開 API ブレークスルー** → Codex review → v2 完全反映ミラー実装 (PR #162) → 本番 E2E 成功 → IaC 化 (PR #163) という当初想定を大幅に超える展開。

### PR 一覧 (8 件 merge + 1 件次セッション持ち越し)

| PR   | 内容                                                                       | 規模                | 結果                      |
| ---- | -------------------------------------------------------------------------- | ------------------- | ------------------------- |
| #158 | fix(web): 予約スロット表示の JST grouping bug 修正 + 時間帯セクション化 UX | 1 file / +75/-20    | ✅ merge + deploy success |
| #159 | fix(infra): GOOGLE_REDIRECT_URI を `infra/deploy-api.sh` deploy 時に設定   | 1 file / +5/-2      | ✅ merge + deploy success |
| #160 | fix(ci): GOOGLE_REDIRECT_URI を `.github/workflows/deploy.yml` で設定      | 1 file / +33/-1     | ✅ merge + deploy success |
| #161 | fix(api): アカウント解除を hard delete に変更                              | 2 files / +4/-9     | ✅ merge + deploy success |
| #162 | **feat(booking-mirror): Google 予約スケジュール完全反映ミラー機能 v2**     | 17 files / +2818/-2 | ✅ merge + deploy + E2E   |
| #163 | chore(infra): bookingMirrorLinks composite index 作成 script (IaC)         | 1 file / +41/-0     | ✅ merge                  |
| #164 | docs(handoff): 第 6 編 (初版)                                              | 1 file / +235/-37   | ✅ merge                  |
| #165 | feat(email): 通知メールに「Google カレンダーに追加」ボタンを追加           | 2 files / +146/-0   | ✅ merge + deploy + E2E   |
| #166 | (次セッション) ゲスト確認メール改修 + 主催者名空欄 bug 修正                | (未作成)            | ⏳ 次セッション持ち越し   |

### マイルストーン

#### M1: UX 修正 + 仕様独立性合意 (PR #158)

`apps/web/src/app/book/[linkId]/book-content.tsx` 単体 (+75/-20):

1. **JST grouping bug**: `slot.start.split('T')[0]` (UTC 日付) → `jstDateKey(isoStr)` ヘルパで JST 基準に統一 (dateGroups / 初期 selectedDate / selectedSlot / confirmation の 4 箇所)。翌日 08:00 が当日末尾に leak する bug 解消。
2. **時間帯セクション化**: 朝 (0-12) / 昼 (12-14) / 午後 (14-17) / 夕方 (17-19) / 夜 (19-) の見出し付きグループ表示。

本田様初期合意: 「CalendarHub は Google 予約スケジュールから読み取りだけする独立予約システム」。Google 公開枠との完全一致は採らない方針。

#### M2: 仕様根本見直し (本田様の真の要求発覚)

本田様再質問「**完全反映されないと意味がない。完全別枠でも良い**」+ Image #14 の別 URL `calendar.app.google/2jkd3Ve8yvhPGtwdA` 提示。

→ M1 の「独立システム」解釈が誤読と判明。本田様の真の要求は **「Google 予約スケジュール公開ページの完全 mirror」**。

事前の `docs/specs/2026-06-24-booking-mirror-design.md` (v1) では「Phase 1 で Bot 検知・規約リスクで運用不向き」と判定された取得方針を再検討する必要が出た。

#### M3: OAuth 連携復旧 (PR #159 / #160)

新規 yasushi.honda 連携試行で `redirect_uri_mismatch` (400) 発覚。原因は **本番 Cloud Run api の env `GOOGLE_REDIRECT_URI` 未設定**で、`apps/api/src/lib/google-oauth.ts:7` のデフォルト値 `http://localhost:8080/...` が送信されていた。

- PR #159: `infra/deploy-api.sh` 手動 deploy 経路に env 追加
- PR #160: `.github/workflows/deploy.yml` CI/CD 経路に env 追加 (二重管理構造の発覚)

両 PR 反映で本番 OAuth 連携成功。既存 `hy.unimail.11` がここまで動作していた経緯は「ローカル dev で OAuth 完了 → 既存 refresh_token を本番が使い続けていた」と推定。

#### M4: アカウント hard delete 化 (PR #161)

`deactivateAccount` は `isActive: false` 更新のみの soft delete で、settings 画面に「無効」バッジ付きで表示が残る挙動だった。本田様「削除したい」直観に反するため `deleteConnectedAccount` に rename、Firestore document を完全削除する hard delete に変更。

#### M5: gRPC-web 公開 API ブレークスルー

Playwright で Google 予約スケジュール公開ページ (Image #14) を開き、`browser_network_requests` で内部呼び出しを解析した結果:

```
POST https://calendar-pa.clients6.google.com/$rpc/google.internal.calendar.v1.AppointmentBookingService/ListAvailableSlots?key=<API_KEY>
Body: [null, null, "<schedule-id>", null, [[<start-unix>], [<end-unix>]]]
→ 200 OK
[[[[<unix-string>], <duration-min>], ...]]
```

- **認証ヘッダ不要** (X-Goog-Api-Key を query param で渡すだけ、SAPISIDHASH / Cookie 不要)
- サーバから cURL で叩いて 200 + Image #14 公開枠と完全一致するデータ取得を実証
- v1 設計仕様書 Phase 1 で却下されたスクレイピング方針を、構造化 JSON 取得可能な内部 API として再評価可能と判明

#### M6: Codex review + 反映 (verdict: 修正後進める)

impl-plan を Codex (`mcp__codex__codex` plan モード) に投げて second opinion 取得。**High リスク 5 件** (二重予約 / 直前再検証なし / durationMinutes 固定値 / 通知メール責務曖昧 / `internal` namespace 長期安定性) + Medium / Low を全件 impl-plan v2.1 に反映。

特に **High「二重予約リスク」** は本田様判断で **C2 採用** (個人運用としてリスク受容)。C1 (Google Calendar block event 書き込み) は spec §9.1 末尾に将来拡張点として記載。

#### M7: 完全反映ミラー実装 (PR #162、17 files / +2818/-2)

7 Phase で実装:

1. `apps/api/src/lib/google-booking-mirror.ts` — gRPC-web client + resolveScheduleId + parseSlotResponse + 構造化エラー (`invalid_shape` / `google_error_payload` / `non_json` / 4xx-5xx / timeout)
2. `apps/api/src/__tests__/google-booking-mirror.test.ts` — 10 tests (PoC fixture)
3. `packages/shared/src/booking-mirror-types.ts` — 型定義 (`BookingMirrorLink` 含む 8 型)
4. `apps/api/src/routes/booking-mirror-links.ts` — owner CRUD (GET / POST / PATCH / DELETE)
5. `apps/api/src/routes/public-booking-mirror.ts` — 公開 (info / slots / book)。POST `/book` で **gRPC slots 直前再検証** (Codex High 反映)
6. `apps/web/src/app/booking-mirror-links/{page,booking-mirror-links-content,new/...}.tsx` — 管理画面 (URL 1 フィールド入力)
7. `apps/web/src/app/book-mirror/[linkId]/{page,layout,book-mirror-content}.tsx` — 公開画面 (既存 book-content の時間帯セクション化を流用)

加えて `apps/api/src/app.ts` (新 route + rate limit)、`apps/web/src/components/AppNav.tsx` (「ミラー」ナビ追加)、`.github/workflows/deploy.yml` + `infra/deploy-api.sh` (Secret Manager 経由で API Key 接続)。

`docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md` (v2.1、Codex 反映済み) 同梱。

#### M8: 本番展開 + Secret + Index + E2E (PR #162 後続作業)

- 初回 GitGuardian fail (API Key hardcode 検知) → Secret Manager 化 + `git reset --soft HEAD~2` + `--force-with-lease` push で history 書き換え → CI pass
- Deploy 失敗 (Secret 未作成) → `gcloud secrets create google-booking-mirror-api-key` + Cloud Run SA IAM 付与 + `gh run rerun --failed` で復旧
- Firestore composite index missing (500) → `gcloud firestore indexes composite create bookingMirrorLinks (ownerUid + createdAt DESC)` で即時作成
- 本田様 E2E 動作確認: **公開枠 8/8 完全一致** (Image #19/#20)、**予約 → メール通知 即時受信** (Image #21/#22)

#### M9: IaC 化 (PR #163)

本番では gcloud で即時 index 作成済みだが、新環境構築 (staging / disaster recovery) 時の再現性確保のため `infra/setup-firestore-indexes.sh` を作成。冪等 (既存 index は AlreadyExists で skip)。

#### M10: 通知メールに Google カレンダー追加ボタン (PR #165)

C2 採用により Google Calendar への自動 event 作成は行わないため、本田様が手動で予定を入れる手間が発生していた。OAuth 連携を増やさず最小コストで解決するため、通知メール本文に **Google Calendar event 作成画面 (deep link)** を開くボタンを追加。

- `buildGoogleCalendarRenderUrl(title, start, end, details)` helper 追加 (URL 形式: `calendar.google.com/calendar/render?action=TEMPLATE&...`、dates は `YYYYMMDDTHHMMSSZ` 形式)
- `buildBookingNotificationHtml` に `<a>` ボタン (青背景 + 📅 emoji) 挿入、`target="_blank"` + 補足テキスト
- unit test 7 件追加 (`apps/api/src/__tests__/email-render-url.test.ts`)
- 本田様 E2E 確認: ボタン表示 ✅ / クリック → Google Calendar 予定作成画面プレフィル ✅ (Image #23/#24)

### 本セッションで発見した残課題 (PR #166 候補、次セッション)

E2E 確認中に追加で発覚した小バグ + 改善余地:

1. **ゲスト向け確認メール (`buildBookingConfirmationHtml`) にも Google カレンダーボタン未追加** (Image #25)
   - owner 通知側 (PR #165) と同等の改修が必要
   - 実運用 (外部ゲスト予約) で guest 側も Google Calendar に登録しやすくなる
2. **主催者名空欄 bug** (Image #25 「主催者: 」が空欄)
   - `getOwnerDisplayName`: `data?.displayName ?? data?.email ?? 'User'` の `??` は `undefined` のみ default に落とすため、`displayName: ''` (空文字) の場合に空文字をそのまま返してしまう
   - `||` に変更すれば空文字も fallback される

本田様判断: **次セッションで対応** (PR #166 として)。本セッションでは handoff に記録のみ。

### 設計仕様書 (v2.1) 主要章

`docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md` 全 11 章。要点:

- §2 動機: v1 (Calendar API events.list 自前算出) は Working Hours / Buffer / 1h 境界が取得不可、v2 で gRPC-web 直叩きに pivot
- §3 要件: FR-1 (短縮 URL 1 つで作成) / FR-6 (Google Calendar 自動登録なし、C2 受容) / FR-9 (60s ポーリング)
- §4 アーキテクチャ: schedule ID 解決 (短縮 URL 30x redirect → 完全 URL から抽出)、fetchAvailableSlots 呼び出しサンプル
- §5 データモデル: 新規 `bookingMirrorLinks` collection (sourceUrl / scheduleId / notificationEmail / rangeDays)
- §6 インターフェース変更: 新規 API 6 個 + 新規 FE 2 ページ
- §9.1 二重予約リスク取り扱い (C2 採用根拠 + C1 拡張点)
- §9.2 Codex review 反映の technical 改善点 (10 項目)
- §10 Open Questions (PoC で済んだもの / 未確認 4 件)
- §11 実装フェーズ計画 (Phase 1-6、推定 3 時間)

### 本田様の真の要求 (達成状況)

| 要求                                                                  | 達成 |
| --------------------------------------------------------------------- | ---- |
| Google 予約スケジュール URL 1 つを設定するだけで完全反映              | ✅   |
| Google 内部の Working Hours / Buffer / 予約済み判定をそのまま反映     | ✅   |
| OAuth 連携不要                                                        | ✅   |
| ページ open / リロード / 60s ポーリング / visibility / focus で最新化 | ✅   |
| ゲスト予約成立で hy.unimail.11 にメール通知                           | ✅   |
| Google Calendar への自動 event 登録なし (今回 C2 採用)                | ✅   |

### Quality gate (PR #162)

| 項目                                         | 結果                      |
| -------------------------------------------- | ------------------------- |
| `pnpm --filter @calendar-hub/shared build`   | ✅                        |
| `pnpm --filter @calendar-hub/api type-check` | ✅                        |
| `pnpm --filter @calendar-hub/api lint`       | ✅                        |
| `pnpm --filter @calendar-hub/web type-check` | ✅                        |
| `pnpm --filter @calendar-hub/web lint`       | ✅                        |
| `pnpm test` (新規 10 含む)                   | ✅ 224 tests pass         |
| CI quality / e2e / GitGuardian / CodeRabbit  | ✅ all pass               |
| Deploy workflow (calendar-hub-api + web)     | ✅ SUCCESS (re-run 後)    |
| 本番 E2E (公開枠表示 + 予約 + メール通知)    | ✅ Image #19-#22 で確認済 |

### Codex review 反映の Technical 改善点 (10 件)

1. `durationMinutes` を gRPC レスポンスから動的取得 (固定値前提廃止)
2. 通知メール送信者 = hy.unimail.11、宛先 = link.notificationEmail に責務分離
3. POST `/book` で gRPC slots 直前再検証 (stale / 任意 slot POST 防止)
4. 構造化エラー分類 (`invalid_shape` / `google_error_payload` / `non_json` / 4xx-5xx / timeout)
5. API Key を Secret Manager 経由 (`google-booking-mirror-api-key`)
6. `bookings` collection に `linkType: 'bookingLink' | 'bookingMirrorLink'` 追加
7. `fetch` に `AbortSignal.timeout(8s)` 必須
8. Rate limit を既存 `/api/public/booking/*` と同等で適用
9. 短縮 URL + 完全 URL 両方を入力受付
10. 二重予約リスクは spec §9.1 で C2 採用 (将来 C1 拡張点も明記)

### Issue Net 変化 (第 6 編)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0** (新機能実装で本来 Issue 起票せず、impl-plan + Codex review で代替)

### 同根再発スキャン (§ 4.6)

- 本セッション修正 PR: PR #158 (fix(web)) / PR #159 (fix(infra)) / PR #160 (fix(ci)) / PR #161 (fix(api)) の 4 件
- handoff archive 7 日 grep (booking-mirror / grpc / redirect_uri / hard-delete): **ヒットなし**
- git log 30 日: 関連修正は今 session 内のみ
- **同根再発候補 0 件** ✅

### 対症療法判定 (§ 4.7)

| PR   | 基準 1 (retry のみ)               | 基準 2 (調査なし)      | 基準 3 (30 日内同症状)     | 基準 4 (構造的検証なし)  |
| ---- | --------------------------------- | ---------------------- | -------------------------- | ------------------------ |
| #158 | ❌ JST 構造修正                   | ❌ logic bug           | ❌ 新規                    | ❌ E2E + 本番スクショ    |
| #159 | ❌ 構造的修正 (env 追加)          | ❌ env 設定漏れ        | ❌ 新規                    | ❌ gcloud describe 確認  |
| #160 | ❌ CI/CD 二重管理発覚への構造修正 | ❌ deploy.yml 経路発見 | ❌ #159 続編、同根構造修正 | ❌ Deploy + env 反映確認 |
| #161 | ❌ soft → hard delete 構造修正    | ❌ deactivate 仕様確認 | ❌ 新規                    | ❌ E2E 削除確認          |

→ 全 PR 全基準 ❌、**対症療法疑いなし** ✅

### グローバル memory scope (§ 4.5)

`git status` で `memory/` 配下変更なし → スキップ ✅。

ただし本セッションで多数の汎用教訓が出ているため、handoff merge 後に follow-up で追加候補:

- Cloud Run env の二重管理リスク (deploy.yml + deploy-api.sh)
- Google 内部公開 API の Playwright network 解析パターン
- soft delete vs hard delete の UX 整合性
- Codex review verdict 「修正後進める」を impl-plan に反映するワークフロー

(本 PR では追加せず、別途整理。)

### 構造的整合性 (§ 4)

| 項目                               | 判定                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 型・共有ロジック・設定ファイル変更 | ✅ `BookingMirrorLink` 型新規、call site (`apps/api` + `apps/web`) 全更新済                                                            |
| 新規テーブル / API 追加            | ✅ `bookingMirrorLinks` collection + `/api/booking-mirror-links` + `/api/public/booking-mirror` (composite index は PR #163 で IaC 化) |
| データフロー実装                   | ✅ gRPC-web → parser → BookingMirrorSlot → FE 表示までトレース可能                                                                     |

## 次のアクション (第 6 編 final update)

### 即着手タスク

なし。本セッション (第 6 編) で PR #158-#165 を全て merge + 本番反映 + E2E 動作確認まで完了。OPEN PR ゼロ。

### 条件待ち (明示 trigger 付き)

| #   | 項目                                                                     | trigger                                              | trigger 充足時のタスク                                                                                                                                                     |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **PR #166: ゲスト確認メール改修 + 主催者名空欄 bug 修正** (次セッション) | decision-maker 起点指示 (本セッション中に確認済み)   | (1) `buildBookingConfirmationHtml` に Google カレンダーボタン追加 (PR #165 同等)、(2) `getOwnerDisplayName` の `??` → `\|\|` 修正で `displayName: ''` (空文字) も fallback |
| 2   | C1 拡張 (booking-mirror に Google Calendar 自動登録追加)                 | decision-maker から「C1 着手」明示指示               | 対象カレンダーを CalendarHub OAuth 連携、`BookingMirrorLink` に `blockCalendarId` 等追加、POST `/book` に `createBlockEvent` 追加 (spec §9.1 末尾参照)                     |
| 3   | gRPC-web API 仕様変更時の運用 fallback                                   | Google 側で `internal` namespace 変更 / API Key 失効 | `parseSlotResponse` の structured log を Cloud Logging で alert 化、Codex review High #1 の継続対応                                                                        |
| 4   | global memory 追加 (本セッション教訓 4 件)                               | 別セッションで本田様確認                             | Cloud Run env 二重管理 / Google 内部 API Playwright 解析 / soft vs hard delete UX / Codex verdict ワークフロー                                                             |
| 5   | PR #153 本番適用 (`bash infra/setup-monitoring.sh`)                      | decision-maker 手動実行 (第 5 編からの継続)          | 適用後 alert policy 表示確認                                                                                                                                               |
| 6   | PR #154/#155/#156 本番適用                                               | decision-maker 手動実行 (第 5 編からの継続)          | 適用後 各リソース確認 (buckets / SLOs / dashboard)                                                                                                                         |
| 7   | ADR-010 Future Work 3 件 + ADR-009 既存ロジック強化 3 件                 | decision-maker 起点指示 (第 5 編からの継続)          | 該当指示時に着手                                                                                                                                                           |
| 8   | Issue #145 の 3 連続 PASS 厳密化                                         | 万一 main 上で flaky 再発                            | listener は永続化済み、再発時に diagnostic PR を起動                                                                                                                       |

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

| 項目                    | 状態                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| OPEN PR                 | 0 件 ✅ (PR #163/#164/#165 merge 済、本 handoff PR が最後)                                                         |
| active Issue            | 0 件 ✅                                                                                                            |
| Git clean               | ✅ (本 handoff PR commit 後)                                                                                       |
| 残留プロセス            | ✅ なし                                                                                                            |
| Deploy 状態             | ✅ 全 PR (#158-#165) 本番反映完了、E2E 動作確認済                                                                  |
| 構造的整合性            | ✅ `BookingMirrorLink` 型新規、call site 全更新済                                                                  |
| 同根再発                | ✅ なし (本セッション内 / 過去 7 日 archive とも候補 0 件)                                                         |
| 対症療法疑い            | ✅ なし (全 PR で構造的修正を確認)                                                                                 |
| グローバル memory scope | ✅ memory 変更なし、§ 4.5 スキップ                                                                                 |
| 本番 GCP 設定           | ✅ Secret Manager `google-booking-mirror-api-key` 作成済、Cloud Run SA IAM 付与済、Firestore composite index READY |
| 本番 E2E 動作確認       | ✅ ミラー公開ページ + 予約 + メール通知 + Google カレンダーボタン (Image #19-#24)                                  |

---

## 最終結論

✅ **セッション終了可** — 本セッション最大成果 (Google 予約スケジュール完全反映ミラー + 通知メール Google カレンダーボタン) が本番反映 + E2E 確認まで全て完了

- OPEN PR ゼロ (PR #163/#164/#165 merge 済、本 handoff PR が最後)
- active Issue ゼロ
- Git clean (本 handoff PR commit 後)
- 即着手タスク = 0 / 残留プロセスなし
- Issue Net 変化 = 0 / 0
- PR merge 8 件 (#158/#159/#160/#161/#162/#163/#164/#165)
- 同根再発候補 0 件 / 対症療法疑いなし (全 PR 構造的修正)
- 本セッション最大成果: 本田様の真の要求「Google 予約スケジュール完全反映 + 1 クリックでカレンダー登録」を達成
- 次セッション持ち越し: PR #166 (ゲスト確認メール改修 + 主催者名空欄 bug 修正、本田様判断により次セッションへ)
