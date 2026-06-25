#!/bin/bash
set -euo pipefail

# Calendar Hub log retention buckets and routing sinks (Issue #81, ADR-010)
#
# 冪等: 既存リソースは update、存在しなければ create。
# 前提: gcloud 認証済み + logging.googleapis.com 有効化済み (setup-monitoring.sh と共通)。
#
# 設計根拠 (docs/adr/010-slo-and-log-retention.md §4):
# - sync-logs (90d): 障害解析・データ整合性事後検証
# - auth-logs (180d): 不正利用調査・規制対応
# - _Default (30d) と並行運用: 新 sink は _Default を抑止せず、対象ログは
#   _Default + 専用バケット双方に保存される (Cloud Logging ingestion は重複課金なし、
#   storage コストのみ延長分を負担)。

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
SERVICE_NAME="${SERVICE_NAME:-calendar-hub-api}"

echo "=== Setting up Calendar Hub log retention ==="
echo "Project: $PROJECT_ID | Service: $SERVICE_NAME"

# --- 1. Log buckets ---

create_or_update_bucket() {
  local name="$1"
  local retention_days="$2"
  local description="$3"

  if gcloud logging buckets describe "$name" \
    --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Updating log bucket: $name (retention=${retention_days}d)"
    gcloud logging buckets update "$name" \
      --location=global \
      --project="$PROJECT_ID" \
      --retention-days="$retention_days" \
      --description="$description" --quiet
  else
    echo "Creating log bucket: $name (retention=${retention_days}d)"
    gcloud logging buckets create "$name" \
      --location=global \
      --project="$PROJECT_ID" \
      --retention-days="$retention_days" \
      --description="$description"
  fi
}

create_or_update_bucket \
  "sync-logs" \
  "90" \
  "Sync-related logs ([SYNC-GAP] / [RRULE-SKIP] / Sync failed for). 90 days for incident analysis (ADR-010)."

create_or_update_bucket \
  "auth-logs" \
  "180" \
  "Auth-related logs (/api/auth/*, TimeTree session). 180 days for security audit (ADR-010)."

# --- 2. Log routing sinks ---

# sync-logs sink: textPayload プレフィックスベース (構造化ログ既存パターンを踏襲)。
# 既存 sync 系メトリクスと同じ patterns を採用 (setup-monitoring.sh: calendar_hub_sync_*)。
SYNC_FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE_NAME}\" AND (textPayload:\"[SYNC-GAP]\" OR textPayload:\"[RRULE-SKIP]\" OR textPayload:\"Sync failed for\")"

# auth-logs sink: /api/auth/* HTTP request + TimeTree session 構造化ログ。
# /api/auth/* は httpRequest.requestUrl で広く拾い、TT 系は textPayload プレフィックスで拾う。
AUTH_FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE_NAME}\" AND (httpRequest.requestUrl:\"/api/auth/\" OR textPayload:\"[TT-SESSION-\")"

create_or_update_sink() {
  local name="$1"
  local bucket="$2"
  local filter="$3"
  local description="$4"

  local destination
  destination="logging.googleapis.com/projects/${PROJECT_ID}/locations/global/buckets/${bucket}"

  if gcloud logging sinks describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Updating log sink: $name → $bucket"
    gcloud logging sinks update "$name" \
      "$destination" \
      --project="$PROJECT_ID" \
      --log-filter="$filter" \
      --description="$description" --quiet
  else
    echo "Creating log sink: $name → $bucket"
    gcloud logging sinks create "$name" \
      "$destination" \
      --project="$PROJECT_ID" \
      --log-filter="$filter" \
      --description="$description"
  fi
}

create_or_update_sink \
  "sync-logs-sink" \
  "sync-logs" \
  "$SYNC_FILTER" \
  "Routes sync-related logs to sync-logs bucket (ADR-010)."

create_or_update_sink \
  "auth-logs-sink" \
  "auth-logs" \
  "$AUTH_FILTER" \
  "Routes auth-related logs to auth-logs bucket (ADR-010)."

echo ""
echo "=== Log retention setup complete ==="
echo ""
echo "Verify:"
echo "  gcloud logging buckets list --project=$PROJECT_ID --filter='name:sync-logs OR name:auth-logs'"
echo "  gcloud logging sinks list --project=$PROJECT_ID --filter='name:sync-logs-sink OR name:auth-logs-sink'"
echo ""
echo "Note: 新規 sink は _Default を抑止しません。対象ログは _Default (30d) と"
echo "      専用バケット (90d/180d) 双方に保存されます (storage コスト延長分のみ加算)。"
