#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="calendar-hub-api"
REPO_NAME="calendar-hub"

# Web URLを取得（CORS設定に必要）
WEB_URL="${WEB_URL:-$(gcloud run services describe calendar-hub-web --project="$PROJECT_ID" --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "http://localhost:3000")}"

echo "=== Deploying Calendar Hub API to Cloud Run ==="
echo "Project: $PROJECT_ID | Region: $REGION | Web: $WEB_URL"

# Artifact Registry リポジトリ作成（初回のみ）
gcloud artifacts repositories describe "$REPO_NAME" \
  --project="$PROJECT_ID" --location="$REGION" 2>/dev/null || \
gcloud artifacts repositories create "$REPO_NAME" \
  --project="$PROJECT_ID" --location="$REGION" \
  --repository-format=docker --description="Calendar Hub containers"

# Cloud Build でリモートビルド＆プッシュ（ローカルDocker不要）
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:$(git rev-parse --short HEAD)"
echo "Building: $IMAGE"

gcloud builds submit \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --config=infra/cloudbuild-api.yaml \
  --substitutions="_IMAGE=$IMAGE" \
  .

# Cloud Run デプロイ
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,FRONTEND_URL=$WEB_URL" \
  --set-secrets="GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,TOKEN_ENCRYPTION_KEY=token-encryption-key:latest,SYNC_SCHEDULER_TOKEN=sync-scheduler-token:latest"

# Cloud Run のトラフィックが過去のピン留めで固定されていると
# `gcloud run deploy` でも自動昇格されない。明示的に LATEST に切り替え (Issue #119)
echo "Promoting traffic to latest revision..."
gcloud run services update-traffic "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-latest

# トラフィックが latest revision に 100% 昇格されたことを検証 (Issue #119)
LATEST_PERCENT=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format="value(status.traffic[?latestRevision=true].percent)")
if [ "$LATEST_PERCENT" != "100" ]; then
  echo "ERROR: traffic not promoted to latest revision (got: ${LATEST_PERCENT:-none})" >&2
  gcloud run services describe "$SERVICE_NAME" \
    --project="$PROJECT_ID" --region="$REGION" \
    --format="value(status.traffic)" >&2
  exit 1
fi

echo "=== API Deploy Complete ==="
gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format="value(status.url)"
