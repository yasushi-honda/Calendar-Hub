# Calendar Hub ハンドオフ (2026-07-26, 第 15 編まで)

> 第 3〜5 編は `archive/2026-06-25_to_26-vol3-to-vol5.md` に分離 (2026-06-26 第 7 編で実施)。第 6 編は `archive/2026-06-26-vol6.md` に分離 (2026-06-27 第 8 編で実施)。第 7〜9 編は `archive/2026-06-26_to_27-vol7-to-vol9.md` に分離 (2026-07-19 第 12 編で実施、60KB 超過のため)。第 10〜13 編は `archive/2026-07-18_to_19-vol10-to-vol13.md` に分離 (2026-07-26 第 15 編で実施、60KB 超過のため)。LATEST.md は第 14 編以降のみ保持する。

## 2026-07-25/26 セッション総括 (第 14 編): Dependabot alert 完全解消 (16→0) + pnpm.overrides 陳腐化パターンの構造的発見・是正

catchup が新規検出した「fast-uri の Dependabot Updates workflow 失敗」を発端に段階的に調査範囲を拡大し、最終的に open Dependabot alert 16 件を全解消。過程で `pnpm.overrides` が時間経過で静かに陳腐化する構造的パターンを 4 パッケージ連続で発見し、§4.6 同根再発スキャンで第 10〜12 編との連続性を確認。再発防止のプロセス改善（memory 化 + CLAUDE.md 明記）まで実施した。

### PR 一覧

| PR   | 内容                                                                  | 規模              | 結果                                              |
| ---- | --------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| #186 | chore(deps): bump @hono/node-server from 1.19.13 to 2.0.10            | 2 files           | ✅ merge (CI green 確認済み)                      |
| #188 | fix(deps): fast-uri を pnpm.overrides で >=3.1.4 に固定               | 2 files +6/-4     | ✅ merge (CI 全 PASS 後)                          |
| #189 | fix(deps): tar/js-yaml/@hono/node-server の陳腐化した override を更新 | 2 files +18/-26   | ✅ merge (CI 全 PASS 後)                          |
| #190 | fix(deps): next/postcss/sharp/brace-expansion の脆弱性を解消          | 3 files +233/-197 | ✅ merge (large tier → `/code-review low` 実施後) |
| #191 | docs(claude-md): catchup 時の Dependabot alert 横断確認を明記         | 1 file +5/-1      | ✅ merge (CI 全 PASS 後)                          |

### 主要成果

#### M1: catchup 起点 — Dependabot open alert 16 件 → 0 件の完全解消

catchup が検出した fast-uri（`security_update_not_possible`）の調査を起点に、`gh api dependabot/alerts` で全件を横断確認しながら段階的に対応範囲を拡大。最終的に 5 PR で以下を解消:

