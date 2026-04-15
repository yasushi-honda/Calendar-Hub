# ADR-007: Firestore バックアップ・PITR 設定

- Status: Accepted
- Date: 2026-04-15
- Issue: #73

## Context

Firestore にバックアップ・Point-in-Time Recovery (PITR) が未設定だった。
予約データ (`bookings`)、同期設定 (`syncConfig`)、暗号化トークン (`connectedAccounts`)、
ownerUid 紐付けなど**再生成不可の情報が多数**あり、誤操作・コードバグ・ransomware 等で
データ損失した場合に**リカバリ手段がない**状態だった。

本番運用として許容できず、以下3層のバックアップ体制を整備する（#73）。

## Decision

| 層          | 対象               | リテンション               | 用途                               |
| ----------- | ------------------ | -------------------------- | ---------------------------------- |
| PITR        | 全コレクション     | 7日                        | 直近の誤操作・バグからの即時復旧   |
| 日次BK      | 全コレクション     | 30日                       | 日次スナップショットから任意点復旧 |
| GCSバケット | 手動エクスポート用 | 30日（lifecycle 自動削除） | 長期保管・ダンプ用                 |

### リソース構成

- **Database**: `projects/calendar-hub-prod/databases/(default)` (asia-northeast1, FIRESTORE_NATIVE)
- **PITR**: `POINT_IN_TIME_RECOVERY_ENABLED`, `versionRetentionPeriod=604800s` (7日)
- **Backup schedule**: daily, retention 2,592,000s (30日)
- **GCS bucket**: `gs://calendar-hub-prod-firestore-backup` (asia-northeast1, Standard, 30日 lifecycle delete)

### セットアップ

```bash
bash infra/setup-firestore-backup.sh
# 環境変数で上書き可: GCP_PROJECT_ID, GCP_REGION, BACKUP_BUCKET, BACKUP_RETENTION_DAYS
```

冪等。既存リソースは作成せずスキップ、lifecycle は毎回 set（同内容なら実質no-op）。

## Alternatives Considered

| 案                                       | 採否   | 理由                                                                                 |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Terraform で IaC 化                      | 不採用 | 本リポジトリは gcloud スクリプト主体（ADR-006 と同じ方針）。冪等性が確保できれば十分 |
| バケットを Nearline/Coldline             | 不採用 | 30日リテンションなら Standard で実質同コスト、復元のアクセスコストが不要             |
| weekly + monthly の多段スケジュール      | 不採用 | Firestore の制約上バックアップ最大リテンション90日、複雑化に対し得られるRPOが同等    |
| 別リージョン (multi-region) バケット複製 | 見送り | 現段階では asia-northeast1 単一運用を許容（災対は将来課題）                          |

## Consequences

### Positive

- 7日以内の誤操作は PITR で分単位復旧可能
- 30日分の日次バックアップで任意時点の完全復旧可能
- 30日以上前のデータは自動削除されストレージコスト抑制

### Negative

- PITR 有効化後、Firestore 料金プランで version storage 分の課金が発生（free tier 内は無料）
- GCS バケット月額: 5GiB 想定で数十円/月程度（Standard asia-northeast1）
- `setup-firestore-backup.sh` は `jq` に依存（chaos なしで失敗停止）

### Restore Procedure（復元手順）

#### A) PITR による point-in-time 復元（直近7日以内）

```bash
# 復元先: 新しい database を作成して復元（本番 (default) を上書きしない）
# earliestVersionTime 以降のタイムスタンプを指定
RESTORE_TIME="2026-04-14T12:00:00Z"   # 復元したいUTC時刻
RESTORE_DB="default-restore-$(date +%Y%m%d-%H%M)"

gcloud firestore databases restore \
  --source-database='projects/calendar-hub-prod/databases/(default)' \
  --snapshot-time="$RESTORE_TIME" \
  --destination-database="$RESTORE_DB" \
  --project=calendar-hub-prod
```

復元 DB でデータ確認後、必要分を手動マイグレーション or app を切り替える。

#### B) 日次バックアップからの復元

```bash
# バックアップID一覧
gcloud firestore backups list --project=calendar-hub-prod

# 復元（新規 database として）
gcloud firestore databases restore \
  --source-backup='projects/calendar-hub-prod/locations/asia-northeast1/backups/<BACKUP_ID>' \
  --destination-database='default-restore-<TIMESTAMP>' \
  --project=calendar-hub-prod
```

#### C) 手動エクスポート → GCS → 別環境にインポート

```bash
# エクスポート（on-demand）
gcloud firestore export gs://calendar-hub-prod-firestore-backup/manual/$(date +%Y%m%d) \
  --project=calendar-hub-prod

# 別プロジェクト/DB にインポート
gcloud firestore import gs://calendar-hub-prod-firestore-backup/manual/<DATE> \
  --project=<TARGET_PROJECT>
```

### 復元後の orchestration 注意

- **暗号化トークン** (`connectedAccounts`): `TOKEN_ENCRYPTION_KEY` が一致する環境にのみ復元可能
  （Secret Manager の key をローテートしたあとは復元前のトークンは復号できない）
- **Firebase Auth ユーザー**: Firestore のバックアップに含まれない。別途 `gcloud firebase auth:export` が必要（本 ADR の対象外、追加対応は Issue #74 以降で検討）
- **アプリ切り替え**: 新 database を `(default)` に昇格する手段はない。切り替えるなら
  (1) 既存 `(default)` を一時 rename する運用は不可 → (2) 新 DB を別 project に復元 or
  (3) 復元 DB からアプリを読み込むよう一時的に設定変更 → データ差分をマージ、が現実解。

## Operations

### 確認コマンド

```bash
# PITR 状態
gcloud firestore databases describe --database='(default)' --project=calendar-hub-prod \
  --format='value(pointInTimeRecoveryEnablement,versionRetentionPeriod,earliestVersionTime)'

# バックアップスケジュール
gcloud firestore backups schedules list --database='(default)' --project=calendar-hub-prod

# 既存バックアップ一覧
gcloud firestore backups list --project=calendar-hub-prod

# GCS バケット lifecycle
gsutil lifecycle get gs://calendar-hub-prod-firestore-backup
```

### 停止（障害対応時）

```bash
# PITR 無効化（version storage 課金停止、過去バージョンは失われる）
gcloud firestore databases update --database='(default)' --no-enable-pitr --project=calendar-hub-prod

# スケジュール削除
gcloud firestore backups schedules delete <SCHEDULE_ID> \
  --database='(default)' --project=calendar-hub-prod
```

## Related

- Issue #73: Firestore バックアップ・PITR設定（本ADR）
- ADR-006: 同期ヘルスチェックの自動アラート化（IaC 方針を踏襲）
- Issue #78: ロールバック手順の実地確認（本 ADR の復元手順を実地検証予定）
