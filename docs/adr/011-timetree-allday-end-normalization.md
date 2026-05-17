# ADR-011: TimeTree all-day `end_at` の包含/排他解釈正規化

- Status: Accepted
- Date: 2026-05-17
- Issue: TimeTree → Google 同期で複数日終日予定が「最終日が1日不足」して反映される事象（ユーザー報告）
- Related: ADR-008（スコープ外項目「TimeTree all-day `end_at` の排他/包含解釈確認」の解消）

## Context

ユーザー報告: 「TimeTree で 1日〜3日の終日設定が、Google カレンダーには 1日〜2日として反映される（最終日が抜ける）」

### 根本原因

TimeTree 内部 API は終日イベントの `end_at` を **単日と複数日で異なる意味**で返している:

| ケース     | TimeTree raw `end_at` | `end_at - start_at` | 解釈                  |
| ---------- | --------------------- | ------------------- | --------------------- |
| 単日終日   | 翌日 0:00 JST         | 24h                 | exclusive（正常）     |
| 複数日終日 | 最終日 0:00 JST       | (N-1) × 24h         | inclusive（要正規化） |

一方、Google Calendar は `end.date` が **exclusive**（その日を含まない）。
内部 `CalendarEvent` の `end` をそのまま `toDateString(end, "Asia/Tokyo")` で日付化して Google に送ると、複数日終日の場合のみ「最終日 = 1日不足」となる。

ADR-008 ではこの解釈確認が「スコープ外」として別 Issue 化されていた。本 ADR でその解消を行う。

### 既存テストでカバーされていなかった理由

- 既存 `sync.test.ts:524-548` の終日マッチングテストは **単日のみ**（`end = start + 24h`）
- 複数日終日のケース（`end = start + N*24h, N>=2`）が未カバー
- 結果として、`buildSyncActions` 内の `eventKey` 計算でも `end` の差を検出できず、TimeTree 側 inclusive end と Google 側 exclusive end が一致せず、fallback マッチに失敗 → 過剰 create が走っていたケースもあり得る

## Decision

`packages/calendar-sdk/src/adapters/timetree.ts` に正規化関数 `normalizeAllDayEnd` を追加し、TimeTree raw event を内部 `CalendarEvent` に変換するすべての経路で適用する:

```ts
export function normalizeAllDayEnd(startMs: number, endMs: number): number {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const diff = endMs - startMs;
  if (diff < 2 * ONE_DAY_MS) return endMs; // 単日 or 異常入力は触らない
  if (diff % ONE_DAY_MS !== 0) return endMs; // 24h 刻みでない（時間指定混入）は触らない
  return endMs + ONE_DAY_MS; // 複数日 inclusive → exclusive 翌日0時に
}
```

適用箇所:

1. `TimeTreeAdapter.toCalendarEvent`（通常イベント経路）
2. `TimeTreeAdapter.listEvents` 内の RRULE 展開時（`masterStart` と `masterEnd` を渡す前に正規化）。durationMs が正規化された値になるため、各インスタンスの end も自動的に exclusive 表現になる

### 副作用最小化の根拠

- **単日 (diff = 24h)**: 既に exclusive 表現なので触らない
- **時間指定 (diff < 48h)**: そもそも `all_day = true` 以外で本関数を呼ばないが、防御的にも触らない
- **24h 刻みでない異常 diff (例: 36h)**: TimeTree 仕様外なので保守的にそのまま
- **複数日 (diff ≥ 48h かつ 24h 刻み)**: +24h で exclusive に変換

### イベント ID 衝突の検討

- `originalId` は `raw.id`（通常）または `${raw.id}${suffix}`（RRULE 展開）。`suffix` は **start ベース**で決まる
- 本修正は **end のみ**を変更するため、`originalId` は変わらず、既存の `timetreeId` タグ付き Google 予定との一次マッチ（tagMap）は引き続き成功する
- `needsContentUpdate` の終日 end 比較（JST date 文字列）で差分検出 → `toUpdate` で Google 側 end.date が +1 日された正しい値に更新される

## 移行戦略

### デプロイ後の挙動

| イベント種別            | 修正前 Google 側         | 修正後 Google 側 | デプロイ後の挙動                                 |
| ----------------------- | ------------------------ | ---------------- | ------------------------------------------------ |
| 単日終日                | 正しい                   | 正しい           | 変化なし                                         |
| 複数日終日 (タグ付き)   | 1日不足                  | 正しい           | 一次マッチ成功 → `toUpdate` で end.date 上書き   |
| 複数日終日 (タグなし旧) | 1日不足、fallback 不一致 | 正しい           | fallback マッチ失敗継続 or 新規 create（要観測） |
| 時間指定                | 正しい                   | 正しい           | 変化なし                                         |

タグ付きイベント（過去 sync で生成されたもの）は初回 sync で自動修正される。

### 手動クリーンアップ

原則不要。タグなしの「過去に手動作成した不一致な複数日終日」は本修正で fallback キーが揃って match できる可能性が増すため、不要な重複 create も収束方向に向かう。

## 検証手順

1. **RED**: `packages/calendar-sdk/src/__tests__/timetree-adapter.test.ts` に以下を追加し、FAIL することを確認
   - `normalizeAllDayEnd` の単体テスト（境界値・異常入力含む）
   - `TimeTreeAdapter.listEvents` の複数日終日経路の統合テスト
2. **GREEN**: `normalizeAllDayEnd` を実装し、`toCalendarEvent` と RRULE 展開時に適用
3. **回帰確認**: `pnpm turbo build && pnpm test` で全 308 テスト PASS
4. **lint / type-check**: `pnpm lint && pnpm turbo type-check` で全 PASS
5. **デプロイ後**: 初回 sync ログで `[SYNC-STATS] updated > 0` が観測されること（複数日終日が一斉に修正される）

## スコープ外

- TimeTree → Google 以外の経路（例: Google → TimeTree の逆同期）。現状の syncロジックは TimeTree → Google 単方向のため対象外
- 他タイムゾーン対応（現状は JST 固定）。`ONE_DAY_MS = 24h` 固定は DST 影響なしの JST に依存している
- ユーザーが TimeTree 側で「終日」を解除した場合の整合（既存挙動を踏襲）

## 参考

- ADR-008: TimeTree RRULE 展開を JST wall-clock 座標系で行う（スコープ外項目として本件を残していた）
- RFC 5545 §3.6.1: `DTEND` for all-day events SHOULD be exclusive
- Google Calendar API リファレンス: `end.date` の exclusive 仕様
