# 設計仕様書: Google 予約スケジュール read-only ミラー

- 作成日: 2026-06-24
- ステータス: Draft (Phase 8 ユーザーレビュー前)
- 関連 Issue / PR: (未起票)
- ブランチ: `feature/booking-mirror-design`

---

## 1. 概要

本田康志様 (`yasushi.honda@aozora-cg.com`) が現在顧客向けに利用している Google Appointment Schedule (`https://calendar.app.google/qyKq3kU2sX9e2vid7`) を、Calendar Hub の既存予約機能を活用して **read-only ミラー** として併設する。

Google 側を「主たる予約スケジュール所有者」「予定の真実の源 (source of truth)」として尊重し、Calendar Hub は以下に限定する。

- 空き時間の表示 (本田様の Google Calendar から自前算出)
- 顧客側予約フォームの提供
- 予約成立時のメール通知 (`hy.unimail.11@gmail.com` 宛)

**Calendar Hub は Google Calendar に event を自動作成しない**。本田様が通知メールを受け取り、必要に応じて Google Calendar 側で手動で予定を入れる運用とする。

## 2. 動機

ユーザー要望の経緯:

1. 初期要望: 「`calendar.app.google/xxx` の URL を入れたら、その内容を自前 UI で表示して、フォーム経由でメール通知する仕組みが欲しい」
2. 実機検証 (Phase 1): iframe 埋め込みは `X-Frame-Options: SAMEORIGIN` で不可、Playwright スクレイプは技術的可能だが Bot 検知・規約リスクで運用不向きと判明
3. 方針確定: 「Calendar Hub は Google 予約 URL の読み取り専用ミラーとして動作」「インタラクティブな相互通信なし、こちら側は読むだけ」「クリック後の入力は Calendar Hub 側のフォームで」

結果として、既存の `bookingLink` 機能と要件がほぼ一致 (違いは「Google Calendar への event 自動作成 OFF」のみ) ことが判明。既存資産を流用しつつ最小変更で実現する。

## 3. 要件

### 3.1 機能要件

| ID   | 要件                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| FR-1 | `yasushi.honda@aozora-cg.com` カレンダー**のみ**の空き時間を 60 分枠で表示する公開予約ページを Calendar Hub 上で提供する |
| FR-2 | 公開ページを開いた時とリロードした時に最新の空き時間を再取得する (既存実装で対応済)                                      |
| FR-3 | ゲストが枠を選択 → 氏名 (必須) / メール (任意) / メッセージ (任意) を入力するフォームを表示する (既存実装で対応済)       |
| FR-4 | 予約成立時に `hy.unimail.11@gmail.com` に通知メールを送信する (既存実装で対応済)                                         |
| FR-5 | ゲストがメールを入力した場合、確認メールも送信する (既存実装で対応済)                                                    |
| FR-6 | Google Calendar への event 自動作成は**行わない** (新規ゲート追加)                                                       |
| FR-7 | 二重予約防止 (Firestore transaction による排他制御は既存実装で対応済)                                                    |
| FR-8 | 既存の `bookingLink` の挙動 (autoCreateCalendarEvent = true として動作) は壊さない                                       |

### 3.2 非機能要件

| ID    | 要件                                                                                        |
| ----- | ------------------------------------------------------------------------------------------- |
| NFR-1 | 既存 Cloud Run service `calendar-hub-web` をそのまま利用 (独自ドメイン設定は今回スコープ外) |
| NFR-2 | ismap 準拠 (GCP 内で完結。外部スクレイピング等は行わない)                                   |
| NFR-3 | Google ToS に抵触しない (公式 Calendar API のみを利用)                                      |

## 4. アーキテクチャ

```
┌──────────────────────────────────────────┐
│ Google Calendar (yasushi.honda@aozora-cg.com)│
└──────────────────────────────────────────┘
           │ events.list / freebusy (公式 API、read-only)
           ▼
┌──────────────────────────────────────────┐
│ Calendar Hub API (Cloud Run / Hono)       │
│  ├ GET /api/public/booking/:linkId         │
│  ├ GET /api/public/booking/:linkId/slots   │
│  │    → fetchOwnerEvents()                │
│  │       + calendarIdsForAvailability 絞込 │
│  │    → free-time calculator              │
│  └ POST /api/public/booking/:linkId/book   │
│       → Firestore に Booking 保存          │
│       → メール通知 (Gmail API for hy.unimail.11) │
│       → ★ Google Calendar に event 作成は SKIP ★│
└──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│ Next.js 公開ページ (apps/web/src/app/book/[linkId]) │
│  (既存実装そのまま使用、UI 変更なし)        │
└──────────────────────────────────────────┘
```

### 4.1 変更前後の差分

| レイヤー         | 変更前                            | 変更後                                                                  |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `BookingLink` 型 | 全 link で event 自動作成 ON      | flag (`autoCreateCalendarEvent`) で ON/OFF 切替可                       |
| 空き時間判定     | `accountIds` の全カレンダーを参照 | `calendarIdsForAvailability` で特定 calendar 絞込可 (null なら従来挙動) |
| 予約成立後       | 必ず `adapter.createEvent` を呼ぶ | flag が `false` なら skip                                               |

