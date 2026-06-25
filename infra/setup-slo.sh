#!/bin/bash
set -euo pipefail

# Calendar Hub SLI/SLO setup (Issue #81, ADR-010 §1-3)
#
# 冪等: 既存リソースは PATCH (replace)、存在しなければ POST (create)。
# 前提: gcloud 認証済み + monitoring.googleapis.com 有効化済み。
#
# gcloud CLI には monitoring services / slos のサブコマンドが無いため
# Cloud Monitoring REST API v3 を curl + jq 経由で呼び出す。
#   - Service: monitoring.googleapis.com/v3/projects/{P}/services
#   - SLO:     monitoring.googleapis.com/v3/projects/{P}/services/{S}/serviceLevelObjectives
#
# 設計根拠 (docs/adr/010-slo-and-log-retention.md §1-3):
# - 4 SLO: API 稼働率 99.5% / API p95 1s / Sync 99%/day / Web 稼働率 99.5%
# - Sync SLO の Pragmatic 実装: 総 sync 数メトリクス未整備のため windowsBased
#   で 1h 単位 failure 0 件を good window と定義 (true 成功率 SLO は将来の
#   `calendar_hub_sync_attempt` 等メトリクス追加後に置換)
# - notification channel / alert policy は本スクリプト対象外 (Error Budget
#   alert は ADR-010 §"実装フェーズ" の別タスク)

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_BASE="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}"

command -v gcloud >/dev/null 2>&1 || {
  echo "ERROR: gcloud CLI not found in PATH" >&2
  exit 1
}
# jq は本スクリプト実行には不要だが、末尾出力の verify コマンドで使用するため
# 不在なら WARN で通知のみ (block しない)。
if ! command -v jq >/dev/null 2>&1; then
  echo "WARN: jq not found in PATH. SLO 設定は実行可能だが、末尾の verify コマンドは" >&2
  echo "      jq に依存するため別途インストール推奨 (例: brew install jq)。" >&2
fi

echo "=== Setting up Calendar Hub SLI/SLO ==="
echo "Project: $PROJECT_ID"

# monitoring.googleapis.com 有効化 (冪等)
gcloud services enable monitoring.googleapis.com --project="$PROJECT_ID" --quiet

# Bearer token は token 有効期限内 (1h) を前提に 1 回だけ取得。
ACCESS_TOKEN=$(gcloud auth print-access-token)
if [ -z "$ACCESS_TOKEN" ]; then
  echo "ERROR: Failed to obtain access token via gcloud" >&2
  exit 1
fi

# --- 1. Custom Monitoring Services ---

apply_service() {
  local service_id="$1"
  local config_file="$2"
  local url="${API_BASE}/services/${service_id}"

  # 存在チェック (404 = create / 200 = update)
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "$url")

  if [ "$status" = "200" ]; then
    echo "Updating service: $service_id"
    curl -sfS -X PATCH \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "${url}?updateMask=displayName,userLabels" \
      -d @"$config_file" >/dev/null
  elif [ "$status" = "404" ]; then
    echo "Creating service: $service_id"
    curl -sfS -X POST \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "${API_BASE}/services?serviceId=${service_id}" \
      -d @"$config_file" >/dev/null
  else
    echo "ERROR: unexpected HTTP $status from services GET for $service_id" >&2
    exit 1
  fi
}

apply_service "calendar-hub-api" "${SCRIPT_DIR}/slo-services/calendar-hub-api.json"
apply_service "calendar-hub-web" "${SCRIPT_DIR}/slo-services/calendar-hub-web.json"

# --- 2. Service Level Objectives ---

apply_slo() {
  local service_id="$1"
  local slo_id="$2"
  local config_file="$3"
  local url="${API_BASE}/services/${service_id}/serviceLevelObjectives/${slo_id}"

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "$url")

  if [ "$status" = "200" ]; then
    echo "Updating SLO: ${service_id}/${slo_id}"
    curl -sfS -X PATCH \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "${url}?updateMask=displayName,goal,rollingPeriod,serviceLevelIndicator,userLabels" \
      -d @"$config_file" >/dev/null
  elif [ "$status" = "404" ]; then
    echo "Creating SLO: ${service_id}/${slo_id}"
    curl -sfS -X POST \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "${API_BASE}/services/${service_id}/serviceLevelObjectives?serviceLevelObjectiveId=${slo_id}" \
      -d @"$config_file" >/dev/null
  else
    echo "ERROR: unexpected HTTP $status from SLOs GET for ${service_id}/${slo_id}" >&2
    exit 1
  fi
}

apply_slo "calendar-hub-api" "api-availability" "${SCRIPT_DIR}/slos/api-availability.json"
apply_slo "calendar-hub-api" "api-latency-p95"  "${SCRIPT_DIR}/slos/api-latency-p95.json"
apply_slo "calendar-hub-api" "sync-success"     "${SCRIPT_DIR}/slos/sync-success.json"
apply_slo "calendar-hub-web" "web-availability" "${SCRIPT_DIR}/slos/web-availability.json"

echo ""
echo "=== SLI/SLO setup complete ==="
echo ""
echo "Verify services:"
echo "  curl -sf -H \"Authorization: Bearer \$(gcloud auth print-access-token)\" \\"
echo "    \"${API_BASE}/services\" | jq '.services[] | {name, displayName}'"
echo ""
echo "Verify SLOs (per service):"
echo "  curl -sf -H \"Authorization: Bearer \$(gcloud auth print-access-token)\" \\"
echo "    \"${API_BASE}/services/calendar-hub-api/serviceLevelObjectives\" | \\"
echo "    jq '.serviceLevelObjectives[] | {name, displayName, goal, rollingPeriod}'"
echo "  curl -sf -H \"Authorization: Bearer \$(gcloud auth print-access-token)\" \\"
echo "    \"${API_BASE}/services/calendar-hub-web/serviceLevelObjectives\" | \\"
echo "    jq '.serviceLevelObjectives[] | {name, displayName, goal, rollingPeriod}'"
echo ""
echo "Console: https://console.cloud.google.com/monitoring/services?project=${PROJECT_ID}"
echo ""
echo "Note: SLO 値が rolling period 経過するまで NaN になる場合あり (新規作成直後の仕様)。"
echo "      Error Budget アラート (50%/25%/0% 残量で通知) は ADR-010 §実装フェーズ 4 で別タスク。"
