# ADR-002: カレンダー統合アーキテクチャ

## ステータス

Accepted (2026-03-21)

## コンテキスト

ユーザーは複数のGoogleアカウント（仕事用・個人用等）のカレンダーと、TimeTree（家族共有）のカレンダーを1つのアプリで統合管理したい。各カレンダーサービスのAPIは異なるプロトコル・認証方式を持つ。

## 決定

### アダプターパターンによる統合

```
CalendarAdapter (interface)
├── GoogleCalendarAdapter
│   ├── Account A (仕事用)
│   └── Account B (個人用)
└── TimeTreeAdapter
    └── Account (家族共有)
```

共通インターフェース `CalendarAdapter` を定義し、各サービス固有の実装を隠蔽する。

```typescript
interface CalendarAdapter {
  listCalendars(): Promise<Calendar[]>;
  listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]>;
  createEvent(calendarId: string, event: CreateEventInput): Promise<CalendarEvent>;
  updateEvent(calendarId: string, eventId: string, event: UpdateEventInput): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
```

### Google Calendar API

- **認証**: OAuth 2.0 (`https://www.googleapis.com/auth/calendar`)
- **SDK**: `googleapis` npm package
- **複数アカウント**: 各アカウントのrefresh tokenをFirestoreに暗号化保存。リクエスト時にaccess tokenを取得
- **同期**: `syncToken` を使った差分同期（Push NotificationはPhase 2で検討）

### TimeTree API（2024年3月更新）

> **注意**: TimeTree公式APIは2023年12月22日に廃止。以下は代替の内部API方式。

- **認証**: email/password → session cookie (`_session_id`)
- **内部API**: `https://timetreeapp.com/api/v1/` (非公式、Webアプリが使用するREST API)
- **主要エンドポイント**:
  - `GET /signin` - CSRFトークン取得（`meta[name="csrf-token"]`から抽出）
  - `PUT /api/v1/auth/email/signin` - ログイン（body: `{uid, password, uuid}`）
  - `GET /api/v2/calendars` - カレンダー一覧（v1は廃止済み）
  - `GET /api/v1/calendar/{numericId}/events/sync` - イベント取得（ページネーション対応）
  - `POST /api/v1/calendar/{numericId}/events` - イベント作成
  - `PUT /api/v1/calendar/{numericId}/events/{eventId}` - イベント更新
  - `DELETE /api/v1/calendar/{numericId}/events/{eventId}` - イベント削除
- **必須ヘッダー**: `X-TimeTreeA: web/2.1.0/ja` + `X-CSRF-Token` + `Cookie: _session_id=...`
- **データ形式**: タイムスタンプはミリ秒Unix timestamp（ISO 8601ではない）
- **認証フロー**: /signin → CSRFトークン+session cookie取得 → ログインAPI → 新session cookie取得
- **リスク**: 非公式APIのためTimeTreeのWebアプリ更新で動作しなくなる可能性
- **参考**: [TimeTree-Exporter](https://github.com/eoleedi/TimeTree-Exporter) の解析結果 + 2026-03実動作検証に基づく

### キャッシュ戦略

外部API呼び出しを最小化するため、Firestoreにイベントキャッシュを持つ。

```
cachedEvents/{compositeId}
  source: "google" | "timetree"
  originalId: string
  accountId: string
  calendarId: string
  data: CalendarEvent
  syncedAt: Timestamp
  syncToken?: string  // Google Calendar用
```

- 初回: 全イベント取得 → キャッシュ
- 以降: syncToken（Google）またはupdatedAt比較（TimeTree）で差分同期
- TTL: キャッシュは24時間で強制リフレッシュ

### トークン管理

```
connectedAccounts/{accountId}
  userId: string
  provider: "google" | "timetree"
  email: string
  encryptedRefreshToken: string  // AES-256-GCM暗号化
  encryptionKeyRef: string       // Secret Managerの鍵参照
  scopes: string[]
  calendarIds: string[]
  lastSyncedAt: Timestamp
```

- refresh tokenは`AES-256-GCM`でFirestore保存前に暗号化
- 暗号化キーはSecret Managerで管理
- access tokenはメモリ内のみ（永続化しない）

## 影響

- `packages/calendar-sdk/` にアダプター実装を集約
- 新しいカレンダーサービス追加時は新アダプター実装のみで対応可能
- キャッシュとソースの不整合リスク → syncメカニズムで緩和
- TimeTree APIのRate Limit対応が必要（キューイングまたはスロットリング）
