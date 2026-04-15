# Calendar Hub ハンドオフ (2026-04-15)

## 最近の完了作業（直近1週間）

| PR  | Issue | 内容                                                                                    |
| --- | ----- | --------------------------------------------------------------------------------------- |
| TBD | #73   | Firestore PITR + 日次バックアップ + `infra/setup-firestore-backup.sh` + ADR-007         |
| #83 | #72   | アラート3種の E2E 発火検証 + `infra/inject-test-alert-log.sh` 追加                      |
| #70 | #65   | 同期ヘルスチェック自動アラート（RRULE-SKIP / Sync failed / SYNC-GAP）                   |
| #68 | #66   | CI/CD自動デプロイ化（GitHub Actions + WIF、main push→Cloud Run自動反映）                |
| #64 | -     | TimeTreeカンマ区切りEXDATE対応（`【専門学校】専攻生` 等が静かに未同期だった不具合修正） |
| #63 | -     | PR #61の本番再デプロイ + `[SYNC-STATS]` 観測ログ追加（revision 00035）                  |
| #61 | -     | TimeTree繰り返しイベント（RRULE）のGoogle Calendar同期対応                              |

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
| 繰り返しイベント同期（RRULE展開）  | ✅ 完了（#61/#64） |

## 品質状態

- テスト: 209件全PASS（最終確認: 2026-04-14）
- ビルド: 全5パッケージ成功
- CI: GitHub Actions グリーン（最新: main 73441b0 / 2026-04-14）
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
- API最新リビジョン: calendar-hub-api-00038-d6x（GitHub Actions自動デプロイ経由、2026-04-14）
- Web最新リビジョン: calendar-hub-web-00013-crs
- デプロイ経路: main push → `.github/workflows/deploy.yml` → quality → deploy-api → deploy-web（完全自動）
- Cloud Monitoring:
  - Log metrics: `calendar_hub_rrule_skip` / `calendar_hub_sync_failed` / `calendar_hub_sync_gap`
  - Alert policies（3件）→ Email 通知 `hy.unimail.11@gmail.com`
  - セットアップ: `bash infra/setup-monitoring.sh`（冪等）
- Firestore Backup（ADR-007, #73）:
  - PITR 有効（7日 `versionRetentionPeriod=604800s`）
  - 日次バックアップスケジュール（30日保持）
  - GCS: `gs://calendar-hub-prod-firestore-backup`（30日 lifecycle delete）
  - セットアップ: `bash infra/setup-firestore-backup.sh`（冪等）

## オープンIssue

本番運用棚卸しで判明した残リスクを Issue 化（2026-04-14）。

### P0（早急対応）

| #                                                              | タイトル                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| [#74](https://github.com/yasushi-honda/Calendar-Hub/issues/74) | Gmail OAuth トークン失効時の可視化（静かな送信失敗の検知） |

（#72 は PR #83 で完了 / #73 は本PRで完了予定）

### P1（次週対応）

