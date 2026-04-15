#!/bin/bash
set -euo pipefail

# Cloud Monitoring アラート発火のE2Eテスト用ログ注入スクリプト（Issue #72）
#
# 注意: `gcloud logging write` は resource.type=global で書き込むため、
# log-based metric の filter (`resource.type="cloud_run_revision"`) と一致せず
# アラートは発火しない。このスクリプトは Cloud Logging REST API を直接叩いて
# cloud_run_revision リソースを明示指定する。
#
# 使用例:
#   bash infra/inject-test-alert-log.sh              # 3種すべて注入
#   bash infra/inject-test-alert-log.sh sync-gap     # SYNC-GAPのみ
#   bash infra/inject-test-alert-log.sh sync-failed  # Sync failedのみ
#   bash infra/inject-test-alert-log.sh rrule-skip   # RRULE-SKIPのみ

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
SERVICE_NAME="${SERVICE_NAME:-calendar-hub-api}"
REGION="${GCP_REGION:-asia-northeast1}"
TARGET="${1:-all}"
TEST_ID="e2e-$(date +%s)"

case "$TARGET" in
  all | sync-gap | sync-failed | rrule-skip) ;;
  *)
    echo "Usage: $0 [all|sync-gap|sync-failed|rrule-skip]" >&2
    exit 2
    ;;
esac

REVISION=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format="value(status.latestReadyRevisionName)")

if [ -z "$REVISION" ]; then
  echo "ERROR: could not resolve latest revision for $SERVICE_NAME" >&2
  exit 1
fi

ACCESS_TOKEN=$(gcloud auth print-access-token)

echo "Injecting with:"
echo "  project  = $PROJECT_ID"
echo "  service  = $SERVICE_NAME"
echo "  revision = $REVISION"
echo "  test_id  = $TEST_ID"
echo ""

write_entry() {
  local payload="$1"
  curl -sSf -X POST \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://logging.googleapis.com/v2/entries:write" \
    -d "$(cat <<EOF
{
  "entries": [
    {
      "logName": "projects/${PROJECT_ID}/logs/run.googleapis.com%2Fstderr",
      "resource": {
        "type": "cloud_run_revision",
        "labels": {
          "project_id": "${PROJECT_ID}",
          "service_name": "${SERVICE_NAME}",
          "revision_name": "${REVISION}",
          "location": "${REGION}",
          "configuration_name": "${SERVICE_NAME}"
        }
      },
      "severity": "ERROR",
      "textPayload": ${payload}
    }
  ]
}
EOF
)" > /dev/null
}

inject_sync_gap() {
  echo "-> [SYNC-GAP] (発火目安: 15-20分)"
  write_entry "\"[SYNC-GAP] calendar=TEST-${TEST_ID} tt=99 taggedBefore=90 diff=9 created=0 deleted=0 skipped=0\""
}

inject_sync_failed() {
  echo "-> Sync failed (発火目安: 1-5分)"
  write_entry "\"Sync failed for TEST-${TEST_ID}: injected for alert E2E verification\""
}

inject_rrule_skip() {
  echo "-> [RRULE-SKIP] (発火目安: 最大1時間)"
  write_entry "\"[RRULE-SKIP] calendar=TEST-${TEST_ID} event=test-evt title=\\\"e2e verification\\\" recurrences=[FREQ=INVALID] err=injected for alert E2E verification\""
}

case "$TARGET" in
  all)
    inject_sync_gap
    inject_sync_failed
    inject_rrule_skip
    ;;
  sync-gap)
    inject_sync_gap
    ;;
  sync-failed)
    inject_sync_failed
    ;;
  rrule-skip)
    inject_rrule_skip
    ;;
esac

echo ""
echo "=== Injection complete ==="
echo "確認コマンド:"
echo "  gcloud logging read 'textPayload:\"TEST-${TEST_ID}\"' --project=${PROJECT_ID} --limit=5"
echo ""
echo "Incident/メール着弾は Monitoring > Alerts で確認（${NOTIFICATION_EMAIL:-hy.unimail.11@gmail.com} 宛）"
