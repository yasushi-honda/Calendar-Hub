# ADR-004: 認証・複数アカウント管理

## ステータス

Accepted (2026-03-21)

## コンテキスト

1人のユーザーが複数のGoogleアカウント（仕事用・個人用等）とTimeTreeアカウントを連携し、各サービスのカレンダーにCRUD操作を行う必要がある。OAuthトークンのセキュアな管理と、スムーズな連携フローの設計が求められる。

## 決定

### メイン認証: Firebase Auth

- ユーザーのプライマリ認証にFirebase Authを使用
- Google Sign-In プロバイダーで初回ログイン
- Firebase Auth UIDを全データのユーザーキーとして使用

### 追加アカウント連携フロー

```
1. メインアカウントでFirebase Authログイン
   → Firebase Auth UID取得

2. 「Googleアカウントを追加」ボタン
   → OAuth 2.0 Authorization Code Flow
   → scope: calendar, calendar.events
   → prompt: consent (毎回同意画面表示で確実にrefresh token取得)
   → access_type: offline (refresh token取得)

3. Authorization Code → Backend API
   → Google Token Endpoint で code → tokens 交換
   → refresh token を暗号化してFirestoreに保存
   → access token はレスポンスで返却（メモリ内のみ）

4. 「TimeTreeアカウントを連携」ボタン
   → TimeTree OAuth 2.0 フロー
   → 同様にrefresh token暗号化保存
```

### OAuth 2.0 設定

#### Google

- **Consent Screen**: External（テスト中はテストユーザー限定）
- **Scopes**:
  - `https://www.googleapis.com/auth/calendar.readonly`（読み取り）
  - `https://www.googleapis.com/auth/calendar.events`（イベントCRUD）
  - `https://www.googleapis.com/auth/gmail.send`（メール通知用、P1）
- **Redirect URI**: `https://{cloud-run-url}/api/auth/callback/google`

#### TimeTree

- **App Type**: OAuth App
- **Scopes**: カレンダー読み書き
- **Redirect URI**: `https://{cloud-run-url}/api/auth/callback/timetree`

### トークンセキュリティ

```
暗号化フロー:
  refresh_token
    → AES-256-GCM暗号化
    → Firestoreに encryptedRefreshToken + iv + authTag 保存

暗号化キー管理:
  → Secret Manager に格納
  → Cloud RunのWorkload Identityで取得
  → 環境変数への直接格納は禁止

復号フロー:
  Firestore読み取り
    → Secret Managerからキー取得
    → AES-256-GCM復号
    → access token取得
    → メモリ内で使用（永続化しない）
```

### Firestoreスキーマ

```
users/{firebaseAuthUid}
  email: string
  displayName: string
  primaryGoogleAccountId: string  // メインのGoogle account
  createdAt: Timestamp
  updatedAt: Timestamp

users/{firebaseAuthUid}/connectedAccounts/{accountId}
  provider: "google" | "timetree"
  email: string
  encryptedRefreshToken: string
  iv: string
  authTag: string
  encryptionKeyVersion: string    // Secret Managerのキーバージョン
  scopes: string[]
  calendarIds: string[]           // 連携対象のカレンダーID
  isActive: boolean
  lastTokenRefreshAt: Timestamp
  connectedAt: Timestamp
```

### トークンリフレッシュ戦略

- access tokenの有効期限: Google は1時間、TimeTreeは要確認
- API呼び出し時にexpiry checkし、期限切れなら自動リフレッシュ
- refresh token失効時（ユーザーがアクセス取消等）: `isActive: false` に更新し、UIで再連携を促す

### セキュリティ考慮事項

| 脅威                       | 対策                                           |
| -------------------------- | ---------------------------------------------- |
| Firestore直接アクセス      | Security Rulesでサーバーサイドのみアクセス許可 |
| トークン漏洩               | AES-256-GCM暗号化 + Secret Manager             |
| CSRF                       | state パラメータによるCSRF防止                 |
| Redirect URI改ざん         | 固定URI + Google/TimeTree側でのホワイトリスト  |
| サービスアカウントキー漏洩 | Workload Identityで鍵レス認証                  |

## 影響

- Firebase Auth + カスタムOAuthフローの2層構成により実装が若干複雑になる
- 暗号化/復号のオーバーヘッドが各API呼び出し時に発生（ただし無視できるレベル）
- Secret Manager API呼び出しコスト（1万回あたり$0.03、無視できるレベル）
- Google OAuth同意画面の審査が公開時に必要（テスト中はテストユーザー設定で回避）
