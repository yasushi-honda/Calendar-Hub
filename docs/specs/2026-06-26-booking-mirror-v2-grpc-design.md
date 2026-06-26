# 設計仕様書: Google 予約スケジュール完全反映ミラー (v2 / gRPC-web 直叩き)

- 作成日: 2026-06-26
- ステータス: v2.1 (本田様承認済み / Codex review 反映済み / C2 採用)
- 関連: `docs/specs/2026-06-24-booking-mirror-design.md` (v1、Calendar API 自前算出方針) を **置き換える**
- ブランチ予定: `feat/booking-mirror-v2`

---

## 1. 概要

v1 (Calendar API 自前算出) は Google 予約スケジュール内部の Working Hours / Buffer / 1h スロット境界ルールが Calendar API では取得不可で、本田様が求める「**Google 予約スケジュール公開ページの完全反映**」を満たせなかった。

v2 では Google 予約スケジュール公開ページが内部で叩いている **gRPC-web 公開 API** を CalendarHub サーバから直接叩き、Google 予約スケジュールが算出した空き枠リストをそのまま CalendarHub UI に表示する。

ブレークスルー (2026-06-26 PoC で実証):

```
POST https://calendar-pa.clients6.google.com/$rpc/google.internal.calendar.v1.AppointmentBookingService/ListAvailableSlots?key=<API_KEY>
Body: [null, null, "<schedule-id>", null, [[<start-unix>], [<end-unix>]]]

→ 200 OK
[[[["<unix-timestamp>"], <duration-min>]], ...]
```

- 認証不要 (X-Goog-Api-Key を query param で渡すだけ、SAPISIDHASH / Cookie 不要)
- 公開 API (Google 予約スケジュールの公開ページから誰でも叩いている同じ endpoint)
- レスポンスは構造化 JSON（unix timestamp 配列）
- Image #14 の枠と完全一致を実証済み

## 2. 動機

| 項目                  | v1 (Calendar API)               | v2 (gRPC-web)                                |
| --------------------- | ------------------------------- | -------------------------------------------- |
| 反映度                | Calendar 上の **実 event** のみ | Google 予約スケジュールの公開枠 **そのまま** |
| Working Hours 設定    | 取得不可                        | 反映済み (Google 側で計算済)                 |
| Buffer 設定           | 取得不可                        | 反映済み                                     |
| 半端時間枠 (06:30 等) | 出ない                          | Google 通り                                  |
| OAuth 連携            | `yasushi.honda` 必要            | **不要**                                     |
| 規約リスク            | なし (公式 SDK)                 | やや有り (`internal` namespace)              |

本田様の決定 (2026-06-26): 「完全反映されないと意味がない」「完全別枠でも良い」。v1 を廃止し v2 を新規実装する方針。

## 3. 要件

### 3.1 機能要件

| ID   | 要件                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | 本田様が管理画面で **Google 予約スケジュール短縮 URL** (`calendar.app.google/XXX`) を入力するだけで新規ミラー link を作成できる |
| FR-2 | 公開ページ `/book-mirror/<linkId>` で Google 予約スケジュール公開ページと**同じ空き枠**を表示する                               |
| FR-3 | ゲストが枠を選択 → 氏名 (必須) / メール (任意) / メッセージ (任意) を入力するフォームを表示する (既存 UI 流用)                  |
| FR-4 | 予約成立時に本田様の通知先メール (`hy.unimail.11@gmail.com`) に通知を送信                                                       |
| FR-5 | ゲストがメールを入力した場合、確認メールも送信                                                                                  |
| FR-6 | Google Calendar への event 自動作成は**行わない** (Google 予約スケジュール側で別途処理されるため、二重登録回避)                 |
| FR-7 | 二重予約防止 (Firestore transaction、既存ロジック流用)                                                                          |
| FR-8 | 既存の `bookingLink` 機能 (v1) とは**完全別物**として共存。v1 link は無効化 / 削除可能                                          |
| FR-9 | 公開ページを開いた時 / リロード時 / 60s ポーリング / visibility / focus で最新化 (既存 book-content.tsx の挙動と同じ)           |

### 3.2 非機能要件

| ID    | 要件                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | 既存 Cloud Run service `calendar-hub-api` / `calendar-hub-web` を流用                                                      |
| NFR-2 | gRPC-web API 直叩きは **サーバサイド (Cloud Run api)** から行う (FE から直接叩くと CORS で blocked、また API Key 露出回避) |
| NFR-3 | Google API レスポンス構造が変わったときの fallback / 検出機構 (graceful failure + ログ)                                    |

