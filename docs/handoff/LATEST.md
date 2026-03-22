# Calendar Hub ハンドオフ (2026-03-22)

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

## 品質状態

- テスト: 74件全PASS（最終確認: #20時点、以降変更なし）
- ビルド: 全5パッケージ成功
- CI: GitHub Actions グリーン (最新: #39)
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

## オープンIssue

GitHub上のオープンIssueはなし（2026-03-22時点）。上記「次セッションの推奨アクション」を参照。

## 次セッションの推奨アクション

1. TimeTree接続フォームの動作確認（設定画面 → OAuth認証フロー）
2. カレンダーイベント取得のデバッグログを確認し、リジェクト原因を特定・修正
3. 本番環境へのデプロイ（Cloud Run: ダークテーマ + TimeTree設定画面 未反映）
4. 本番E2Eフロー確認: Googleログイン → カレンダー表示 → AI提案
5. Gmail OAuth再連携（gmail.sendスコープ追加のため設定画面で再接続）

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In有効化済み
- gcloud named config: `calendar-hub`