| package                       | 問題                                                                    | 対応                                         |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| @hono/node-server             | apps/api 直接依存が 1.19.13 で fix 版未満                               | 2.0.10 へ更新 (PR #186)                      |
| fast-uri                      | devDependency (firebase-tools 配下) が 3.1.2 で fix 版未満              | override 追加 (PR #188)                      |
| tar                           | 既存 override target (第 12 編で追加) が新規 CVE 未カバー               | target 引き上げ (PR #189)                    |
| js-yaml                       | 既存 override target (第 10-11 編で追加) が 5.x 系の別 CVE を誘発       | 単一ルールへ統合し target 引き上げ (PR #189) |
| @hono/node-server(transitive) | `@google/genai` → MCP SDK peer 経由の別インスタンスが未解消             | override 追加 (PR #189)                      |
| next                          | apps/web 直接依存の lockfile が古いまま (override 無関係の単純ドリフト) | `pnpm update next`（PR #190）                |
| postcss                       | 既存 override target が新規 CVE 未カバー                                | target 引き上げ (PR #190)                    |
| sharp                         | next の optionalDependencies が旧バージョンに固定                       | override 新規追加 (PR #190)                  |
| brace-expansion               | 既存 override target が新規 CVE 未カバー                                | target 引き上げ (PR #190)                    |

#### M2:【重要な発見】pnpm.overrides の構造的陳腐化パターン（同根再発、詳細は § 4.6）

tar/js-yaml/postcss/brace-expansion の 4 件で共通して「override 追加時点の CVE は解消したが、後発の新規 CVE には自動追随しない」パターンを検出。js-yaml では上限なし `>=X.Y.Z` ターゲットが「その時点の latest」に解決されるため別 major の新規 CVE を誘発する挙動、および pnpm のローカル metadata cache（`~/Library/Caches/pnpm/metadata-v1.3/`）が古い `dist-tags.latest` を保持し override 修正後も解決結果が変わらないケースを実測で確認・解消した。

#### M3: 再発防止のプロセス改善

- memory 化: `reference_pnpm_overrides_staleness_pitfall.md`（`platform-pitfalls-index.md` にインデックス追加）
- decision-maker に AskUserQuestion で再発防止策を確認 → 「catchup 時に Dependabot alert 横断確認を追加」を採用
- `CLAUDE.md` に「Dependency Security」節を新設（PR #191）。次回以降の `/catchup` で既存 override のあるパッケージも横断確認対象に含める運用を明記

### 検証

- 各 PR で `pnpm turbo build` / `pnpm lint` / `pnpm turbo type-check` / `pnpm test`（246 tests）全 PASS を個別確認
- 各 PR の CI（quality/e2e/GitGuardian/CodeRabbit）全 green を fresh 確認後、番号単位の明示認可を得てマージ
- PR #190 は diff 規模（+233/-197、3 files）が hook の large tier 判定に該当し `/code-review low package.json apps/web/package.json pnpm-lock.yaml` を実施（findings 0 件、sharp の Node 要求バージョン変更を CI/Docker 双方で Node 22 が満たすことを個別確認）
- 全 5 PR のマージ後デプロイ（`deploy.yml`）を `gh run view` で fresh 確認し、5 回とも success
- 最終状態: `gh api dependabot/alerts` で open 件数 **0**（fresh 確認、複数回計測して回帰なし）

### 同根再発スキャン (§ 4.6)

本セッション修正 PR: PR #188 / #189 / #190（いずれも `fix(deps):`）。

- **同根確定（4 セッションにまたがる構造的パターン）**: 「pnpm.overrides は追加時点の CVE のみ固定し、再監査の仕組みがない」という根本原因が、第 10-11 編（websocket-driver/js-yaml override 新規追加）→ 第 12 編（tar override 新規追加、M3 で peer-dependency 無効化パターンのスイープ実施も target 陳腐化は未検知）→ 本セッション（tar/js-yaml の再陳腐化 + postcss/brace-expansion の新規陳腐化発覚）と繰り返し発症
  - 第 12 編の M3 スイープは「override が peer dependency 経由で無効化されていないか」のみを検出対象としており、「override target 自体が最新 CVE データに対して十分か」は検証範囲外だった。これが今回の見逃しの直接要因
  - 根本原因仮説（3 つ）: ① override はワンショットの point-in-time 対応で、CI 上に「既存 override target が最新 Dependabot データを満たしているか」を継続検証する仕組みがない ② 上限なし `>=` ターゲットは pnpm のローカル metadata cache 次第で解決結果が変動しうる（実測確認済み） ③ direct dependency（next）は override 機構と無関係に、単純な `pnpm update` 未実施でも同様にドリフトする
  - 「もう 1 件同根が出るとしたら」: 既存 override 全 23 件（第 12 編時点）のうち今回検証しなかった残り約 19 件（websocket-driver / esbuild / ws / @grpc/grpc-js / form-data / qs / uuid / node-forge / minimatch / picomatch / yaml / lodash 等）のいずれかに、今後新規 CVE が公開された際に同じ形で再発しうる
- 過去 7 日 archive を `override` / `Dependabot` / `pnpm.overrides` で grep → 第 11-12 編（本ファイル内）に直接該当。新規の別セッション同根なし（既知の継続パターンとして扱う）

→ **同根再発 1 件（override 陳腐化パターン、4 セッション目の再発）を検出。今回は個別パッケージの target 修正に加えて、根本原因（再監査プロセスの欠如）に対するプロセス改善（CLAUDE.md 明記 + memory 化）まで実施し、対症療法で終わらせなかった** ✅

### 対症療法判定 (§ 4.7)

| #   | 基準                                              | 判定                                                                                                                                                                                                                           |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | retry/timeout/fallback/文言修正のみで調査ログなし | ❌ `pnpm why` によるバージョン解決経路の実測確認 + CVE の `first_patched_version` 照合を全パッケージで実施                                                                                                                     |
| 2   | WebSearch / changelog 確認なし                    | ⚠️ 該当（基準 3 がヒットしたため § 4.7 手順に従い WebSearch を実施。pnpm エコシステムの公式見解として「override は定期的な再監査・クリーンアップが必要」というベストプラクティスを確認、外部要因として構造的に説明可能と判定） |
| 3   | 同症状 PR が過去 30 日に 1 件以上                 | ✅ 該当（tar: 第 12 編 PR #182 → 本セッション PR #189、js-yaml: 第 11 編 PR #178 → 本セッション PR #189）                                                                                                                      |
| 4   | smoke のみで構造的検証なし                        | ❌ 全 PR で build/lint/type-check/test/CI/Deploy を個別 fresh 確認、metadata cache 陳腐化の根本原因まで実測特定                                                                                                                |

→ **対症療法ではないが、外部要因（エコシステム共通のベストプラクティスギャップ）による構造的再発と判定** ⚠️。基準 3 がヒットした際の § 4.7 の要求に従い、個別パッケージ修正だけで終わらせず M3（memory 化 + CLAUDE.md プロセス明記）で再発防止まで実施済み

### グローバル memory scope (§ 4.5)

- 新規作成: `reference_pnpm_overrides_staleness_pitfall.md`（type: reference）
- 既存類似 grep 実施 → 該当なし（新規作成が妥当と判定）
- スコープ判定: 汎用的な pnpm/エコシステムの技術的知見であり、Why 欄に PR 番号・プロジェクト名・人名は含めず一般化して記述 → グローバル配置が適切
- `platform-pitfalls-index.md` にインデックス追加済み

### 構造的整合性 (§ 4)

`package.json`（`pnpm.overrides`/`devDependencies`）+ `pnpm-lock.yaml` + `apps/web/package.json` + `CLAUDE.md` の設定・doc 変更のみ。型・共有ロジック・API 変更なし → ⏭️ スキップ

### Issue Net 変化 (第 14 編)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0**（全て PR ベースの対応で Issue 起票不要な軽微修正のため）

### 次のアクション (第 14 編 update)

#### 即着手タスク

なし。

#### 条件待ち (明示 trigger 付き) — 第 13 編の 5 件、内容変化なし

| #   | 項目                                                                    | trigger                                                        | trigger 充足時のタスク                                           |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | C1 拡張 (booking-mirror に Google Calendar 自動登録追加)                | decision-maker から「C1 着手」明示指示                         | spec §9.1 末尾参照 (第 9 編から継続)                             |
| 2   | gRPC-web API 仕様変更時の運用 fallback                                  | Google 側で `internal` namespace 変更 / API Key 失効           | `parseSlotResponse` の structured log alert 化 (第 9 編から継続) |
| 3   | ADR-010 Future Work 残り 2 件（Error Budget アラート / PII 直書き検知） | decision-maker 起点指示（本番 GCP 変更を伴うため個別認可必須） | ADR-010 実装フェーズ §4-5 参照                                   |
| 4   | Issue #145 の 3 連続 PASS 厳密化                                        | 万一 main 上で flaky 再発                                      | diagnostic PR 起動 (第 9 編から継続)                             |
| 5   | book-mirror デスクトップ (≥ 768px) UI レビュー                          | decision-maker 起点指示                                        | モバイル改修は desktop 非 touch (第 9 編から継続)                |

#### 却下候補 (記録のみ)

第 9-10 編の却下候補は変化なし。

### 再開可能性判定 (第 14 編)

| 項目                       | 状態                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| OPEN PR                    | 0 件 ✅ (PR #186/#188/#189/#190/#191 merge 済)                                                                |
| active Issue               | 0 件 ✅                                                                                                       |
| Git clean                  | ✅                                                                                                            |
| 残留プロセス               | ✅ なし                                                                                                       |
| Security alert(Dependabot) | **0 件**（前セッションから 16 件全解消、fresh 確認済み）                                                      |
| Deploy CI                  | ✅ success（5 PR とも fresh 確認で success）                                                                  |
| 構造的整合性               | ⏭️ スキップ (設定ファイル + doc のみ)                                                                         |
| 同根再発                   | ⚠️ 1 件検出（override 陳腐化、4 セッション目の再発）。個別修正 + プロセス改善（CLAUDE.md/memory）まで実施済み |
| 対症療法疑い               | ⚠️ 外部要因による構造的再発と判定、再発防止プロセスを追加済み                                                 |
| グローバル memory scope    | ✅ 新規 1 件、スコープ判定済み                                                                                |

---

## 最終結論 (第 14 編)

✅ **セッション終了可** — Dependabot open alert 16 件 → 0 件を完全解消、同根再発パターンの根本原因分析と再発防止プロセス（CLAUDE.md 明記 + memory 化）まで実施済み

- OPEN PR ゼロ、active Issue ゼロ、Git clean、残留プロセスなし
- 即着手タスク = 0 / 条件待ち = 5 件（すべて decision-maker 領分または外部 trigger 待ち、第 13 編から変化なし）
- Issue Net 変化 = 0 / 0
- **同根再発 1 件検出**（pnpm.overrides 陳腐化、第 10〜12 編から続く 4 セッション目の再発）— 対症療法では終わらせず、次回 catchup から Dependabot alert 横断確認を定例化する仕組み（CLAUDE.md「Dependency Security」節）まで構築
- 次回セッション以降、同パターンが解消されたか（catchup で Dependabot alert 0 件を維持できているか）を注視ポイントとして引き継ぐ

---

## 2026-07-26 セッション総括 (第 15 編): C1 拡張着手 → PR1 完了 + Codex 全コードベース監査 → Issue 5 件起票 + P1 1 件修正

catchup で条件待ち第 13 編 #1「C1 拡張 (booking-mirror に Google Calendar 自動登録追加)」の trigger「decision-maker から『C1 着手』明示指示」が本セッションで充足。plan mode でフル計画を策定 → Plan エージェントによる敵対的レビューで Cloud Run CPU throttling・キャンセル後始末欠如・silent failure 検出欠如等 20 件超のリスクを発見し、計画を大幅改訂。PR1 (OAuth 非依存の先行修正) と PR2 (C1 本体、OAuth 前提) に分割し、PR1 を完了。続けて decision-maker の選択で Codex (`/codex review`, 全コードベース監査) を実行し、10 件の指摘のうち 5 件をコード直接確認で検証、Issue として起票。うち P1 の 1 件 (#194) をその場で修正・マージした。

### PR 一覧

| PR   | 内容                                                             | 規模              | 結果                                                                                  |
| ---- | ---------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| #193 | fix(booking-mirror): mirror の空き枠から自前の確定予約を差し引く | 9 files, +497/-70 | ✅ merge (`/code-review high` 6 件対応後、e2e/quality/GitGuardian/CodeRabbit 全 PASS) |
| #199 | fix(free-time): 終日予定を空き時間計算で busy 扱いにする         | 2 files, +30/-5   | ✅ merge (Issue #194 を Closes、e2e/quality/GitGuardian/CodeRabbit 全 PASS)           |

### 主要成果

#### M1: C1 拡張の設計調査 → Plan エージェントの敵対的レビューで計画を全面改訂

booking-mirror の spec (`docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md` §9.1) と現状実装を調査した上で plan mode に入り、フル計画を作成。Plan エージェントに批判的レビューを依頼した結果、以下の構造的リスクが発覚:

- `infra/deploy-api.sh` に `--no-cpu-throttling` がなく `--min-instances=0` → **レスポンス返却後の非同期処理は完走保証がない**。当初「block event 作成は非同期でよい」と判断していたが、この事実により撤回し同期実行に変更
- mirror の `GET /slots` が Google の生データをそのまま返し、自前の確定予約を差し引いていなかった (別の、OAuth 非依存で先に直せる不整合)
- `PATCH /bookings/:bookingId/cancel` は mirror にも効くが block event の削除には触れない → C1 導入後に「空いているのに永久に埋まって見える」逆方向の障害が新規発生する
- `createEvent` の戻り値 id は `google_` プレフィックス付きだが `deleteEvent` は素の id を要求 → 後始末実装時に踏む潜在バグ
- OAuth consent screen が Testing のままだと refresh token が 7 日で失効する (公式ドキュメント確認)

これを受け、C1 は **PR1 (mirror slots のローカル差し引き、OAuth 非依存)** と **PR2 (block event 本体、OAuth 前提)** に分割。PR2 は Phase 0 (OAuth 再連携可否・Testing mode 確認・Busy 動作の実測検証) が decision-maker 側で未完了のため、計画のみ確定 (`~/.claude/plans/iterative-riding-hummingbird.md`) し、`docs/handoff/GOAL.md` にセッション横断ゴールとして登録した。

#### M2: PR1 実装 → `/code-review high` の指摘 6 件を全て対応

`getConfirmedBookingEventsForOwner` を `booking-events.ts` に抽出し非ミラー版・ミラー版で共通化、`BookingMirrorLink` の Firestore mapper (2 箇所に手書き重複) を `buildBookingMirrorLinkFromFirestoreData` に一本化。`/code-review high main...HEAD` 実行後、以下 6 件を検証・対応:

1. **[correctness/High]** `slotStart >= timeMin` 条件により進行中の予約 (開始済み・未終了) が除外され、このPRの目的そのものを部分的に再発させる欠陥 → 24h lookback + `end > timeMin` の app-level filter で修正 (`toOverlappingBookingEvents` として切り出し回帰テスト追加)
2. **[robustness/Medium]** 新規 Firestore 呼び出しにエラーハンドリングがなく直前の `fetchAvailableSlots` と不揃い → 502 で統一
3. **[efficiency/Low-Medium]** 2 つの独立呼び出しが逐次 await → `Promise.allSettled` で並列化
4. **[altitude/Low]** `excludeOverlappingSlots` が `BookingMirrorLink` 専用ファイルに誤配置 → `booking-mirror-slots.ts` に分離
5. **[simplification/Low]** mapper を spread パターン化 (description の null→undefined 変換は既存挙動を壊さないよう明示維持)
6. **[test-coverage/Low-Medium]** 正確性バグの回帰テスト追加

#### M3: Codex `/codex review` (全コードベース監査, MCP版, effort=high) → 5 件を検証し Issue 起票

セカンドオピニオンの要否を相談された際、PR1 は既にレビュー済みのため限界効用は低いが「PR2 実装後に `/codex review`」を提案 → decision-maker はその場で `/codex review` (MCP版) を選択し実行。10 件の指摘のうち以下 5 件をコードを直接読んで検証 (残り 5 件は未検証のまま記録のみ、Issue 化せず):

| Issue                                                            | 内容                                                                            | 重大度                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| [#194](https://github.com/yasushi-honda/Calendar-Hub/issues/194) | 終日予定が空き時間計算から除外され二重予約になる                                | P1 (本セッションで修正・クローズ) |
| [#195](https://github.com/yasushi-honda/Calendar-Hub/issues/195) | 通常予約API(POST /:linkId/book)が予約直前に外部カレンダーとの重複を再検証しない | P1                                |
| [#196](https://github.com/yasushi-honda/Calendar-Hub/issues/196) | sync.ts の lastSyncedAt 判定が非原子的で二重処理されうる                        | P1                                |
| [#197](https://github.com/yasushi-honda/Calendar-Hub/issues/197) | 予約重複チェックが下限なしで全件スキャンする                                    | P2                                |
| [#198](https://github.com/yasushi-honda/Calendar-Hub/issues/198) | 空き時間表示が当日の過去時間帯の枠を含む                                        | P2                                |

#### M4: Issue #194 を TDD で修正・マージ

`calculateFreeSlots` の `.filter((e) => !e.isAllDay)` を削除。既存の日次クリッピングロジックがそのまま単日・複数日の終日予定を正しくブロックすることを確認し、境界値テスト 3 件 (単日ブロック・複数日ブロック・通常予定との混在) を追加。影響範囲 (booking-links / AI提案 ai.ts の全呼び出し元) を grep で確認済み。

### Issue Net 変化

- Close 数: 1 件 (#194)
- 起票数: 5 件 (#194, #195, #196, #197, #198)
- Net: -4 件

**Net が負であることの理由**: 起票した 5 件は全て Codex review (全コードベース監査) で発見され、うち検証対象とした 5 件はコードを直接読んで実バグ・実害を確認済み (triage 基準「実バグ/実害」を満たす)。恒常的な Issue 積み増しではなく、1 回の監査で複数の独立した実バグが同時に発覚したことによる一時的な増加であり、うち最重要度の 1 件はその場で解消済み。

### 構造的整合性チェック

`packages/shared/src/free-time.ts` (共有ロジック) と `packages/shared/src/booking-mirror-types.ts` (共有型) を変更したため、本来 `/impact-analysis` の実行対象。**⚠️未確認 (正式実行なし)** — ただし全呼び出し元 (`calculateFreeSlots`: `public-booking.ts`, `ai.ts`。`BookingMirrorLink` mapper: `booking-mirror-links.ts`, `public-booking-mirror.ts`) は grep で手動確認済み、型チェック・全テストも PASS。

### 同根再発スキャン (§4.6)

過去 7 日の handoff archive に "二重予約"/"calculateFreeSlots"/"free-time" を含むファイルは 2026-06-25/26 (原設計期) のもののみで、直近 7 日以内の同根再発候補は 0 件。PR #193 と PR #199 は同一セッション内だが異なるコードパス (Firestore クエリの下限欠如 vs `isAllDay` フィルタ) であり、機構的に同根ではない。ただし **テーマ的な傾向**として、今回の Codex 全コードベース監査で「予約可否判定ロジック」領域に独立した欠陥が計 5 件見つかっており (#194〜#198)、この領域が構造的に脆弱である可能性は留意点として記録する (新規対応の提案はしない、decision-maker 判断待ち)。

### 対症療法判定 (§4.7)

判定基準 1-3 は非該当 (retry/fallback ではなく根本原因への直接修正、過去 30 日以内の同一ファイルへの他 PR なし)。基準 4 (単体テストのみでの検証) は形式的に該当するが、両修正とも外部依存・ライブラリバージョンが原因ではない自社コードの original defect (Codex review で発見された潜在バグ) であり、「外部要因による回帰」という前提が成立しないため WebSearch によるエスカレーションは実施しなかった (retry/fallback ではなく直接のロジック修正である点で、起源インシデントの「floating dependency tag」パターンとは性質が異なると判断)。

### 次のアクション (第 15 編)

#### 即着手タスク

| #   | タスク                                 | ROI                                                                                                             | 想定工数           | 完了条件                                                                                                                                                                                        | 関連ファイル / コマンド                                        |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Issue #198 (過去枠表示) 修正           | 今回の #194 と同一ファイル・同一パターンで低コスト。UX 劣化の解消                                               | 30分               | `packages/shared/src/free-time.ts` の日次ループ初日 cursor を `max(dayStart, rangeStart)` に変更、回帰テスト追加、`pnpm test && pnpm lint && pnpm turbo type-check && pnpm turbo build` 全 PASS | `packages/shared/src/free-time.ts:76`                          |
| 2   | Issue #197 (重複判定全件スキャン) 修正 | PR #193 で実施した lookback bound パターンの横展開、スコープ確定済み                                            | 45分               | `public-booking.ts` の overlap query に時間下限追加。mirror 側の同等パスも要横断確認                                                                                                            | `apps/api/src/routes/public-booking.ts:241-245`                |
| 3   | Issue #195 (予約直前再検証欠如) 修正   | 二重予約リスクに直結する P1、mirror 側の既存パターンを移植するだけで実現可能                                    | 1-2時間            | POST `/:linkId/book` に `fetchOwnerEvents` 再検証を追加                                                                                                                                         | `apps/api/src/routes/public-booking.ts` (POST `/:linkId/book`) |
| 4   | Issue #196 (sync.ts 排他制御なし) 修正 | 二重同期・競合更新の実害防止。ただしロック機構の設計判断が先に必要 (2-4ファイル設計 → インライン軽量プラン推奨) | 2-3時間 (設計込み) | syncConfig document 単位で lease/実行中フラグをトランザクション取得してから処理開始する設計に変更                                                                                               | `apps/api/src/routes/sync.ts:65-126`                           |

#### 条件待ち (明示 trigger 付き)

| #   | 項目                                                                    | trigger（充足条件）                                                                                               | 充足時のタスク                                                             | 充足確認方法                                          |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | [GOAL.md] PR2 (C1 本体: block event 自動作成) 実装                      | Phase 0 完了 (OAuth 連携可否・Testing mode 確認・Busy 動作実測検証、いずれも decision-maker のブラウザ操作を伴う) | `docs/handoff/GOAL.md` の「進行中の tasks」PR2-a〜f を順次実行             | `docs/handoff/GOAL.md` の完了の定義チェックリスト参照 |
| 2   | gRPC-web API 仕様変更時の運用 fallback                                  | Google 側で `internal` namespace 変更 / API Key 失効                                                              | `parseSlotResponse` の structured log alert 化 (第 9 編から継続、変化なし) | Cloud Monitoring アラート発火時                       |
| 3   | ADR-010 Future Work 残り 2 件（Error Budget アラート / PII 直書き検知） | decision-maker 起点指示（本番 GCP 変更を伴うため個別認可必須）                                                    | ADR-010 実装フェーズ §4-5 参照（第 9 編から継続、変化なし）                | decision-maker の明示指示                             |
| 4   | Issue #145 の 3 連続 PASS 厳密化                                        | 万一 main 上で flaky 再発                                                                                         | diagnostic PR 起動（第 9 編から継続、変化なし）                            | CI 失敗の観測                                         |
| 5   | book-mirror デスクトップ (≥ 768px) UI レビュー                          | decision-maker 起点指示                                                                                           | モバイル改修は desktop 非 touch（第 9 編から継続、変化なし）               | decision-maker の明示指示                             |

#### 却下候補（記録のみ）

| #   | 項目                                                                                                                                                                                         | 検討経緯                                                                            | 着手しない理由                                           | 参照条件                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Codex review 未検証の残り 5 件 (timetree同期の所有権判定 `timetree-google-sync.ts:189/221`、fire-and-forget耐障害性、booking-links入力検証不足、AI提案API無制限実行、通知設定の型安全性なし) | Codex `/codex review` (2026-07-26) で指摘されたが、セッション内で検証しきれず未実施 | 実バグとして未検証、triage 基準（実バグ/実害確認）未充足 | decision-maker からの明示指示、または次回検証セッション |

第 9-10 編の却下候補は変化なし。

### 再開可能性判定 (第 15 編)

| 項目                    | 状態                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| OPEN PR                 | 0 件 ✅ (#193, #199 とも merge 済)                                |
| active Issue            | 4 件 (#195, #196, #197, #198。いずれも即着手候補として上表に記載) |
| Git clean               | ✅                                                                |
| 残留プロセス            | ✅ なし                                                           |
| Deploy CI               | ✅ 進行中 (#199 マージに伴う自動デプロイ、正常フロー)             |
| 構造的整合性            | ⚠️未確認（`/impact-analysis` 未実行、手動 grep で代替確認済み）   |
| 同根再発                | ✅ 候補 0 件（過去7日以内）、テーマ的傾向のみ記録                 |
| 対症療法疑い            | ✅ 基準4形式該当も外部要因なしと判断、エスカレーション不要と判定  |
| グローバル memory scope | ⏭️ スキップ（本セッション memory 変更なし）                       |
| GOAL.md                 | ✅ 新規作成（C1 拡張、plan mode 承認済み計画を登録）              |

---

## 最終結論 (第 15 編)

⚠️ **セッション終了前に要対応なし、次アクションは即着手タスク 4 件が候補として残る状態でセッション終了**

- OPEN PR ゼロ・Git clean・残留プロセスなし
- active Issue 4 件 (#195〜#198) はいずれも即着手タスクとして具体化済み、番号単位の認可で次セッション着手可能
- C1 (PR2) は GOAL.md 経由でセッション横断ゴールとして引き継ぎ、trigger (Phase 0) 未充足のため条件待ちのまま
- 同根再発候補 0 件・対症療法疑いなし（判断根拠を明記済み）
- 次セッションは「Issue #195-198 のどれから着手するか」の番号単位認可、または Phase 0 (OAuth) の進捗確認から開始するのが妥当