## 4. アーキテクチャ

```
┌──────────────────────────────────────────────┐
│ Google 予約スケジュール公開 API               │
│  POST .../AppointmentBookingService/         │
│       ListAvailableSlots                      │
│  POST .../GetAppointmentServiceDefinition    │
└──────────────────────────────────────────────┘
           │ HTTPS (X-Goog-Api-Key query param)
           ▼
┌──────────────────────────────────────────────┐
│ Calendar Hub API (Cloud Run / Hono)           │
│  ├ GET /api/public/booking-mirror/:linkId     │
│  │    → Firestore から link 情報取得         │
│  ├ GET /api/public/booking-mirror/:linkId/slots│
│  │    → resolveScheduleId(shortUrl)           │
│  │    → fetchAvailableSlots(scheduleId, range)│
│  │    → convertToBookingSlots(slots)          │
│  └ POST /api/public/booking-mirror/:linkId/book│
│       → Firestore に Booking 保存             │
│       → メール通知 (hy.unimail.11 経由)        │
└──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ Next.js 公開ページ (apps/web/src/app/book-mirror/[linkId]) │
│  既存 book-content.tsx のセクション化 UI を流用 │
└──────────────────────────────────────────────┘
```

### 4.1 schedule ID 解決ロジック

短縮 URL → 完全 schedule ID への解決:

1. `https://calendar.app.google/<short-id>` を fetch、リダイレクト先 URL を取得 (HTTP 30x の Location ヘッダ)
2. リダイレクト先は `https://calendar.google.com/calendar/u/0/appointments/schedules/<full-schedule-id>`
3. `<full-schedule-id>` を抽出して保持

**最適化案**: link 作成時に解決して Firestore に保存しておけば、毎回の slots 取得で再解決不要。仕様変更で短縮 URL が変わった場合のみ再解決。

### 4.2 gRPC-web 呼び出し

```ts
async function fetchAvailableSlots(
  scheduleId: string,
  startUnix: number,
  endUnix: number,
): Promise<Array<{ startUnix: number; durationMinutes: number }>> {
  const url = `https://calendar-pa.clients6.google.com/$rpc/google.internal.calendar.v1.AppointmentBookingService/ListAvailableSlots?key=${API_KEY}`;
  const body = JSON.stringify([null, null, scheduleId, null, [[startUnix], [endUnix]]]);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'X-User-Agent': 'grpc-web-javascript/0.1',
      'X-Goog-AuthUser': '0',
      Origin: 'https://calendar.google.com',
      Referer: 'https://calendar.google.com/',
    },
    body,
  });
  if (!res.ok) throw new Error(`gRPC-web failed: ${res.status}`);
  const data = (await res.json()) as unknown;
  return parseSlotResponse(data);
}

