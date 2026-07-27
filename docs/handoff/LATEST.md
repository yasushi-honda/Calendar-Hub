# Calendar Hub ハンドオフ (2026-07-27, 第 17 編まで)

> 第 3〜5 編は `archive/2026-06-25_to_26-vol3-to-vol5.md` に分離 (2026-06-26 第 7 編で実施)。第 6 編は `archive/2026-06-26-vol6.md` に分離 (2026-06-27 第 8 編で実施)。第 7〜9 編は `archive/2026-06-26_to_27-vol7-to-vol9.md` に分離 (2026-07-19 第 12 編で実施、60KB 超過のため)。第 10〜13 編は `archive/2026-07-18_to_19-vol10-to-vol13.md` に分離 (2026-07-26 第 15 編で実施、60KB 超過のため)。第 14 編は `archive/2026-07-25_to_26-vol14.md` に分離 (2026-07-27 第 17 編で実施、60KB 超過のため)。LATEST.md は第 15 編以降のみ保持する。

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

---

## 2026-07-26 セッション総括 (第 16 編): Issue #195〜#198 修正完了の遡及記録(未記録セッションの handoff 追補) + `/catchup` `/handoff` のみの点検セッション

第 15 編で即着手タスクとして具体化した Issue #195〜#198 は、本編作成セッションより前の別セッションで PR #201〜#204 として全件修正・マージ・クローズ済みだったが、当該セッションが `/handoff` を実行せず終了したため本ファイルに記録が欠落していた。`/catchup` がこの記録漏れを検出し、本セッション(コード変更なし、`/catchup` → `/handoff` のみ実行)で遡及記録する。

### PR 一覧(遡及記録、マージは全て 2026-07-26)

| PR   | 内容                                                               | 規模             | 結果                                                                |
| ---- | ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------- |
| #201 | fix(booking): 予約直前に外部カレンダーとの重複を再検証する         | 3 files, +96/-2  | ✅ merge (`/code-review medium` 実施、Closes #195)                  |
| #202 | fix(free-time): 当日の空き枠計算が過去時間帯を含む不具合を修正     | 2 files, +56/-2  | ✅ merge (2 files/56 行のため `/code-review` 閾値未満、Closes #198) |
| #203 | fix(booking): 予約重複チェックの Firestore クエリに下限を追加      | 3 files, +20/-3  | ✅ merge (Closes #197)                                              |
| #204 | fix(sync): syncConfig の同期実行をリースで排他制御し二重処理を防ぐ | 3 files, +189/-6 | ✅ merge (`/code-review medium` 実施、Closes #196)                  |

### 主要成果(PR 本文からの遡及要約)

- **#201 (旧 #195)**: 非 mirror 版の `POST /:linkId/book` が外部カレンダーとの直前重複再検証を欠いていた。mirror 版と同型の再検証ロジックを `hasOverlappingEvent`（`booking-events.ts`）として切り出して移植。`/code-review medium` の指摘を受け、`fetchOwnerEvents` の fail-open 挙動(取得失敗を握りつぶして続行)が安全装置としては不適切だったため `failClosed` オプションを追加し fail-closed に統一。
- **#202 (旧 #198)**: `calculateFreeSlots` の日次カーソルが常に `dayStartHour` から始まり、`rangeStart`(当日途中)を無視していた表示上の劣化 UX を修正(実害は `POST /:linkId/book` 側の `slotStart < now` 弾きで防止済みだった)。初日のみ `max(dayStart, rangeStart)` に変更。
- **#203 (旧 #197)**: 予約重複チェックの overlap query が時間下限を持たず全期間走査していた。PR #193(第 15 編)で `getConfirmedBookingEventsForOwner` に導入済みの 24h lookback パターンを `OVERLAP_LOOKBACK_MS` として export し、非 mirror・mirror 両方の overlap query に横展開。
- **#204 (旧 #196)**: `sync.ts` の `lastSyncedAt` 判定が check-then-act で非原子的だった。`syncConfig` document 単位の Firestore トランザクションで「インターバル経過判定 + リース取得」を原子化。`shouldAcquireSyncLease` を純粋関数として切り出し境界値テスト追加。`/code-review medium` の指摘 2 件(per-config try/catch 分離、リース解放順序)に対応済み。

### 呼び出し元の遡及確認

