# Calendar Hub ハンドオフ (2026-03-23)

## 完了した作業

| PR  | Issue    | 内容                                                 |
| --- | -------- | ---------------------------------------------------- |
| #10 | #1, #2   | GCP初期化 + Firebase Auth + OAuth連携                |
| #11 | #3, #4   | Google Calendar + TimeTree Adapter                   |
| #12 | #5, #6   | 統合カレンダーUI + 空き時間算出                      |
| #13 | #7, #8   | Vertex AI Gemini 2.5 Flash AI提案                    |
| #14 | -        | テスト追加 + shared exports修正                      |
| #15 | -        | TimeTree Adapter内部API修正                          |
| #16 | #9       | メール通知システム (Gmail OAuth2)                    |
| #20 | #17-19   | CI + PRテンプレート + テスト46件追加                 |
| #26 | #21, #22 | CORS環境変数化 + Secret Manager + CSRF移行           |
| #27 | #23, #24 | AI JSONパース堅牢化 + TT session管理                 |
| #28 | #25      | Cloud Runデプロイ基盤                                |
| -   | -        | ダークテーマUI全ページリデザイン + simplify修正      |
| #32 | -        | Firebase初期化スキップ（APIキー未設定時）            |
| #33 | -        | ダークテーマ視認性改善 + FRONTEND_URL追加            |
| #34 | -        | react-big-calendarダークテーマ完成                   |
| #35 | -        | カレンダースタイル !important 全面適用               |
| #36 | -        | PageShell + useRequireAuth 共通コンポーネント抽出    |
| #37 | -        | 設定画面にTimeTree接続フォーム追加                   |
| #38 | -        | 認証完了後にカレンダーイベント取得（タイミング修正） |
| #39 | -        | カレンダー取得リジェクト結果のデバッグログ追加       |
| #40 | -        | CLAUDE.md + ハンドオフ + .gitignore                  |
| #41 | -        | 公開予約リンク機能（Calendlyライク）                 |
| #45 | #42      | 予約リンクのユニットテスト21件追加                   |
| #46 | #43      | /simplify リファクタ（DRY・型安全性・効率化）        |
| #47 | -        | Cloud Runタイムゾーン修正（UTC→JST）                 |
| #48 | #44      | 公開予約APIのレート制限（429保護）                   |

## 品質状態

- テスト: 116件全PASS
- ビルド: 全5パッケージ成功
- CI: GitHub Actions グリーン (最新: #48)
- PRテンプレート: Quality Gateチェックリスト強制

## 本番環境

| サービス | URL                                              |
| -------- | ------------------------------------------------ |
| Web      | https://calendar-hub-web-cu7tz7flqq-an.a.run.app |
| API      | https://calendar-hub-api-cu7tz7flqq-an.a.run.app |

- GCP: calendar-hub-prod / asia-northeast1
- Secret Manager: google-client-id, google-client-secret, token-encryption-key, timetree-password
- Firebase Auth承認済みドメイン: 設定済み
- OAuth redirect URI: 設定済み
- CORS: localhost + Cloud Run Web URL
- Firestoreインデックス: bookingLinks, bookings 各種 READY

## オープンIssue

GitHub上のオープンIssueはなし（2026-03-23時点）。

## 次セッションの推奨アクション

1. 公開予約ページで実際に予約テスト（スロット選択 → フォーム入力 → 予約確定 → メール受信確認）
2. 予約リンクのタイムゾーン設定をユーザー選択可能にする（現在JST固定）
3. fetchOwnerEvents / getGmailAuthForUser の3ファイル横断共通化（calendars.ts, ai.ts, public-booking.ts）
4. Gmail OAuth再連携（gmail.sendスコープ追加のため設定画面で再接続）

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In有効化済み
- gcloud named config: `calendar-hub`
