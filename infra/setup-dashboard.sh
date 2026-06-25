#!/bin/bash
set -euo pipefail

# Calendar Hub SLI/SLO Dashboard setup (Issue #81 c, ADR-010 §実装フェーズ 3)
#
# 冪等: 既存ダッシュボードは update、無ければ create。
# 前提:
#   1. gcloud 認証済み + monitoring.googleapis.com 有効化済み
#      (infra/setup-slo.sh 実行時に有効化)
#   2. log-based metrics 作成済み (infra/setup-monitoring.sh 実行時)
#      未実行環境で本スクリプトを走らせると dashboard 作成自体は成功するが
#      widget は "No data" 永久表示になる (silent UX 劣化)
#
# 設計根拠 (docs/adr/010-slo-and-log-retention.md §実装フェーズ 3):
# - SLI 4 種 + 関連メトリクスを 1 ダッシュボードに集約
# - API/Web requests by response class (5xx rate SLI) / API latency p50-95-99 /
#   Sync failures / Sync gap / TT session expired (per accountId) / Mail send failures
# - SLO target 1000ms (p95) は threshold line で可視化

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_FILE="${SCRIPT_DIR}/dashboards/calendar-hub-slo.yaml"
DASHBOARD_DISPLAY_NAME="Calendar Hub - SLI/SLO Dashboard"

command -v gcloud >/dev/null 2>&1 || {
  echo "ERROR: gcloud CLI not found in PATH" >&2
  exit 1
}

if [ ! -f "$DASHBOARD_FILE" ]; then
  echo "ERROR: Dashboard config file not found: $DASHBOARD_FILE" >&2
  exit 1
fi

echo "=== Setting up Calendar Hub SLI/SLO Dashboard ==="
echo "Project: $PROJECT_ID"
echo "Config: $DASHBOARD_FILE"

# 既存ダッシュボードを displayName で検索 (gcloud monitoring dashboards は ID で識別、
# displayName で list して既存を見つけ、ID 経由で update する)。
existing_id=""
dashboards_out=$(gcloud monitoring dashboards list \
  --project="$PROJECT_ID" \
  --format="value(name,displayName)" 2>&1) || {
  echo "ERROR: failed to list dashboards:" >&2
  echo "$dashboards_out" >&2
  exit 1
}

existing_id=$(echo "$dashboards_out" \
  | awk -F$'\t' -v name="$DASHBOARD_DISPLAY_NAME" '$2 == name {print $1; exit}')

if [ -n "$existing_id" ]; then
  echo "Updating dashboard: $DASHBOARD_DISPLAY_NAME ($existing_id)"
  # update は config-from-file の中身全てを replace する仕様。
  gcloud monitoring dashboards update "$existing_id" \
    --project="$PROJECT_ID" \
    --config-from-file="$DASHBOARD_FILE" --quiet
else
  echo "Creating dashboard: $DASHBOARD_DISPLAY_NAME"
  gcloud monitoring dashboards create \
    --project="$PROJECT_ID" \
    --config-from-file="$DASHBOARD_FILE"
fi

echo ""
echo "=== Dashboard setup complete ==="
echo ""
echo "Verify:"
echo "  gcloud monitoring dashboards list --project=$PROJECT_ID --filter='displayName:\"Calendar Hub\"'"
echo ""
echo "Console:"
echo "  https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
echo ""
echo "Note: 各 widget のデータは対応メトリクスにログが流れていない期間は NaN/0 表示。"
echo "      SLI 4 種は ADR-010 §1 SLO target との対応関係を widget タイトルに明示。"