`grep` で `OVERLAP_LOOKBACK_MS`/`hasOverlappingEvent` が `public-booking.ts`・`public-booking-mirror.ts` の両方で使用され、`acquireSyncLease` が `sync.ts` の単一呼び出し元からのみ使用されていることを本セッションで確認済み。PR 本文記載の呼び出し元と齟齬なし。

### Issue Net 変化(遡及記録、当該セッション分)

- Close 数: 4 件 (#195, #196, #197, #198)
- 起票数: 0 件
- Net: +4 件

本編作成セッション(`/catchup` + `/handoff` のみ)自体の Issue 操作は 0 件。

### 構造的整合性チェック

`packages/shared/src/free-time.ts`(共有ロジック、PR #202)を変更。呼び出し元(`public-booking.ts`, `ai.ts`)は第 15 編(PR #199)で確認済みの集合と同一であり新規呼び出し元の追加なし。`apps/api/src/lib/booking-events.ts`・`timetree-google-sync.ts` は API 内部の共有 lib で、呼び出し元は本セッションで grep 確認済み(上記)。→ ⏭️ 実質スキップ相当(新規呼び出し元なし、既存確認済み集合の範囲内)。

### 同根再発スキャン (§4.6)

PR #203 は PR #193(第 15 編、`getConfirmedBookingEventsForOwner` への 24h lookback 導入)と同一パターン(overlap query への時間下限追加)を別の呼び出し箇所(予約確定時の重複チェック)へ横展開したもの。第 15 編の M1 実装時点では `GET /slots` 側のみ対応し `POST /book` 側の overlap query は対象外だったため、同一セッション内で 1 箇所を直しても兄弟コードパスが取り残される、という構造が実際に発現した(Codex 全コードベース監査でのみ発覚)。過去 7 日 archive を `OVERLAP_LOOKBACK_MS`/`下限`/`lastSyncedAt`/`排他制御`/`rangeStart` で grep → 該当ファイルなし(本ファイル内の第 15 編記載のみ)。

→ **軽度の同根re発 1 件**(「lookback bound パターンを 1 箇所修正した際、兄弟コードパスへの横展開を同一 PR で行わなかった」という設計判断)を検出。ただし実害は Codex 監査で同日中に発覚・解消済みであり、多セッションにまたがる長期未検出ではないため、追加のプロセス改善は不要と判断(第 15 編の「予約可否判定ロジック領域」の脆弱性傾向という既存の留意点で説明可能)。

### 対症療法判定 (§4.7)

4 PR とも根本原因への直接修正(retry/fallback ではない)。基準 3(過去 30 日以内の同症状 PR)は #203 が PR #193 と該当するが、上記同根再発スキャンで扱い済み。基準 4(単体テストのみ)は形式的に該当するが、いずれも自社コードの原設計欠陥(外部依存起因ではない)であり WebSearch エスカレーションは不要と判断(第 15 編と同一の判断基準)。

### グローバル memory scope (§4.5)

本セッション memory 変更なし → ⏭️ スキップ。

### 次のアクション (第 16 編)

#### 即着手タスク

なし(第 15 編の即着手 4 件は全て完了・クローズ済み。新規の即着手候補は `/catchup` で検出されず)。

#### 条件待ち (明示 trigger 付き) — 第 15 編の 5 件、内容変化なし

| #   | 項目                                                                    | trigger（充足条件）                                                                                               | 充足時のタスク                                                             |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | [GOAL.md] PR2 (C1 本体: block event 自動作成) 実装                      | Phase 0 完了 (OAuth 連携可否・Testing mode 確認・Busy 動作実測検証、いずれも decision-maker のブラウザ操作を伴う) | `docs/handoff/GOAL.md` の「進行中の tasks」PR2-a〜f を順次実行             |
| 2   | gRPC-web API 仕様変更時の運用 fallback                                  | Google 側で `internal` namespace 変更 / API Key 失効                                                              | `parseSlotResponse` の structured log alert 化 (第 9 編から継続、変化なし) |
| 3   | ADR-010 Future Work 残り 2 件（Error Budget アラート / PII 直書き検知） | decision-maker 起点指示（本番 GCP 変更を伴うため個別認可必須）                                                    | ADR-010 実装フェーズ §4-5 参照（第 9 編から継続、変化なし）                |
| 4   | Issue #145 の 3 連続 PASS 厳密化                                        | 万一 main 上で flaky 再発                                                                                         | diagnostic PR 起動（第 9 編から継続、変化なし）                            |
| 5   | book-mirror デスクトップ (≥ 768px) UI レビュー                          | decision-maker 起点指示                                                                                           | モバイル改修は desktop 非 touch（第 9 編から継続、変化なし）               |

#### 却下候補（記録のみ）— 第 15 編から変化なし

| #   | 項目                                                                                                                                                       | 検討経緯                                                                            | 着手しない理由                                           | 参照条件                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Codex review 未検証の残り 5 件 (timetree同期の所有権判定、fire-and-forget耐障害性、booking-links入力検証不足、AI提案API無制限実行、通知設定の型安全性なし) | Codex `/codex review` (2026-07-26) で指摘されたが、セッション内で検証しきれず未実施 | 実バグとして未検証、triage 基準（実バグ/実害確認）未充足 | decision-maker からの明示指示、または次回検証セッション |

### 再開可能性判定 (第 16 編)

| 項目                    | 状態                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPEN PR                 | 0 件 ✅                                                                                                                                                                                                             |
| active Issue            | 0 件 ✅ (#195〜#198 は本編で遡及記録した通り全クローズ済み)                                                                                                                                                         |
| Git clean               | ✅                                                                                                                                                                                                                  |
| 残留プロセス            | ⚠️ マシン全体では複数検出(本プロジェクトの TS language server 含む)。本プロジェクト由来の dev server 放置なし。他プロジェクト(doc-split 等)由来のプロセスも観測されたが並行セッションの可能性があり停止提案は対象外 |
| Deploy CI               | ✅ success (直近実行 `9cf9fd7`, 2026-07-26T11:13:43Z)                                                                                                                                                               |
| Dependabot open alert   | **0 件**（fresh 確認）                                                                                                                                                                                              |
| 構造的整合性            | ⏭️ 実質スキップ相当（新規呼び出し元なし、grep で確認済み）                                                                                                                                                          |
| 同根再発                | ⚠️ 軽度 1 件検出（lookback パターンの横展開漏れ、同日中に解消済み）                                                                                                                                                 |
| 対症療法疑い            | ✅ 該当なしと判定（根拠明記済み）                                                                                                                                                                                   |
| グローバル memory scope | ⏭️ スキップ（本セッション memory 変更なし）                                                                                                                                                                         |
| GOAL.md                 | ✅ 整合性確認済み（変更なし、C1/PR2 は Phase 0 待ちのまま）                                                                                                                                                         |

---

## 最終結論 (第 16 編)

🛑 **executor 領分の作業ゼロ、即時終了推奨**

- OPEN PR ゼロ・active Issue ゼロ・Git clean・Dependabot alert ゼロ
- 即着手タスク = 0 / 条件待ち = 5 件（全て decision-maker 領分または外部 trigger 待ち、第 15 編から変化なし）
- Issue Net 変化(遡及記録分) = +4（Close 4 / 起票 0）
- 本編は記録の遡及補完が目的であり、次セッションへの新規引き継ぎ事項はなし
- 次セッションは Phase 0 (OAuth 再連携) の進捗共有、または条件待ち 5 件への decision-maker からの明示指示があれば再開可能

---

## 2026-07-27 セッション総括 (第 17 編): compact 跨ぎ整合性確認 + `/handoff` ドキュメント記述の 3 件補強(PR #207〜#209)

前セッションの `/handoff` 実行中に compact が発生。decision-maker から「抜け落ちなど問題ないか」と確認を受け、compact 前後の内容を PR #206 の実装ファイル・git 履歴・`pnpm test`(316件)で実測突き合わせし欠落なしを確認した上で `/handoff` を完了(GOAL.md の Phase 0/PR2/実機検証(作成側)を `[x]` 化)。その後、decision-maker からの 2 件の指摘(spec の記述矛盾、AC-8 の性質の誤解)を受けて追加のドキュメント整合性修正を実施し、最終的に decision-maker から「キャンセル機能はペンディングです」との明示判断を得て GOAL.md に反映した。コード変更は一切なし、全て docs のみ。

### PR 一覧

| PR   | 内容                                                                                          | 規模             | 結果                                                                                 |
| ---- | --------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| #207 | docs(handoff): booking-mirror C1 実機検証(作成側)完了を GOAL.md/spec に反映                   | 2 files, +19/-21 | ✅ merge (quality/e2e/GitGuardian/CodeRabbit 全 PASS)                                |
| #208 | docs(handoff): AC-8 はキャンセル UI 不在のため API 直接呼び出し以外の検証手段がないことを明記 | 1 file, +3/-3    | ✅ merge (必須チェック `quality` PASS。e2e は既知の flaky で non-required、詳細後述) |
| #209 | docs(handoff): AC-8 実機検証を decision-maker 明示判断によりペンディングに変更                | 1 file, +3/-3    | ✅ merge (`quality` PASS)                                                            |

### 主要成果

#### M1: compact 跨ぎの内容欠落なしを実測確認

decision-maker の「handoff 途中に compact が走った。抜け落ちなど問題ないか？」という問いに対し、要約に記載された実装ファイル(`block-event.ts`/`calendar-target-invariant.ts`/`calendar-dedup.ts` 等)の実在、PR #206 のコミットメッセージ、`booking-links.ts` のキャンセルハンドラの実装内容を git 履歴・grep で直接突き合わせ、`pnpm test`(316件 PASS)も fresh 実行して裏付けた。全て要約の記述と一致し、欠落は確認されなかった。

#### M2: spec doc §9 の記述矛盾を修正(PR #207)

`docs/specs/2026-06-26-booking-mirror-v2-grpc-design.md` の「9. スコープ外 / 将来課題」テーブルに、実装済みの C1(Google Calendar への event 自動作成)の行が「理由: C2 → C1 へ移行済み」として矛盾したまま残っていた。テーブルから除外し、実装済みである旨を注記として追加。

#### M3: AC-8(キャンセル実機検証)の性質を明確化(PR #208)

decision-maker から「AC-8 実機検証とは？キャンセルボタンの出現などしない方針になったのでは？」との指摘を受け、`apps/web` を grep して「キャンセル」に関する UI コードが一切存在しない(ゲスト向け・オーナー向けとも)ことを確認。`PATCH /bookings/:bookingId/cancel` は PR #41(初期の予約リンク機能)由来の既存 API で、今回の C1 では block event 削除ロジックを追加しただけであることを確認した上で GOAL.md の記述を補強した。ゲストの自己キャンセル不可の方針は不変であることを明記。

#### M4: e2e flaky の発生と、既存トラッキング済みパターンとの照合(PR #208 マージ時)

PR #208 のマージ前チェックで e2e が 2 回連続失敗(`booking-success.spec.ts`/`booking-polling.spec.ts`、いずれも `getByTestId('slot-btn-2026-07-27T05:00:00.000Z')` が見つからない)。原因調査の結果、e2e ヘルパー `nextDay14JST()`(`apps/web/e2e/fixtures/seed.ts:157`)が CI ランナーの **UTC** wall-clock を基準に「翌日 14:00 JST」を計算する設計で、UTC 深夜帯(JST 早朝)の実行時に UTC/JST の日付境界がずれて slot が見つからなくなる構造的フレークと判明。該当テストファイル自身のコメントが既存 Issue #145(条件待ち #4、「万一 main 上で flaky 再発」)を参照しており、新規の問題ではなく既知パターンの再現と判断。branch protection の必須チェックは `quality` のみ(e2e は non-required)で、`quality` は 2 回とも PASS していたため、PR #207/#209 の差分がいずれも docs のみでこの e2e とは無関係であることを確認した上でマージした。

#### M5: AC-8 のステータスを「条件待ち」→「ペンディング」に変更(PR #209)

decision-maker から「キャンセル機能はペンディングです」との明示判断を受け、GOAL.md の AC-8 関連 3 箇所(完了の定義・進行中の tasks・中断点)を「decision-maker が API を直接呼べば検証可能」という条件待ちの書き方から、「decision-maker の明示判断によりペンディング、次セッションは明示の再開指示があるまで着手不要」という書き方に変更した。

### Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- Net: 0(docs のみのセッションのため Issue 操作なし)

### 構造的整合性チェック

型・共有ロジック・API・設定ファイルの変更なし(docs のみ)。→ ⏭️ スキップ

### 同根再発スキャン (§4.6)

本セッションの PR は全て `docs(handoff):` プレフィックスであり、`fix:`/`hotfix:` プレフィックスの修正 PR は 0 件。§4.6 の発動条件(修正 PR 1 件以上)を満たさないため詳細スキャンは非該当。ただし M4 で遭遇した e2e flaky は、既存の条件待ち項目(第 9 編から継続の Issue #145)と同一の root cause(`nextDay14JST()` の UTC 基準日付計算)であることを本セッションで具体的に特定した。新規の同根ではなく、既知パターンの再確認。

### 対症療法判定 (§4.7)

本セッションに修正 PR(`fix:`)が存在しないため非該当。e2e flaky への対応は「原因調査の上で non-required チェックであることを確認してマージ」であり、flaky 自体の修正は行っていない(修正は条件待ち #4 の trigger 充足時に別途対応する既存の合意通り)。

### グローバル memory scope (§4.5)

本セッション memory 変更なし → ⏭️ スキップ。

### 次のアクション (第 17 編)

#### 即着手タスク

なし。

#### 条件待ち (明示 trigger 付き) — 第 15 編の項目、AC-8 のみステータス変更

| #   | 項目                                                                    | trigger（充足条件）                                                                            | 充足時のタスク                                                                                                  |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | gRPC-web API 仕様変更時の運用 fallback                                  | Google 側で `internal` namespace 変更 / API Key 失効                                           | `parseSlotResponse` の structured log alert 化 (第 9 編から継続、変化なし)                                      |
| 2   | ADR-010 Future Work 残り 2 件（Error Budget アラート / PII 直書き検知） | decision-maker 起点指示（本番 GCP 変更を伴うため個別認可必須）                                 | ADR-010 実装フェーズ §4-5 参照（第 9 編から継続、変化なし）                                                     |
| 3   | Issue #145 の 3 連続 PASS 厳密化                                        | 万一 main 上で flaky 再発(本セッション M4 で PR #208 のマージ前チェックにて再発を実測確認済み) | diagnostic PR 起動（第 9 編から継続。再発実測により trigger 充足に近づいている可能性、decision-maker 判断待ち） |
| 4   | book-mirror デスクトップ (≥ 768px) UI レビュー                          | decision-maker 起点指示                                                                        | モバイル改修は desktop 非 touch（第 9 編から継続、変化なし）                                                    |

#### 却下候補(記録のみ)— 第 15 編から変化なし

| #   | 項目                                                                                                                                                       | 検討経緯                                                                            | 着手しない理由                                           | 参照条件                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Codex review 未検証の残り 5 件 (timetree同期の所有権判定、fire-and-forget耐障害性、booking-links入力検証不足、AI提案API無制限実行、通知設定の型安全性なし) | Codex `/codex review` (2026-07-26) で指摘されたが、セッション内で検証しきれず未実施 | 実バグとして未検証、triage 基準（実バグ/実害確認）未充足 | decision-maker からの明示指示、または次回検証セッション |

**AC-8(キャンセル実機検証)は decision-maker の明示判断によりペンディング(2026-07-27)のため、上記どちらのセクションにも記載しない**(条件待ち・却下候補いずれとも異なる「明示保留」ステータス。詳細は GOAL.md 参照)。

### 再開可能性判定 (第 17 編)

| 項目                    | 状態                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| OPEN PR                 | 0 件 ✅ (#207/#208/#209 とも merge 済)                                              |
| active Issue            | 0 件 ✅                                                                             |
| Git clean               | ✅                                                                                  |
| 残留プロセス            | ✅ なし                                                                             |
| Deploy CI               | ✅ 3 PR とも fresh 確認で success                                                   |
| 構造的整合性            | ⏭️ スキップ(docs のみ)                                                              |
| 同根再発                | ⏭️ 非該当(修正 PR 0 件)。e2e flaky は既知パターン(Issue #145)の再確認               |
| 対症療法疑い            | ⏭️ 非該当(修正 PR 0 件)                                                             |
| グローバル memory scope | ⏭️ スキップ(memory 変更なし)                                                        |
| GOAL.md                 | ✅ 整合性確認・更新・コミット済み(PR #207/#208/#209、AC-8 はペンディングとして明記) |

---

## 最終結論 (第 17 編)

🛑 **executor 領分の作業ゼロ、即時終了推奨**

- OPEN PR ゼロ・active Issue ゼロ・Git clean・Deploy 全 success
- 即着手タスク = 0 / 条件待ち = 4 件(AC-8 はペンディングへ移行したため条件待ちから除外)
- Issue Net 変化 = 0(Close 0 / 起票 0)
- 同根再発・対症療法判定はいずれも非該当(本セッションに修正 PR なし)
- e2e flaky(Issue #145 パターン)の再発を実測確認したが、trigger の充足可否は decision-maker 判断に委ねる形で条件待ちに残した
- 次セッションは条件待ち 4 件への decision-maker からの明示指示があれば再開可能。それ以外の新規引き継ぎ事項なし
