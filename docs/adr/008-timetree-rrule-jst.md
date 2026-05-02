# ADR-008: TimeTree RRULE 展開を JST wall-clock 座標系で行う

- Status: Accepted
- Date: 2026-05-02
- Issue: TimeTree → Google 同期で日曜の繰り返し予定が月曜にずれて生成される事象（ユーザー報告）

## Context

ユーザー報告: 「Googleカレンダーで日曜日の『集まれ！隊長・副隊長 会議』『統括隊長MTG』などが月曜日に入ってしまう。削除してもまた入る」

### 根本原因

`packages/calendar-sdk/src/adapters/timetree-recurrence.ts:29` の RRULE 展開で `rrulestr(line, { dtstart: masterStart })` に `tzid` を渡していない。`rrule` ライブラリは `tzid` 未指定時、`BYDAY` を **UTC 基準**で判定する。

TimeTree の「日曜 0:00 JST」予定は内部的に `start_at = 2026-05-02T15:00:00Z`（UTC では土曜）として保存されるため、`BYDAY=SU` で展開すると次の「UTC 日曜」 = `2026-05-03T15:00:00Z` = **JST 月曜 0:00** が生成される。

Google Calendar への同期ではこの月曜配置の date がそのまま `{date: "2026-05-04"}` として書き込まれ、ユーザーが削除しても次回 sync で `taggedGoogleIds` から外れた timetreeId が新規 create に振られて再生成される。

### Codex セカンドオピニオンの結論

- 主因仮説は妥当（`rrule@2.8.1` で実測確認）
- `rrulestr({ tzid: 'Asia/Tokyo' })` を渡すだけでは出力は変わらない（UTC instant の意味づけは変わらない）
- **floating wall-clock 座標系で展開**するアプローチが堅実
- `instanceDateSuffix` および `parseExdate` も同じ座標系で揃える必要がある

## Decision

`expandRecurringEvent` を以下の方針で書き換える:

1. **入力変換**: 実 UTC instant の `masterStart` を「JST wall-clock を Z付き ISO で表現した floating Date」に変換  
   例: `2026-05-02T15:00:00Z`（実）→ `2026-05-03T00:00:00Z`（floating, JST 0:00 を UTC 表記したもの）
2. **rrule 展開**: floating Date を `dtstart` として `rrule` に渡す。`rrule` は内部で UTC 基準で曜日判定するが、入力が wall-clock 表現のため「JST の曜日」として正しく扱われる
3. **EXDATE 変換**: `parseExdate` も同じ floating 座標系に変換するヘルパーを通す
4. **出力変換**: rrule から得た occurrence（floating）を実 UTC instant に逆変換して呼び出し元に返す
5. **`instanceDateSuffix`**: JST 日付ベースで `_RYYYYMMDD` を生成する（`getUTCFullYear/Month/Date` ではなく `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })` 経由）

JST は DST なしのため、固定 +9 時間オフセットで安全に変換できる。

## 移行戦略（重要な発見）

### `instanceDateSuffix` 変更による `originalId` 衝突は発生しない

T1.1 の数学的検証で、**修正前（バグあり）の UTC 日付 suffix と、修正後（JST 日付）suffix が全ケースで一致**することを確認:

| ケース              | 修正前 UTC suffix | 修正後 JST suffix |
| ------------------- | ----------------- | ----------------- |
| JST 日曜 0:00 開始  | `_R20260503`      | `_R20260503`      |
| JST 火曜 16:00 開始 | `_R20260106`      | `_R20260106`      |
| JST 月曜 8:30 開始  | `_R20260303`      | `_R20260303`      |
| JST 金曜 23:30 開始 | `_R20260410`      | `_R20260410`      |

理由: 修正前 instance.start = 修正後 instance.start + 24h であり、UTC 日付の +1 シフトと、JST 0:00-8:59 帯の wall-clock +1 シフトが相殺するため。

### 既存タグ付き Google 予定の自動修正

修正後の sync 実行で、既存の「月曜にずれた」タグ付き予定は:

1. 一次 tagMap マッチ成功（suffix 一致のため）
2. `needsContentUpdate` が start/end の date 差分を検知
3. `toUpdate` に振られて Google 予定の date が日曜に書き換わる

ユーザーが既に削除した予定は、tagMap 不一致 → fallback 失敗 → `toCreate` で日曜に新規生成される。

→ **手動クリーンアップ（一括削除等）は原則不要**。デプロイ後の初回 sync で自然に正しい曜日に収束する。

## スコープ外

以下は別 Issue に切り出す（本 PR には含めない）:

- TimeTree all-day `end_at` の排他/包含解釈確認
- 他タイムゾーン対応（現状は JST 固定が製品仕様）

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
