# ADR-011: TimeTree all-day `end_at` の包含/排他解釈正規化

- Status: Accepted
- Date: 2026-05-17
- Issue: TimeTree → Google 同期で複数日終日予定が「最終日が1日不足」して反映される事象（ユーザー報告）
- Related: ADR-008（スコープ外項目「TimeTree all-day `end_at` の排他/包含解釈確認」の解消）

## Context

ユーザー報告: 「TimeTree で 1日〜3日の終日設定が、Google カレンダーには 1日〜2日として反映される（最終日が抜ける）」

### 根本原因

TimeTree 内部 API は終日イベントの `end_at` を **イベント長で異なる意味**で返している（実観測モデル）:

| ケース           | TimeTree raw `end_at` | `end_at - start_at` | 解釈              | Google 側のあるべき end.date |
| ---------------- | --------------------- | ------------------- | ----------------- | ---------------------------- |
| 単日終日         | 翌日 0:00 JST         | 24h                 | exclusive（正常） | 翌日 (= raw 値)              |
| 2日間終日        | 最終日 0:00 JST       | **24h**             | inclusive         | 翌々日 (= raw 値 + 24h)      |
| N日間終日 (N>=3) | 最終日 0:00 JST       | (N-1) × 24h         | inclusive         | 最終日翌日 (= raw 値 + 24h)  |

**問題**: 2日間と単日は raw `end_at` だけでは区別不能。N>=3 は `diff` が 48h 以上で判別可能。

一方、Google Calendar は `end.date` が **exclusive**（その日を含まない）。内部 `CalendarEvent.end` をそのまま `toDateString(end, "Asia/Tokyo")` で日付化して送ると、複数日終日では「最終日 = 1日不足」となる。

ADR-008 ではこの解釈確認が「スコープ外」として別 Issue 化されていた。本 ADR で **N>=3 範囲**で解消する。

### 既存テストでカバーされていなかった理由

- 既存 `sync.test.ts:524-548` の終日マッチングテストは **単日のみ**（`end = start + 24h`）
- 複数日終日のケースが未カバー
- `buildSyncActions` 内の `eventKey` 計算でも `end` の差を検出できず、TimeTree 側 inclusive end と Google 側 exclusive end が一致せず、fallback マッチに失敗 → 過剰 create が走っていたケースもあり得る

## Decision

`packages/calendar-sdk/src/adapters/timetree.ts` に正規化関数 `normalizeAllDayEnd` を追加し、TimeTree raw event を内部 `CalendarEvent` に変換するすべての経路で適用する:

```ts
export function normalizeAllDayEnd(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return endMs;
  const diff = endMs - startMs;
  if (diff < 2 * ONE_DAY_MS) return endMs; // 単日 / 2日間 / 異常 / 時間指定
  if (diff % ONE_DAY_MS !== 0) return endMs; // 24h 刻みでない（時間指定混入）
  return endMs + ONE_DAY_MS; // N>=3 日 inclusive → exclusive 翌日0時に
}
```

適用箇所:

1. `TimeTreeAdapter.toCalendarEvent`（通常イベント経路）
2. `TimeTreeAdapter.listEvents` 内の **通常イベント分岐の時間範囲フィルタ**（raw end_at で判定すると終端日に取得した複数日終日が欠落するため、正規化後 end で判定）
3. `TimeTreeAdapter.listEvents` 内の RRULE 展開時（`masterEnd` を正規化してから `expandRecurringEvent` に渡す。durationMs が `N*24h` となり、各インスタンスの end も自動的に exclusive 表現）

### 既知の制限: 2日間終日は判別不能 (確定)

2日間終日 (raw diff=24h) は **単日終日 (raw diff=24h) と raw 値が同一**のため、`normalizeAllDayEnd` では判別不能。結果として 2日間終日は Google で 1日不足（最終日のみ表示）となる挙動が継続する。

**Issue #118 (2026-05-18) で実機観測検討の結論**:

