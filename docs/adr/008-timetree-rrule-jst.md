# ADR-008: TimeTree RRULE 展開を JST wall-clock 座標系で行う

- Status: Accepted
- Date: 2026-05-02
- Issue: TimeTree → Google 同期で日曜の繰り返し予定が月曜にずれて生成される事象（ユーザー報告）

## Context

ユーザー報告: 「Googleカレンダーで日曜日の『集まれ！隊長・副隊長 会議』『統括隊長MTG』などが月曜日に入ってしまう。削除してもまた入る」

### 根本原因

`packages/calendar-sdk/src/adapters/timetree-recurrence.ts` の `expandRecurringEvent` 内 `rrulestr(line, { dtstart: masterStart })` 呼び出しで `tzid` を渡していない。`rrule` ライブラリは `tzid` 未指定時、`BYDAY` を **UTC 基準**で判定する。

TimeTree の「日曜 0:00 JST」予定は内部的に `start_at = 2026-05-02T15:00:00Z`（UTC では土曜）として保存されるため、`BYDAY=SU` で展開すると次の「UTC 日曜」 = `2026-05-03T15:00:00Z` = **JST 月曜 0:00** が生成される。

Google Calendar への同期ではこの月曜配置の date がそのまま `{date: "2026-05-04"}` として書き込まれ、ユーザーが削除しても次回 sync で `taggedGoogleIds` から外れた timetreeId が新規 create に振られて再生成される。

### Codex セカンドオピニオンの結論

- 主因仮説は妥当（`rrule@2.8.1` で実測確認）
- `rrulestr({ tzid: 'Asia/Tokyo' })` を渡すだけでは出力は変わらない（UTC instant の意味づけは変わらない）
- **floating wall-clock 座標系で展開**するアプローチが堅実
- `instanceDateSuffix` および `parseExdate` も同じ座標系で揃える必要がある

## Decision

`expandRecurringEvent` を以下の方針で書き換える:

1. **入力変換**: 実 UTC instant の `masterStart` を「JST wall-clock を Z付き ISO で表現した floating Date」に変換（具体例は Context 参照）
2. **rrule 展開**: floating Date を `dtstart` として `rrule` に渡す。`rrule` は内部で UTC 基準で曜日判定するが、入力が wall-clock 表現のため「JST の曜日」として正しく扱われる
3. **EXDATE 変換**: `parseExdateFloating` で同じ floating 座標系に揃える。Z 付き UTC instant は `+9h` で変換、Z なし date-time は既に floating として扱う、date-only は JST 0:00 floating として扱う
4. **出力変換**: rrule から得た occurrence（floating）を実 UTC instant に逆変換して呼び出し元に返す
5. **`instanceDateSuffix`**: JST 日付ベースで `_RYYYYMMDD` を生成する（`getUTCFullYear/Month/Date` ではなく `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })` 経由）

JST は DST なしのため、固定 +9 時間オフセットで安全に変換できる。

## 移行戦略

### 全日イベント: `instanceDateSuffix` 変更による `originalId` 衝突は発生しない

**全日イベントに限り**、修正前の UTC 日付ベース suffix と修正後の JST 日付ベース suffix が一致することを T1.1 で数学的に検証:

| ケース              | 修正前 UTC suffix | 修正後 JST suffix | 一致理由                           |
| ------------------- | ----------------- | ----------------- | ---------------------------------- |
| JST 日曜 0:00 開始  | `_R20260503`      | `_R20260503`      | 境界帯（+24h と +1日シフトが相殺） |
| JST 月曜 8:30 開始  | `_R20260303`      | `_R20260303`      | 境界帯（同上）                     |
| JST 火曜 16:00 開始 | `_R20260106`      | `_R20260106`      | 同日帯（UTC でも JST でも同日）    |
| JST 金曜 23:30 開始 | `_R20260410`      | `_R20260410`      | 同日帯（同上）                     |

→ 全日イベントの一次 tagMap マッチは成功し、`needsContentUpdate` が date 差分を検知して `toUpdate` で正しい曜日に上書きされる。

### 時間指定イベント: 一部ケースで create/delete に寄る

時間指定 suffix（`_RYYYYMMDDTHHmmss`）は本 PR で UTC ISO のまま据え置き。ただし `expandRecurringEvent` の出力 `instance.start` は修正前後で値が変わる（バグ修正により JST 0:00-8:59 帯では -24h シフト）ため:

- **JST 9:00 以降**: 修正前後で `instance.start` 不変 → suffix も不変 → tagMap マッチ成功 → 一致
- **JST 0:00-8:59 帯**: 修正前後で `instance.start` が -24h シフト → suffix が変わる → tagMap マッチ失敗 → fallback マッチも失敗（時刻一致せず）→ `toDelete`（旧）+ `toCreate`（新）経路で再生成

### 既存タグ付き Google 予定の挙動まとめ

| 種別 / 帯                 | デプロイ後の挙動                               |
| ------------------------- | ---------------------------------------------- |
| 全日（全帯）              | tagMap マッチ → toUpdate で date 上書き        |
| 時間指定 JST 9:00 以降    | tagMap マッチ → 内容差分なし or 上書き         |
| 時間指定 JST 0:00-8:59 帯 | toDelete（旧月曜）+ toCreate（新日曜）で再生成 |

ユーザーが Google 側のみ削除済みの予定は、いずれの帯でも `toCreate` で正しい曜日に新規生成される。

→ **手動クリーンアップは原則不要**。デプロイ後の初回 sync で自然に正しい曜日に収束する（時間指定 0:00-8:59 帯では一時的に delete+create が走る）。

## スコープ外

以下は別 Issue に切り出す（本 PR には含めない）:

- TimeTree all-day `end_at` の排他/包含解釈確認
- 他タイムゾーン対応（現状は JST 固定が製品仕様）
- `rruleSet.between(timeMin, timeMax, true)` の上限 inclusive 挙動による隣接同期窓の重複可能性（既存挙動、本 PR では悪化していない）。`between(..., false)` + 明示フィルタへの変更と境界テスト追加を別 Issue で扱う
- 時間指定 RRULE + date-only EXDATE は rrule の厳密一致仕様で除外不発（TimeTree が当該パターンを送るかは未観測。observation のみ追加した状態でテストに記録済み）

## 将来拡張の余地

- 座標変換ヘルパーを汎用関数として実装し、引数で TZ を受け取る形にしておく
- 多言語/多TZ対応が必要になった際は、ユーザーごとの primaryTimeZone 設定を導入

## 検証手順

1. RED: JST 0:00 境界の繰り返し予定（BYDAY=SU all-day weekly 等）の再現テストを追加し、現状で FAIL することを確認
2. GREEN: 上記 Decision の実装で全テスト PASS
3. 既存テスト（`timetree-recurrence.test.ts`）が引き続き PASS することを確認（後方互換性）
4. デプロイ後の初回 sync ログで `[SYNC-STATS]` の updates 件数を確認（過去にずれた予定が一斉に修正される想定）

## 参考

- Codex 検証ログ（threadId: `019de6ba-6789-7121-8b90-3ca1e86d516f`）
- rrule README: `https://github.com/jkbrzt/rrule`（"Important: Use UTC dates" / `rrulestr` `tzid` 既定値の説明）