## 5. データモデル

### 5.1 `BookingLink` (`packages/shared/src/booking-types.ts`)

```typescript
export interface BookingLink {
  id: string;
  ownerUid: string;
  title: string;
  description?: string;
  durationMinutes: DurationOption;
  accountIds: string[];

  // 自動 event 作成関連 (autoCreateCalendarEvent=false なら null 可)
  calendarIdForEvent: string | null;
  accountIdForEvent: string | null;

  freeTimeOptions: BookingLinkFreeTimeOptions;
  availableDays: number[];
  rangeDays: number;
  bufferMinutes: number;
  status: BookingLinkStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // ★ 今回追加
  autoCreateCalendarEvent: boolean;
  calendarIdsForAvailability: string[] | null;
}
```

### 5.2 不変条件

- `autoCreateCalendarEvent === true` のとき: `calendarIdForEvent` と `accountIdForEvent` は **必須 (非 null)**
- `autoCreateCalendarEvent === false` のとき: `calendarIdForEvent` と `accountIdForEvent` は **null 許容**
- `calendarIdsForAvailability === null`: 既存挙動 (`accountIds` の全カレンダーを参照)
- `calendarIdsForAvailability` が配列: その配列に含まれる calendar ID のみ参照

### 5.3 既存 Firestore document の読み出し互換性 (`toBookingLink`)

| フィールド                   | 既存 document に欠如している場合の default |
| ---------------------------- | ------------------------------------------ |
| `autoCreateCalendarEvent`    | `true` (既存挙動)                          |
| `calendarIdsForAvailability` | `null` (既存挙動)                          |
| `calendarIdForEvent`         | 既存値 / `null`                            |
| `accountIdForEvent`          | 既存値 / `null`                            |

これにより、本変更のデプロイ時に既存 link を migration する必要はない。

### 5.4 本田様用 `bookingLink` インスタンス

実装フェーズで本田様が管理画面 (`/booking-links/new`) から作成する。推奨値:

| フィールド                     | 値                                                    |
| ------------------------------ | ----------------------------------------------------- |
| `title`                        | 「【本田】予約スケジュール」                          |
| `description`                  | 「ご相談・お打ち合わせのご予約はこちらから（60 分）」 |
| `durationMinutes`              | `60`                                                  |
| `accountIds`                   | `[<hy.unimail.11 の connected account ID>]`           |
| `calendarIdsForAvailability`   | `["yasushi.honda@aozora-cg.com"]`                     |
| `autoCreateCalendarEvent`      | `false`                                               |
| `calendarIdForEvent`           | `null`                                                |
| `accountIdForEvent`            | `null`                                                |
| `availableDays`                | `[0,1,2,3,4,5,6]`                                     |
| `freeTimeOptions.dayStartHour` | `8`                                                   |
| `freeTimeOptions.dayEndHour`   | `23`                                                  |
| `bufferMinutes`                | `0`                                                   |
| `rangeDays`                    | `30`                                                  |
| `expiresAt`                    | `null`                                                |
| `status`                       | `'active'`                                            |

## 6. インターフェース変更

### 6.1 `apps/api/src/routes/booking-links.ts`

#### POST `/` (新規作成)

`CreateBookingLinkInput` に以下を追加:

```typescript
autoCreateCalendarEvent?: boolean;        // default true
calendarIdsForAvailability?: string[];    // default null
```

バリデーション:

- `autoCreateCalendarEvent !== false` のとき: `calendarIdForEvent` / `accountIdForEvent` は必須
- `autoCreateCalendarEvent === false` のとき: 両者 null 許容
- `calendarIdsForAvailability` 指定時: 配列要素は文字列

#### PATCH `/:linkId` (更新)

- 上記 2 フィールドの更新を許可
- 不変条件チェックを再実行 (false → true 変更時、必須フィールドの存在確認)

#### `toBookingLink` (Firestore data → BookingLink)

§5.3 の default 補完を実装する。

### 6.2 `apps/api/src/routes/public-booking.ts`

#### `fetchOwnerEvents` (signature 変更)

```typescript
async function fetchOwnerEvents(
  ownerUid: string,
  accountIds: string[],
  calendarIdsFilter: string[] | null, // ★ 引数追加
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]>;
```

実装内で `calendarIdsFilter !== null` の場合、`adapter.listCalendars()` の結果を filter してから `listEvents` を呼ぶ。

#### `GET /:linkId/slots` のハンドラ

`fetchOwnerEvents` の呼出に `link.calendarIdsForAvailability` を渡す。

#### `POST /:linkId/book` のハンドラ

```typescript
if (link.autoCreateCalendarEvent) {
  createCalendarEventAsync(link, bookingId, body.guestName, body.guestMessage, slotStart, slotEnd);
}
sendBookingNotificationsAsync(...);  // メール通知は flag に関係なく実行
```

### 6.3 `apps/web/src/app/booking-links/new/new-link-content.tsx`

新規作成 UI に以下を追加:

