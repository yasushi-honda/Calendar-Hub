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

# Docker ビルド＆プッシュ
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:$(git rev-parse --short HEAD)"
echo "Building: $IMAGE"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet 2>/dev/null

docker build -t "$IMAGE" -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL="$API_URL" \
  .
docker push "$IMAGE"

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

echo "=== Web Deploy Complete ==="
gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format="value(status.url)"
