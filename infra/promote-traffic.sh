#!/bin/bash
# Cloud Run のトラフィックを LATEST revision に明示的に昇格し、結果を検証する。
#
# 背景 (Issue #119):
#   `gcloud run services update-traffic --to-revisions=<rev>=100` 等で
#   特定 revision にトラフィックがピン留めされていると、その後の
#   `gcloud run deploy` は新 revision を作成しても自動的に昇格しない。
#   このスクリプトを deploy 直後に呼び出すことで、過去のピン留め状態に
#   依らず冪等にトラフィックを LATEST に切り替える。
#
# Usage:
#   PROJECT_ID=... REGION=... bash infra/promote-traffic.sh <service-name>
#
# Exit codes:
#   0  - LATEST revision に 100% 昇格完了
#   1  - update-traffic 失敗 / describe 失敗 / 100% 未昇格

set -euo pipefail

SERVICE_NAME="${1:?service name required as first arg}"
PROJECT_ID="${PROJECT_ID:?PROJECT_ID env var required}"
REGION="${REGION:?REGION env var required}"

echo "Promoting traffic to latest revision for ${SERVICE_NAME}..."
gcloud run services update-traffic "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-latest

# update-traffic は eventual consistency 上 ok 返却後も traffic 反映に遅延がある
# 可能性があるため、describe で実状態を検証する。
# describe 失敗 (権限/NW/サービス未存在) と未昇格を区別するため exit code を分離。
set +e
TRAFFIC_JSON=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format="json(status.traffic)" 2>/tmp/promote-traffic-err.log)
DESCRIBE_EXIT=$?
set -e

if [ "$DESCRIBE_EXIT" -ne 0 ]; then
  echo "ERROR: failed to describe ${SERVICE_NAME} after update-traffic (exit=${DESCRIBE_EXIT})" >&2
  cat /tmp/promote-traffic-err.log >&2 || true
  exit 1
fi

# latestRevision=true の entry の percent 合計を取得 (canary/tag 構成の複数 entry に対応)
LATEST_PERCENT=$(echo "$TRAFFIC_JSON" \
  | jq '[.status.traffic[]? | select(.latestRevision==true) | .percent // 0] | add // 0')

if [ "$LATEST_PERCENT" != "100" ]; then
  echo "ERROR: traffic not promoted to latest revision for ${SERVICE_NAME} (got: ${LATEST_PERCENT})" >&2
  echo "--- Current traffic split ---" >&2
  gcloud run services describe "$SERVICE_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format="yaml(status.traffic)" >&2
  exit 1
fi

echo "OK: ${SERVICE_NAME} traffic promoted to latest revision (100%)"