| #                                                              | タイトル                                 |
| -------------------------------------------------------------- | ---------------------------------------- |
| [#75](https://github.com/yasushi-honda/Calendar-Hub/issues/75) | 公開予約ページ E2E テスト                |
| [#76](https://github.com/yasushi-honda/Calendar-Hub/issues/76) | GCP 予算アラート・コストモニタリング     |
| [#77](https://github.com/yasushi-honda/Calendar-Hub/issues/77) | API エラー率・レイテンシ監視（sync以外） |
| [#78](https://github.com/yasushi-honda/Calendar-Hub/issues/78) | ロールバック手順の実地確認               |

### P2（中期対応）

| #                                                              | タイトル                                        |
| -------------------------------------------------------------- | ----------------------------------------------- |
| [#79](https://github.com/yasushi-honda/Calendar-Hub/issues/79) | TimeTree session 切れの自動検知と再ログイン手順 |
| [#80](https://github.com/yasushi-honda/Calendar-Hub/issues/80) | 依存ライブラリ脆弱性監視（Dependabot）          |
| [#81](https://github.com/yasushi-honda/Calendar-Hub/issues/81) | ログ保持期間・SLO 定義                          |

**本番運用として #74 の P0 残 1件は優先対応**する。

## 次セッションの推奨アクション

1. **#74 Gmail 送信失敗の可視化** — 静かに失敗する通知の検知
2. P1 群（予約E2E / 予算アラート / エラー率監視 / ロールバック検証）
3. fetchOwnerEvents / getGmailAuthForUser の3ファイル横断共通化
4. Node.js 20 → Node.js 24 移行（2026-09-16 まで）

## 技術メモ（今セッション）

### Firestore Backup セットアップの落とし穴（2026-04-15, #73）

1. **`gcloud firestore backups schedules list --filter=...` で `dailyRecurrence` を検出できない**:
   `dailyRecurrence: {}` は空オブジェクトで filter の `:*` マッチが機能しない。
   冪等判定には `--format=json | jq '.[] | select(.dailyRecurrence != null)'` が必要。
2. **PITR の `earliestVersionTime` は有効化時刻から進行**: 有効化直後は直近まで、
   7日分のウィンドウが埋まるまで最大 7 日かかる（version_retention_period=604800s）。
3. **復元は新 DB へ**: `gcloud firestore databases restore` は常に新しい database を作成する。
   `(default)` を直接上書きする手段はない（ADR-007 復元後 orchestration 節参照）。

### アラート E2E 検証の落とし穴（2026-04-15, #72 / PR #83）

1. **`gcloud logging write` は使えない**: `resource.type=global` でログを書き込むため、
   log-based metric の filter (`resource.type="cloud_run_revision"`) と一致せず、
   アラートは発火しない。Issue #72 / ADR-006 の原文例が silent に動いていなかった。
   → `infra/inject-test-alert-log.sh` で REST API 直接呼び出し（`cloud_run_revision` 明示）。
2. **SYNC-GAP は 1回注入では発火しない**: `duration=900s` により sustained signal が必須。
   3分間隔で6回注入（18分連続）で確実発火確認。5分間隔4回は境界で逃す事例あり。
3. **E2E 結果**: 3種すべて発火 + メール到着確認済（RRULE-SKIP 2min / Sync failed 3min / SYNC-GAP 19min）。

### TimeTree繰り返しイベント同期の不具合連鎖（2026-04-14）

ユーザー報告「2026-04-14以降の繰り返しイベントが未反映」の調査で**2つの独立した問題**が連鎖していたことが判明：

1. **デプロイ漏れ（PR #63で対応）** — PR #61（RRULE展開）の修正がそもそも本番に入っていなかった。revision 00032-ftb は commit 4f75b61（#61前）でビルドされており、前回ハンドオフの「繰り返しイベント対応済み」記載が誤り。
2. **カンマ区切りEXDATE未対応（PR #64で対応）** — TimeTreeはRFC 5545準拠で1行EXDATEに複数日をカンマ並列（例: `EXDATE:20260505T000000Z,20260526T000000Z,...`）。旧 `parseExdate` は単一値想定で `Invalid Date` を生成 → `rrule.between()` 内で `RangeError: Invalid date passed to DateWithZone` → `try/catch` で握り潰され、該当マスターの全インスタンスが静かに消失。

### `[SYNC-STATS]` / `[RRULE-SKIP]` 観測ログ

- 場所: `apps/api/src/routes/sync.ts` / `packages/calendar-sdk/src/adapters/timetree.ts`
- `[SYNC-STATS]` 形式: `tt=N (recurring=M) gg=K tagged=T actions: c=X u=Y d=Z`
  - 同期結果0件時に「TT側に無い」「既に全マッチ」「タグ欠落」を判別可能
- `[RRULE-SKIP]` 形式: `calendar=X event=Y title="..." recurrences=[...] err=...`
  - 今後の静かなスキップ再発を即座に検知するため `console.error` で出力
- 両ログは Cloud Logging で検索可能。次ステップ #65 でアラート化予定。

### TimeTree繰り返しイベント展開の実装要点（#61 + #64）

- TimeTree API `/events/sync` は繰り返しイベントをマスター1件のみ返す。`recurrences`フィールドに RRULE/EXDATE 文字列配列を格納。
- `rrule` ライブラリで解析、同期期間内のインスタンスを個別イベントとして展開。ID形式: `{masterId}_R{YYYYMMDD[THHmmss]}`（決定論的）。
- `rrule` はCJSモジュールのためデフォルトインポート必須（`import pkg from 'rrule'`）。
- EXDATE は RFC 5545 準拠のカンマ区切りに対応（`split(',')` で分解して各日付を `rruleSet.exdate()` へ）。
- 無効なRRULE/日付は `try-catch` でスキップし `[RRULE-SKIP]` で可視化。

### 運用メモ

- **GCPアカウント**: gcloud操作時は `hy.unimail.11@gmail.com` に切り替え必要（`.envrc` の `sasaki.system0801` には calendar-hub-prod の権限なし）
- **デプロイ**: `bash infra/deploy-api.sh`（`git rev-parse --short HEAD` をイメージタグにするため、デプロイ前に必ず `git checkout main && git pull` 必須）

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In有効化済み
- gcloud named config: `calendar-hub`
