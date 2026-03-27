# Calendar Hub ハンドオフ (2026-03-27)

## 最近の完了作業（直近1週間）

| PR  | Issue | 内容                                                                |
| --- | ----- | ------------------------------------------------------------------- |
| #59 | #58   | 全日イベント同期のタイムゾーン対応（toDateString→UTC変換）          |
| #57 | #56   | TimeTree→Google sync で isAllDay フラグを保持                       |
| -   | -     | sync比較でGoogle Meet メタデータを除去                              |
| -   | -     | 重複イベント処理・全日フォールバックマッチの修正（未PRコミット3件） |
| #55 | #52   | extendedProperties タグによる同期済みイベント識別                   |
| -   | #51   | Google Calendar API呼び出しで originalId を使用                     |

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
| timeMax 月末バグ                   | ⚠️ 未修正（#54）   |

## 品質状態

- テスト: 116件全PASS（最終確認: 2026-03-23）
- ビルド: 全5パッケージ成功
- CI: GitHub Actions グリーン（最新: main 7b373d5 / 2026-03-27）
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

| #   | タイトル                                                 | ラベル  |
| --- | -------------------------------------------------------- | ------- |
| #54 | fix: timeMax calculation misses last day of month events | bug, P1 |

## 次セッションの推奨アクション

1. **#54 修正**: timeMax 計算バグ（月末イベントが取得されない）
2. 公開予約ページで実際に予約テスト（スロット選択 → フォーム入力 → 予約確定 → メール受信確認）
3. fetchOwnerEvents / getGmailAuthForUser の3ファイル横断共通化（calendars.ts, ai.ts, public-booking.ts）

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In有効化済み
- gcloud named config: `calendar-hub`
