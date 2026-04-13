# Calendar Hub ハンドオフ (2026-04-13)

## 最近の完了作業（直近1週間）

| PR  | Issue | 内容                                                       |
| --- | ----- | ---------------------------------------------------------- |
| #61 | -     | TimeTree繰り返しイベント（RRULE）のGoogle Calendar同期対応 |

（それ以前の詳細は `docs/handoff/archive/` を参照）

## MVP実装状況

| 機能                               | 状態               |
| ---------------------------------- | ------------------ |
| Firebase Auth + Google OAuth       | ✅ 完了            |
| Google Calendar / TimeTree 統合    | ✅ 完了            |
| 統合カレンダーUI                   | ✅ 完了            |
| Vertex AI 提案（Gemini 2.5 Flash） | ✅ 完了            |
| メール通知（Gmail OAuth2）         | ✅ 完了            |
| 公開予約リンク（Calendlyライク）   | ✅ 完了            |
| カレンダー同期（extendedProps）    | ✅ 完了            |
| 全日イベント同期（TZ対応）         | ✅ 完了（#58/#59） |
| syncIntervalMinutes スケジューラ   | ✅ 完了（#53）     |
| timeMax 月末バグ                   | ✅ 完了（dd241df） |
| 繰り返しイベント同期（RRULE展開）  | ✅ 完了（#61）     |

## 品質状態

- テスト: 200件全PASS（最終確認: 2026-04-13）
- ビルド: 全5パッケージ成功
- CI: GitHub Actions グリーン（最新: main 35e0748 / 2026-04-13）
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
- API最新リビジョン: calendar-hub-api-00032-ftb（繰り返しイベント対応済み、手動デプロイ）

## オープンIssue

なし（2026-04-13時点）

## 次セッションの推奨アクション

1. 公開予約ページで実際に予約テスト（スロット選択 → フォーム入力 → 予約確定 → メール受信確認）
2. fetchOwnerEvents / getGmailAuthForUser の3ファイル横断共通化（calendars.ts, ai.ts, public-booking.ts）
3. CI/CDパイプライン構築（mainマージ時に自動デプロイ）— 現在は手動 `bash infra/deploy-api.sh`

## 技術メモ（今セッション）

### TimeTree繰り返しイベント同期（#61）

- **根本原因**: TimeTree API `/events/sync` は繰り返しイベントをマスター1件のみ返す。`recurrences`フィールドにRRULE文字列を格納。アダプターがこれを無視し、`start_at`（初回日時、多くは数年前）で時間範囲フィルタしていたため全除外。
- **修正**: `rrule`ライブラリでRRULE/EXDATEを解析、同期期間内のインスタンスを個別イベントとして展開。ID形式: `{masterId}_R{YYYYMMDD}`（決定論的）。
- **注意**: `rrule`はCJSモジュールのためデフォルトインポート必須（`import pkg from 'rrule'`）。無効なRRULE/日付は`try-catch`でスキップ。
- **GCPアカウント**: gcloud操作時は `hy.unimail.11@gmail.com` に切り替え必要（.envrcの`sasaki.system0801`にはcalendar-hub-prodの権限なし）

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In有効化済み
- gcloud named config: `calendar-hub`
