#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="calendar-hub-api"
REPO_NAME="calendar-hub"

echo "=== Deploying Calendar Hub API to Cloud Run ==="
echo "Project: $PROJECT_ID | Region: $REGION"

# Artifact Registry リポジトリ作成（初回のみ）
gcloud artifacts repositories describe "$REPO_NAME" \
  --project="$PROJECT_ID" --location="$REGION" 2>/dev/null || \
gcloud artifacts repositories create "$REPO_NAME" \
  --project="$PROJECT_ID" --location="$REGION" \
  --repository-format=docker --description="Calendar Hub containers"

# Docker イメージビルド＆プッシュ
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:$(git rev-parse --short HEAD)"
echo "Building: $IMAGE"

gcloud builds submit \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --tag="$IMAGE" \
  --dockerfile=apps/api/Dockerfile \
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
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID" \
  --set-secrets="GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,TOKEN_ENCRYPTION_KEY=token-encryption-key:latest"

echo "=== API Deploy Complete ==="
gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format="value(status.url)"
