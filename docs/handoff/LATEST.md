# Calendar Hub ハンドオフ (2026-06-26)

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
