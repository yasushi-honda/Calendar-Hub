#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"

echo "=== Secret Manager Setup ==="
echo "Project: $PROJECT_ID"

# 必要なシークレット一覧
SECRETS=(
  "google-client-id"
  "google-client-secret"
  "token-encryption-key"
)

for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" 2>/dev/null; then
    echo "✅ $secret already exists"
  else
    echo "Creating $secret..."
    echo -n "Enter value for $secret: " && read -s VALUE && echo
    echo -n "$VALUE" | gcloud secrets create "$secret" \
      --project="$PROJECT_ID" \
      --data-file=- \
      --replication-policy=automatic
    echo "✅ $secret created"
  fi
done

echo ""
echo "=== Existing secrets ==="
gcloud secrets list --project="$PROJECT_ID"