- TimeTree 公式 API は 2023-12-22 に**完全シャットダウン済み** (developers.timetreeapp.com 廃止)、ドキュメント確認手段なし
- リバースエンジニアリングの本家 [`eoleedi/TimeTree-Exporter`](https://github.com/eoleedi/TimeTree-Exporter) の `formatter.py:get_datetime` 実装も **all_day=true なら end_at を常に +1 日**しており、単日と多日を区別していない (Calendar Hub と逆方向の誤り = 単日終日を 2 日表示にする側に倒している)。本家が「区別不能」を前提に設計している事実は、internal API の raw レスポンスに判別フィールドが**存在しない**ことの強力な傍証
- TimeTree-Exporter の `TimeTreeEvent` には Calendar Hub 型定義に欠落しているフィールド (`uuid` / `event_type` / `parent_id` / `label_id` / `alerts` / `url`) が含まれるが、本家実装でもこれらは all_day 判別に使われておらず、観測コストに見合うリターンが薄い
- ユーザー報告ベースの実害ケースは **3 日以上** (PR #117 で解消済み) のみ。2 日間ケースは理論的に発生し得るが報告未確認

**判断**: 実機観測タスクは**打ち切り**、2 日間終日は既知の制限として確定する。

### ワークアラウンド (2 日間終日が必要なユーザー向け)

- **推奨**: TimeTree 側で 2 日間ではなく 1 日 + 1 日の 2 件、または 3 日以上として作成する
- **代替**: Google カレンダー側で同期後に末日を手動延長する
- 反対方向の自動補正 (TimeTree-Exporter 方式) は単日終日が 2 日表示になる regression を生むため採用しない

### 副作用最小化の根拠

- **単日 (diff = 24h)**: 既に exclusive 表現 (or 2日間 inclusive と区別不能) → 触らない
- **時間指定 (diff < 48h かつ all-day=false)**: そもそも本関数を呼ばないが、防御的にも触らない
- **24h 刻みでない異常 diff (例: 36h)**: TimeTree 仕様外なので保守的にそのまま
- **異常入力 (NaN / Infinity / 負値)**: silent normalization 防止のため元値返却。後段の `new Date()` で Invalid Date になり、上位の `[SYNC-GAP]` 等で検出可能
- **N>=3 日 (diff ≥ 48h かつ 24h 刻み)**: +24h で exclusive に変換

### イベント ID 衝突の検討

- `originalId` は `raw.id`（通常）または `${raw.id}${suffix}`（RRULE 展開）。`suffix` は **start ベース**で決まる
- 本修正は **end のみ**を変更するため、`originalId` は変わらず、既存の `timetreeId` タグ付き Google 予定との一次マッチ（tagMap）は引き続き成功する
- `needsContentUpdate` の終日 end 比較（JST date 文字列）で差分検出 → `toUpdate` で Google 側 end.date が +1 日された正しい値に更新される

### Asymmetric write path（書込み側は逆正規化なし）

`createEvent` / `updateEvent` は内部 CalendarEvent の `end` を TimeTree raw `end_at` にそのまま渡している。現状の sync ロジックは TimeTree → Google 単方向のため逆方向書込み経路は未使用。

将来 Google → TimeTree 同期を追加する場合は、内部 exclusive end を TimeTree inclusive end に戻す逆正規化関数が必要になる。本 PR ではスコープ外とする。

## 移行戦略

### デプロイ後の挙動

| イベント種別           | 修正前 Google 側         | 修正後 Google 側 | デプロイ後の挙動                                                                                                 |
| ---------------------- | ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| 単日終日               | 正しい                   | 正しい           | 変化なし                                                                                                         |
| 2日間終日 (本 PR 制限) | 1日不足                  | 1日不足のまま    | 別 Issue で対応 (実機観測必要)                                                                                   |
| N>=3 日終日 (タグ付き) | 1日不足                  | 正しい           | 一次マッチ成功 → `toUpdate` で end.date 上書き                                                                   |
| N>=3 日終日 (タグなし) | 1日不足、fallback 不一致 | 正しい           | 旧バグ由来の予定とは end が不一致 → 別途新規 create / 旧手動修正済みのものは fallback マッチ可能性あり（要観測） |
| 時間指定               | 正しい                   | 正しい           | 変化なし                                                                                                         |

タグ付きイベント（過去 sync で生成されたもの）は初回 sync で自動修正される。

### 手動クリーンアップ

タグなしの旧予定（過去のバグで 1 日不足のまま手動修正されずに残っている Google 側の終日予定）は、修正後 TimeTree 側 end と一致しなくなるため、新規 create で重複が発生し得る。デプロイ後の初回 sync ログ `[SYNC-STATS]` で created 数を観測し、想定外に多ければ手動マージ判断する。

## 検証手順

1. **RED**: `packages/calendar-sdk/src/__tests__/timetree-adapter.test.ts` に以下を追加し、FAIL することを確認
   - `normalizeAllDayEnd` の単体テスト（境界値・異常入力含む 10 件）
   - `TimeTreeAdapter.listEvents` の複数日終日経路の統合テスト（範囲フィルタ + RRULE 経路含む 5 件）
2. **GREEN**: `normalizeAllDayEnd` を実装し、`toCalendarEvent` / 範囲フィルタ / RRULE 展開時に適用
3. **回帰確認**: `pnpm turbo build && pnpm test` で全 320 テスト PASS
4. **lint / type-check**: `pnpm lint && pnpm turbo type-check` で全 PASS
5. **デプロイ後**: 初回 sync ログで `[SYNC-STATS] updated > 0` が観測されること（N>=3 日終日が一斉に修正される）
6. **デプロイ後**: ユーザー報告ケース（1日〜3日終日）が Google 側で 1日〜3日表示になることを確認

## スコープ外

- **2日間終日の判別**: Issue #118 (2026-05-18) で実機観測検討した結果、リバースエンジニアリングの本家も区別していないため判別不能と確定 → §既知の制限 参照
- **TimeTree への書込み (Google → TimeTree 逆同期)**: 現状の sync は単方向のため未対応。将来追加時に逆正規化が必要
- **他タイムゾーン対応**: 現状は JST 固定。`ONE_DAY_MS = 24h` 固定は DST なしの JST に依存
- **ユーザーが TimeTree 側で「終日」を解除した場合の整合**: 既存挙動を踏襲

## 参考

- ADR-008: TimeTree RRULE 展開を JST wall-clock 座標系で行う（スコープ外項目として本件を残していた）
- RFC 5545 §3.6.1: `DTEND` for all-day events SHOULD be exclusive
- Google Calendar API リファレンス: `end.date` の exclusive 仕様
- PR #117 レビュー: Codex / pr-test-analyzer / silent-failure-hunter / code-reviewer による多角的指摘を踏まえて Decision を改訂