- チェックボックス「Google Calendar に予定を自動登録する」(default ON、OFF なら autoCreateCalendarEvent=false)
- カレンダー絞り込み欄: connected account の calendar 一覧から複数選択 (空なら calendarIdsForAvailability=null)

## 7. エラー処理

新規ロジック (calendar 絞込・event skip) は副作用のないシンプルな分岐のため、追加のエラーパスは発生しない。既存実装のエラー処理 (二重予約防止の 409 / event 作成失敗時のログ ([MAIL-FAIL]) / メール送信失敗時のフォールバック) はそのまま維持する。

## 8. テスト戦略

### 8.1 Acceptance Criteria

| AC   | 内容                                                                                                                                | 検証方法                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| AC-1 | `autoCreateCalendarEvent: false` の link で予約成立時、`adapter.createEvent` が呼ばれない                                           | unit test (mock adapter)                            |
| AC-2 | `calendarIdsForAvailability: ['x']` の link で `/slots` 取得時、events が `x` カレンダーのみから取られる                            | unit test (mock adapter.listCalendars + listEvents) |
| AC-3 | `autoCreateCalendarEvent` が undefined の既存 link で予約成立時、`createEvent` が呼ばれる (既存挙動の維持)                          | unit test                                           |
| AC-4 | `calendarIdsForAvailability` が undefined の既存 link で `/slots` 取得時、すべてのカレンダーから events が取られる (既存挙動の維持) | unit test                                           |
| AC-5 | `autoCreateCalendarEvent: true` で `calendarIdForEvent` を null で作成しようとすると 400 エラー                                     | unit test (POST `/`)                                |
| AC-6 | 本田様用 link (60 分 / 全曜日 / 8-23 時) で `yasushi.honda@aozora-cg.com` の空き時間が枠として表示される                            | 手動確認 (dev server)                               |
| AC-7 | 予約成立で `hy.unimail.11@gmail.com` に通知メールが届く                                                                             | 手動確認                                            |
| AC-8 | 予約成立で `yasushi.honda@aozora-cg.com` の Google Calendar には event が追加されない                                               | 手動確認 (Google Calendar 画面)                     |

### 8.2 既存テストへの影響

| ファイル                                         | 影響                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/api/src/__tests__/notifications.test.ts`   | 新規 flag を default 補完するため、既存ケースは無変更で通るはず  |
| `apps/api/src/__tests__/adapter-factory.test.ts` | 影響なし                                                         |
| `apps/api/src/__tests__/sync.test.ts`            | 影響なし                                                         |
| 新規 test ファイル                               | `public-booking.test.ts` の追加を検討 (上記 AC-1〜AC-5 をカバー) |

## 9. スコープ外 / 将来課題

| 項目                                               | 理由                                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 独自ドメイン (`book.honda.work` 等) のセットアップ | 本田様の判断で「不要」とされた (Phase 5-3)                                                                                                      |
| フロントエンドのデザイン刷新                       | Phase 5-4 で「既存デザインのまま進める (A スタート)」を決定。実物確認後に必要なら別仕様で実施                                                   |
| spam 対策 (hCaptcha 等)                            | 本田様の要件にない (現状の Google 側にも明示的な spam 対策なし)                                                                                 |
| メール通知の宛先カスタマイズ                       | 現状の `hy.unimail.11@gmail.com` 固定で十分 (本田様承認済)                                                                                      |
| Google Calendar への双方向同期                     | 「インタラクティブな相互通信なし」の方針により対象外                                                                                            |
| Google 予約スケジュールの完全な挙動再現            | Working Location / Working Hours / 不規則な時間帯ルール等は Calendar API では取得不可。`availableDays` + `dayStartHour`/`dayEndHour` で近似する |

## 10. Open Questions

実装フェーズで検証する前提条件:

- [ ] `hy.unimail.11@gmail.com` が Calendar Hub に既にログイン済か (Firebase Auth に user document が存在するか)
- [ ] `hy.unimail.11` の connected account から `yasushi.honda@aozora-cg.com` カレンダーが `calendarList.list()` で見えるか
- [ ] 見えない場合、Google Workspace 側で `yasushi.honda@aozora-cg.com` カレンダーの共有設定が必要

→ これらは dev server を立ち上げてログイン確認後に判明する。本設計の妥当性には影響しないが、本田様用 link の作成に必要な前提条件。

## 11. 参考

- 既存実装: `packages/shared/src/booking-types.ts` / `apps/api/src/routes/booking-links.ts` / `apps/api/src/routes/public-booking.ts` / `apps/web/src/app/book/[linkId]/book-content.tsx`
- Phase 1 検証ログ: `https://calendar.app.google/qyKq3kU2sX9e2vid7` のリダイレクト先 `calendar.google.com/calendar/appointments/schedules/AcZssZ1...` を Playwright で取得し、X-Frame-Options: SAMEORIGIN と予約枠 DOM 構造を確認
- 関連 ADR: ADR-002 (calendar-integration) / ADR-004 (auth-multi-account) / ADR-009 (timetree-session-management)
