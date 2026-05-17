#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="calendar-hub-web"
REPO_NAME="calendar-hub"

# API URLを取得（既にデプロイ済みの前提）
API_URL="${API_URL:-$(gcloud run services describe calendar-hub-api --project="$PROJECT_ID" --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "http://localhost:8080")}"

echo "=== Deploying Calendar Hub Web to Cloud Run ==="
echo "Project: $PROJECT_ID | Region: $REGION | API: $API_URL"

# Cloud Build でリモートビルド＆プッシュ
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:$(git rev-parse --short HEAD)"
echo "Building: $IMAGE"

gcloud builds submit \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --config=infra/cloudbuild-web.yaml \
  --substitutions="_IMAGE=$IMAGE,_API_URL=$API_URL" \
  .

# Cloud Run デプロイ
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --set-env-vars="NEXT_PUBLIC_API_URL=$API_URL,NEXT_PUBLIC_FIREBASE_PROJECT_ID=$PROJECT_ID"

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

echo "=== Web Deploy Complete ==="
gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format="value(status.url)"
