#!/bin/bash
set -euo pipefail

# Firestore バックアップ・PITR セットアップ（Issue #73）
#
# 冪等: 既存リソースは再作成せずスキップ/更新する。
# 前提: gcloud 認証済み（hy.unimail.11@gmail.com）+ 必要APIが有効化されている。
#
# 作成リソース:
#   1. GCS バケット (asia-northeast1, Standard, 30日ライフサイクル)
#   2. Firestore PITR 有効化（直近7日のpoint-in-time restore）
#   3. Firestore 日次バックアップスケジュール（30日保持）

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
REGION="${GCP_REGION:-asia-northeast1}"
DATABASE="${FIRESTORE_DATABASE:-(default)}"
BACKUP_BUCKET="${BACKUP_BUCKET:-${PROJECT_ID}-firestore-backup}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Setting up Firestore backup & PITR ==="
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Database: $DATABASE"
echo "Bucket:   gs://${BACKUP_BUCKET}"
echo "Retention: ${RETENTION_DAYS} days"
echo ""

# 必要APIの有効化（冪等）
gcloud services enable \
  firestore.googleapis.com \
  storage.googleapis.com \
  --project="$PROJECT_ID" --quiet

# --- 1. GCS バケット（手動エクスポート配置先、長期保管用） ---

if gsutil ls -b "gs://${BACKUP_BUCKET}" >/dev/null 2>&1; then
  echo "✓ Bucket exists: gs://${BACKUP_BUCKET}"
else
  echo "Creating bucket: gs://${BACKUP_BUCKET}"
  gsutil mb -p "$PROJECT_ID" -l "$REGION" -c STANDARD "gs://${BACKUP_BUCKET}"
fi

# ライフサイクル: RETENTION_DAYS 日以上前のオブジェクトを自動削除
LIFECYCLE_JSON=$(mktemp)
trap 'rm -f "$LIFECYCLE_JSON"' EXIT
cat > "$LIFECYCLE_JSON" <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": ${RETENTION_DAYS}}
      }
    ]
  }
}
EOF

echo "Applying lifecycle (delete objects older than ${RETENTION_DAYS} days)"
gsutil lifecycle set "$LIFECYCLE_JSON" "gs://${BACKUP_BUCKET}"

# --- 2. PITR 有効化（直近7日間のpoint-in-time restore） ---

PITR_STATUS=$(gcloud firestore databases describe \
  --database="$DATABASE" --project="$PROJECT_ID" \
  --format="value(pointInTimeRecoveryEnablement)")

if [ "$PITR_STATUS" = "POINT_IN_TIME_RECOVERY_ENABLED" ]; then
  echo "✓ PITR already enabled"
else
  echo "Enabling PITR (pointInTimeRecoveryEnablement=ENABLED)"
  gcloud firestore databases update \
    --database="$DATABASE" \
    --enable-pitr \
    --project="$PROJECT_ID" --quiet
fi

# --- 3. 日次バックアップスケジュール ---

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not found in PATH" >&2
  exit 1
fi

# `--filter` は dailyRecurrence:{} (空オブジェクト) を認識できないため jq で判定する
SCHEDULE_EXISTS=$(gcloud firestore backups schedules list \
  --database="$DATABASE" --project="$PROJECT_ID" --format=json \
  | jq -r '.[] | select(.dailyRecurrence != null) | .name' | head -n 1)

if [ -n "$SCHEDULE_EXISTS" ]; then
  echo "✓ Daily backup schedule already exists: $(basename "$SCHEDULE_EXISTS")"
else
  echo "Creating daily backup schedule (retention=${RETENTION_DAYS}d)"
  gcloud firestore backups schedules create \
    --database="$DATABASE" \
    --recurrence=daily \
    --retention="${RETENTION_DAYS}d" \
    --project="$PROJECT_ID"
fi

echo ""
echo "=== Setup complete ==="
echo "Verify:"
echo "  gcloud firestore databases describe --database='${DATABASE}' --project=${PROJECT_ID} --format='value(pointInTimeRecoveryEnablement)'"
echo "  gcloud firestore backups schedules list --database='${DATABASE}' --project=${PROJECT_ID}"
echo "  gsutil ls -L -b gs://${BACKUP_BUCKET}"
echo ""
echo "Restore procedure: see docs/adr/007-firestore-backup-restore.md"