function parseSlotResponse(data: unknown): Array<{ startUnix: number; durationMinutes: number }> {
  // [[[[["1782466200"], 60]], ...]]
  // 外側 [0] -> slots array
  // 各 slot: [[[<unix-str>], <duration>]]
  const outer = (data as unknown[])[0] as unknown[];
  return outer.map((slot) => {
    const inner = (slot as unknown[])[0] as unknown[];
    const startUnixStr = (inner[0] as unknown[])[0] as string;
    const durationMinutes = inner[1] as number;
    return { startUnix: parseInt(startUnixStr, 10), durationMinutes };
  });
}
```

## 5. データモデル

### 5.1 新規 Firestore collection: `bookingMirrorLinks`

```typescript
export interface BookingMirrorLink {
  id: string; // nanoid(12)
  ownerUid: string; // Firebase Auth uid
  title: string; // 例: 「【本田】予約スケジュール (mirror)」
  description?: string; // 任意の案内文
  shortUrl: string; // calendar.app.google/<short-id> ← 必須
  scheduleId: string; // 解決済み full schedule ID (cache、空のときは毎回再解決)
  notificationEmail: string; // 通知先 (デフォルト: hy.unimail.11@gmail.com)
  rangeDays: number; // 公開日数 (デフォルト 30、最大 60)
  status: 'active' | 'paused';
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.2 関連: `bookings` collection

既存 `bookings` collection を流用。`linkId` フィールドに `bookingMirrorLinks` の id を入れて区別。

## 6. インターフェース変更

### 6.1 新規 API endpoint

#### `GET /api/booking-mirror-links` (オーナー用)

owner の mirror link 一覧を返す。`requireAuth` 必須。

#### `POST /api/booking-mirror-links` (オーナー用)

新規 mirror link 作成。入力: `{ title, shortUrl, notificationEmail?, rangeDays? }`。
作成時に shortUrl から scheduleId を解決して保存。

#### `DELETE /api/booking-mirror-links/:linkId` (オーナー用)

mirror link 削除。

#### `GET /api/public/booking-mirror/:linkId` (公開)

link 情報の public-safe subset を返す (タイトル / 説明 / 受付状態)。

#### `GET /api/public/booking-mirror/:linkId/slots` (公開)

空き枠取得。サーバ側で gRPC-web API を叩く。レスポンスは既存 `book-content.tsx` の `BookingSlot[]` 形式に変換。

#### `POST /api/public/booking-mirror/:linkId/book` (公開)

予約成立。Firestore に保存 + 通知メール。Google Calendar への event 作成は**行わない** (FR-6)。

### 6.2 新規 FE ページ

#### `apps/web/src/app/book-mirror/[linkId]/`

公開ページ。`page.tsx` + `book-mirror-content.tsx` で構成。

既存 `book-content.tsx` の **時間帯セクション化 UI / JST grouping bug 修正 / ポーリング ロジック** を流用 (コード重複は最小化、可能なら共通化)。

#### `apps/web/src/app/booking-mirror-links/`

管理画面。`booking-mirror-links-content.tsx` で link 一覧 + 「+ 新規作成」ボタン。
新規作成画面 `apps/web/src/app/booking-mirror-links/new/new-mirror-link-content.tsx` で:

- タイトル
- Google 予約スケジュール短縮 URL (入力時に format validate)
- 受付状態 (デフォルト active)

## 7. エラー処理

| 状況                                    | 挙動                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- |
| gRPC-web API 200 + 空配列               | 「利用可能な日程がありません」表示                                    |
| gRPC-web API 非 200 (4xx, 5xx)          | ログ記録 + 公開ページで「現在予約システムに障害が発生しています」表示 |
| schedule ID 解決失敗 (短縮 URL invalid) | link 作成時に 400 error返却                                           |
| Google API 仕様変更でレスポンス構造変化 | `parseSlotResponse` で例外 → ログ + 「障害」表示                      |

## 8. テスト戦略

### 8.1 Acceptance Criteria

| AC   | 内容                                                                     | 検証                                               |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| AC-1 | 短縮 URL `calendar.app.google/2jkd3Ve8yvhPGtwdA` で mirror link 作成成功 | 手動確認 (本田様)                                  |
| AC-2 | mirror link の `/book-mirror/<linkId>` で Image #14 と同じ枠が表示される | 手動確認 (Google 予約スケジュール公開ページと比較) |
| AC-3 | ゲストが予約 → `hy.unimail.11@gmail.com` に通知メール届く                | 手動確認                                           |
| AC-4 | `parseSlotResponse` が unix timestamp 配列を正しく変換する               | unit test (fixture: PoC で取得した実 JSON)         |
| AC-5 | 短縮 URL invalid のとき POST `/api/booking-mirror-links` が 400 を返す   | unit test                                          |

### 8.2 unit test 対象

- `apps/api/src/lib/google-booking-mirror.ts`:
  - `resolveScheduleId(shortUrl)` — リダイレクト先パース
  - `parseSlotResponse(data)` — JSON 配列パース (PoC 取得 fixture を使用)
- `apps/api/src/routes/booking-mirror-links.ts`:
  - POST 入力バリデーション
  - DELETE 権限チェック (ownerUid 一致)

## 9. スコープ外 / 将来課題

| 項目                                     | 理由                                              |
| ---------------------------------------- | ------------------------------------------------- |
| Google Calendar への event 自動作成 (C1) | C2 採用により本リリースでは実装しない (§9.1 参照) |
| 独自ドメイン                             | 既存方針通り                                      |
| spam 対策 (hCaptcha 等)                  | 既存方針通り                                      |
| 既存 v1 bookingLink との移行ツール       | v1 廃止方針なので不要                             |

### 9.1 二重予約リスクの取り扱い (C2 採用)

Codex review (2026-06-26) で指摘された High リスク: Calendar Hub フォームで予約完了しても Google Appointment Schedule には予約が入らない。その枠は Google 公開ページ上では空いたままで、同枠を Google 経由で別ゲストが予約すると二重予約になる。

本リリースでは **C2 = 個人運用としてリスク受容** を本田様判断で採用。理由:

- オーナー 1 名運用、ターゲット限定の予約系
- Google 予約スケジュール側と CalendarHub mirror 側で公開先を分離する運用は可能
- C1 (Google Calendar への block event 書き込み) には `yasushi.honda@aozora-cg.com` 等の OAuth 連携 + `calendar.events` write 権限が必要だが、本田様の方針で当該連携を削除済

将来 C2 から C1 に移行する場合の拡張点:

1. 対象カレンダーを CalendarHub に OAuth 連携
2. `BookingMirrorLink` に `blockCalendarId` / `blockAccountId` フィールド追加
3. POST `/book` 処理に `createBlockEvent` を追加

### 9.2 Codex review 反映の technical 改善点

- `durationMinutes` はモデル固定値ではなく gRPC レスポンス (各 slot の duration) から動的取得
- 通知メール: **送信者** `hy.unimail.11@gmail.com` (Gmail send 権限利用) / **宛先** = link 作成時の `notificationEmail` 設定値 (デフォルト hy.unimail.11)
- POST `/book` で予約直前に `ListAvailableSlots` を再取得し、選択 slot の妥当性を再検証 (stale slot / 任意 slot POST 防止)
- gRPC 4xx/5xx / 非 JSON / 構造化エラー時は `invalid_shape` / `empty_slots` / `google_error_payload` / `non_json` に分類して structured log
- API Key は環境変数 (`GOOGLE_BOOKING_MIRROR_API_KEY`) から取得、Cloud Run env で設定、ログ出力時はマスク
- `bookings` collection に `linkType: 'bookingLink' | 'bookingMirrorLink'` を追加 (既存は default 'bookingLink')
- `fetch` には `AbortSignal.timeout(8_000)` を必ず付与、タイムアウト時は 503 変換
- `/api/public/booking-mirror/*` は既存 `/api/public/booking/*` と同等の rate limit を適用
- 短縮 URL `calendar.app.google/<id>` と完全 URL `calendar.google.com/calendar/.../schedules/<full-id>` の両方を入力受付 (短縮 URL 仕様変更耐性)

## 10. Open Questions / 検証必要事項

実装着手前に検証 (PoC で一部既に確認済み):

- [x] gRPC-web API が認証なし (API Key のみ) で叩けるか → ✅ 200 OK 確認
- [x] レスポンスが構造化 JSON か → ✅ 配列形式確認
- [x] Image #14 と一致するデータが返るか → ✅ unix timestamp デコードで一致確認
- [ ] schedule ID の最大有効期間 (例: 1 年先まで取れる?)
- [ ] gRPC-web API の rate limit (公開 API key の上限)
- [ ] レスポンスにエラー時の structured error が含まれるか (scheduleID 無効時の挙動)
- [ ] Cloud Run から `calendar.app.google` への HTTPS リダイレクト解決が正常動作するか (egress 制限の有無)

## 11. 実装フェーズ計画

| Phase       | 内容                                                                             | 所要 (目安) |
| ----------- | -------------------------------------------------------------------------------- | ----------- |
| **Phase 1** | `apps/api/src/lib/google-booking-mirror.ts` 実装 + unit test                     | 30 分       |
| **Phase 2** | Firestore collection schema + `apps/api/src/routes/booking-mirror-links.ts` 実装 | 45 分       |
| **Phase 3** | `apps/api/src/routes/public-booking-mirror.ts` 実装 (slots / book)               | 45 分       |
| **Phase 4** | `apps/web/src/app/booking-mirror-links/` 管理画面                                | 30 分       |
| **Phase 5** | `apps/web/src/app/book-mirror/[linkId]/` 公開画面                                | 30 分       |
| **Phase 6** | E2E 動作確認 (本田様の `2jkd3Ve8yvhPGtwdA` で Image #14 と比較)                  | 15 分       |

合計推定 ~3 時間。1 つの PR にまとめて段階 commit。

## 12. 参考

- v1 設計仕様: `docs/specs/2026-06-24-booking-mirror-design.md`
- PoC 実機データ: 本ブランチ作業ディレクトリの `listavailableslots-response.json` (Image #14 と一致)
- Image #14: Google 予約スケジュール `calendar.app.google/2jkd3Ve8yvhPGtwdA` 7/3 表示
- 関連 ADR: ADR-002 (calendar-integration)
