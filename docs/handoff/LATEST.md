# Calendar Hub ハンドオフ (2026-03-22)

## 完了した作業

| PR  | Issue  | 内容                                   |
| --- | ------ | -------------------------------------- |
| #10 | #1, #2 | GCP初期化 + Firebase Auth + OAuth連携  |
| #11 | #3, #4 | Google Calendar + TimeTree Adapter     |
| #12 | #5, #6 | 統合カレンダーUI + 空き時間算出        |
| #13 | #7, #8 | Vertex AI Gemini 2.5 Flash AI提案      |
| #14 | -      | テスト追加 + shared exports修正        |
| #15 | -      | TimeTree Adapter内部API修正            |
| #16 | #9     | メール通知システム (Gmail OAuth2)      |
| #20 | #17-19 | CI + PRテンプレート + テスト46件追加   |
| #26 | #21,22 | CORS環境変数化 + Secret Manager + CSRF |
| #27 | #23,24 | AI JSONパース堅牢化 + TT session管理   |
| #28 | #25    | Cloud Runデプロイ基盤                  |

## 品質状態

- テスト: 74件全PASS (crypto: 6, free-time: 8, notifications: 6, adapter-factory: 8, timetree: 10, vitest自動検出: 36)
- ビルド: 全5パッケージ成功
- CI: GitHub Actions (lint/build/type-check/test)
- PRテンプレート: Quality Gateチェックリスト強制

## 本番環境

| サービス | URL                                              |
| -------- | ------------------------------------------------ |
| Web      | https://calendar-hub-web-cu7tz7flqq-an.a.run.app |
| API      | https://calendar-hub-api-cu7tz7flqq-an.a.run.app |

- GCP: calendar-hub-prod / asia-northeast1
- Secret Manager: google-client-id, google-client-secret, token-encryption-key, timetree-password
- Firebase Auth承認済みドメイン設定済み
- OAuth redirect URI設定済み

## オープンIssue: 0件

## 次セッションの推奨アクション

1. 本番環境でGoogleログイン→カレンダー表示→AI提案の一連フロー動作確認
2. Gmail OAuth再連携（gmail.sendスコープ追加のため設定画面で再接続）
3. Google Chat Webhook通知追加（Webhook URL取得後）
4. ブランチプロテクションルール設定（GitHub Settings → main保護）
5. ローカル古いブランチ掃除（5本残存）

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In有効化済み
- gcloud named config: `calendar-hub`
