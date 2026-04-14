#!/bin/bash
set -euo pipefail

# Cloud Monitoring alerts for Calendar Hub sync health (#65)
#
# 冪等: 既存リソースは作成せずスキップ、設定更新は `update`。
# 前提: gcloud 認証済み + 必要APIが有効化されている。

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
SERVICE_NAME="${SERVICE_NAME:-calendar-hub-api}"
NOTIFICATION_EMAIL="${NOTIFICATION_EMAIL:-hy.unimail.11@gmail.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Setting up Calendar Hub monitoring ==="
echo "Project: $PROJECT_ID | Service: $SERVICE_NAME | Email: $NOTIFICATION_EMAIL"

# 必要APIの有効化（冪等）
gcloud services enable \
  monitoring.googleapis.com \
  logging.googleapis.com \
  --project="$PROJECT_ID" --quiet

# --- 1. Log-based counter metrics ---

create_or_update_metric() {
  local name="$1"
  local description="$2"
  local filter="$3"

  if gcloud logging metrics describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Updating log metric: $name"
    gcloud logging metrics update "$name" \
      --project="$PROJECT_ID" \
      --description="$description" \
      --log-filter="$filter" --quiet
  else
    echo "Creating log metric: $name"
    gcloud logging metrics create "$name" \
      --project="$PROJECT_ID" \
      --description="$description" \
      --log-filter="$filter"
  fi
}

BASE_FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE_NAME}\""

create_or_update_metric \
  "calendar_hub_rrule_skip" \
  "Count of [RRULE-SKIP] occurrences (recurring event expansion failed)" \
  "${BASE_FILTER} AND textPayload:\"[RRULE-SKIP]\""

create_or_update_metric \
  "calendar_hub_sync_failed" \
  "Count of 'Sync failed for ...' occurrences (full sync cycle error)" \
  "${BASE_FILTER} AND textPayload:\"Sync failed for\""

create_or_update_metric \
  "calendar_hub_sync_gap" \
  "Count of [SYNC-GAP] occurrences (tt != tagged+created-deleted)" \
  "${BASE_FILTER} AND textPayload:\"[SYNC-GAP]\""

# --- 2. Notification channel (email) ---

# 既存のチャネルを検索（gcloud --filter の labels.email_address が不安定なため
# 全取得 → ローカルで email で絞り込む）
EXISTING_CHANNEL=$(gcloud alpha monitoring channels list \
  --project="$PROJECT_ID" \
  --format="value(name,labels.email_address)" 2>/dev/null \
  | awk -v email="$NOTIFICATION_EMAIL" '$2 == email {print $1; exit}' || true)

if [ -n "$EXISTING_CHANNEL" ]; then
  echo "Using existing notification channel: $EXISTING_CHANNEL"
  CHANNEL_NAME="$EXISTING_CHANNEL"
else
  echo "Creating notification channel for $NOTIFICATION_EMAIL"
  CHANNEL_NAME=$(gcloud alpha monitoring channels create \
    --project="$PROJECT_ID" \
    --display-name="Calendar Hub Admin Email" \
    --type=email \
    --channel-labels="email_address=${NOTIFICATION_EMAIL}" \
    --format="value(name)")
  echo "Created: $CHANNEL_NAME"
fi

# --- 3. Alert policies ---

apply_policy() {
  local policy_file="$1"
  local display_name
  display_name=$(grep '^displayName:' "$policy_file" | head -1 | sed 's/displayName: *//; s/^"//; s/"$//')

  # 既存ポリシーを表示名で検索（--filter で displayName の角括弧が扱いづらいため、
  # 全取得してローカルで完全一致検索する）
  local existing
  existing=$(gcloud alpha monitoring policies list \
    --project="$PROJECT_ID" \
    --format="value(name,displayName)" 2>/dev/null \
    | awk -F'\t' -v name="$display_name" '$2 == name {print $1; exit}' || true)

  # ポリシーファイルに notificationChannels を動的に追加して適用
  local tmpfile
  tmpfile=$(mktemp)
  {
    cat "$policy_file"
    echo "notificationChannels:"
    echo "  - \"${CHANNEL_NAME}\""
  } > "$tmpfile"

  if [ -n "$existing" ]; then
    echo "Updating policy: $display_name"
    gcloud alpha monitoring policies update "$existing" \
      --project="$PROJECT_ID" \
      --policy-from-file="$tmpfile" --quiet
  else
    echo "Creating policy: $display_name"
    gcloud alpha monitoring policies create \
      --project="$PROJECT_ID" \
      --policy-from-file="$tmpfile"
  fi

  rm -f "$tmpfile"
}

apply_policy "${SCRIPT_DIR}/alert-policies/rrule-skip.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/sync-failed.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/sync-gap.yaml"

echo ""
echo "=== Monitoring setup complete ==="
echo ""
echo "Verify:"
echo "  gcloud logging metrics list --project=$PROJECT_ID --filter='name:calendar_hub'"
echo "  gcloud alpha monitoring policies list --project=$PROJECT_ID --filter='displayName:Calendar Hub'"
echo ""
echo "Test notification delivery:"
echo "  gcloud alpha monitoring channels verify $CHANNEL_NAME --project=$PROJECT_ID"
