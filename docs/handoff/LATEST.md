# Calendar Hub ハンドオフ (2026-03-22)

## 完了した作業

| PR  | Issue    | 内容                                            |
| --- | -------- | ----------------------------------------------- |
| #10 | #1, #2   | GCP初期化 + Firebase Auth + OAuth連携           |
| #11 | #3, #4   | Google Calendar + TimeTree Adapter              |
| #12 | #5, #6   | 統合カレンダーUI + 空き時間算出                 |
| #13 | #7, #8   | Vertex AI Gemini 2.5 Flash AI提案               |
| #14 | -        | テスト追加 + shared exports修正                 |
| #15 | -        | TimeTree Adapter内部API修正                     |
| #16 | #9       | メール通知システム (Gmail OAuth2)               |
| #20 | #17-19   | CI + PRテンプレート + テスト46件追加            |
| #26 | #21, #22 | CORS環境変数化 + Secret Manager + CSRF移行      |
| #27 | #23, #24 | AI JSONパース堅牢化 + TT session管理            |
| #28 | #25      | Cloud Runデプロイ基盤                           |
| -   | -        | ダークテーマUI全ページリデザイン + simplify修正 |

## 品質状態

- テスト: 74件全PASS
- ビルド: 全5パッケージ成功
- CI: GitHub Actions (pnpmバージョン競合修正済み)
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

| #   | タイトル                               | ラベル |
| --- | -------------------------------------- | ------ |
| #29 | 本番環境E2E動作確認                    | P1     |
| #30 | mainブランチプロテクションルール設定   | P2     |
| #31 | UI共通コンポーネント抽出(simplify残件) | P2     |

## 次セッションの推奨アクション

1. CIグリーン確認（pnpmバージョン修正pushがトリガー済み）
2. Issue #29: 本番でGoogleログイン→カレンダー→AI提案のE2Eフロー確認
3. Gmail OAuth再連携（gmail.sendスコープ追加のため設定画面で再接続）
4. Issue #30: ブランチプロテクション設定
5. ダークテーマUIの本番デプロイ（現在mainにあるがCloud Run未反映）

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In有効化済み
- gcloud named config: `calendar-hub`
