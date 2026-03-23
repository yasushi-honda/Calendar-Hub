#!/bin/bash
# Cloud Scheduler ジョブ設定: TimeTree → Google Calendar 同期
# 前提: gcloud CLI認証済み、calendar-hub-prod プロジェクト設定済み

set -euo pipefail

PROJECT_ID="calendar-hub-prod"
REGION="asia-northeast1"
JOB_NAME="timetree-google-sync"
API_URL="https://calendar-hub-api-$(gcloud run services describe calendar-hub-api --region=${REGION} --format='value(status.url)' 2>/dev/null | sed 's|https://||')"

# Cloud Run サービスURL取得
SERVICE_URL=$(gcloud run services describe calendar-hub-api \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)' 2>/dev/null)

if [ -z "${SERVICE_URL}" ]; then
  echo "ERROR: Cloud Run service 'calendar-hub-api' not found in ${REGION}"
  exit 1
fi

ENDPOINT="${SERVICE_URL}/api/sync/timetree-to-google"

# Secret Manager からトークン取得（存在しない場合は作成）
if ! gcloud secrets describe sync-scheduler-token --project="${PROJECT_ID}" &>/dev/null; then
  echo "Creating sync-scheduler-token secret..."
  SYNC_TOKEN=$(openssl rand -hex 32)
  echo -n "${SYNC_TOKEN}" | gcloud secrets create sync-scheduler-token \
    --project="${PROJECT_ID}" \
    --replication-policy="automatic" \
    --data-file=-
  echo "Secret created. Token: ${SYNC_TOKEN}"
  echo "IMPORTANT: Add SYNC_SCHEDULER_TOKEN=${SYNC_TOKEN} to Cloud Run env vars"
else
  echo "Secret 'sync-scheduler-token' already exists."
  SYNC_TOKEN=$(gcloud secrets versions access latest --secret=sync-scheduler-token --project="${PROJECT_ID}")
fi

# 既存ジョブ削除（あれば）
if gcloud scheduler jobs describe "${JOB_NAME}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" &>/dev/null; then
  echo "Deleting existing job '${JOB_NAME}'..."
  gcloud scheduler jobs delete "${JOB_NAME}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --quiet
fi

# ジョブ作成（5分毎）
echo "Creating Cloud Scheduler job '${JOB_NAME}'..."
gcloud scheduler jobs create http "${JOB_NAME}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --schedule="*/5 * * * *" \
  --uri="${ENDPOINT}" \
  --http-method=POST \
  --headers="Authorization=Bearer ${SYNC_TOKEN},Content-Type=application/json" \
  --attempt-deadline="300s" \
  --time-zone="Asia/Tokyo" \
  --description="TimeTree → Google Calendar sync (every 5 minutes)"

echo ""
echo "=== Setup Complete ==="
echo "Job:      ${JOB_NAME}"
echo "Schedule: */5 * * * * (every 5 minutes, JST)"
echo "Endpoint: ${ENDPOINT}"
echo ""
echo "Test run:"
echo "  gcloud scheduler jobs run ${JOB_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "View logs:"
echo "  gcloud scheduler jobs describe ${JOB_NAME} --location=${REGION} --project=${PROJECT_ID}"
